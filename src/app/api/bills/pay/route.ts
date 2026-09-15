/**
 * BIL — POST /api/bills/pay { billerCode, accountNumber, amountMinor, pin } + Idempotency-Key
 * سداد فاتورة (9-b) — النموذج المرجعي نفسه لنمط transfers:
 *  1) جلسة → غير مجمّد → داخل النطاق → Idempotency → PIN (خارج المعاملة)
 *  2) $transaction واحدة: رصيد (TXN-001) → حدود (TXN-002) → رسوم FeeRule →
 *     Transaction (BILL_PAY COMPLETED, ref BP-…) → postEntries:
 *       [MAIN DEBIT a+f] + [FEE:YER CREDIT f] + [SUSPENSE:YER CREDIT a]  Σ=0
 *     (المبلغ في SUSPENSE بانتظار تسوية المزود — نظام نقدي مغلق D-01)
 *  3) notify + writeAudit → BillPayResultView { …tx, billerName, accountNumber }
 * قيود السداد: المبلغ ≤ المستحق المحاكى دائماً؛ المزود غير المفتوح
 * (openAmount=false) يستقبل السداد الكامل فقط.
 */
import { ok, route, readJsonBody, reqStr, reqInt, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { assertServiceOn } from "@/lib/server/service-guard";
import { assertNotFrozen, assertInScope, generateRef } from "@/lib/server/domain";
import { verifyPin } from "@/lib/server/pin";
import { requireValidAmount, assertDailyLimit, formatMinor } from "@/lib/server/money";
import { getOrCreateMainWallet, getSystemWallet, postEntries } from "@/lib/server/ledger";
import { notify } from "@/lib/server/notify";
import { writeAudit } from "@/lib/server/audit";
import { readIdempotencyKey, findIdempotentTx, assertSamePayload, idmMeta } from "@/lib/server/idempotency";
import { toTxView } from "@/lib/server/views";
import {
  assertValidAccountNumber,
  billerByCode,
  getPaymentsFeeRule,
  simulatedDueAmountMinor,
  simulatedDueLabel,
} from "@/lib/server/payments-catalog";
import { computeFee } from "@/lib/server/money";
import { db } from "@/lib/db";

export const POST = route(async (req) => {
  const user = await requireUser();
  // Master §139: إنفاذ مفتاح الخدمة الإداري خادمياً (BILLS)
  await assertServiceOn("BILLS");
  assertNotFrozen(user);
  await assertInScope(db, user);

  const body = await readJsonBody(req);
  const billerCode = reqStr(body, "billerCode");
  const accountNumber = reqStr(body, "accountNumber");
  const amountMinor = requireValidAmount("YER", reqInt(body, "amountMinor"));
  const pin = reqStr(body, "pin");

  const biller = billerByCode(billerCode);
  if (!biller) {
    throw new RouteError("BIL-001", 404, { billerCode });
  }
  const account = assertValidAccountNumber(biller, accountNumber);

  // Idempotency قبل أي شيء آخر
  const idemKey = readIdempotencyKey(req);
  if (idemKey) {
    const existing = await findIdempotentTx(db, user.id, idemKey);
    if (existing) {
      if (existing.type !== "BILL_PAY") throw new RouteError("TXN-003", 409);
      assertSamePayload(existing, body);
      const wallet = await db.wallet.findFirst({
        where: { userId: user.id, kind: "MAIN", currency: "YER" },
      });
      const meta = existing.metadataJson
        ? (JSON.parse(existing.metadataJson) as { billerName?: string; accountNumber?: string })
        : {};
      return ok({
        ...toTxView(existing),
        replayed: true,
        balanceMinor: wallet?.balanceMinor,
        billerName: meta.billerName ?? existing.counterpartyName ?? biller.name,
        accountNumber: meta.accountNumber ?? account,
      });
    }
  }

  // المستحق المحاكى — نفس الرقم نفس المبلغ دائماً
  const dueAmountMinor = simulatedDueAmountMinor(biller.code, account);
  const dueLabel = simulatedDueLabel(biller.code, account);
  if (amountMinor > dueAmountMinor) {
    throw new RouteError("SYS-001", 400, {
      field: "amountMinor",
      reason: `المبلغ يتجاوز المستحق (${formatMinor(dueAmountMinor, "YER")})`,
    });
  }
  if (!biller.openAmount && amountMinor !== dueAmountMinor) {
    throw new RouteError("SYS-001", 400, {
      field: "amountMinor",
      reason: `هذا المزوّد يستقبل السداد الكامل للمستحق فقط (${formatMinor(dueAmountMinor, "YER")})`,
    });
  }

  // PIN على عميل مستقل (يثبّت العداد حتى لو فشلت المعاملة بعده)
  await verifyPin(db, user, pin);

  const result = await db.$transaction(async (tx) => {
    const main = await getOrCreateMainWallet(tx, user.id, "YER");
    const feeRule = await getPaymentsFeeRule(tx, "BILL_PAY");
    const feeMinor = computeFee(feeRule, amountMinor);
    const totalDebit = amountMinor + feeMinor;

    if (main.balanceMinor < totalDebit) {
      throw new RouteError("TXN-001", 400, { currency: "YER", balance: main.balanceMinor });
    }
    await assertDailyLimit(tx, user, "YER", totalDebit);

    const feeWallet = await getSystemWallet(tx, "FEE", "YER");
    const suspense = await getSystemWallet(tx, "SUSPENSE", "YER");

    const ref = generateRef("BP");
    const billTx = await tx.transaction.create({
      data: {
        ref,
        userId: user.id,
        type: "BILL_PAY",
        status: "COMPLETED",
        currency: "YER",
        amountMinor,
        feeMinor,
        direction: "DEBIT",
        counterpartyName: biller.name,
        description: `سداد فاتورة ${biller.name} — ${account}`,
        idempotencyKey: idemKey,
        completedAt: new Date(),
        metadataJson: JSON.stringify(
          idemKey
            ? idmMeta(body, { billerCode: biller.code, billerName: biller.name, accountNumber: account, dueAmountMinor, dueLabel })
            : { billerCode: biller.code, billerName: biller.name, accountNumber: account, dueAmountMinor, dueLabel }
        ),
      },
    });

    await postEntries(
      tx,
      [
        { walletId: main.id, direction: "DEBIT", amountMinor: totalDebit },
        { walletId: feeWallet.id, direction: "CREDIT", amountMinor: feeMinor },
        { walletId: suspense.id, direction: "CREDIT", amountMinor: amountMinor },
      ],
      { transactionRef: ref, currency: "YER" }
    );

    await notify(
      tx,
      user.id,
      "تم سداد الفاتورة",
      `سُدّدت فاتورة ${biller.name} (${formatMinor(amountMinor, "YER")}) عن الحساب ${account}${
        amountMinor < dueAmountMinor ? ` — سداد جزئي من مستحق ${formatMinor(dueAmountMinor, "YER")}` : ""
      }.`,
      "TXN",
      ref
    );

    return { billTx, balanceAfter: main.balanceMinor - totalDebit, feeMinor };
  });

  // تدقيق عملية (أثر خارج المعاملة — لا يوقف النجاح إن تعذّر)
  await writeAudit(
    db,
    { id: user.id, role: user.role },
    "BILL_PAY_EXEC",
    "TRANSACTION",
    result.billTx.ref,
    `سداد فاتورة ${biller.name} — حساب ${account}`
  );

  return ok({
    ...toTxView(result.billTx),
    balanceMinor: result.balanceAfter,
    billerName: biller.name,
    accountNumber: account,
  });
});
