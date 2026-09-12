/**
 * محفظة الجنوب — حقل رقم الهاتف اليمني (مشترك بين الدخول والتسجيل)
 * مفتاح الدولة +967 ثابت في بداية السطر (يمين في RTL)، والأرقام تُكتب LTR.
 */
"use client";

import { cn } from "@/lib/utils";
import { onlyDigits } from "@/components/app/ui/utils";

export interface PhoneFieldProps {
  value: string;
  onChange: (digits: string) => void;
  label?: string;
  error?: string | null;
  hint?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function PhoneField({
  value,
  onChange,
  label = "رقم الهاتف",
  error,
  hint,
  disabled = false,
  autoFocus = false,
}: PhoneFieldProps) {
  return (
    <div className="w-full">
      <label
        htmlFor="sw-phone"
        className="mb-1.5 block text-[11px] font-semibold leading-4 text-[#5C5A56]"
      >
        {label}
      </label>
      <div
        className={cn(
          "flex h-[52px] items-stretch overflow-hidden rounded-xl border bg-white transition-colors",
          error ? "border-[#B91C1C]/60" : "border-[#E8E6E1] focus-within:border-[#C9A227]",
        )}
      >
        {/* مفتاح الدولة — بداية السطر (يمين في RTL) */}
        <span
          dir="ltr"
          className="flex min-w-[64px] items-center justify-center border-l border-[#E8E6E1] bg-[#F7F6F2] text-[15px] font-bold tabular-nums text-[#141416]"
        >
          +967
        </span>
        <input
          id="sw-phone"
          type="tel"
          inputMode="numeric"
          dir="ltr"
          autoFocus={autoFocus}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(onlyDigits(e.target.value).slice(0, 9))}
          placeholder="7XX XXX XXX"
          className="h-full w-full bg-transparent px-4 text-left text-[16px] font-semibold tabular-nums text-[#141416] placeholder:font-medium placeholder:text-[#A3A09B] focus:outline-none disabled:opacity-60"
          autoComplete="tel-national"
        />
      </div>
      {error ? (
        <p className="mt-1.5 text-[13px] font-medium text-[#B91C1C]">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] font-medium text-[#A3A09B]">{hint}</p>
      ) : null}
    </div>
  );
}
