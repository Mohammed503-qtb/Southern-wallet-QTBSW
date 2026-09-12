/**
 * T2 — POST /api/transfers { phone, currency, amountMinor, note?, pin } + Idempotency-Key
 * النموذج المرجعي لكل العمليات المالية:
 *  1) جلسة → غير مجمّد → داخل النطاق (تدقيق AC-07) → Idempotency → PIN
 *     (خارج المعاملة: أثر التدقيق/الإشعار/عداد PIN يبقى محفوظاً)
 *  2) $transaction واحدة: قفل/فحص رصيد (TXN-001) → حدود (TXN-002) → رسوم →
 *     Transaction (TRANSFER_OUT COMPLETED) → postEntries:
 *       [MAIN المرسل DEBIT a+f] + [FEE:* CREDIT f] + [MAIN المستلم CREDIT a]  Σ=0
 *     → Transaction للمستلم (TRANSFER_IN، relatedRef) → إشعاران → رصيد محدث
 */
import { ok, route, readJsonBody, reqStr, reqInt, RouteError, optStr } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import {
  assertValidPhone,
  assertValidCurrency,
  assertNotFrozen,
  assertInScope,
  generateRef,
} from "@/lib/server/domain";
import { verifyPin } from "@/lib/server/pin";
import {
  computeFee,
  getFeeRule,
  requireValidAmount,
  assertDailyLimit,
  formatMinor,
} from "@/lib/server/money";
import { getOrCreateMainWallet, getSystemWallet, postEntries } from "@/lib/server/ledger";
import { notify } from "@/lib/server/notify";
import { readIdempotencyKey, findIdempotentTx, assertSamePayload, idmMeta } from "@/lib/server/idempotency";
import { toTxView } from "@/lib/server/views";
import { db } from "@/lib/db";

export const POST = route(async (req) => {
  const user = await requireUser();
  assertNotFrozen(user);
  await assertInScope(db, user);

  const body = await readJsonBody(req);
  const phone = assertValidPhone(reqStr(body, "phone"));
  const currency = assertValidCurrency(reqStr(body, "currency"));
  const amountMinor = requireValidAmount(currency, reqInt(body, "amountMinor"));
  const note = optStr(body, "note");
  const pin = reqStr(body, "pin");

  // Idempotency قبل أي شيء آخر
  const idemKey = readIdempotencyKey(req);
  if (idemKey) {
    const existing = await findIdempotentTx(db, user.id, idemKey);
    if (existing) {
      if (existing.type !== "TRANSFER_OUT") throw new RouteError("TXN-003", 409);
      assertSamePayload(existing, body);
      const wallet = await db.wallet.findFirst({
        where: { userId: user.id, kind: "MAIN", currency },
      });
      return ok({ ...toTxView(existing), replayed: true, balanceMinor: wallet?.balanceMinor });
    }
  }

  const recipient = await db.user.findUnique({ where: { phone } });
  if (!recipient || recipient.status === "CLOSED" || recipient.role === "SYSTEM") {
    throw new RouteError("TRF-001", 404);
  }
  if (recipient.id === user.id) {
    throw new RouteError("TRF-002", 400);
  }

  // PIN على عميل مستقل (يثبّت العداد حتى لو فشلت المعاملة بعده)
  await verifyPin(db, user, pin);

  const senderName = user.fullName ?? user.phone;
  const recipientName = recipient.fullName ?? "مستخدم محفظة الجنوب";

  const result = await db.$transaction(async (tx) => {
    const senderWallet = await getOrCreateMainWallet(tx, user.id, currency);
    const feeRule = await getFeeRule(tx, "TRANSFER", currency);
    const feeMinor = computeFee(feeRule, amountMinor);
    const totalDebit = amountMinor + feeMinor;

    if (senderWallet.balanceMinor < totalDebit) {
      throw new RouteError("TXN-001", 400, { currency, balance: senderWallet.balanceMinor });
    }
    await assertDailyLimit(tx, user, currency, totalDebit);

    const feeWallet = await getSystemWallet(tx, "FEE", currency);
    const receiverWallet = await getOrCreateMainWallet(tx, recipient.id, currency);

    const ref = generateRef("SW");
    const senderTx = await tx.transaction.create({
      data: {
        ref,
        userId: user.id,
        type: "TRANSFER_OUT",
        status: "COMPLETED",
        currency,
        amountMinor,
        feeMinor,
        direction: "DEBIT",
        counterpartyName: recipientName,
        counterpartyPhone: recipient.phone,
        description: note,
        idempotencyKey: idemKey,
        completedAt: new Date(),
        metadataJson: idemKey ? JSON.stringify(idmMeta(body)) : null,
      },
    });

    await postEntries(
      tx,
      [
        { walletId: senderWallet.id, direction: "DEBIT", amountMinor: totalDebit },
        { walletId: feeWallet.id, direction: "CREDIT", amountMinor: feeMinor },
        { walletId: receiverWallet.id, direction: "CREDIT", amountMinor },
      ],
      { transactionRef: ref, currency }
    );

    // معاملة الطرف المستلم (TRANSFER_IN — بلا قيود خاصة بها)
    const receiverRef = generateRef("SW");
    await tx.transaction.create({
      data: {
        ref: receiverRef,
        userId: recipient.id,
        type: "TRANSFER_IN",
        status: "COMPLETED",
        currency,
        amountMinor,
        feeMinor: 0,
        direction: "CREDIT",
        counterpartyName: senderName,
        counterpartyPhone: user.phone,
        description: note,
        relatedRef: ref,
        completedAt: new Date(),
      },
    });

    await notify(
      tx,
      user.id,
      "تم التحويل",
      `حوّلت ${formatMinor(amountMinor, currency)} إلى ${recipientName}${
        feeMinor > 0 ? ` (رسوم ${formatMinor(feeMinor, currency)})` : ""
      }.`,
      "TXN",
      ref
    );
    await notify(
      tx,
      recipient.id,
      "استلام تحويل",
      `استلمت ${formatMinor(amountMinor, currency)} من ${senderName}.`,
      "TXN",
      receiverRef
    );

    return { senderTx, balanceAfter: senderWallet.balanceMinor - totalDebit };
  });

  return ok({ ...toTxView(result.senderTx), balanceMinor: result.balanceAfter });
});
