/**
 * محفظة الجنوب — طبقة تخزين الحوالات الواردة (A-03 — 9-c)
 * =========================================================
 * حيلة التخزين الموثقة (المخطط prisma/schema.prisma مغلق — لا تعديل):
 *
 * جدول Remittance يُستعمل نفسه للحوالة الواردة من شبكة صرافة:
 *   • senderId      → معرف مستخدم الإدارة المُصدِر (ADMIN/COMPLIANCE)
 *   • receiverName  → اسم المستلم الحقيقي (نفس اسم حسابه)
 *   • receiverPhone → هاتف المستلم المستهدف (المطالبة تتحقق أن
 *                     session user.phone === remittance.receiverPhone)
 *   • deliveryCode  → رمز المطالبة 6 أرقام (نفس فلسفة رمز التسليم)
 *   • status        → PENDING حتى المطالبة ثم PAID (الإلغاء/الانتهاء
 *                     يمر بمحرك cashflow.settleRemittance الذي يميّز
 *                     الواردة بغياب معاملة REMITTANCE ممولة → بلا استرجاع)
 *   • payingAgentId → يبقى فارغاً دائماً (لا وكيل في هذه القناة)
 *
 * الفرق الإضافي (اسم الشبكة + اسم المرسل الحقيقي) يُخزَّن في معاملة
 * نائبة PENDING بنفس المرجع (RI-YYYYMMDD-XXXXXXXX):
 *   Transaction {
 *     userId: المستلم، type: "REMIT_IN_CLAIM"، status: PENDING،
 *     direction: CREDIT، counterpartyName: اسم الشبكة،
 *     description: "حوالة واردة من <المرسل> — شبكة <الشبكة>"،
 *     metadataJson: { networkName, senderName, beneficiaryPhone }
 *   }
 * عند المطالبة تُقلَب هذه المعاملة نفسها إلى COMPLETED وتُقيَّد تحتها
 * القيود [FX:YER DEBIT a] + [MAIN المستلم CREDIT a] (Σ=0) — تماماً
 * كنمط الحوالة العادية (R2 → G4) لكن مصدر التمويل محفظة FX (النقد
 * الخارجي للاقتصاد المغلق D-01) بدل SUSPENSE.
 * رسوم الإصدار الوارد feeMinor = 0 في Beta (المستلم يستلم amountMinor كاملاً).
 */
import type { Remittance, Transaction } from "@prisma/client";
import type { InboundRemittanceView } from "../api-types";

/** metadata المعاملة النائبة للحوالة الواردة */
export interface RemitInMeta {
  networkName: string;
  senderName: string;
  beneficiaryPhone?: string;
  claimCode?: string;
  idmHash?: string;
}

/** قراءة metadata معاملة الحوالة الواردة (سلسلة JSON) بأمان */
export function parseRemitInMeta(tx: Pick<Transaction, "metadataJson">): RemitInMeta | null {
  if (!tx.metadataJson) return null;
  try {
    const parsed = JSON.parse(tx.metadataJson) as Partial<RemitInMeta>;
    if (typeof parsed.networkName !== "string" || typeof parsed.senderName !== "string") {
      return null;
    }
    return {
      networkName: parsed.networkName,
      senderName: parsed.senderName,
      beneficiaryPhone: typeof parsed.beneficiaryPhone === "string" ? parsed.beneficiaryPhone : undefined,
      claimCode: typeof parsed.claimCode === "string" ? parsed.claimCode : undefined,
    };
  } catch {
    return null;
  }
}

/** خريطة حالة Remittance → حالة InboundRemittanceView (PAID→CLAIMED، CANCELLED→EXPIRED) */
export function mapInboundStatus(status: string): "PENDING" | "CLAIMED" | "EXPIRED" {
  if (status === "PAID") return "CLAIMED";
  if (status === "PENDING") return "PENDING";
  return "EXPIRED"; // EXPIRED | CANCELLED
}

/** بناء InboundRemittanceView من زوج (Remittance + معاملة REMIT_IN_CLAIM بنفس ref) */
export function toInboundRemittanceView(
  rem: Remittance,
  tx: Pick<Transaction, "metadataJson" | "counterpartyName"> | null
): InboundRemittanceView {
  const meta = tx ? parseRemitInMeta(tx) : null;
  return {
    ref: rem.ref,
    networkName: meta?.networkName ?? tx?.counterpartyName ?? "شبكة صرافة",
    senderName: meta?.senderName ?? "مرسل",
    amountMinor: rem.amountMinor,
    currency: rem.currency as InboundRemittanceView["currency"],
    feeMinor: rem.feeMinor, // 0 في Beta للإصدار الوارد
    claimCode: rem.deliveryCode,
    status: mapInboundStatus(rem.status),
    createdAt: rem.createdAt.toISOString(),
    expiresAt: rem.expiresAt.toISOString(),
  };
}
