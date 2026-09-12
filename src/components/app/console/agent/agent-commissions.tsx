/**
 * محفظة الجنوب — عمولات الوكيل (G5) — 8-d
 * بطاقة الإجمالي + جدول/قائمة CommissionEntry (النوع/المرجع/المبلغ/التاريخ).
 */
"use client";

import { HandCoins } from "lucide-react";
import type { CommissionListView } from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { formatShortDateTime, useApiData } from "@/components/app/ui";
import {
  Column,
  ConsoleCard,
  DataTable,
  SectionHeader,
  Skeleton,
} from "../console-ui";

const COMMISSION_LABELS: Record<string, string> = {
  CASH_IN: "عمولة إيداع نقدي",
  WITHDRAW: "عمولة سحب نقدي",
  REMITTANCE: "عمولة تسليم حوالة",
};

export function AgentCommissions() {
  const { data, loading, error, retry } = useApiData<CommissionListView>("/api/agent/commissions");

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4">
        <SectionHeader title="العمولات" />
        <Skeleton className="h-[100px]" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <ConsoleCard className="p-6">
        <p className="text-center text-[14px] font-semibold text-[#B91C1C]">
          {error.message}
          <span dir="ltr" className="ms-2 text-[11px] text-[#A3A09B]">{error.code}</span>
        </p>
      </ConsoleCard>
    );
  }

  if (!data) return null;

  const columns: Column<{ id: string; opType: string; sourceRef: string; amountMinor: number; createdAt: string }>[] = [
    {
      key: "type",
      header: "النوع",
      render: (e) => (
        <span className="flex items-center gap-2 font-bold text-[#141416]">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#C9A227]/12 text-[#C9A227]"
          >
            <HandCoins strokeWidth={1.6} className="h-3.5 w-3.5" />
          </span>
          {COMMISSION_LABELS[e.opType] ?? e.opType}
        </span>
      ),
    },
    {
      key: "ref",
      header: "المرجع",
      render: (e) => (
        <span dir="ltr" className="text-[12.5px] font-bold tabular-nums tracking-wide text-[#8A6E14]">
          {e.sourceRef}
        </span>
      ),
    },
    {
      key: "amount",
      header: "المبلغ (YER)",
      align: "end",
      render: (e) => (
        <span className="tabular-nums font-extrabold text-[#15803D]">+ {formatMoney(e.amountMinor, "YER")}</span>
      ),
    },
    {
      key: "date",
      header: "التاريخ",
      render: (e) => <span className="text-[12.5px] text-[#8A8783]">{formatShortDateTime(e.createdAt)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="العمولات"
        description="كل عمولاتك المستحقّة من الإيداعات والسحوبات وتسليم الحوالات"
        onRefresh={retry}
        refreshing={loading}
      />

      {/* بطاقة الإجمالي */}
      <ConsoleCard className="flex flex-wrap items-center justify-between gap-4 bg-[#191308] p-5">
        <div>
          <p className="flex items-center gap-2 text-[12px] font-bold text-[#D8CBB0]/70">
            <HandCoins strokeWidth={1.6} className="h-4 w-4 text-[#C9A227]" />
            إجمالي عمولاتي المستحقّة
          </p>
          <p className="mt-2 text-[34px] font-extrabold leading-none tabular-nums text-[#F3E9CF]">
            {formatMoney(data.totalMinor, "YER")}
          </p>
        </div>
        <p className="text-[12px] font-semibold text-[#D8CBB0]/60">
          {data.items.length.toLocaleString("en-US")} عملية عمولة
        </p>
      </ConsoleCard>

      <DataTable
        columns={columns}
        rows={data.items}
        rowKey={(e) => e.id}
        loading={loading}
        error={error}
        onRetry={retry}
        emptyTitle="لا عمولات بعد"
        emptyDescription="ستظهر عمولاتك هنا فور إتمام أول عملية إيداع أو سحب أو تسليم حوالة."
        minWidthClass="min-w-[640px]"
        maxHeightClass="max-h-[560px]"
        footer={
          data.items.length > 0 ? (
            <p className="text-[12px] font-medium text-[#8A8783] tabular-nums">
              {data.items.length} عمولة — أحدثها أولاً
            </p>
          ) : undefined
        }
      />
    </div>
  );
}
