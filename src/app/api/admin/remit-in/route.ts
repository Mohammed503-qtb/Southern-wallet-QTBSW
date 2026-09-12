/**
 * GET  /api/admin/remit-in?status=PENDING|CLAIMED|EXPIRED — ADMIN/COMPLIANCE (9-c)
 * POST /api/admin/remit-in { beneficiaryPhone, senderName, networkName, amountMinor }
 * ----------------------------------------------------------------------------------
 * إدارة الحوالات الواردة من شبكات الصرافة (A-03):
 * GET: قائمة كل الحوالات الواردة بفلاتر حالة (المصدر: المعاملات النائبة
 *      REMIT_IN_CLAIM بكل مستلميها + الانتهاء الكسول أولاً).
 * POST: إصدار حوالة واردة PENDING باسم مستلم مسجل (TRF-001 لغير المسجل)
 *      من شبكة كتالوج remit-in-networks برمز مطالبة 6 أرقام فريد +
 *      صلاحية 7 أيام + إشعار وصول للمستلم (يشمل الرمز — قناة التسليم في
 *      Alpha) + AuditLog. لا حركة دفترية هنا — التمويل عند المطالبة من FX.
 * Idempotency اختياري عند الإصدار: يُخزَّن على المعاملة النائبة
 * (userId=المستلم) ويُفحص قبل الإنشاء — مفتاح المستلم لا يُستبدل إلا عند
 * المطالبة الفعلية (العملية المالية هي المطالبة — AC-03 للمال).
 */
import { ok, route, readJsonBody, reqStr, reqInt, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { assertValidPhone, generateRef, randomCode } from "@/lib/server/domain";
import { requireValidAmount, formatMinor } from "@/lib/server/money";
import { notify } from "@/lib/server/notify";
import { writeAudit } from "@/lib/server/audit";
import { expireDueRemittances } from "@/lib/server/cashflow";
import { readIdempotencyKey } from "@/lib/server/idempotency";
import { toInboundRemittanceView } from "@/lib/server/remit-in-store";
import { isValidRemitInNetwork, REMIT_IN_NETWORK_ERROR } from "@/lib/server/remit-in-networks";
import { db } from "@/lib/db";

const CURRENCY = "YER" as const;
const REMIT_IN_TTL_MS = 7 * 24 * 3600_000;

export const GET = route(async (req) => {
  await requireUser(["ADMIN", "COMPLIANCE"]);
  await expireDueRemittances();

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status"); // PENDING | CLAIMED | EXPIRED (أو فارغ = الكل)

  // كل الحوالات الواردة = كل المعاملات النائبة REMIT_IN_CLAIM (أي مستلم)
  const txs = await db.transaction.findMany({
    where: { type: "REMIT_IN_CLAIM" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const rems = txs.length
    ? await db.remittance.findMany({ where: { ref: { in: txs.map((t) => t.ref) } } })
    : [];
  const remByRef = new Map(rems.map((r) => [r.ref, r]));
  let views = txs
    .map((t) => {
      const rem = remByRef.get(t.ref);
      return rem ? toInboundRemittanceView(rem, t) : null;
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
  if (statusFilter && statusFilter !== "ALL") {
    views = views.filter((v) => v.status === statusFilter);
  }

  // إحصاء سريع للأقسام (يُحسب بعد الفلترة أم قبلها؟ قبلها — أرقام كلية)
  const counts = views.length; // بعد الفلترة
  return ok({ items: views, count: counts });
});

export const POST = route(async (req) => {
  const admin = await requireUser(["ADMIN", "COMPLIANCE"]);

  const body = await readJsonBody(req);
  const beneficiaryPhone = assertValidPhone(reqStr(body, "beneficiaryPhone"));
  const senderName = reqStr(body, "senderName").slice(0, 60);
  const networkName = reqStr(body, "networkName").slice(0, 60);
  const amountMinor = requireValidAmount(CURRENCY, reqInt(body, "amountMinor"));

  if (!isValidRemitInNetwork(networkName)) {
    throw new RouteError("SYS-001", 400, { field: "networkName", reason: REMIT_IN_NETWORK_ERROR });
  }

  // المستلم: مستخدم مسجل نشط (عميل أو تاجر)
  const beneficiary = await db.user.findUnique({ where: { phone: beneficiaryPhone } });
  if (
    !beneficiary ||
    (beneficiary.role !== "CUSTOMER" && beneficiary.role !== "MERCHANT") ||
    beneficiary.status !== "ACTIVE"
  ) {
    throw new RouteError("TRF-001", 404, { phone: beneficiaryPhone });
  }

  // Idempotency اختياري عند الإصدار (يخزن على المعاملة النائبة — userId=المستلم)
  const idemKey = readIdempotencyKey(req);
  if (idemKey) {
    const existing = await db.transaction.findFirst({
      where: { userId: beneficiary.id, idempotencyKey: idemKey, type: "REMIT_IN_CLAIM" },
    });
    if (existing) {
      const rem = await db.remittance.findUnique({ where: { ref: existing.ref } });
      if (rem) return ok({ ...toInboundRemittanceView(rem, existing), replayed: true });
    }
  }

  // رمز مطالبة 6 أرقام — إعادة المحاولة حتى التفرد عن كل الرموز القائمة
  let claimCode = randomCode(6);
  for (let i = 0; i < 5; i++) {
    const clash = await db.remittance.findFirst({ where: { deliveryCode: claimCode } });
    if (!clash) break;
    claimCode = randomCode(6);
  }

  const receiverName = beneficiary.fullName?.trim() || beneficiary.phone;
  const expiresAt = new Date(Date.now() + REMIT_IN_TTL_MS);

  const created = await db.$transaction(async (tx) => {
    // معاملة نائبة PENDING للمستلم — تحمل الشبكة والمرسل (حيلة التخزين)
    const ref = generateRef("RI");
    await tx.transaction.create({
      data: {
        ref,
        userId: beneficiary.id,
        type: "REMIT_IN_CLAIM",
        status: "PENDING",
        currency: CURRENCY,
        amountMinor,
        feeMinor: 0, // Beta: لا رسوم على الإصدار الوارد — المستلم يستلم المبلغ كاملاً
        direction: "CREDIT",
        counterpartyName: networkName,
        counterpartyPhone: null,
        description: `حوالة واردة من ${senderName} — شبكة ${networkName}`,
        ...(idemKey ? { idempotencyKey: idemKey } : {}),
        metadataJson: JSON.stringify({ networkName, senderName, beneficiaryPhone }),
      },
    });

    // سجل الحوالة الواردة (نفس جدول Remittance — انظر remit-in-store.ts)
    const rem = await tx.remittance.create({
      data: {
        ref,
        senderId: admin.id, // مُصدِر الإدارة (لا المرسل الحقيقي — الاسم في metadata)
        receiverName,
        receiverPhone: beneficiaryPhone,
        currency: CURRENCY,
        amountMinor,
        feeMinor: 0,
        deliveryCode: claimCode,
        status: "PENDING",
        expiresAt,
      },
    });

    // إشعار وصول للمستلم (يشمل الرمز — قناة التسليم في Alpha)
    await notify(
      tx,
      beneficiary.id,
      "وصلك رمز مطالبة حوالة",
      `وصلتك حوالة واردة ${formatMinor(amountMinor, CURRENCY)} من ${senderName} عبر ${networkName}. رمز المطالبة: ${claimCode} — صالحة 7 أيام، استلمها من شاشة «الحوالات الواردة».`,
      "TXN",
      ref
    );

    // تدقيق إداري للإصدار
    await writeAudit(
      tx,
      { id: admin.id, role: admin.role },
      "REMIT_IN_ISSUE",
      "REMITTANCE_IN",
      rem.id,
      `إصدار حوالة واردة ${formatMinor(amountMinor, CURRENCY)} من ${networkName} إلى ${receiverName} (${beneficiaryPhone})`,
      { networkName, senderName, amountMinor, claimCode, ref }
    );

    return rem;
  });

  const placeholderTx = await db.transaction.findUnique({ where: { ref: created.ref } });
  return ok(toInboundRemittanceView(created, placeholderTx));
});
