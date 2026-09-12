/**
 * محفظة الجنوب — نظرة الوكيل (G1) — 8-d
 * بطاقة العوم الكبيرة (tabular-nums) + إجمالي العمولات وعددها + صف إحصاء
 * (إيداعات معلقة لديّ/سحوبات معلقة لديّ/حوالات قابلة للدفع عالمياً) +
 * بطاقة ملف الوكيل + شرح صغير: «أدخل رمز الحوالة للتحقق قبل الدفع».
 */
"use client";

import { ArrowLeft, Coins, HandCoins, ListChecks, Send, Wallet } from "lucide-react";
import type { AgentOverviewView } from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui";
import { ConsoleButton, ConsoleCard, SectionHeader, Skeleton } from "../console-ui";

export function AgentOverview({ onGoQueue }: { onGoQueue: () => void }) {
  const { data, loading, error, retry } = useApiData<AgentOverviewView>("/api/agent/overview");

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4">
        <SectionHeader title="نظرة الوكيل" />
        <Skeleton className="h-[150px]" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton className="h-[100px]" />
          <Skeleton className="h-[100px]" />
          <Skeleton className="h-[100px]" />
        </div>
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
        <div className="mt-4 flex justify-center">
          <ConsoleButton onClick={retry}>إعادة المحاولة</ConsoleButton>
        </div>
      </ConsoleCard>
    );
  }

  if (!data) return null;

  const stats = [
    { label: "إيداعات معلقة لديّ", value: data.pendingDeposits, icon: HandCoins, tone: "text-[#B45309]", bg: "bg-[#B45309]/10" },
    { label: "سحوبات معلقة لديّ", value: data.pendingWithdrawals, icon: ListChecks, tone: "text-[#B45309]", bg: "bg-[#B45309]/10" },
    { label: "حوالات قابلة للدفع عالمياً", value: data.pendingRemittancesGlobal, icon: Send, tone: "text-[#8A6E14]", bg: "bg-[#C9A227]/12" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="نظرة الوكيل"
        description="عومك وعمولاتك وطلباتك المعلقة — تُحدَّث مع كل عملية"
        onRefresh={retry}
        refreshing={loading}
      />

      {/* بطاقة العوم + ملف الوكيل */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ConsoleCard className="relative overflow-hidden bg-[#191308] p-5 lg:col-span-2">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(420px 180px at 85% 0%, rgba(201,162,39,0.16), transparent 65%)",
            }}
          />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-[12px] font-bold text-[#D8CBB0]/70">
                <Wallet strokeWidth={1.6} className="h-4 w-4 text-[#C9A227]" />
                عومي النقدي
              </p>
              <p className="mt-2 text-[38px] font-extrabold leading-none tabular-nums text-[#F3E9CF]">
                {formatMoney(data.floatMinor, "YER")}
              </p>
              <p className="mt-2 text-[12px] font-medium text-[#D8CBB0]/60">
                الرصيد المتاح لتموين السحوبات وتسليم الحوالات
              </p>
            </div>
            <div className="text-left lg:text-right">
              <p className="text-[13px] font-extrabold text-[#F3E9CF]">{data.profile.shopName}</p>
              <p dir="ltr" className="text-right text-[11.5px] font-semibold tabular-nums text-[#C9A227]">
                {data.profile.code}
              </p>
              <p className="mt-1 text-[11.5px] font-medium text-[#D8CBB0]/70">
                {data.profile.governorate}
                {data.profile.district ? ` · ${data.profile.district}` : ""}
              </p>
              <span className="mt-2 inline-flex rounded-full border border-[#15803D]/40 bg-[#15803D]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#7BD693]">
                {data.profile.status === "ACTIVE" ? "وكالة مفعّلة" : "وكالة معلّقة"}
              </span>
            </div>
          </div>
        </ConsoleCard>

        {/* العمولات */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <ConsoleCard className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#8A8783]">
                <Coins strokeWidth={1.6} className="h-3.5 w-3.5 text-[#C9A227]" />
                إجمالي عمولاتي
              </p>
              <p className="mt-1.5 text-[22px] font-extrabold leading-8 tabular-nums text-[#8A6E14]">
                {formatMoney(data.commissionTotalMinor, "YER")}
              </p>
            </div>
          </ConsoleCard>
          <ConsoleCard className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-[11px] font-semibold text-[#8A8783]">عدد العمولات</p>
              <p className="mt-1.5 text-[22px] font-extrabold leading-8 tabular-nums text-[#141416]">
                {data.commissionCount.toLocaleString("en-US")}
              </p>
            </div>
          </ConsoleCard>
        </div>
      </div>

      {/* صف الإحصاء */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <ConsoleCard key={stat.label} className="flex items-center gap-3 p-4">
            <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.bg}`}>
              <stat.icon strokeWidth={1.6} className={`h-5 w-5 ${stat.tone}`} />
            </span>
            <div className="min-w-0">
              <p className="text-[11.5px] font-semibold leading-4 text-[#8A8783]">{stat.label}</p>
              <p className={`mt-0.5 text-[20px] font-extrabold leading-7 tabular-nums ${stat.tone}`}>
                {stat.value.toLocaleString("en-US")}
              </p>
            </div>
          </ConsoleCard>
        ))}
      </div>

      {/* شرح الدفع بالرمز */}
      <ConsoleCard className="flex flex-wrap items-center justify-between gap-3 border-[#C9A227]/30 bg-[#C9A227]/[0.06] p-4">
        <p className="max-w-[520px] text-[13px] font-semibold leading-6 text-[#705908]">
          أدخل رمز الحوالة للتحقق قبل الدفع: تحقق أولاً من تفاصيل المستلم، ثم أكّد الدفع
          النقدي — الخادم يخصم من عومك ويسجّل عمولتك تلقائياً.
        </p>
        <ConsoleButton variant="gold" onClick={onGoQueue}>
          <ListChecks strokeWidth={1.6} className="h-4 w-4" />
          اذهب إلى طابور العمليات
          <ArrowLeft strokeWidth={1.6} className="h-4 w-4" />
        </ConsoleButton>
      </ConsoleCard>
    </div>
  );
}
