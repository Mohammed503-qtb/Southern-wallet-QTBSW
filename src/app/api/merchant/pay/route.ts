/**
 * POST /api/merchant/pay { merchantPhone, amountMinor, note?, pin } + Idempotency-Key
 * -----------------------------------------------------------------------------------
 * دفع التاجر QR (MERCHANT_PAY — 9-c) — النموذج الثنائي الطرف على غرار T2:
 *  1) جلسة → غير مجمّد → داخل النطاق (AC-07) → Idempotency → PIN
 *  2) $transaction واحدة:
 *     • رصيد العميل ≥ المبلغ (TXN-001) — العميل يدفع المبلغ كاملاً بلا رسوم
 *     • حدود اليوم (TXN-002) على المبلغ الصادر
 *     • الرسوم على التاجر (القرار التعاقدي): FeeRule opType="MERCHANT_PAY"
 *       → fee تُحسم من مبلغ التاجر: net = amount − fee
 *     • قيود Σ=0: [MAIN العميل DEBIT amount] + [FEE:YER CREDIT fee]
 *                  + [MAIN التاجر CREDIT net]        (-a + f + (a-f) = 0)
 *     • معاملة العميل MERCHANT_PAY_OUT (DEBIT، بلا رسوم عليه)
 *     • معاملة التاجر MERCHANT_SALE_IN (CREDIT net، feeMinor=fee منه)
 *  3) إشعار للطرفين + QrPayResultView { ...TxView, merchantName, balanceMinor }.
 * ملاحظة Beta: YER فقط (رسوم/عوم المرحلة 2 باليمني)؛ الحد اليومي يفحص
 * المبلغ لكن MERCHANT_PAY_OUT لا يُضاف لمجموع الأنواع المحسوبة في money.ts
 * (ملف مشترك مغلق — موثق كحدود Beta).
 */
import { ok, route, readJsonBody, reqStr, reqInt, optStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { assertNotFrozen, assertInScope, assertValidPhone, generateRef } from "@/lib/server/domain";
import { verifyPin } from "@/lib/server/pin";
import { computeFee, getFeeRule, requireValidAmount, assertDailyLimit, formatMinor } from "@/lib/server/money";
import { getOrCreateMainWallet, getSystemWallet, postEntries } from "@/lib/server/ledger";
import { notify } from "@/lib/server/notify";
import { readIdempotencyKey, findIdempotentTx, assertSamePayload, idmMeta } from "@/lib/server/idempotency";
import { toTxView } from "@/lib/server/views";
import { db } from "@/lib/db";

const CURRENCY = "YER" as const;

export const POST = route(async (req) => {
  const user = await requireUser();
  assertNotFrozen(user);
  await assertInScope(db, user);

  const body = await readJsonBody(req);
  const merchantPhone = assertValidPhone(reqStr(body, "merchantPhone"));
  const amountMinor = requireValidAmount(CURRENCY, reqInt(body, "amountMinor"));
  const note = optStr(body, "note");
  const pin = reqStr(body, "pin");

  // Idempotency قبل أي شيء آخر (AC-03)
  const idemKey = readIdempotencyKey(req);
  if (idemKey) {
    const existing = await findIdempotentTx(db, user.id, idemKey);
    if (existing) {
      if (existing.type !== "MERCHANT_PAY_OUT") throw new RouteError("TXN-003", 409);
      assertSamePayload(existing, body);
      const wallet = await db.wallet.findFirst({
        where: { userId: user.id, kind: "MAIN", currency: CURRENCY },
      });
      return ok({
        ...toTxView(existing),
        replayed: true,
        merchantName: existing.counterpartyName ?? "متجر",
        balanceMinor: wallet?.balanceMinor,
      });
    }
  }

  // التاجر: موجود + MERCHANT + ACTIVE + غير مقيد (MRC-001)
  const merchant = await db.user.findUnique({ where: { phone: merchantPhone } });
  if (
    !merchant ||
    merchant.role !== "MERCHANT" ||
    merchant.status !== "ACTIVE" ||
    merchant.scopeRestricted
  ) {
    throw new RouteError("MRC-001", 404, { phone: merchantPhone });
  }
  if (merchant.id === user.id) {
    throw new RouteError("TRF-002", 400, { reason: "لا يمكنك الدفع لمتجرك نفسه" });
  }
  assertNotFrozen(merchant);

  // PIN على عميل مستقل (يثبّت العداد حتى لو فشلت المعاملة بعده)
  await verifyPin(db, user, pin);

  const customerName = user.fullName ?? user.phone;
  const shopName = merchant.fullName?.trim() || "متجر معتمد";

  const result = await db.$transaction(async (tx) => {
    const customerWallet = await getOrCreateMainWallet(tx, user.id, CURRENCY);
    const feeRule = await getFeeRule(tx, "MERCHANT_PAY", CURRENCY);
    const feeMinor = computeFee(feeRule, amountMinor);
    const netToMerchant = amountMinor - feeMinor;
    if (netToMerchant <= 0) {
      throw new RouteError("SYS-001", 400, { reason: "المبلغ أصغر من الحد الأدنى للرسوم" });
    }

    // العميل يدفع المبلغ كاملاً (الرسوم على التاجر)
    if (customerWallet.balanceMinor < amountMinor) {
      throw new RouteError("TXN-001", 400, { currency: CURRENCY, balance: customerWallet.balanceMinor });
    }
    await assertDailyLimit(tx, user, CURRENCY, amountMinor);

    const feeWallet = await getSystemWallet(tx, "FEE", CURRENCY);
    const merchantWallet = await getOrCreateMainWallet(tx, merchant.id, CURRENCY);

    // معاملة العميل (الدفع) — SW- لأنه دفع تحويلي فوري
    const ref = generateRef("SW");
    const customerTx = await tx.transaction.create({
      data: {
        ref,
        userId: user.id,
        type: "MERCHANT_PAY_OUT",
        status: "COMPLETED",
        currency: CURRENCY,
        amountMinor,
        feeMinor: 0, // الرسوم على التاجر — العميل لا يدفع رسوماً
        direction: "DEBIT",
        counterpartyName: shopName,
        counterpartyPhone: merchant.phone,
        description: note,
        idempotencyKey: idemKey,
        completedAt: new Date(),
        metadataJson: idemKey ? JSON.stringify(idmMeta(body)) : null,
      },
    });

    // القيود Σ=0: العميل يدفع a، التاجر يستلم net، الرسوم f للمحفظة
    await postEntries(
      tx,
      [
        { walletId: customerWallet.id, direction: "DEBIT", amountMinor },
        { walletId: feeWallet.id, direction: "CREDIT", amountMinor: feeMinor },
        { walletId: merchantWallet.id, direction: "CREDIT", amountMinor: netToMerchant },
      ],
      { transactionRef: ref, currency: CURRENCY }
    );

    // معاملة التاجر (المبيعات) — قيمة المبيعات الصافية بعد رسوم التاجر
    const saleRef = generateRef("SW");
    await tx.transaction.create({
      data: {
        ref: saleRef,
        userId: merchant.id,
        type: "MERCHANT_SALE_IN",
        status: "COMPLETED",
        currency: CURRENCY,
        amountMinor: netToMerchant,
        feeMinor,
        direction: "CREDIT",
        counterpartyName: customerName,
        counterpartyPhone: user.phone,
        description: note,
        relatedRef: ref,
        completedAt: new Date(),
      },
    });

    await notify(
      tx,
      user.id,
      "تم الدفع للتاجر",
      `دفعت ${formatMinor(amountMinor, CURRENCY)} إلى ${shopName}.`,
      "TXN",
      ref
    );
    await notify(
      tx,
      merchant.id,
      "عملية بيع جديدة",
      `استلمت ${formatMinor(netToMerchant, CURRENCY)} من ${customerName}${
        feeMinor > 0 ? ` (رسوم التاجر ${formatMinor(feeMinor, CURRENCY)})` : ""
      }.`,
      "TXN",
      saleRef
    );

    return { customerTx, balanceAfter: customerWallet.balanceMinor - amountMinor };
  });

  return ok({
    ...toTxView(result.customerTx),
    merchantName: shopName,
    balanceMinor: result.balanceAfter,
  });
});
