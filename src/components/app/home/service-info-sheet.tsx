/**
 * محفظة الجنوب — Sheet توضيح حالة الخدمة
 * يُفتح عند نقر خدمة غير ON (قريباً/معطلة/صيانة) — شرح وافٍ بلا تنفيذ.
 */
"use client";

import type { LucideIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ServiceStateValue } from "@/lib/api-types";
import { SERVICE_STATE_LABELS } from "@/lib/api-types";
import { cn } from "@/lib/utils";

const STATE_EXPLANATIONS: Record<ServiceStateValue, string> = {
  ON: "الخدمة متاحة الآن — يمكنك استخدامها مباشرة.",
  OFF: "الخدمة معطّلة إدارياً حالياً. راجع الإشعارات لاحقاً أو تواصل مع الدعم.",
  COMING_LATER:
    "هذه الخدمة مجدولة للمرحلة الثانية (Beta) وفق خارطة الطريق — الظهور هنا للتعريف فقط ولا تُنفَّذ أي عملية.",
  MAINTENANCE: "الخدمة تحت صيانة مؤقتة وستعود قريباً. نعتذر عن الإزعاج.",
};

/** شريحة حالة الخدمة (ألوان موحدة للحالات الأربع) */
export function ServiceStateChip({ state }: { state: ServiceStateValue }) {
  const tone =
    state === "ON"
      ? "border-[#15803D]/20 bg-[#15803D]/10 text-[#15803D]"
      : state === "MAINTENANCE"
        ? "border-[#B45309]/25 bg-[#B45309]/10 text-[#B45309]"
        : "border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-semibold",
        tone,
      )}
    >
      {SERVICE_STATE_LABELS[state]}
    </span>
  );
}

export interface ServiceInfoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  icon: LucideIcon;
  state: ServiceStateValue;
  note?: string | null;
}

export function ServiceInfoSheet({
  open,
  onOpenChange,
  title,
  description,
  icon: Icon,
  state,
  note,
}: ServiceInfoSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl px-5 pb-7 pt-4">
        <SheetHeader className="items-center text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]">
            <Icon strokeWidth={1.5} className="h-7 w-7" />
          </span>
          <SheetTitle className="text-center text-[18px] font-bold text-[#141416]">
            {title}
          </SheetTitle>
          <SheetDescription className="text-center text-[14px] font-medium text-[#5C5A56]">
            {description}
          </SheetDescription>
          <div className="flex justify-center">
            <ServiceStateChip state={state} />
          </div>
        </SheetHeader>

        <p className="mt-2 text-center text-[14px] font-medium leading-7 text-[#141416]">
          {STATE_EXPLANATIONS[state] ?? SERVICE_STATE_LABELS[state]}
        </p>
        {note ? (
          <p className="mt-2 rounded-xl bg-[#F7F6F2] p-3 text-center text-[13px] font-semibold text-[#5C5A56]">
            ملاحظة الإدارة: {note}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl bg-[#0B0B0C] text-[15px] font-bold text-white transition-colors hover:bg-[#1A1A1C]"
        >
          حسناً، فهمت
        </button>
      </SheetContent>
    </Sheet>
  );
}
