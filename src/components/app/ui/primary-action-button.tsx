/**
 * محفظة الجنوب — المكون القياسي 1/10: زر الإجراء الأساسي (PrimaryActionButton)
 * - أسود الجنوب #0B0B0C بارتفاع 52px، نص أبيض Bold 16.
 * - معطّل: رمادي #A3A09B مع نص السبب أسفل الزر (disabledReason).
 * - loading: مؤشر تقدم ذهبي رفيع أسفل الزر (شريط متحرك).
 * - نسخة glass للأسطح الداكنة (بطاقة الرصيد).
 */
"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PrimaryActionButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  /** نص سبب التعطيل — يظهر أسفل الزر */
  disabledReason?: string;
  loading?: boolean;
  /** solid: أسود الجنوب | glass: شفاف فوق الأسطح الداكنة */
  variant?: "solid" | "glass";
  className?: string;
}

export function PrimaryActionButton({
  children,
  onClick,
  type = "button",
  disabled = false,
  disabledReason,
  loading = false,
  variant = "solid",
  className,
}: PrimaryActionButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <div className={cn("w-full", className)}>
      <button
        type={type}
        onClick={onClick}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(
          "relative h-[52px] w-full overflow-hidden rounded-xl text-[16px] font-bold leading-none transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A227]",
          variant === "glass"
            ? "border border-white/25 bg-white/10 text-white hover:bg-white/15 active:bg-white/20 disabled:border-white/10 disabled:bg-white/5 disabled:text-white/40"
            : "bg-[#0B0B0C] text-white shadow-[0_2px_8px_rgba(11,11,12,0.06)] hover:bg-[#1A1A1C] active:bg-[#232325] disabled:bg-[#A3A09B] disabled:shadow-none",
        )}
      >
        <span className={cn("inline-flex items-center justify-center gap-2", loading && "opacity-60")}>
          {children}
        </span>
        {loading ? (
          <span
            aria-hidden="true"
            className="sw-progress-track absolute inset-x-0 bottom-0 h-[3px]"
          >
            <span className="sw-progress-bar absolute inset-y-0 w-1/3 bg-[#C9A227]" />
          </span>
        ) : null}
      </button>
      {disabled && !loading && disabledReason ? (
        <p className="mt-1.5 text-center text-[13px] font-medium leading-[18px] text-[#A3A09B]">
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
}
