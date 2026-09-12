/**
 * محفظة الجنوب — المكون القياسي 5/10: شريحة الحالة (StatusChip)
 * ألوان الحالات الموحدة (SCREENS_FLOWS §2.1):
 * COMPLETED/PAID/APPROVED → أخضر | PENDING/PROCESSING → كهرماني
 * FAILED/REJECTED → أحمر | EXPIRED/CANCELLED → رمادي.
 * النص العربي من ملصقات api-types (TX/REMITTANCE/KYC).
 */
"use client";

import { cn } from "@/lib/utils";
import {
  KYC_STATUS_LABELS,
  REMITTANCE_STATUS_LABELS,
  TX_STATUS_LABELS,
} from "@/lib/api-types";

type Tone = "success" | "pending" | "error" | "muted";

const TONES: Record<Tone, string> = {
  success: "border-[#15803D]/20 bg-[#15803D]/10 text-[#15803D]",
  pending: "border-[#B45309]/25 bg-[#B45309]/10 text-[#B45309]",
  error: "border-[#B91C1C]/25 bg-[#B91C1C]/10 text-[#B91C1C]",
  muted: "border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]",
};

function toneOf(status: string): Tone {
  switch (status) {
    case "COMPLETED":
    case "PAID":
    case "APPROVED":
    case "RESOLVED":
      return "success";
    case "PENDING":
    case "PROCESSING":
    case "OPEN":
    case "IN_PROGRESS":
      return "pending";
    case "FAILED":
    case "REJECTED":
      return "error";
    default:
      // EXPIRED / CANCELLED / CLOSED وأي حالة غير معروفة
      return "muted";
  }
}

function labelOf(status: string): string {
  return (
    TX_STATUS_LABELS[status as keyof typeof TX_STATUS_LABELS] ??
    REMITTANCE_STATUS_LABELS[status as keyof typeof REMITTANCE_STATUS_LABELS] ??
    KYC_STATUS_LABELS[status as keyof typeof KYC_STATUS_LABELS] ??
    status
  );
}

export interface StatusChipProps {
  status: string;
  className?: string;
}

export function StatusChip({ status, className }: StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4",
        TONES[toneOf(status)],
        className,
      )}
    >
      {labelOf(status)}
    </span>
  );
}
