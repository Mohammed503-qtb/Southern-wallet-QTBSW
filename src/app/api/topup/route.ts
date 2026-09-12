/**
 * TOP — GET /api/topup → TopupOperatorView[] (مشغلو اليمن بفئات الشحن + الرسوم)
 *      POST /api/topup { operatorCode, phone, amountMinor, pin } + Idempotency-Key
 * 9-b: شحن رصيد الهاتف (لرقمي أو رقم آخر):
 *  • التحقق: المشغل موجود (TOP-001) + الرقم يمني + يتبع بادئات المشغل +
 *    الفئة ضمن packagesMinor (TOP-001).
 *  • المعاملة TOPUP COMPLETED (ref TU-…):
 *      [MAIN DEBIT a+f] + [FEE:YER CREDIT f] + [SUSPENSE:YER CREDIT a]  Σ=0
 *    (قيمة الشحن في SUSPENSE بانتظار تسوية المشغل — D-01 نظام مغلق).
 *  • metadataJson: { phone, operatorCode, operatorName } → notify + audit.
 *  • ?ref=<مرجع> على GET: استرجاع metadata شحن لتفاصيل العملية.
 */
import { ok, route, readJsonBody, reqStr, reqInt, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import {
  assertNotFrozen,
  assertInScope,
  assertValidPhone,
  generateRef,
} from "@/lib/server/domain";
import { verifyPin } from "@/lib/server/pin";
import { requireValidAmount, assertDailyLimit, computeFee, formatMinor } from "@/lib/server/money";
import { getOrCreateMainWallet, getSystemWallet, postEntries } from "@/lib/server/ledger";
import { notify } from "@/lib/server/notify";
import { writeAudit } from "@/lib/server/audit";
import { readIdempotencyKey, findIdempotentTx, assertSamePayload, idmMeta } from "@/lib/server/idempotency";
import { toTxView } from "@/lib/server/views";
import {
  OPERATORS,
  getPaymentsFeeRule,
  isPackageAllowed,
  operatorByCode,
  phoneMatchesOperator,
  peekPaymentsFeeMinor,
  toTopupOperatorView,
} from "@/lib/server/payments-catalog";
import { db } from "@/lib/db";

export const GET = route(async (req) => {
  const user = await requireUser();

  // وضع استرجاع metadata لعملية TOPUP محددة (تفاصيل العملية)
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref");
  if (ref) {
    const tx = await db.transaction.findFirst({ where: { ref, userId: user.id } });
    if (!tx || tx.type !== "TOPUP") {
      throw new RouteError("SYS-001", 404, { reason: "عملية شحن غير موجودة" });
    }
    let meta: { operatorName?: string; phone?: string } = {};
    try {
      meta = tx.metadataJson ? (JSON.parse(tx.metadataJson) as typeof meta) : {};
    } catch {
      meta = {};
    }
    return ok({
      operatorName: meta.operatorName ?? tx.counterpartyName ?? "مشغل",
      phone: meta.phone ?? null,
    });
  }

  const feeMinor = await peekPaymentsFeeMinor(db, "TOPUP");
  return ok(OPERATORS.map((o) => toTopupOperatorView(o, feeMinor)));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  assertNotFrozen(user);
  await assertInScope(db, user);

  const body = await readJsonBody(req);
  const operatorCode = reqStr(body, "operatorCode");
  const phone = assertValidPhone(reqStr(body, "phone"));
  const amountMinor = requireValidAmount("YER", reqInt(body, "amountMinor"));
  const pin = reqStr(body, "pin");

  const operator = operatorByCode(operatorCode);
  if (!operator) {
    throw new RouteError("TOP-001", 404, { operatorCode });
  }
  if (!phoneMatchesOperator(operator, phone)) {
    throw new RouteError("SYS-001", 400, {
      field: "phone",
      reason: `الرقم لا يتبع مشغل ${operator.name} (أرقامه تبدأ بـ ${operator.prefixes.join(" أو ")})`,
    });
  }
  if (!isPackageAllowed(operator, amountMinor)) {
    throw new RouteError("TOP-001", 400, {
      field: "amountMinor",
      reason: `الفئة غير متاحة — الفئات المدعومة: ${operator.packagesMinor.join("، ")}`,
    });
  }

  // Idempotency قبل أي شيء آخر
  const idemKey = readIdempotencyKey(req);
  if (idemKey) {
    const existing = await findIdempotentTx(db, user.id, idemKey);
    if (existing) {
      if (existing.type !== "TOPUP") throw new RouteError("TXN-003", 409);
      assertSamePayload(existing, body);
      const wallet = await db.wallet.findFirst({
        where: { userId: user.id, kind: "MAIN", currency: "YER" },
      });
      const meta = existing.metadataJson
        ? (JSON.parse(existing.metadataJson) as { operatorName?: string; phone?: string })
        : {};
      return ok({
        ...toTxView(existing),
        replayed: true,
        balanceMinor: wallet?.balanceMinor,
        operatorName: meta.operatorName ?? existing.counterpartyName ?? operator.name,
        phone: meta.phone ?? phone,
      });
    }
  }

  // PIN على عميل مستقل
  await verifyPin(db, user, pin);

  const result = await db.$transaction(async (tx) => {
    const main = await getOrCreateMainWallet(tx, user.id, "YER");
    const feeRule = await getPaymentsFeeRule(tx, "TOPUP");
    const feeMinor = computeFee(feeRule, amountMinor);
    const totalDebit = amountMinor + feeMinor;

    if (main.balanceMinor < totalDebit) {
      throw new RouteError("TXN-001", 400, { currency: "YER", balance: main.balanceMinor });
    }
    await assertDailyLimit(tx, user, "YER", totalDebit);

    const feeWallet = await getSystemWallet(tx, "FEE", "YER");
    const suspense = await getSystemWallet(tx, "SUSPENSE", "YER");

    const ref = generateRef("TU");
    const topupTx = await tx.transaction.create({
      data: {
        ref,
        userId: user.id,
        type: "TOPUP",
        status: "COMPLETED",
        currency: "YER",
        amountMinor,
        feeMinor,
        direction: "DEBIT",
        counterpartyName: operator.name,
        description: `شحن رصيد ${operator.name} — ${phone}`,
        idempotencyKey: idemKey,
        completedAt: new Date(),
        metadataJson: JSON.stringify(
          idemKey
            ? idmMeta(body, { phone, operatorCode: operator.code, operatorName: operator.name })
            : { phone, operatorCode: operator.code, operatorName: operator.name }
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
      "تم شحن الرصيد",
      `شُحن رصيد ${formatMinor(amountMinor, "YER")} على الرقم ${phone} (${operator.name}).`,
      "TXN",
      ref
    );

    return { topupTx, balanceAfter: main.balanceMinor - totalDebit, feeMinor };
  });

  await writeAudit(
    db,
    { id: user.id, role: user.role },
    "TOPUP_EXEC",
    "TRANSACTION",
    result.topupTx.ref,
    `شحن رصيد ${operator.name} — ${phone}`
  );

  return ok({
    ...toTxView(result.topupTx),
    balanceMinor: result.balanceAfter,
    operatorName: operator.name,
    phone,
  });
});
