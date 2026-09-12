/**
 * محفظة الجنوب — رموز الهوية المشتركة (ملزمة حرفياً من SCREENS_FLOWS §2.1)
 * تُستخدم القيم في الأنماط المضمنة (inline styles) فقط؛
 * أما Tailwind فيستعمل القيم نفسها بصيغة arbitrary (bg-[#0B0B0C] …).
 * الوضع الفاتح فقط في Alpha — لا داكن.
 */
"use client";

export const SW_COLORS = {
  /** أسود الجنوب — primary */
  primary: "#0B0B0C",
  /** ذهبي الجنوب — accent */
  gold: "#C9A227",
  /** سطح أساسي */
  surface: "#FFFFFF",
  /** سطح دافئ */
  warm: "#F7F6F2",
  /** خلفية الصفحة */
  page: "#FAF9F6",
  /** نجاح */
  success: "#15803D",
  /** معلق/تحذير */
  pending: "#B45309",
  /** خطأ */
  error: "#B91C1C",
  /** نصوص */
  textPrimary: "#141416",
  textSecondary: "#5C5A56",
  textDisabled: "#A3A09B",
  /** فواصل */
  divider: "#E8E6E1",
} as const;
