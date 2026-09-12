/**
 * W4 — POST /api/wallet/exchange { fromCurrency, toCurrency, amountMinor, pin } + Idempotency-Key
 * تنفيذ تحويل بين محافظ المستخدم (FX_EXCHANGE) بعملتيه:
 *   عملة المصدر: [MAIN:from DEBIT a+f] + [FX:from CREDIT a+f]   Σ=0
 *   عملة الهدف:  [FX:to DEBIT receive] + [MAIN:to CREDIT receive] Σ=0
 * كل عملة تتحقق Σ=0 على حدة (استدعاءا postEntries منفصلان).
 */
import { ok, route, readJsonBody, reqStr, reqInt, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { assertValidCurrency, assertNotFrozen, assertInScope, generateRef } from "@/lib/server/domain";
import { verifyPin } from "@/lib/server/pin";
import {
  computeFee,
  convertMinor,
  findFxRate,
  getFeeRule,
  requireValidAmount,
  assertDailyLimit,
  formatMinor,
} from "@/lib/server/money";
import { getOrCreateMainWallet, getSystemWallet, postEntries } from "@/lib/server/ledger";
import { notify } from "@/lib/server/notify";
import {
  readIdempotencyKey,
  findIdempotentTx,
  assertSamePayload,
  idmMeta,
} from "@/lib/server/idempotency";
import { toTxView } from "@/lib/server/views";
import { db } from "@/lib/db";

export const POST = route(async (req) => {
  const user = await requireUser();
  assertNotFrozen(user);
  await assertInScope(db, user);

  const body = await readJsonBody(req);
  const fromCurrency = assertValidCurrency(reqStr(body, "fromCurrency"));
  const toCurrency = assertValidCurrency(reqStr(body, "toCurrency"));
  const amountMinor = requireValidAmount(fromCurrency, reqInt(body, "amountMinor"));
  const pin = reqStr(body, "pin");
  if (fromCurrency === toCurrency) {
    throw new RouteError("SYS-001", 400, { reason: "لا يمكن التحويل بين نفس العملة" });
  }

  // Idempotency — قبل أي شيء آخر
  const idemKey = readIdempotencyKey(req);
  if (idemKey) {
    const existing = await findIdempotentTx(db, user.id, idemKey);
    if (existing) {
      if (existing.type !== "FX_EXCHANGE") throw new RouteError("TXN-003", 409);
      assertSamePayload(existing, body);
      const wallet = await db.wallet.findFirst({
        where: { userId: user.id, kind: "MAIN", currency: toCurrency },
      });
      return ok({
        ...toTxView(existing),
        replayed: true,
        balanceMinor: wallet?.balanceMinor,
      });
    }
  }

  // PIN على عميل مستقل لضمان ثبات عداد المحاولات
  await verifyPin(db, user, pin);

  const result = await db.$transaction(async (tx) => {
    const fromWallet = await getOrCreateMainWallet(tx, user.id, fromCurrency);
    const toWallet = await getOrCreateMainWallet(tx, user.id, toCurrency);
    const rate = await findFxRate(tx, fromCurrency, toCurrency);
    if (rate === null) {
      throw new RouteError("SRV-001", 503, { reason: "لا يوجد سعر صرف لهذا الزوج" });
    }
    const feeRule = await getFeeRule(tx, "FX", fromCurrency);
    const feeMinor = computeFee(feeRule, amountMinor);
    const totalDebit = amountMinor + feeMinor;
    const receiveMinor = convertMinor(amountMinor, rate, fromCurrency, toCurrency);
    if (receiveMinor <= 0) {
      throw new RouteError("SYS-001", 400, { reason: "المبلغ صغير جداً لهذا الزوج" });
    }
    if (fromWallet.balanceMinor < totalDebit) {
      throw new RouteError("TXN-001", 400, { currency: fromCurrency, balance: fromWallet.balanceMinor });
    }
    await assertDailyLimit(tx, user, fromCurrency, totalDebit);

    const fxFrom = await getSystemWallet(tx, "FX", fromCurrency);
    const fxTo = await getSystemWallet(tx, "FX", toCurrency);

    const ref = generateRef("SW");
    const meta = idemKey ? idmMeta(body, { toCurrency, receiveMinor, rate }) : { toCurrency, receiveMinor, rate };
    const txRow = await tx.transaction.create({
      data: {
        ref,
        userId: user.id,
        type: "FX_EXCHANGE",
        status: "COMPLETED",
        currency: fromCurrency,
        amountMinor,
        feeMinor,
        direction: "DEBIT",
        description: `تحويل بين المحافظ ${fromCurrency} → ${toCurrency}`,
        idempotencyKey: idemKey,
        completedAt: new Date(),
        metadataJson: JSON.stringify(meta),
      },
    });

    // عملة المصدر: خصم من المستخدم وإيداع محاسبي في FX للنظام
    await postEntries(
      tx,
      [
        { walletId: fromWallet.id, direction: "DEBIT", amountMinor: totalDebit },
        { walletId: fxFrom.id, direction: "CREDIT", amountMinor: totalDebit },
      ],
      { transactionRef: ref, currency: fromCurrency }
    );
    // عملة الهدف: شراء من FX النظام وإضافة لمحفظة المستخدم
    await postEntries(
      tx,
      [
        { walletId: fxTo.id, direction: "DEBIT", amountMinor: receiveMinor },
        { walletId: toWallet.id, direction: "CREDIT", amountMinor: receiveMinor },
      ],
      { transactionRef: ref, currency: toCurrency }
    );

    await notify(
      tx,
      user.id,
      "تم التحويل بين المحافظ",
      `حوّلت ${formatMinor(amountMinor, fromCurrency)} إلى ${formatMinor(receiveMinor, toCurrency)}${
        feeMinor > 0 ? ` (رسوم ${formatMinor(feeMinor, fromCurrency)})` : ""
      }.`,
      "TXN",
      ref
    );
    return { txRow, balanceAfter: toWallet.balanceMinor + receiveMinor };
  });

  return ok({ ...toTxView(result.txRow), balanceMinor: result.balanceAfter });
});
