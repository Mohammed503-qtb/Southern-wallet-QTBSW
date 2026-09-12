/**
 * محفظة الجنوب — المكون القياسي 4/10: صف عملية (TransactionRow)
 * أيقونة النوع في دائرة سطح دافئ + اسم الطرف + نوع/وصف صغير +
 * المبلغ بإشارة ملوّنة (دخل أخضر / خرج أحمر داكن) + StatusChip + تاريخ caption.
 * النقر يستدعي onOpen(ref) → شاشة تفاصيل العملية.
 */
"use client";

import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Banknote,
  ChevronLeft,
  PiggyBank,
  Scale,
  Send,
  Undo2,
  Wallet,
} from "lucide-react";
import type { TxView, TxType } from "@/lib/api-types";
import { TX_TYPE_LABELS, formatMoney } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { formatShortDateTime } from "./utils";
import { StatusChip } from "./status-chip";

const TYPE_ICON: Record<TxType, typeof Send> = {
  TRANSFER_OUT: Send,
  TRANSFER_IN: Wallet,
  REMITTANCE: Banknote,
  REMITTANCE_REFUND: Undo2,
  CASH_IN: ArrowDownToLine,
  CASH_OUT: ArrowUpFromLine,
  CASH_REFUND: Undo2,
  SAVING_IN: PiggyBank,
  SAVING_OUT: PiggyBank,
  FX_EXCHANGE: ArrowLeftRight,
  SYSTEM_ADJUST: Scale,
};

export interface TransactionRowProps {
  tx: TxView;
  onOpen?: (ref: string) => void;
  className?: string;
}

export function TransactionRow({ tx, onOpen, className }: TransactionRowProps) {
  const Icon = TYPE_ICON[tx.type] ?? Send;
  const isCredit = tx.direction === "CREDIT";
  const amount = formatMoney(tx.amountMinor, tx.currency);
  const title = tx.counterpartyName ?? TX_TYPE_LABELS[tx.type];
  const subtitle = tx.counterpartyName
    ? TX_TYPE_LABELS[tx.type]
    : (tx.description ?? "عملية محفظة");

  return (
    <button
      type="button"
      onClick={() => onOpen?.(tx.ref)}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border border-[#E8E6E1]/70 bg-white p-3 text-right transition-colors",
        "min-h-[64px] hover:border-[#C9A227]/40 hover:bg-[#FDFCFA] active:bg-[#F7F6F2]",
        className,
      )}
    >
      {/* أيقونة النوع في دائرة دافئة */}
      <span
        aria-hidden="true"
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border",
          isCredit
            ? "border-[#15803D]/15 bg-[#15803D]/[0.07] text-[#15803D]"
            : "border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]",
        )}
      >
        <Icon strokeWidth={1.5} className="h-5 w-5" />
      </span>

      {/* الطرف + النوع/الوصف + التاريخ */}
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="w-full truncate text-[15px] font-semibold text-[#141416]">
          {title}
        </span>
        <span className="w-full truncate text-[12px] font-medium text-[#5C5A56]">
          {subtitle}
        </span>
        <span className="text-[11px] font-medium text-[#A3A09B]">
          {formatShortDateTime(tx.createdAt)}
        </span>
      </span>

      {/* المبلغ + الحالة */}
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span
          dir="ltr"
          className={cn(
            "text-[15px] font-bold tabular-nums",
            isCredit ? "text-[#15803D]" : "text-[#B91C1C]",
          )}
        >
          {isCredit ? "+" : "−"} {amount}
        </span>
        <StatusChip status={tx.status} />
      </span>

      <ChevronLeft strokeWidth={1.5} className="h-4 w-4 shrink-0 text-[#A3A09B]" />
    </button>
  );
}
