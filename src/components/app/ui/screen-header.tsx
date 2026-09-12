/**
 * محفظة الجنوب — ترويسة شاشة قياسية
 * سهم رجوع يشير يميناً (معكوس RTL — Master §92)، عنوان 22/30 Bold،
 * وإجراء اختياري في الطرف (يسار الشاشة في RTL).
 */
"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/app-store";

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** زر الرجوع (الافتراضي: هبوط في مكدس التنقل) */
  onBack?: () => void;
  /** إخفاء سهم الرجوع للشاشات الجذرية */
  showBack?: boolean;
  /** إجراء في الطرف المقابل للعنوان */
  action?: ReactNode;
  className?: string;
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  showBack = true,
  action,
  className,
}: ScreenHeaderProps) {
  const back = useAppStore((s) => s.back);

  return (
    <header className={cn("flex items-center gap-2 pb-1 pt-2", className)}>
      {showBack ? (
        <button
          type="button"
          onClick={onBack ?? back}
          aria-label="رجوع"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#E8E6E1] bg-white text-[#141416] transition-colors hover:bg-[#F7F6F2] active:bg-[#F0EEE8]"
        >
          <ChevronRight strokeWidth={1.5} className="h-5 w-5" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[22px] font-bold leading-[30px] text-[#141416]">
          {title}
        </h1>
        {subtitle ? (
          <p className="truncate text-[13px] font-medium text-[#5C5A56]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
