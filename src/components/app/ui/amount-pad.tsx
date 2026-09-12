/**
 * محفظة الجنوب — المكون القياسي 2/10: لوحة الأرقام (AmountPad)
 * شبكة 3 أعمدة بأرقام كبيرة (1..9 ثم 0) — الأعمدة تتبع RTL منطقياً
 * (العمود الأيمن يبدأ 1-2-3 تلقائياً مع dir=rtl).
 * الأوضاع: amount (مبالغ 12 رقم) / phone (هاتف 9 أرقام) / digits (رمز PIN 6).
 * زر الحذف مقلوب الاتجاه (backspace يشير يميناً في RTL).
 */
"use client";

import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

export type AmountPadMode = "amount" | "phone" | "digits";

export interface AmountPadProps {
  value: string;
  onChange: (next: string) => void;
  mode?: AmountPadMode;
  /** إظهار زر الفاصلة العشرية (يعمل فقط في وضع amount) */
  decimal?: boolean;
  /** زر تأكيد اختياري في الصف الأخير */
  onEnter?: () => void;
  enterLabel?: string;
  disabled?: boolean;
  className?: string;
}

const MAX_BY_MODE: Record<AmountPadMode, number> = {
  amount: 12,
  phone: 9,
  digits: 6,
};

const KEY_BASE =
  "flex h-14 min-h-11 items-center justify-center rounded-xl transition-colors disabled:opacity-40 select-none";
const KEY_WARM = `${KEY_BASE} bg-[#F7F6F2] hover:bg-[#F0EEE7] active:bg-[#EAE7DE]`;

/** زر رقم واحد (مكوّن مستقل خارج الرسم لضمان ثبات الحالة) */
function DigitKey({
  d,
  disabled,
  onPress,
}: {
  d: string;
  disabled: boolean;
  onPress: (d: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`الرقم ${d}`}
      onClick={() => onPress(d)}
      disabled={disabled}
      className={cn(KEY_WARM, "text-[24px] font-semibold tabular-nums text-[#141416]")}
    >
      {d}
    </button>
  );
}

export function AmountPad({
  value,
  onChange,
  mode = "amount",
  decimal = false,
  onEnter,
  enterLabel,
  disabled = false,
  className,
}: AmountPadProps) {
  const maxLen = MAX_BY_MODE[mode];
  const allowDot = mode === "amount" && decimal && !value.includes(".");

  const press = (key: string) => {
    if (disabled) return;
    if (key === "del") {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === "enter") {
      onEnter?.();
      return;
    }
    if (key === ".") {
      if (allowDot && value !== "") onChange(`${value}.`);
      return;
    }
    // رقم
    if (value.replace(".", "").length >= maxLen) return;
    // في المبالغ: الصفر البادئ يُستبدل ولا يتكرر
    if (mode === "amount" && (value === "" || value === "0")) {
      onChange(key);
      return;
    }
    onChange(value + key);
  };

  return (
    <div
      className={cn("grid select-none grid-cols-3 gap-2.5", disabled && "opacity-60", className)}
      role="group"
      aria-label="لوحة الأرقام"
    >
      {(["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const).map((d) => (
        <DigitKey key={d} d={d} disabled={disabled} onPress={press} />
      ))}

      {/* الصف الأخير: فاصلة عشرية (أو زر تأكيد أو فراغ) — صفر — حذف */}
      {allowDot ? (
        <button
          type="button"
          aria-label="فاصلة عشرية"
          onClick={() => press(".")}
          disabled={disabled}
          className={cn(KEY_WARM, "text-[24px] font-semibold text-[#141416]")}
        >
          .
        </button>
      ) : onEnter ? (
        <button
          type="button"
          aria-label={enterLabel ?? "تأكيد"}
          onClick={() => press("enter")}
          disabled={disabled}
          className={cn(
            KEY_BASE,
            "bg-[#0B0B0C] text-[15px] font-bold text-white hover:bg-[#1A1A1C] active:bg-[#232325]",
          )}
        >
          {enterLabel ?? "تأكيد"}
        </button>
      ) : (
        <div aria-hidden="true" className="h-14" />
      )}

      <DigitKey d="0" disabled={disabled} onPress={press} />

      <button
        type="button"
        aria-label="حذف رقم"
        onClick={() => press("del")}
        disabled={disabled}
        className={cn(KEY_WARM, "text-[#5C5A56]")}
      >
        <Delete strokeWidth={1.5} className="h-6 w-6 -scale-x-100" />
      </button>
    </div>
  );
}
