/**
 * محفظة الجنوب — قسم الأحداث الأمنية (M9) — ADMIN وCOMPLIANCE
 * جدول أحداث الدخول/القفل/إعادة التعيين/الاسترداد مع فلتر نوع
 * بترقيم cursor. يشكل مع قسم التدقيق صورة أمنية شاملة للعمليات.
 */
"use client";

import { useState } from "react";
import { usePagedData } from "../console-hooks";
import {
  Column,
  ConsoleChip,
  DataTable,
  LoadMoreFooter,
  SectionHeader,
} from "../console-ui";
import { formatDateTime } from "@/components/app/ui";
import { cn } from "@/lib/utils";

interface SecurityEventRow {
  id: string;
  kind: string;
  kindLabel: string;
  phone: string | null;
  userId: string | null;
  ip: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

const KIND_TONE: Record<string, "error" | "success" | "pending" | "gold" | "muted"> = {
  LOGIN_FAIL: "error",
  LOGIN_LOCK: "error",
  LOGIN_SUCCESS: "success",
  REGISTER: "muted",
  TOTP_RESET: "gold",
  RECOVERY_USED: "gold",
  RECOVERY_REGEN: "gold",
  REENROLL_ISSUED: "gold",
  REENROLL_USED: "success",
  ADMIN_IP_DENIED: "error",
};

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "الكل" },
  { key: "LOGIN_FAIL", label: "دخول خاطئ" },
  { key: "LOGIN_LOCK", label: "قفل" },
  { key: "LOGIN_SUCCESS", label: "نجاح" },
  { key: "TOTP_RESET", label: "إعادة تعيين" },
  { key: "RECOVERY_USED", label: "استرداد" },
  { key: "REGISTER", label: "تسجيل" },
];

export function SecurityEventsSection() {
  const [kind, setKind] = useState("");
  const path = kind
    ? `/api/admin/security-events?kind=${kind}`
    : "/api/admin/security-events";
  const { items, nextCursor, loading, loadingMore, error, loadMore, refresh } =
    usePagedData<SecurityEventRow>(path);

  const columns: Column<SecurityEventRow>[] = [
    {
      key: "time",
      header: "الوقت",
      render: (e) => (
        <span className="text-[12.5px] text-[#8A8783]">{formatDateTime(e.createdAt)}</span>
      ),
    },
    {
      key: "kind",
      header: "الحدث",
      render: (e) => (
        <ConsoleChip tone={KIND_TONE[e.kind] ?? "muted"}>{e.kindLabel}</ConsoleChip>
      ),
    },
    {
      key: "phone",
      header: "الهاتف",
      render: (e) =>
        e.phone ? (
          <span dir="ltr" className="text-[13px] font-bold tabular-nums text-[#141416]">
            +967 {e.phone}
          </span>
        ) : (
          <span className="text-[12px] text-[#A3A09B]">—</span>
        ),
    },
    {
      key: "ip",
      header: "IP",
      render: (e) => (
        <span dir="ltr" className="text-[12px] font-semibold tabular-nums text-[#5C5A56]">
          {e.ip ?? "—"}
        </span>
      ),
    },
    {
      key: "meta",
      header: "تفاصيل",
      render: (e) => {
        if (!e.meta) return <span className="text-[12px] text-[#A3A09B]">—</span>;
        const parts = Object.entries(e.meta)
          .filter(([, v]) => v !== null && v !== undefined)
          .map(([k, v]) => `${k}=${String(v)}`);
        return (
          <span dir="ltr" className="text-[11.5px] font-medium text-[#8A8783]">
            {parts.join(" · ") || "—"}
          </span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="الأحداث الأمنية"
        description="محاولات الدخول والقفل وإعادة تعيين المصادقة واستخدام رموز الاسترداد"
        onRefresh={refresh}
        refreshing={loading}
      />

      {/* فلاتر النوع */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setKind(f.key)}
            className={cn(
              "min-h-9 rounded-full border px-3 text-[12px] font-bold transition-colors",
              kind === f.key
                ? "border-[#C9A227] bg-[#C9A227]/10 text-[#8A6E14]"
                : "border-[#E8E6E1] bg-white text-[#5C5A56] hover:border-[#C9A227]/50"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <DataTable<SecurityEventRow>
        columns={columns}
        rows={items}
        rowKey={(e) => e.id}
        loading={loading}
        error={error}
        onRetry={refresh}
        emptyTitle="لا أحداث أمنية"
        emptyDescription="لم تُسجَّل أحداث أمنية بعد بهذا الفلتر."
      />

      {items.length > 0 ? (
        <LoadMoreFooter
          count={items.length}
          nextCursor={nextCursor}
          loading={loadingMore}
          onLoadMore={loadMore}
        />
      ) : null}
    </div>
  );
}
