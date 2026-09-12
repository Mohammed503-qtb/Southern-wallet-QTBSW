/**
 * R2 — POST /api/remittances { receiverName, receiverPhone, currency, amountMinor, pin } + Idempotency-Key
 * R3 — GET /api/remittances  (مع الإنهاء الكسول: PENDING منتهي → EXPIRED + استرجاع)
 *
 * إنشاء الحوالة: [MAIN DEBIT a+f] + [FEE CREDIT f] + [SUSPENSE CREDIT a]  Σ=0
 * Transaction REMITTANCE (PENDING) بمرجع RM- نفس الحوالة + رمز تسليم 6 أرقام
 * صلاحية الاستلام 7 أيام.
 */
import { ok, route, readJsonBody, reqStr, reqInt, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import {
  assertValidPhone,
  assertValidCurrency,
  assertNotFrozen,
  assertInScope,
  generateRef,
  randomCode,
} from "@/lib/server/domain";
import { verifyPin } from "@/lib/server/pin";
import { computeFee, getFeeRule, requireValidAmount, assertDailyLimit, formatMinor } from "@/lib/server/money";
import { getOrCreateMainWallet, getSystemWallet, postEntries } from "@/lib/server/ledger";
import { notify } from "@/lib/server/notify";
import { readIdempotencyKey, findIdempotentTx, assertSamePayload, idmMeta } from "@/lib/server/idempotency";
import { runLazyExpiry } from "@/lib/server/cashflow";
import { toRemittanceView } from "@/lib/server/views";
import { db } from "@/lib/db";

const REMITTANCE_TTL_MS = 7 * 24 * 3600_000;

export const GET = route(async () => {
  const user = await requireUser();
  await runLazyExpiry(user.id);
  const rows = await db.remittance.findMany({
    where: { senderId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  // حل اسم الوكيل الدافع إن وجد
  const agentIds = [...new Set(rows.map((r) => r.payingAgentId).filter((x): x is string => x !== null))];
  const agents = agentIds.length
    ? await db.agentProfile.findMany({ where: { userId: { in: agentIds } } })
    : [];
  const agentNames = new Map(agents.map((a) => [a.userId, a.shopName]));
  return ok(rows.map((r) => toRemittanceView(r, r.payingAgentId ? agentNames.get(r.payingAgentId) ?? null : null)));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  assertNotFrozen(user);
  await assertInScope(db, user);

  const body = await readJsonBody(req);
  const receiverName = reqStr(body, "receiverName");
  const receiverPhone = assertValidPhone(reqStr(body, "receiverPhone"));
  const currency = assertValidCurrency(reqStr(body, "currency"));
  const amountMinor = requireValidAmount(currency, reqInt(body, "amountMinor"));
  const pin = reqStr(body, "pin");

  if (currency !== "YER") {
    throw new RouteError("SYS-001", 400, {
      field: "currency",
      reason: "الحوالات في النسخة التجريبية بالريال اليمني فقط",
    });
  }

  // Idempotency
  const idemKey = readIdempotencyKey(req);
  if (idemKey) {
    const existing = await findIdempotentTx(db, user.id, idemKey);
    if (existing) {
      if (existing.type !== "REMITTANCE") throw new RouteError("TXN-003", 409);
      assertSamePayload(existing, body);
      const rem = await db.remittance.findUnique({ where: { ref: existing.ref } });
      if (rem) {
        return ok({ ...toRemittanceView(rem), replayed: true });
      }
      throw new RouteError("TXN-003", 409);
    }
  }

  await verifyPin(db, user, pin);

  const result = await db.$transaction(async (tx) => {
    const main = await getOrCreateMainWallet(tx, user.id, currency);
    const feeRule = await getFeeRule(tx, "REMITTANCE", currency);
    const feeMinor = computeFee(feeRule, amountMinor);
    const totalDebit = amountMinor + feeMinor;

    if (main.balanceMinor < totalDebit) {
      throw new RouteError("TXN-001", 400, { currency, balance: main.balanceMinor });
    }
    await assertDailyLimit(tx, user, currency, totalDebit);

    const feeWallet = await getSystemWallet(tx, "FEE", currency);
    const suspense = await getSystemWallet(tx, "SUSPENSE", currency);

    const ref = generateRef("RM");
    const deliveryCode = randomCode(6);
    const expiresAt = new Date(Date.now() + REMITTANCE_TTL_MS);

    // حجز المبلغ في SUSPENSE حتى الاستلام
    await tx.transaction.create({
      data: {
        ref,
        userId: user.id,
        type: "REMITTANCE",
        status: "PENDING",
        currency,
        amountMinor,
        feeMinor,
        direction: "DEBIT",
        counterpartyName: receiverName,
        counterpartyPhone: receiverPhone,
        description: `حوالة إلى ${receiverName}`,
        idempotencyKey: idemKey,
        metadataJson: JSON.stringify(
          idemKey ? idmMeta(body, { deliveryCode, receiverName, receiverPhone }) : { deliveryCode, receiverName, receiverPhone }
        ),
      },
    });
    await postEntries(
      tx,
      [
        { walletId: main.id, direction: "DEBIT", amountMinor: totalDebit },
        { walletId: feeWallet.id, direction: "CREDIT", amountMinor: feeMinor },
        { walletId: suspense.id, direction: "CREDIT", amountMinor },
      ],
      { transactionRef: ref, currency }
    );

    const rem = await tx.remittance.create({
      data: {
        ref,
        senderId: user.id,
        receiverName,
        receiverPhone,
        currency,
        amountMinor,
        feeMinor,
        deliveryCode,
        status: "PENDING",
        expiresAt,
      },
    });

    await notify(
      tx,
      user.id,
      "تم إرسال الحوالة",
      `حوالة ${formatMinor(amountMinor, currency)} إلى ${receiverName} بانتظار الاستلام — رمز التسليم: ${deliveryCode} (صالحة 7 أيام).`,
      "TXN",
      ref
    );
    return rem;
  });

  return ok(toRemittanceView(result));
});
