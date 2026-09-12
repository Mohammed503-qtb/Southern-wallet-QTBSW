/**
 * محفظة الجنوب — مشتركات الحصالة (8-c-1)
 * شريحة حالة الهدف (ACTIVE/ACHIEVED/BROKEN بملصقات عربية)
 * + أداة استخراج هدف من القائمة بالمعرّف.
 */

"use client";

import type { SavingsJarView } from "@/lib/api-types";
import { cn } from "@/lib/utils";

const JAR_STATUS_LABELS: Record<SavingsJarView["status"], string> = {
  ACTIVE: "نشطة",
  ACHIEVED: "تم تحقيقها",
  BROKEN: "محطّمة",
};

const JAR_STATUS_TONES: Record<SavingsJarView["status"], string> = {
  ACTIVE: "border-[#C9A227]/30 bg-[#C9A227]/[0.1] text-[#8A6E14]",
  ACHIEVED: "border-[#15803D]/20 bg-[#15803D]/10 text-[#15803D]",
  BROKEN: "border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]",
};

/** شريحة حالة هدف الحصالة (خارج نطاق StatusChip القياسي) */
export function JarStatusChip({ status, className }: { status: SavingsJarView["status"]; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold leading-4",
        JAR_STATUS_TONES[status],
        className,
      )}
    >
      {JAR_STATUS_LABELS[status]}
    </span>
  );
}

export { JAR_STATUS_LABELS };

/** إيجاد هدف بالمعرّف من قائمة الأهداف */
export function findJar(jars: SavingsJarView[] | null, id: string | undefined): SavingsJarView | null {
  if (!jars || !id) return null;
  return jars.find((j) => j.id === id) ?? null;
}
