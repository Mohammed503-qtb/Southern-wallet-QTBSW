/**
 * محفظة الجنوب — قسم التدقيق (M13) — ADMIN وCOMPLIANCE
 * جدول سجل الأفعال الإدارية الحساسة (الوقت/الفاعل/دوره/الإجراء/الهدف/السبب)
 * بترقيم cursor (تحميل المزيد). أسماء الإجراءات مترجمة مع عرض الخام عند الغرابة.
 */
"use client";

import type { AdminAuditRow } from "@/lib/api-types";
import { USER_ROLE_LABELS } from "@/lib/api-types";
import { formatDateTime } from "@/components/app/ui";
import { usePagedData } from "../console-hooks";
import {
  Column,
  ConsoleChip,
  DataTable,
  LoadMoreFooter,
  SectionHeader,
} from "../console-ui";

const ACTION_LABELS: Record<string, { label: string; tone: "error" | "success" | "pending" | "gold" | "muted" }> = {
  USER_FREEZE: { label: "تجميد مستخدم", tone: "error" },
  USER_UNFREEZE: { label: "فك تجميد مستخدم", tone: "success" },
  KYC_APPROVE: { label: "اعتماد توثيق", tone: "success" },
  KYC_REJECT: { label: "رفض توثيق", tone: "error" },
  AGENT_STATUS: { label: "تغيير حالة وكيل", tone: "pending" },
  LIMIT_UPDATE: { label: "تحرير حدود", tone: "gold" },
  FEE_UPDATE: { label: "تحرير رسوم", tone: "gold" },
  FX_UPDATE: { label: "تحرير سعر صرف", tone: "gold" },
  SERVICE_UPDATE: { label: "تحرير خدمة", tone: "gold" },
  ADMIN_CANCEL_CASH: { label: "إلغاء عملية نقدية", tone: "error" },
  ADMIN_CANCEL_REMITTANCE: { label: "إلغاء حوالة", tone: "error" },
  TICKET_STATUS: { label: "تغيير حالة تذكرة", tone: "muted" },
};

const TARGET_LABELS: Record<string, string> = {
  USER: "مستخدم",
  KYC_SUBMISSION: "طلب توثيق",
  AGENT: "وكيل",
  LIMIT_RULE: "قاعدة حدود",
  FEE_RULE: "قاعدة رسوم",
  FX_RATE: "سعر صرف",
  SERVICE_STATE: "خدمة",
  CASH_OPERATION: "عملية نقدية",
  REMITTANCE: "حوالة",
  TICKET: "تذكرة",
};

export function AuditSection() {
  const { items, nextCursor, loading, loadingMore, error, loadMore, refresh } = usePagedData<AdminAuditRow>(
    "/api/admin/audit",
  );

  const columns: Column<AdminAuditRow>[] = [
    {
      key: "time",
      header: "الوقت",
      render: (a) => <span className="text-[12.5px] text-[#8A8783]">{formatDateTime(a.createdAt)}</span>,
    },
    {
      key: "actor",
      header: "الفاعل",
      render: (a) => (
        <div className="flex flex-col">
          <span className="text-[13.5px] font-bold text-[#141416]">{a.actorName}</span>
          <span className="text-[11.5px] font-semibold text-[#8A8783]">{USER_ROLE_LABELS[a.actorRole]}</span>
        </div>
      ),
    },
    {
      key: "action",
      header: "الإجراء",
      render: (a) => {
        const def = ACTION_LABELS[a.action];
        return def ? (
          <ConsoleChip tone={def.tone}>{def.label}</ConsoleChip>
        ) : (
          <span dir="ltr" className="text-[12px] font-bold text-[#5C5A56]">{a.action}</span>
        );
      },
    },
    {
      key: "target",
      header: "الهدف",
      render: (a) => (
        <div className="flex flex-col">
          <span className="text-[12.5px] font-semibold text-[#5C5A56]">{TARGET_LABELS[a.targetType] ?? a.targetType}</span>
          <span dir="ltr" className="text-right text-[11px] tabular-nums text-[#A3A09B]">{a.targetId}</span>
        </div>
      ),
    },
    {
      key: "reason",
      header: "السبب",
      render: (a) =>
        a.reason ? (
          <span className="text-[12.5px] font-medium text-[#5C5A56]">{a.reason}</span>
        ) : (
          <span className="text-[12px] text-[#A3A09B]">—</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="التدقيق"
        description="كل الأفعال الإدارية الحساسة بسبلها المسجَّلة — Append-only"
        onRefresh={refresh}
        refreshing={loading}
      />

      <DataTable<AdminAuditRow>
        columns={columns}
        rows={items}
        rowKey={(a) => a.id}
        loading={loading}
        error={error}
        onRetry={refresh}
        emptyTitle="لا قيود تدقيق"
        emptyDescription="لم تُسجَّل أفعال إدارية حساسة بعد."
        minWidthClass="min-w-[840px]"
        footer={
          nextCursor || items.length > 0 ? (
            <LoadMoreFooter count={items.length} nextCursor={nextCursor} loading={loadingMore} onLoadMore={loadMore} />
          ) : undefined
        }
      />
    </div>
  );
}
