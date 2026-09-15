/**
 * محفظة الجنوب — قسم نظرة عامة (M1) — 8-d
 * بطاقات KPI (مستخدمون/عملاء/وكلاء/مجمّدون/KYC معلق/نقدي معلق/حوالات معلقة/
 * تذاكر مفتوحة/عمليات 24س) + حجم 24 ساعة لكل عملة (formatMoney) +
 * بطاقة فحص الدفاتر: ledgerBalanced أخضر "Σ=0" أو أحمر بعدد المخالفات،
 * مع زر فحص مفصّل (M16 — ADMIN فقط) يعرض عدد القيود والمجموعات المفحوصة.
 */
"use client";

import { useState } from "react";
import {
  Activity,
  Banknote,
  CheckCircle2,
  LifeBuoy,
  RefreshCw,
  Send,
  ShieldCheck,
  Snowflake,
  Store,
  User,
  Users,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { AdminOverviewView, CurrencyCode, LedgerCheckView, UserRole } from "@/lib/api-types";
import { CURRENCIES, CURRENCY_META, formatMoney } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui";
import { ConsoleButton, ConsoleCard, KpiCard, SectionHeader } from "../console-ui";

export function OverviewSection({ role }: { role: UserRole }) {
  const { data, loading, error, retry } = useApiData<AdminOverviewView>("/api/admin/overview");
  const [check, setCheck] = useState<LedgerCheckView | null>(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const runDeepCheck = async () => {
    setCheckBusy(true);
    setCheckError(null);
    try {
      const result = await api.get<LedgerCheckView>("/api/admin/ledger-check");
      setCheck(result);
    } catch (err) {
      setCheckError(err instanceof ApiError ? err.message : "تعذر إجراء الفحص");
    } finally {
      setCheckBusy(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4">
        <SectionHeader title="نظرة عامة" description="مؤشرات المنصة المباشرة" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <ConsoleCard key={i} className="h-[92px] animate-pulse bg-[#EFEBDD]/60" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col gap-4">
        <SectionHeader title="نظرة عامة" />
        <ConsoleCard className="p-6">
          <p className="text-center text-[14px] font-semibold text-[#B91C1C]">
            {error.message}
            <span dir="ltr" className="ms-2 text-[11px] text-[#A3A09B]">{error.code}</span>
          </p>
          <div className="mt-4 flex justify-center">
            <ConsoleButton onClick={retry}>إعادة المحاولة</ConsoleButton>
          </div>
        </ConsoleCard>
      </div>
    );
  }

  if (!data) return null;

  const kpis: { label: string; value: number; icon: LucideIcon; tone?: "gold" | "pending" | "error" }[] = [
    { label: "إجمالي المستخدمين", value: data.usersCount, icon: Users },
    { label: "العملاء", value: data.customersCount, icon: User },
    { label: "الوكلاء", value: data.agentsCount, icon: Store },
    { label: "حسابات مجمّدة", value: data.frozenUsers, icon: Snowflake, tone: data.frozenUsers > 0 ? "error" : undefined },
    { label: "طلبات KYC معلقة", value: data.pendingKyc, icon: ShieldCheck, tone: data.pendingKyc > 0 ? "pending" : undefined },
    { label: "عمليات نقدية معلقة", value: data.pendingCashOps, icon: Banknote, tone: data.pendingCashOps > 0 ? "pending" : undefined },
    { label: "حوالات معلقة", value: data.pendingRemittances, icon: Send, tone: data.pendingRemittances > 0 ? "pending" : undefined },
    { label: "تذاكر مفتوحة", value: data.openTickets, icon: LifeBuoy, tone: data.openTickets > 0 ? "pending" : undefined },
    { label: "عمليات آخر 24 ساعة", value: data.txnLast24h, icon: Activity, tone: "gold" },
  ];

  const balanced = data.ledgerBalanced;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="نظرة عامة"
        description="مؤشرات المنصة المباشرة وفحص سلامة الدفاتر المزدوجة"
        onRefresh={retry}
        refreshing={loading}
      />

      {/* بطاقات KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value.toLocaleString("en-US")}
            icon={<kpi.icon strokeWidth={1.6} className="h-[18px] w-[18px]" />}
            tone={kpi.tone ?? "default"}
          />
        ))}
      </div>

      {/* فحص الدفاتر + حجم 24 ساعة */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {/* بطاقة فحص الدفاتر */}
        <ConsoleCard
          className={
            balanced
              ? "border-[#15803D]/25 bg-[#15803D]/[0.04] p-4"
              : "border-[#B91C1C]/25 bg-[#B91C1C]/[0.04] p-4"
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold leading-4 text-[#8A8783]">فحص الدفاتر المزدوجة</p>
              {balanced ? (
                <p className="mt-1.5 flex items-center gap-2 text-[15px] font-extrabold leading-6 text-[#15803D]">
                  <CheckCircle2 strokeWidth={1.75} className="h-5 w-5 shrink-0" />
                  الدفاتر متوازنة — Σ=0
                </p>
              ) : (
                <p className="mt-1.5 flex items-center gap-2 text-[15px] font-extrabold leading-6 text-[#B91C1C]">
                  <XCircle strokeWidth={1.75} className="h-5 w-5 shrink-0" />
                  خلل في التوازن ({data.ledgerViolations.length} مخالفة)
                </p>
              )}
              {check ? (
                <p className="mt-1 text-[12px] font-semibold tabular-nums text-[#5C5A56]">
                  فحص مفصّل: {check.totalEntries.toLocaleString("en-US")} قيداً · {check.groupsChecked.toLocaleString("en-US")} مجموعة
                </p>
              ) : null}
              {checkError ? (
                <p className="mt-1 text-[12px] font-semibold text-[#B91C1C]">{checkError}</p>
              ) : null}
              {!balanced && data.ledgerViolations.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {data.ledgerViolations.slice(0, 4).map((v) => (
                    <li key={v} dir="ltr" className="truncate text-left text-[11px] font-medium tabular-nums text-[#B91C1C]">
                      {v}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {role === "ADMIN" ? (
              <ConsoleButton variant="ghost" size="sm" onClick={() => void runDeepCheck()} loading={checkBusy}>
                <RefreshCw strokeWidth={1.6} className="h-3.5 w-3.5" />
                فحص M16
              </ConsoleButton>
            ) : null}
          </div>
          {/* المهمة 14 (M14): نتيجة مطابقة الأرصدة المخزنة مع سلسلة القيود */}
          {check ? (
            <div className="mt-3 rounded-lg border border-[#E8E6E1] bg-[#FAF9F6] px-3 py-2">
              <p className="flex items-center gap-2 text-[12px] font-bold leading-5">
                {check.balancesReconciled ? (
                  <>
                    <CheckCircle2 strokeWidth={1.75} className="h-4 w-4 shrink-0 text-[#15803D]" />
                    <span className="text-[#15803D]">مطابقة الأرصدة — كل محفظة تساوي مجموع قيودها</span>
                  </>
                ) : (
                  <>
                    <XCircle strokeWidth={1.75} className="h-4 w-4 shrink-0 text-[#B91C1C]" />
                    <span className="text-[#B91C1C]">خلل مطابقة أرصدة ({check.balanceViolations.length} مخالفة)</span>
                  </>
                )}
              </p>
              <p className="mt-1 text-[11px] font-semibold tabular-nums text-[#5C5A56]">
                محافظ مطابقة: {check.walletsChecked.toLocaleString("en-US")} · افتتاحية بلا قيود:{" "}
                {check.walletsWithoutEntries.toLocaleString("en-US")}
              </p>
              {!check.balancesReconciled ? (
                <ul className="mt-1.5 space-y-1">
                  {check.balanceViolations.slice(0, 4).map((v) => (
                    <li key={v} dir="auto" className="truncate text-[11px] font-medium text-[#B91C1C]">
                      {v}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </ConsoleCard>

        {/* حجم 24 ساعة لكل عملة */}
        <ConsoleCard className="p-4 xl:col-span-2">
          <p className="text-[11px] font-semibold leading-4 text-[#8A8783]">حجم العمليات آخر 24 ساعة (المبلغ + الرسوم)</p>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {CURRENCIES.map((cur) => {
              const volume = data.volume24hMinor[cur] ?? 0;
              return (
                <div key={cur} className="rounded-xl border border-[#E8E6E1] bg-[#FAF9F6] px-3.5 py-2.5">
                  <p className="text-[11px] font-semibold text-[#8A8783]">
                    {CURRENCY_META[cur].symbolAr} · {cur}
                  </p>
                  <p className="mt-1 text-[17px] font-extrabold leading-6 tabular-nums text-[#141416]">
                    {formatMoney(volume, cur as CurrencyCode)}
                  </p>
                </div>
              );
            })}
          </div>
        </ConsoleCard>
      </div>
    </div>
  );
}
