/**
 * محفظة الجنوب — طلب سحب نقدي (SC-23)
 * يغلف المسار المشترك CashRequestFlow بنوع WITHDRAW:
 * اختيار وكيل → المبلغ (YER) → C3 → مراجعة → PIN → C4 (خصم + حجز فوري
 * بمفتاح Idempotency) → الانتقال لشاشة رمز السحب (SC-24).
 * ملكية الملف: الوكيل 8-c-1.
 */
"use client";

import { CashRequestFlow } from "./shared-cash-request";

export function CashWithdrawScreen() {
  return <CashRequestFlow type="WITHDRAW" />;
}
