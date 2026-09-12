/**
 * محفظة الجنوب — طلب إيداع نقدي (SC-22)
 * يغلف المسار المشترك CashRequestFlow بنوع DEPOSIT:
 * اختيار وكيل → المبلغ (YER) → C3 (مجاني) → مراجعة → C4 (بلا PIN)
 * → نتيجة بالرمز وتعليمات "اذهب للوكيل وقدّم الرمز مع النقد".
 * ملكية الملف: الوكيل 8-c-1.
 */
"use client";

import { CashRequestFlow } from "./shared-cash-request";

export function CashDepositScreen() {
  return <CashRequestFlow type="DEPOSIT" />;
}
