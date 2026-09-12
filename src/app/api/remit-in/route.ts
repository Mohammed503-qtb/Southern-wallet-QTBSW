/**
 * GET  /api/remit-in — حوالاتي الواردة (InboundRemittanceView[]) (A-03 — 9-c)
 * POST /api/remit-in { claimCode, pin } + Idempotency-Key — استلام فوري برصيد
 * ---------------------------------------------------------------------------
 * GET: قائمة الحوالات الواردة للمستلم الحالي (المعاملات النائبة REMIT_IN_CLAIM
 *      التي userId = المستلم) مع إنهاء كسول عام (expireDueRemittances يعالج
 *      الواردة بلا استرجاع — انظر حارس A-03 في cashflow.ts).
 * POST: الرمز 6 أرقام + PIN → التحقق (RIN-001 للرمز الخاطئ/المنتهي/المطالب/
 *      المملوك لغيرك) → الحالة PAID + معاملة REMIT_IN_CLAIM COMPLETED بقيد
 *      [FX:YER DEBIT a] + [MAIN CREDIT a] (Σ=0 — التمويل من محفظة FX: النقد
 *      الخارجي للاقتصاد المغلق D-01) + إشعار → RemitInClaimResultView.
 * Idempotency: مفتاح المطالبة يُخزَّن على المعاملة النائبة عند التنفيذ،
 * والإعادة بنفس المفتاح تعيد نفس النتيجة (replayed=true — AC-03).
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { assertNotFrozen, assertInScope } from "@/lib/server/domain";
import { verifyPin } from "@/lib/server/pin";
import { formatMinor } from "@/lib/server/money";
import { getOrCreateMainWallet, getSystemWallet, postEntries } from "@/lib/server/ledger";
import { notify } from "@/lib/server/notify";
import { expireDueRemittances } from "@/lib/server/cashflow";
import { readIdempotencyKey, findIdempotentTx, assertSamePayload, idmMeta } from "@/lib/server/idempotency";
import { toTxView } from "@/lib/server/views";
import { parseRemitInMeta, toInboundRemittanceView } from "@/lib/server/remit-in-store";
import { db } from "@/lib/db";
import type { RemitInClaimResultView } from "@/lib/api-types";

const CURRENCY = "YER" as const;

export const GET = route(async () => {
  const user = await requireUser();

  // إنهاء كسول عام (يعالج الحوالات الواردة المنتهية بلا استرجاع — حارس A-03)
  await expireDueRemittances();

  // المعاملات النائبة REMIT_IN_CLAIM للمستلم = مفاتيح حوالاته الواردة
  const txs = await db.transaction.findMany({
    where: { userId: user.id, type: "REMIT_IN_CLAIM" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  if (txs.length === 0) return ok([]);
  const rems = await db.remittance.findMany({
    where: { ref: { in: txs.map((t) => t.ref) } },
  });
  const remByRef = new Map(rems.map((r) => [r.ref, r]));
  const views = txs
    .map((t) => {
      const rem = remByRef.get(t.ref);
      return rem ? toInboundRemittanceView(rem, t) : null;
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
  return ok(views);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  assertNotFrozen(user);
  await assertInScope(db, user);

  const body = await readJsonBody(req);
  const claimCode = reqStr(body, "claimCode").replace(/\D/g, "");
  if (!/^\d{6}$/.test(claimCode)) {
    throw new RouteError("RIN-001", 404, { reason: "رمز المطالبة يجب أن يكون 6 أرقام" });
  }
  const pin = reqStr(body, "pin");

  // Idempotency (AC-03) — الإعادة تعيد نفس نتيجة المطالبة
  const idemKey = readIdempotencyKey(req);
  if (idemKey) {
    const existing = await findIdempotentTx(db, user.id, idemKey);
    if (existing) {
      if (existing.type !== "REMIT_IN_CLAIM") throw new RouteError("TXN-003", 409);
      assertSamePayload(existing, body);
      const rem = await db.remittance.findUnique({ where: { ref: existing.ref } });
      const meta = parseRemitInMeta(existing);
      const wallet = await db.wallet.findFirst({
        where: { userId: user.id, kind: "MAIN", currency: CURRENCY },
      });
      const result: RemitInClaimResultView = {
        ...toTxView(existing),
        replayed: true,
        networkName: meta?.networkName ?? "شبكة صرافة",
        senderName: meta?.senderName ?? "مرسل",
        balanceMinor: wallet?.balanceMinor,
      };
      void rem;
      return ok(result);
    }
  }

  // البحث بالرمز — قد يصادف حوالة عادية (رمز تسليم) → ترفض بRIN-001
  const rem = await db.remittance.findFirst({
    where: { deliveryCode: claimCode },
    orderBy: { createdAt: "desc" },
  });

  // شروط الملكية والنوع: معاملة نائبة REMIT_IN_CLAIM بنفس المرجع لهذا المستلم
  const claimTx = rem
    ? await db.transaction.findFirst({
        where: { ref: rem.ref, type: "REMIT_IN_CLAIM", userId: user.id },
      })
    : null;
  if (!rem || !claimTx) {
    throw new RouteError("RIN-001", 404, { reason: "لا توجد حوالة واردة بهذا الرمز لحسابك" });
  }
  if (rem.receiverPhone !== user.phone) {
    // الرمز صحيح لكنه ليس لحساب هذا المستخدم — رسالة موحدة (لا تسريب)
    throw new RouteError("RIN-001", 404, { reason: "لا توجد حوالة واردة بهذا الرمز لحسابك" });
  }
  if (rem.status !== "PENDING" || rem.expiresAt < new Date()) {
    throw new RouteError("RIN-001", 409, {
      reason: rem.status === "PAID" ? "الحوالة سبق استلامها" : "انتهت صلاحية الحوالة",
      status: rem.status,
    });
  }

  // PIN على عميل مستقل (نمط T2)
  await verifyPin(db, user, pin);

  const meta = parseRemitInMeta(claimTx);
  const networkName = meta?.networkName ?? "شبكة صرافة";
  const senderName = meta?.senderName ?? "مرسل";
  const amountMinor = rem.amountMinor;

  const result = await db.$transaction(async (tx) => {
    // إعادة الفحص داخل المعاملة (تعارض تزامني → RIN-001)
    const fresh = await tx.remittance.findUnique({ where: { id: rem.id } });
    if (!fresh || fresh.status !== "PENDING" || fresh.expiresAt < new Date()) {
      throw new RouteError("RIN-001", 409, { reason: "الحوالة لم تعد قابلة للاستلام" });
    }

    // 1) قلب حالة الحوالة إلى PAID (بلا payingAgentId — لا وكيل هنا)
    const flipped = await tx.remittance.updateMany({
      where: { id: fresh.id, status: "PENDING" },
      data: { status: "PAID", paidAt: new Date() },
    });
    if (flipped.count === 0) {
      throw new RouteError("RIN-001", 409, { reason: "الحوالة سبق استلامها" });
    }

    // 2) قلب المعاملة النائبة إلى COMPLETED + تخزين مفتاح Idempotency للمطالبة
    await tx.transaction.updateMany({
      where: { ref: fresh.ref, type: "REMIT_IN_CLAIM", status: "PENDING" },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        ...(idemKey ? { idempotencyKey: idemKey } : {}),
        metadataJson: JSON.stringify(
          idemKey
            ? idmMeta(body, { networkName, senderName, claimCode })
            : { networkName, senderName, claimCode }
        ),
      },
    });

    // 3) القيود Σ=0 — التمويل من محفظة FX (النقد الخارجي — D-01)
    const main = await getOrCreateMainWallet(tx, user.id, CURRENCY);
    const fx = await getSystemWallet(tx, "FX", CURRENCY);
    await postEntries(
      tx,
      [
        { walletId: fx.id, direction: "DEBIT", amountMinor },
        { walletId: main.id, direction: "CREDIT", amountMinor },
      ],
      { transactionRef: fresh.ref, currency: CURRENCY }
    );

    // 4) إشعار المستلم
    await notify(
      tx,
      user.id,
      "تم استلام حوالة واردة",
      `استلمت ${formatMinor(amountMinor, CURRENCY)} حوالة واردة من ${senderName} عبر ${networkName}.`,
      "TXN",
      fresh.ref
    );

    return { ref: fresh.ref, balanceAfter: main.balanceMinor + amountMinor };
  });

  const completedTx = await db.transaction.findUnique({ where: { ref: result.ref } });
  const out: RemitInClaimResultView = {
    ...toTxView(completedTx!),
    networkName,
    senderName,
    balanceMinor: result.balanceAfter,
  };
  return ok(out);
});
