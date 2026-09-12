/**
 * محفظة الجنوب — قسم المعاملات (M8) — 8-d
 * بحث (مرجع/طرف) + فلاتر (نوع/حالة/عملة) + جدول (المرجع/النوع/المستخدم/الطرف/
 * المبلغ بإشارة ملونة/الرسوم/الحالة/التاريخ) بترقيم cursor (تحميل المزيد).
 * ملاحظة: فلتر العملة يطبَّق في الواجهة — M8 خادمياً لا يدعم معامل currency.
 */
"use client";

import { useState } from "react";
import type { AdminTxRow } from "@/lib/api-types";
import { TX_TYPE_LABELS, formatMoney } from "@/lib/api-types";
import { formatShortDateTime, StatusChip } from "@/components/app/ui";
import { useDebounced, usePagedData } from "../console-hooks";
import {
  Column,
  DataTable,
  FilterSelect,
  LoadMoreFooter,
  MoneyText,
  SearchField,
  SectionHeader,
} from "../console-ui";

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "كل الأنواع" },
  ...Object.entries(TX_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "كل الحالات" },
  { value: "PENDING", label: "معلّق" },
  { value: "COMPLETED", label: "مكتملة" },
  { value: "FAILED", label: "فاشلة" },
  { value: "CANCELLED", label: "ملغاة" },
  { value: "EXPIRED", label: "منتهية" },
];

const CURRENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "كل العملات" },
  { value: "YER", label: "YER · ر.ي" },
  { value: "SAR", label: "SAR · ر.س" },
  { value: "USD", label: "USD · $" },
];

export function TransactionsSection() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const debouncedSearch = useDebounced(search);

  const params = new URLSearchParams();
  if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
  if (typeFilter) params.set("type", typeFilter);
  if (statusFilter) params.set("status", statusFilter);
  const path = `/api/admin/transactions${params.size > 0 ? `?${params.toString()}` : ""}`;

  const { items, nextCursor, loading, loadingMore, error, loadMore, refresh } = usePagedData<AdminTxRow>(path);

  // فلتر العملة في الواجهة (M8 لا يقبل currency خادمياً)
  const visibleItems = currencyFilter ? items.filter((t) => t.currency === currencyFilter) : items;

  const columns: Column<AdminTxRow>[] = [
    {
      key: "ref",
      header: "المرجع",
      render: (t) => (
        <span dir="ltr" className="text-[12.5px] font-bold tracking-wide tabular-nums text-[#8A6E14]">
          {t.ref}
        </span>
      ),
    },
    {
      key: "type",
      header: "النوع",
      render: (t) => <span className="text-[13px] font-semibold text-[#5C5A56]">{TX_TYPE_LABELS[t.type]}</span>,
    },
    {
      key: "user",
      header: "المستخدم",
      render: (t) => (
        <div className="flex flex-col">
          <span className="text-[13px] font-bold text-[#141416]">{t.userName ?? "—"}</span>
          <span dir="ltr" className="text-right text-[11.5px] tabular-nums text-[#8A8783]">{t.userPhone}</span>
        </div>
      ),
    },
    {
      key: "counterparty",
      header: "الطرف المقابل",
      render: (t) => (
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold text-[#5C5A56]">{t.counterpartyName ?? "—"}</span>
          {t.counterpartyPhone ? (
            <span dir="ltr" className="text-right text-[11.5px] tabular-nums text-[#8A8783]">
              {t.counterpartyPhone}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "amount",
      header: "المبلغ",
      align: "end",
      render: (t) => <MoneyText minor={t.amountMinor} currency={t.currency} signed={t.direction} />,
    },
    {
      key: "fee",
      header: "الرسوم",
      align: "end",
      render: (t) => (
        <span className="tabular-nums text-[13px] font-semibold text-[#8A8783]">
          {t.feeMinor > 0 ? formatMoney(t.feeMinor, t.currency) : "—"}
        </span>
      ),
    },
    { key: "status", header: "الحالة", render: (t) => <StatusChip status={t.status} /> },
    {
      key: "date",
      header: "التاريخ",
      render: (t) => <span className="text-[12.5px] text-[#8A8783]">{formatShortDateTime(t.createdAt)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="المعاملات"
        description="كل معاملات المنصة — بحث بالمرجع أو الطرف مع فلاتر النوع والحالة والعملة"
        onRefresh={refresh}
        refreshing={loading}
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="ابحث بالمرجع أو اسم/هاتف الطرف…"
          className="min-w-[220px] flex-1"
        />
        <FilterSelect label="النوع" value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} />
        <FilterSelect label="الحالة" value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
        <FilterSelect label="العملة" value={currencyFilter} onChange={setCurrencyFilter} options={CURRENCY_OPTIONS} />
      </div>

      <DataTable<AdminTxRow>
        columns={columns}
        rows={visibleItems}
        rowKey={(t) => t.ref}
        loading={loading}
        error={error}
        onRetry={refresh}
        emptyTitle="لا معاملات مطابقة"
        emptyDescription="عدّل البحث أو الفلاتر لعرض نتائج أخرى."
        minWidthClass="min-w-[960px]"
        footer={
          nextCursor || visibleItems.length > 0 ? (
            <LoadMoreFooter
              count={visibleItems.length}
              nextCursor={nextCursor}
              loading={loadingMore}
              onLoadMore={loadMore}
            />
          ) : undefined
        }
      />
    </div>
  );
}
