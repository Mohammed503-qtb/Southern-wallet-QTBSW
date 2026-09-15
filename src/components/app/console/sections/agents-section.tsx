/**
 * محفظة الجنوب — قسم الوكلاء (M6 + M7) — 8-d
 * جدول شبكة الوكلاء (المتجر/الكود/المالك/الهاتف/المحافظة/الحالة/العوم YER/
 * نقاط العمولة/إجمالي العمولات) + زر تعليق/تفعيل (M7) عبر ReasonDialog — ADMIN فقط.
 */
"use client";

import { useState } from "react";
import { PauseCircle, PlayCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { AdminAgentRow, AgentView } from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui";
import { toastSuccess } from "../console-hooks";
import { useActionRunner } from "../console-hooks";
import { ReasonDialog } from "../confirm-dialog";
import {
  AgentStatusChip,
  Column,
  ConsoleButton,
  DataTable,
  LoadMoreFooter,
  SectionHeader,
} from "../console-ui";

export function AgentsSection() {
  const { data, loading, error, retry } = useApiData<AdminAgentRow[]>("/api/admin/agents");

  const [target, setTarget] = useState<AdminAgentRow | null>(null);
  const runner = useActionRunner();

  const submitStatus = async (reason: string) => {
    if (!target) return;
    const nextStatus = target.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const result = await runner.run(() =>
      api.post<AgentView>(`/api/admin/agents/${target.id}/status`, { status: nextStatus, reason }),
    );
    if (result.ok) {
      const updated = result.value;
      toastSuccess(
        nextStatus === "SUSPENDED" ? `عُلّق وكيل ${target.shopName}` : `فُعّل وكيل ${target.shopName}`,
        `السبب المسجَّل في التدقيق: ${reason}`,
      );
      setTarget(null);
      retry();
    }
  };

  const columns: Column<AdminAgentRow>[] = [
    {
      key: "shop",
      header: "المتجر",
      render: (a) => (
        <div className="flex flex-col">
          <span className="font-bold text-[#141416]">{a.shopName}</span>
          {a.district ? <span className="text-[11.5px] text-[#8A8783]">{a.district}</span> : null}
        </div>
      ),
    },
    {
      key: "code",
      header: "الكود",
      render: (a) => (
        <span dir="ltr" className="tabular-nums text-[13px] font-bold text-[#8A6E14]">
          {a.code}
        </span>
      ),
    },
    {
      key: "owner",
      header: "المالك",
      render: (a) => <span className="font-semibold text-[#141416]">{a.ownerName ?? "—"}</span>,
    },
    {
      key: "phone",
      header: "الهاتف",
      render: (a) => (
        <span dir="ltr" className="tabular-nums text-[13.5px] text-[#5C5A56]">
          {a.phone}
        </span>
      ),
    },
    {
      key: "gov",
      header: "المحافظة",
      render: (a) => <span className="text-[13px] text-[#5C5A56]">{a.governorate}</span>,
    },
    { key: "status", header: "الحالة", render: (a) => <AgentStatusChip status={a.status} /> },
    {
      key: "float",
      header: "العوم (YER)",
      align: "end",
      render: (a) => (
        <span className="tabular-nums font-bold text-[#141416]">{formatMoney(a.floatMinor, "YER")}</span>
      ),
    },
    {
      key: "bps",
      header: "العمولة",
      align: "end",
      render: (a) => (
        <span className="tabular-nums font-semibold text-[#5C5A56]">
          {(a.commissionBps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%
        </span>
      ),
    },
    {
      key: "commissionTotal",
      header: "إجمالي العمولات (YER)",
      align: "end",
      render: (a) => (
        <span className="tabular-nums font-bold text-[#8A6E14]">{formatMoney(a.commissionTotalMinor, "YER")}</span>
      ),
    },
    {
      key: "actions",
      header: "إجراءات",
      align: "center",
      render: (a) =>
        a.status === "ACTIVE" ? (
          <ConsoleButton
            variant="danger"
            size="sm"
            onClick={() => setTarget(a)}
            title="تعليق الوكيل — M7"
          >
            <PauseCircle strokeWidth={1.6} className="h-3.5 w-3.5" />
            تعليق
          </ConsoleButton>
        ) : (
          <ConsoleButton
            variant="ghost"
            size="sm"
            onClick={() => setTarget(a)}
            title="تفعيل الوكيل — M7"
          >
            <PlayCircle strokeWidth={1.6} className="h-3.5 w-3.5" />
            تفعيل
          </ConsoleButton>
        ),
    },
  ];

  return (
    <div className="relative flex flex-col gap-4">
      <SectionHeader
        title="الوكلاء"
        description="شبكة الوكلاء المعتمدين وأعومتهم وعمولاتهم — تعليق وتفعيل بسبب مسجَّل"
        onRefresh={retry}
        refreshing={loading}
      />

      <DataTable<AdminAgentRow>
        columns={columns}
        rows={data}
        rowKey={(a) => a.id}
        loading={loading}
        error={error}
        onRetry={retry}
        emptyTitle="لا وكلاء"
        emptyDescription="لم تُسجَّل أي وكالات بعد."
        minWidthClass="min-w-[980px]"
        footer={
          data && data.length > 0 ? (
            <LoadMoreFooter count={data.length} nextCursor={null} loading={false} onLoadMore={() => undefined} />
          ) : undefined
        }
      />

      <ReasonDialog
        open={target !== null}
        title={target?.status === "ACTIVE" ? "تعليق وكالة" : "تفعيل وكالة"}
        description={
          target
            ? `الوكيل: ${target.shopName} (${target.code}) · ${target.ownerName ?? "—"}${
                target.status === "ACTIVE"
                  ? " — لن يستقبل طلبات جديدة حتى إعادة التفعيل."
                  : " — سيستقبل الطلبات فوراً بعد التفعيل."
              }`
            : null
        }
        confirmLabel={target?.status === "ACTIVE" ? "تأكيد التعليق" : "تأكيد التفعيل"}
        confirmVariant={target?.status === "ACTIVE" ? "danger" : "primary"}
        busy={runner.busy}
        error={runner.error}
        onConfirm={(reason) => void submitStatus(reason)}
        onCancel={() => {
          runner.setError(null);
          setTarget(null);
        }}
      />
    </div>
  );
}
