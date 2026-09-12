/**
 * POST /api/merchant/lookup { payload } — MERCHANT_PAY (9-c)
 * --------------------------------------------------------
 * payload = "SWPAY:770000020" أو "770000020" (بعد تقليم البادئة).
 * التحقق: المستخدم موجود role="MERCHANT" + ACTIVE + غير scopeRestricted
 * (أي حالة أخرى → MRC-001 «التاجر غير مسجل في شبكة الدفع» — بما فيها
 * الرقم غير الموجود أصلاً كي لا نسرّب وجود الحسابات).
 * يعيد QrPayPreviewView { merchant: MerchantPublicView } —
 * shopName من user.fullName أساساً، category/governorate من كتالوج التجار.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { toMerchantPublicView } from "@/lib/server/merchant-catalog";
import { db } from "@/lib/db";

/** استخراج هاتف التاجر من حمولة QR: يقبل SWPAY:<phone> أو الرقم مباشرة */
export function extractPhoneFromPayload(raw: string): string {
  const trimmed = raw.trim();
  const phone = trimmed.toUpperCase().startsWith("SWPAY:")
    ? trimmed.slice("SWPAY:".length)
    : trimmed;
  return phone.replace(/\D/g, "").slice(0, 9);
}

export const POST = route(async (req) => {
  await requireUser();

  const body = await readJsonBody(req);
  const payload = reqStr(body, "payload");
  const phone = extractPhoneFromPayload(payload);

  if (!/^7\d{8}$/.test(phone)) {
    throw new RouteError("MRC-001", 404, { reason: "رمز الدفع غير صالح — يجب أن يكون SWPAY:<هاتف التاجر>" });
  }

  const merchant = await db.user.findUnique({ where: { phone } });
  if (
    !merchant ||
    merchant.role !== "MERCHANT" ||
    merchant.status !== "ACTIVE" ||
    merchant.scopeRestricted
  ) {
    throw new RouteError("MRC-001", 404, { phone });
  }

  return ok({ merchant: toMerchantPublicView(merchant) });
});
