/**
 * محفظة الجنوب — حقل عرض المبلغ الكبير (AmountInputField)
 * عرض المبلغ 32/40 ExtraBold بأرقام tabular فوق لوحة الأرقام،
 * مع رمز العملة الذهبي، وتنسيق فواصل الآلاف الحي، وحالة خطأ.
 */
"use client";

import type { CurrencyCode } from "@/lib/api-types";
import { CURRENCY_META } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { groupDigits } from "./utils";

export interface AmountInputFieldProps {
  /** نص المبلغ الجاري (أرقام لاتينية + فاصلة اختيارية) */
  value: string;
  currency: CurrencyCode;
  placeholder?: string;
  /** سطر تلميح أسفل الحقل (مثل حدود المبلغ) */
  hint?: string;
  error?: string | null;
  className?: string;
}

export function AmountInputField({
  value,
  currency,
  placeholder = "0",
  hint,
  error,
  className,
}: AmountInputFieldProps) {
  const meta = CURRENCY_META[currency];

  return (
    <div className={cn("w-full", className)}>
      <div
        dir="ltr"
        className={cn(
          "flex min-h-[88px] w-full items-center justify-center gap-3 rounded-2xl border bg-white px-4 py-4 transition-colors",
          error ? "border-[#B91C1C]/60 bg-[#B91C1C]/[0.03]" : "border-[#E8E6E1]",
        )}
      >
        <span className="text-[18px] font-semibold text-[#C9A227]">{meta.symbolAr}</span>
        <span
          className={cn(
            "text-[32px] font-extrabold leading-10 tabular-nums",
            value ? "text-[#141416]" : "text-[#A3A09B]",
          )}
        >
          {value ? groupDigits(value) : placeholder}
        </span>
      </div>
      {error ? (
        <p className="mt-1.5 text-center text-[13px] font-medium text-[#B91C1C]">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-center text-[13px] font-medium text-[#5C5A56]">{hint}</p>
      ) : null}
    </div>
  );
}
