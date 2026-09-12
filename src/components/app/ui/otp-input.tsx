/**
 * محفظة الجنوب — المكون القياسي 7/10: حقل رمز التحقق (OTPInput)
 * 6 خانات RTL تُملأ من اليمين (خانة index 0 هي اليمنى في dir=rtl)،
 * لصق الرمز كاملاً مدعوم (input مخفي يلتقط كل الإدخال)،
 * عدّاد تنازلي 60 ثانية لإعادة الإرسال، وحالة خطأ بحدود حمراء + نص المحاولات.
 */
"use client";

import { useId, useRef } from "react";
import { cn } from "@/lib/utils";
import { onlyDigits } from "./utils";

export interface OTPInputProps {
  value: string;
  onChange: (code: string) => void;
  /** يُستدعى عند اكتمال الرمز (6 خانات) */
  onComplete?: (code: string) => void;
  error?: string | null;
  /** عدد محاولات الإدخال المتبقية (يعرض نصاً) */
  attemptsLeft?: number;
  /** ثواني الانتظار قبل إعادة الإرسال (0 أو غير محدد = متاحة) */
  resendSeconds?: number;
  onResend?: () => void;
  disabled?: boolean;
  length?: number;
  className?: string;
}

export function OTPInput({
  value,
  onChange,
  onComplete,
  error,
  attemptsLeft,
  resendSeconds,
  onResend,
  disabled = false,
  length = 6,
  className,
}: OTPInputProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const chars = value.split("");

  const handleChange = (raw: string) => {
    const code = onlyDigits(raw).slice(0, length);
    onChange(code);
    if (code.length === length) onComplete?.(code);
  };

  const canResend = !resendSeconds || resendSeconds <= 0;

  return (
    <div className={cn("w-full", className)}>
      {/* الخانات — input مخفي يحتكر الإدخال واللصق */}
      <div
        className="relative"
        onMouseDown={(e) => {
          // النقر في أي مكان يركّز حقل الإدخال المخفي
          if (window.getSelection()?.toString() === "") {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        <div dir="rtl" className="flex justify-center gap-2">
          {Array.from({ length }).map((_, i) => {
            const filled = i < chars.length;
            const isCursor = i === chars.length && !disabled && !error;
            return (
              <div
                key={i}
                aria-hidden="true"
                className={cn(
                  "flex h-[52px] w-11 items-center justify-center rounded-xl border text-[20px] font-bold tabular-nums transition-all",
                  error
                    ? "border-[#B91C1C] bg-[#B91C1C]/[0.04] text-[#B91C1C]"
                    : filled
                      ? "border-[#0B0B0C] bg-white text-[#141416]"
                      : "border-[#E8E6E1] bg-[#F7F6F2] text-[#141416]",
                  isCursor && "border-[#C9A227] bg-[#C9A227]/[0.06] sw-breathe",
                )}
              >
                {chars[i] ?? ""}
              </div>
            );
          })}
        </div>
        <label htmlFor={inputId} className="sr-only">
          رمز التحقق المكوّن من {length} أرقام
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          dir="ltr"
          value={value}
          disabled={disabled}
          onChange={(e) => handleChange(e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            handleChange(e.clipboardData.getData("text/plain"));
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      {/* الخطأ + المحاولات المتبقية */}
      {error ? (
        <p className="mt-2 text-center text-[13px] font-medium text-[#B91C1C]">{error}</p>
      ) : null}
      {typeof attemptsLeft === "number" && !error ? (
        <p className="mt-2 text-center text-[12px] font-medium text-[#A3A09B]">
          المحاولات المتبقية: {attemptsLeft}
        </p>
      ) : null}

      {/* إعادة الإرسال بعد 60 ثانية */}
      {onResend ? (
        <div className="mt-3 text-center">
          {canResend ? (
            <button
              type="button"
              onClick={onResend}
              disabled={disabled}
              className="min-h-11 rounded-lg px-4 text-[14px] font-bold text-[#C9A227] underline decoration-[#C9A227]/40 underline-offset-4 transition-colors hover:text-[#A2831B] disabled:opacity-50"
            >
              إعادة إرسال الرمز
            </button>
          ) : (
            <p className="text-[13px] font-medium text-[#A3A09B]">
              إعادة الإرسال خلال{" "}
              <span className="tabular-nums font-bold text-[#5C5A56]">
                {resendSeconds}
              </span>{" "}
              ثانية
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
