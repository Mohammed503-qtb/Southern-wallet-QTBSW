/**
 * محفظة الجنوب — أدوات عرض مشتركة للواجهة
 * تنسيق التواريخ بالعربية (date-fns)، التحيّة، واسم المستخدم الأول.
 */
"use client";

import { format } from "date-fns";
import { ar } from "date-fns/locale";

/** تاريخ ووقت كامل: 12 مارس 2026، 14:05 */
export function formatDateTime(iso: string): string {
  try {
    return format(new Date(iso), "d MMMM yyyy، HH:mm", { locale: ar });
  } catch {
    return iso;
  }
}

/** تاريخ قصير للصفوف: 12 مارس • 14:05 */
export function formatShortDateTime(iso: string): string {
  try {
    return format(new Date(iso), "d MMM • HH:mm", { locale: ar });
  } catch {
    return iso;
  }
}

/** تحيّة الوقت الحالي */
export function greetingLabel(): string {
  const h = new Date().getHours();
  return h < 12 ? "صباح الخير" : "مساء الخير";
}

/** الاسم الأول لعرض التحيّة (أو بديل) */
export function firstNameOf(
  fullName: string | null | undefined,
  fallback = "ضيف",
): string {
  if (!fullName || !fullName.trim()) return fallback;
  return fullName.trim().split(/\s+/)[0];
}

/** الحرف الأول لصورة الحساب */
export function initialOf(fullName: string | null | undefined): string {
  return firstNameOf(fullName, "م").charAt(0);
}

/** تنسيق المبلغ الحي أثناء الكتابة: فواصل آلاف للجزء الصحيح فقط */
export function groupDigits(value: string): string {
  if (!value) return "";
  const [intPart, decPart] = value.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? `${grouped}.${decPart}` : grouped;
}

/** استخلاص الأرقام فقط من نص */
export function onlyDigits(text: string): string {
  return text.replace(/[^\d]/g, "");
}
