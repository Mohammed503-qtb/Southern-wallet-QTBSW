/**
 * محفظة الجنوب — المكون القياسي 10/10: حالة الخطأ (ErrorState)
 * أيقونة خطأ + رسالة الخادم المفهومة + زرا "إعادة المحاولة" و
 * "تواصل مع الدعم" + كود الخطأ التقني caption (NFR-USE-005).
 */
"use client";

import { CircleAlert, LifeBuoy, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  /** رسالة مفهومة (يفضّل err.message من ApiError) */
  message: string;
  /** كود تقني (AUTH-002… يُعرض caption صغير) */
  code?: string;
  onRetry?: () => void;
  /** الافتراضي: الانتقال إلى شاشة تذكرة جديدة */
  onSupport?: () => void;
  compact?: boolean;
  /** عنصر إضافي أسفل (مثل زر خروج) */
  children?: ReactNode;
  className?: string;
}

export function ErrorState({
  message,
  code,
  onRetry,
  onSupport,
  compact = false,
  children,
  className,
}: ErrorStateProps) {
  const navigate = useAppStore((s) => s.navigate);

  return (
    <div
      role="alert"
      className={cn(
        "flex w-full flex-col items-center justify-center text-center",
        compact ? "py-6" : "py-10",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex items-center justify-center rounded-full border border-[#B91C1C]/20 bg-[#B91C1C]/[0.07] text-[#B91C1C]",
          compact ? "h-12 w-12" : "h-16 w-16",
        )}
      >
        <CircleAlert strokeWidth={1.5} className={compact ? "h-6 w-6" : "h-7 w-7"} />
      </span>
      <p
        className={cn(
          "mt-4 max-w-[300px] font-semibold leading-6 text-[#141416]",
          compact ? "text-[14px]" : "text-[16px]",
        )}
      >
        {message}
      </p>
      {code ? (
        <p dir="ltr" className="mt-1 text-[11px] font-medium tabular-nums text-[#A3A09B]">
          {code}
        </p>
      ) : null}

      <div className={cn("grid w-full max-w-[320px] gap-2", compact ? "mt-4" : "mt-6")}>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0B0B0C] px-4 text-[14px] font-bold text-white transition-colors hover:bg-[#1A1A1C]"
          >
            <RotateCw strokeWidth={1.5} className="h-4 w-4" />
            إعادة المحاولة
          </button>
        ) : null}
        <button
          type="button"
          onClick={onSupport ?? (() => navigate("ticket-new"))}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E8E6E1] bg-white px-4 text-[14px] font-bold text-[#5C5A56] transition-colors hover:border-[#C9A227]/50 hover:text-[#8A6E14]"
        >
          <LifeBuoy strokeWidth={1.5} className="h-4 w-4" />
          تواصل مع الدعم
        </button>
      </div>
      {children}
    </div>
  );
}
