/**
 * محفظة الجنوب — هيكل تحميل (Skeleton) بلمسة ذهبية خفيفة
 * يُستعمل في حالات Loading لكل الشاشات (SRS §7.4 — نفس شكل العنصر النهائي).
 */
"use client";

import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-xl bg-[#EFEBDD]", className)}
    />
  );
}
