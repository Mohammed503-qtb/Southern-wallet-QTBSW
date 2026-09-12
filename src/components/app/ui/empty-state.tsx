/**
 * محفظة الجنوب — المكون القياسي 9/10: الحالة الفارغة (EmptyState)
 * تكوين هندسي من معيّنات (مربعات مدوّرة بحد ذهبي — إشارة لنجمة الشعار
 * الثمانية) + عنوان + سطر شرح + زر إجراء اختياري واحد.
 */
"use client";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  className?: string;
}

/** زخرفة المعيّنات الذهبية (نجمة ثمانية + معيّنات صغيرة) */
function DiamondOrnament({ compact }: { compact?: boolean }) {
  const size = compact ? "h-20" : "h-28";
  return (
    <div
      aria-hidden="true"
      className={cn("relative w-full select-none", size)}
    >
      {/* نجمة ثمانية: مربعان متداخلان */}
      <span className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-lg border-[1.5px] border-[#C9A227]" />
      <span className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-lg border-[1.5px] border-[#C9A227]/70" />
      {/* معيّنان صغيران جانبيان */}
      <span className="absolute left-[calc(50%-56px)] top-1/2 h-5 w-5 -translate-y-1/2 rotate-45 rounded-[4px] border-[1.5px] border-[#C9A227]/50" />
      <span className="absolute left-[calc(50%+34px)] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-45 rounded-[3px] border-[1.5px] border-[#C9A227]/30" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center text-center",
        compact ? "py-8" : "py-12",
        className,
      )}
    >
      <DiamondOrnament compact={compact} />
      <h3
        className={cn(
          "mt-4 font-bold text-[#141416]",
          compact ? "text-[16px]" : "text-[18px]",
        )}
      >
        {title}
      </h3>
      {description ? (
        <p className="mt-1.5 max-w-[280px] text-[14px] font-medium leading-6 text-[#5C5A56]">
          {description}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 flex min-h-11 items-center justify-center rounded-xl bg-[#0B0B0C] px-6 text-[14px] font-bold text-white transition-colors hover:bg-[#1A1A1C]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
