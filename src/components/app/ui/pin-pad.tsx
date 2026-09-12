/**
 * محفظة الجنوب — المكون القياسي 8/10: لوحة رمز PIN (PINPad)
 * 6 نقاط ملء (تمتلئ مع الإدخال) + AmountPad بوضع digits +
 * عنوان العملية الحساسة (contextLabel) + عدّاد محاولات وتحذير القفل
 * (PIN-002 من الخادم يمرّ عبر lockSeconds) + زر بصمة إن كانت مفعّلة
 * (محاكاة ناجحة فورية في Alpha عبر onBiometric).
 */
"use client";

import { Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";
import { AmountPad } from "./amount-pad";

export interface PINPadProps {
  /** عنوان يوضح العملية الحساسة الجارية (مثل: تأكيد تحويل 500 ريال) */
  contextLabel?: string;
  /** قيمة الرمز الجارية */
  pin: string;
  onChange: (pin: string) => void;
  /** يُستدعى عند اكتمال 6 أرقام */
  onComplete?: (pin: string) => void;
  error?: string | null;
  attemptsLeft?: number;
  /** ثواني القفل التصاعدي المتبقية (PIN-002) */
  lockSeconds?: number;
  /** البصمة إن كانت مفعّلة — الضغط عليها يحاكي نجاحاً فورياً في Alpha */
  biometric?: { onPress: () => void };
  length?: number;
  disabled?: boolean;
  className?: string;
}

export function PINPad({
  contextLabel,
  pin,
  onChange,
  onComplete,
  error,
  attemptsLeft,
  lockSeconds,
  biometric,
  length = 6,
  disabled = false,
  className,
}: PINPadProps) {
  const locked = typeof lockSeconds === "number" && lockSeconds > 0;

  const handleChange = (next: string) => {
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  return (
    <div className={cn("w-full", className)}>
      {/* عنوان العملية الحساسة */}
      {contextLabel ? (
        <p className="mb-3 text-center text-[15px] font-bold leading-6 text-[#141416]">
          {contextLabel}
        </p>
      ) : null}

      {/* نقاط الملء */}
      <div dir="rtl" className="flex items-center justify-center gap-3.5 py-4">
        {Array.from({ length }).map((_, i) => {
          const filled = i < pin.length;
          return (
            <span
              key={i}
              aria-hidden="true"
              className={cn(
                "h-3.5 w-3.5 rounded-full border transition-all",
                error
                  ? "border-[#B91C1C] bg-[#B91C1C]"
                  : filled
                    ? "scale-110 border-[#0B0B0C] bg-[#0B0B0C]"
                    : "border-[#E8E6E1] bg-[#F7F6F2]",
              )}
            />
          );
        })}
      </div>
      <span className="sr-only" aria-live="polite">
        {pin.length > 0 ? `تم إدخال ${pin.length} من ${length} أرقام` : ""}
      </span>

      {/* الخطأ / المحاولات / القفل */}
      {error ? (
        <p className="mb-2 text-center text-[13px] font-medium text-[#B91C1C]">{error}</p>
      ) : null}
      {locked ? (
        <p className="mb-2 text-center text-[13px] font-semibold text-[#B45309]">
          رمز PIN مقفل مؤقتاً — أعد المحاولة بعد{" "}
          <span className="tabular-nums">{lockSeconds}</span> ثانية
        </p>
      ) : typeof attemptsLeft === "number" ? (
        <p className="mb-2 text-center text-[12px] font-medium text-[#A3A09B]">
          المحاولات المتبقية: {attemptsLeft}
        </p>
      ) : null}

      {/* لوحة الأرقام */}
      <AmountPad
        value={pin}
        onChange={handleChange}
        mode="digits"
        disabled={disabled || locked}
      />

      {/* زر البصمة (إن كانت مفعّلة) */}
      {biometric ? (
        <button
          type="button"
          onClick={biometric.onPress}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#C9A227]/40 bg-[#C9A227]/[0.06] px-4 text-[14px] font-bold text-[#8A6E14] transition-colors hover:bg-[#C9A227]/[0.12]"
        >
          <Fingerprint strokeWidth={1.5} className="h-5 w-5 text-[#C9A227]" />
          استخدم البصمة بدلاً من الرمز
        </button>
      ) : null}
    </div>
  );
}
