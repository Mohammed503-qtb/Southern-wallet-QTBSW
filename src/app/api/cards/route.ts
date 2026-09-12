/**
 * NWC — GET /api/cards → CardProductView[] (باقات بيانات كل مشغل بأسعار ثابتة)
 *      POST /api/cards { productCode, pin } + Idempotency-Key
 * 9-b: شراء كرت شبكة:
 *  • التحقق: الباقة موجودة (TOP-001 — فئة غير مدعومة) + PIN + رصيد + حدود.
 *  • المعاملة CARD_PURCHASE COMPLETED (ref NC-…):
 *      [MAIN DEBIT p+f] + [FEE:YER CREDIT f] + [SUSPENSE:YER CREDIT p]  Σ=0
 *  • **توليد رمز كرت 11 خانة** (generateCardCode — أبجدية بلا لبس) يُخزن في
 *    metadataJson ويُعاد في الاستجابة (cardCode) ليظهر في الإيصال مع تحذير
 *    «احفظ الرمز» — ولا يُعاد إلا عبر ?ref= لتفاصيل العملية.
 *  • notify يتضمن الرمز (نسخة احتياطية للعميل في الإشعارات).
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { assertServiceOn } from "@/lib/server/service-guard";
import { assertNotFrozen, assertInScope, generateRef } from "@/lib/server/domain";
import { verifyPin } from "@/lib/server/pin";
import { assertDailyLimit, computeFee, formatMinor } from "@/lib/server/money";
import { getOrCreateMainWallet, getSystemWallet, postEntries } from "@/lib/server/ledger";
import { notify } from "@/lib/server/notify";
import { writeAudit } from "@/lib/server/audit";
import { readIdempotencyKey, findIdempotentTx, assertSamePayload, idmMeta } from "@/lib/server/idempotency";
import { toTxView } from "@/lib/server/views";
import {
  CARDS,
  cardByCode,
  generateCardCode,
  getPaymentsFeeRule,
  peekPaymentsFeeMinor,
  toCardProductView,
} from "@/lib/server/payments-catalog";
import { db } from "@/lib/db";

export const GET = route(async (req) => {
  const user = await requireUser();

  // وضع استرجاع metadata لعملية CARD_PURCHASE محددة (تفاصيل العملية)
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref");
  if (ref) {
    const tx = await db.transaction.findFirst({ where: { ref, userId: user.id } });
    if (!tx || tx.type !== "CARD_PURCHASE") {
      throw new RouteError("SYS-001", 404, { reason: "عملية شراء كرت غير موجودة" });
    }
    let meta: {
      cardCode?: string;
      productName?: string;
      operatorName?: string;
      productCode?: string;
    } = {};
    try {
      meta = tx.metadataJson ? (JSON.parse(tx.metadataJson) as typeof meta) : {};
    } catch {
      meta = {};
    }
    return ok({
      cardCode: meta.cardCode ?? null,
      productName: meta.productName ?? null,
      operatorName: meta.operatorName ?? tx.counterpartyName ?? "مشغل",
      productCode: meta.productCode ?? null,
    });
  }

  const feeMinor = await peekPaymentsFeeMinor(db, "CARD_PURCHASE");
  // feeMinor حقل إضافي فوق CardProductView (لعرضه في المراجعة) — لا يعدل العقد
  return ok(CARDS.map((c) => ({ ...toCardProductView(c), feeMinor })));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  // Master §139: إنفاذ مفتاح الخدمة الإداري خادمياً (NETWORK_CARDS)
  await assertServiceOn("NETWORK_CARDS");
  assertNotFrozen(user);
  await assertInScope(db, user);

  const body = await readJsonBody(req);
  const productCode = reqStr(body, "productCode");
  const pin = reqStr(body, "pin");

  const product = cardByCode(productCode);
  if (!product) {
    throw new RouteError("TOP-001", 404, { productCode, reason: "باقة كرت غير معروفة" });
  }
  const amountMinor = product.priceMinor;

  // Idempotency قبل أي شيء آخر
  const idemKey = readIdempotencyKey(req);
  if (idemKey) {
    const existing = await findIdempotentTx(db, user.id, idemKey);
    if (existing) {
      if (existing.type !== "CARD_PURCHASE") throw new RouteError("TXN-003", 409);
      assertSamePayload(existing, body);
      const wallet = await db.wallet.findFirst({
        where: { userId: user.id, kind: "MAIN", currency: "YER" },
      });
      const meta = existing.metadataJson
        ? (JSON.parse(existing.metadataJson) as {
            cardCode?: string;
            productName?: string;
            operatorName?: string;
          })
        : {};
      return ok({
        ...toTxView(existing),
        replayed: true,
        balanceMinor: wallet?.balanceMinor,
        cardCode: meta.cardCode ?? null,
        productName: meta.productName ?? product.name,
        operatorName: meta.operatorName ?? product.operatorName,
      });
    }
  }

  // PIN على عميل مستقل
  await verifyPin(db, user, pin);

  const result = await db.$transaction(async (tx) => {
    const main = await getOrCreateMainWallet(tx, user.id, "YER");
    const feeRule = await getPaymentsFeeRule(tx, "CARD_PURCHASE");
    const feeMinor = computeFee(feeRule, amountMinor);
    const totalDebit = amountMinor + feeMinor;

    if (main.balanceMinor < totalDebit) {
      throw new RouteError("TXN-001", 400, { currency: "YER", balance: main.balanceMinor });
    }
    await assertDailyLimit(tx, user, "YER", totalDebit);

    const feeWallet = await getSystemWallet(tx, "FEE", "YER");
    const suspense = await getSystemWallet(tx, "SUSPENSE", "YER");

    // رمز الكرت: يولَّد مرة واحدة ويُخزن في metadataJson (يظهر عند الإشعار والتفاصيل)
    const cardCode = generateCardCode();

    const ref = generateRef("NC");
    const cardTx = await tx.transaction.create({
      data: {
        ref,
        userId: user.id,
        type: "CARD_PURCHASE",
        status: "COMPLETED",
        currency: "YER",
        amountMinor,
        feeMinor,
        direction: "DEBIT",
        counterpartyName: product.operatorName,
        description: `شراء كرت شبكة ${product.operatorName} — ${product.name} (${product.size})`,
        idempotencyKey: idemKey,
        completedAt: new Date(),
        metadataJson: JSON.stringify(
          idemKey
            ? idmMeta(body, {
                productCode: product.code,
                productName: product.name,
                operatorName: product.operatorName,
                cardCode,
              })
            : {
                productCode: product.code,
                productName: product.name,
                operatorName: product.operatorName,
                cardCode,
              }
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
      "تم شراء كرت الشبكة",
      `كرت ${product.name} من ${product.operatorName} (${formatMinor(amountMinor, "YER")}) — رمز الكرت: ${cardCode}. احفظ الرمز؛ تجده أيضاً في تفاصيل العملية.`,
      "TXN",
      ref
    );

    return { cardTx, balanceAfter: main.balanceMinor - totalDebit, feeMinor, cardCode };
  });

  await writeAudit(
    db,
    { id: user.id, role: user.role },
    "CARD_PURCHASE_EXEC",
    "TRANSACTION",
    result.cardTx.ref,
    `شراء كرت شبكة ${product.operatorName} — ${product.name}`
  );

  return ok({
    ...toTxView(result.cardTx),
    balanceMinor: result.balanceAfter,
    cardCode: result.cardCode,
    productName: product.name,
    operatorName: product.operatorName,
  });
});
