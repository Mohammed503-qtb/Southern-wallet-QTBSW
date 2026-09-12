/**
 * محفظة الجنوب — قسم المستخدمين (M2 + M3) — 8-d
 * بحث بالاسم/الهاتف + فلاتر (دور/حالة) + جدول (الاسم/الهاتف/الدور/الحالة/
 * KYC/المحافظة/رصيد YER/الانضمام). أزرار تجميد/فك التجميع (M3) تظهر لADMIN
 * فقط (COMPLIANCE قراءة فقط) وتمر عبر ReasonDialog بسبب إلزامي.
 */
"use client";

import { useState } from "react";
import { Snowflake, Sun } from "lucide-react";
import { api } from "@/lib/api";
import type { AdminUserRow, PublicUser, UserRole } from "@/lib/api-types";
import { USER_ROLE_LABELS, formatMoney } from "@/lib/api-types";
import { formatShortDateTime } from "@/components/app/ui";
import { toastSuccess } from "../console-hooks";
import { useActionRunner, useDebounced, usePagedData } from "../console-hooks";
import { ReasonDialog } from "../confirm-dialog";
import {
  Column,
  ConsoleButton,
  DataTable,
  FilterSelect,
  KycLevelChip,
  LoadMoreFooter,
  SearchField,
  SectionHeader,
  UserStatusChip,
} from "../console-ui";

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "كل الأدوار" },
  { value: "CUSTOMER", label: "عميل" },
  { value: "AGENT", label: "وكيل معتمد" },
  { value: "ADMIN", label: "مدير النظام" },
  { value: "COMPLIANCE", label: "مراجع KYC/الامتثال" },
  { value: "SUPPORT", label: "دعم العملاء" },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "كل الحالات" },
  { value: "PENDING", label: "قيد التفعيل" },
  { value: "ACTIVE", label: "نشط" },
  { value: "FROZEN", label: "مجمّد" },
  { value: "CLOSED", label: "مغلق" },
];

interface FreezeTarget {
  user: AdminUserRow;
  action: "freeze" | "unfreeze";
}

export function UsersSection({ role }: { role: UserRole }) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const debouncedSearch = useDebounced(search);

  const params = new URLSearchParams();
  if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
  if (roleFilter) params.set("role", roleFilter);
  if (statusFilter) params.set("status", statusFilter);
  const path = `/api/admin/users${params.size > 0 ? `?${params.toString()}` : ""}`;

  const { items, nextCursor, loading, loadingMore, error, loadMore, refresh } = usePagedData<AdminUserRow>(path);

  const [target, setTarget] = useState<FreezeTarget | null>(null);
  const runner = useActionRunner();

  const isAdmin = role === "ADMIN";

  const submitFreeze = async (reason: string) => {
    if (!target) return;
    const verb = target.action === "freeze" ? "freeze" : "unfreeze";
    const result = await runner.run(() =>
      api.post<PublicUser>(`/api/admin/users/${target.user.id}/${verb}`, { reason }),
    );
    if (result.ok) {
      const updated = result.value;
      toastSuccess(
        target.action === "freeze" ? `جُمّد حساب ${target.user.fullName ?? target.user.phone}` : `فُك تجميد ${target.user.fullName ?? target.user.phone}`,
        `السبب المسجَّل في التدقيق: ${reason}`,
      );
      setTarget(null);
      refresh();
    }
  };

  const columns: Column<AdminUserRow>[] = [
    {
      key: "name",
      header: "الاسم",
      render: (u) => (
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#141416]">{u.fullName ?? "بلا اسم"}</span>
          {u.scopeRestricted ? (
            <span className="rounded-full border border-[#B45309]/25 bg-[#B45309]/10 px-1.5 py-px text-[10px] font-bold text-[#B45309]">
              نطاق مقيد
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "phone",
      header: "الهاتف",
      render: (u) => (
        <span dir="ltr" className="tabular-nums text-[13.5px] text-[#5C5A56]">
          {u.phone}
        </span>
      ),
    },
    {
      key: "role",
      header: "الدور",
      render: (u) => <span className="text-[13px] font-semibold text-[#5C5A56]">{USER_ROLE_LABELS[u.role]}</span>,
    },
    { key: "status", header: "الحالة", render: (u) => <UserStatusChip status={u.status} /> },
    { key: "kyc", header: "KYC", render: (u) => <KycLevelChip level={u.kycLevel} /> },
    {
      key: "gov",
      header: "المحافظة",
      render: (u) => <span className="text-[13px] text-[#5C5A56]">{u.governorate ?? "—"}</span>,
    },
    {
      key: "balance",
      header: "الرصيد (YER)",
      align: "end",
      render: (u) => (
        <span className="tabular-nums font-bold text-[#141416]">{formatMoney(u.balancesYER, "YER")}</span>
      ),
    },
    {
      key: "joined",
      header: "الانضمام",
      render: (u) => (
        <span className="text-[12.5px] text-[#8A8783]">{formatShortDateTime(u.createdAt)}</span>
      ),
    },
  ];

  if (isAdmin) {
    columns.push({
      key: "actions",
      header: "إجراءات",
      align: "center",
      render: (u) => {
        if (u.role === "SYSTEM") return <span className="text-[12px] text-[#A3A09B]">—</span>;
        if (u.status === "FROZEN") {
          return (
            <ConsoleButton
              variant="ghost"
              size="sm"
              onClick={() => setTarget({ user: u, action: "unfreeze" })}
              title="فك التجميد — M3"
            >
              <Sun strokeWidth={1.6} className="h-3.5 w-3.5" />
              فك التجميد
            </ConsoleButton>
          );
        }
        if (u.status !== "ACTIVE") {
          return <span className="text-[12px] text-[#A3A09B]">—</span>;
        }
        return (
          <ConsoleButton
            variant="danger"
            size="sm"
            onClick={() => setTarget({ user: u, action: "freeze" })}
            title="تجميد الحساب — M3"
          >
            <Snowflake strokeWidth={1.6} className="h-3.5 w-3.5" />
            تجميد
          </ConsoleButton>
        );
      },
    });
  }

  return (
    <div className="relative flex flex-col gap-4">
      <SectionHeader
        title="المستخدمون"
        description={isAdmin ? "بحث وفلاتر وتجميد حسابات المشتركين" : "بحث وقراءة — دور الامتثال بلا أزرار إجراء"}
        onRefresh={refresh}
        refreshing={loading}
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="ابحث بالاسم أو رقم الهاتف…"
          className="min-w-[220px] flex-1"
        />
        <FilterSelect label="الدور" value={roleFilter} onChange={setRoleFilter} options={ROLE_OPTIONS} />
        <FilterSelect label="الحالة" value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
      </div>

      <DataTable<AdminUserRow>
        columns={columns}
        rows={items}
        rowKey={(u) => u.id}
        loading={loading}
        error={error}
        onRetry={refresh}
        emptyTitle="لا نتائج مطابقة"
        emptyDescription="جرّب تعديل البحث أو الفلاتر — قد لا يوجد مستخدمون بهذه الشروط."
        minWidthClass="min-w-[900px]"
        footer={
          nextCursor || items.length > 0 ? (
            <LoadMoreFooter count={items.length} nextCursor={nextCursor} loading={loadingMore} onLoadMore={loadMore} />
          ) : undefined
        }
      />

      <ReasonDialog
        open={target !== null}
        title={target?.action === "freeze" ? "تجميد حساب" : "فك تجميد حساب"}
        description={
          target
            ? `الحساب: ${target.user.fullName ?? "بلا اسم"} · ${target.user.phone}${
                target.action === "freeze"
                  ? " — سيُنهي الخادم جلساته النشطة فوراً ويمنع دخوله الكامل."
                  : " — سيُعيد تنشيط الحساب وعملياته المالية."
              }`
            : null
        }
        confirmLabel={target?.action === "freeze" ? "تأكيد التجميد" : "تأكيد فك التجميد"}
        confirmVariant={target?.action === "freeze" ? "danger" : "primary"}
        busy={runner.busy}
        error={runner.error}
        onConfirm={(reason) => void submitFreeze(reason)}
        onCancel={() => {
          runner.setError(null);
          setTarget(null);
        }}
      />
    </div>
  );
}
