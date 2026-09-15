/**
 * محفظة الجنوب — الحصالة (SC-30)
 * GET /api/savings → بطاقة إجمالية (الموفَّر الكلي لكل عملة)
 * + شبكة أهداف (اسم/شريط تقدم ذهبي/الموفَّر من الهدف/العملة/الحالة)
 * → نقر هدف → savings-goal · زر هدف جديد → savings-new.
 * EmptyState أنيق + CTA عند الفراغ.
 */

"use client";

import { Plus, RotateCw } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import type { CurrencyCode, SavingsJarView } from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui/api-hooks";
import { EmptyState } from "@/components/app/ui/empty-state";
import { ErrorState } from "@/components/app/ui/error-state";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { cn } from "@/lib/utils";
import { JarStatusChip } from "./savings-shared";

export function SavingsScreen() {
  const navigate = useAppStore((s) => s.navigate);

  const jars = useApiData<SavingsJarView[]>("/api/savings");

  // إجمالي الموفَّر مجمّعاً بكل عملة
  const totals = new Map<CurrencyCode, number>();
  for (const j of jars.data ?? []) {
    totals.set(j.currency, (totals.get(j.currency) ?? 0) + j.savedMinor);
  }
  const totalEntries = [...totals.entries()];
  const mainTotal = totalEntries[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader
        title="الحصالة"
        subtitle="أهدافك الادخارية"
        action={
          <button
            type="button"
            onClick={jars.retry}
            aria-label="تحديث"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#E8E6E1] bg-white text-[#5C5A56] transition-colors hover:bg-[#F7F6F2]"
          >
            <RotateCw strokeWidth={1.5} className="h-5 w-5" />
          </button>
        }
      />

      {jars.loading ? (
        <>
          <Skeleton className="mt-4 h-40 w-full rounded-2xl" />
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-2xl" />
            ))}
          </div>
        </>
      ) : jars.error ? (
        <div className="mt-6">
          <ErrorState message={jars.error.message} code={jars.error.code} onRetry={jars.retry} />
        </div>
      ) : (jars.data?.length ?? 0) === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="ابدأ أول هدف ادخار"
            description="أنشئ حصالة لهدفك القادم — حج، دراسة، أو مشروع — وودّع فيها ما تيسّر"
            actionLabel="إنشاء هدف جديد"
            onAction={() => navigate("savings-new")}
          />
        </div>
      ) : (
        <>
          {/* بطاقة الإجمالي */}
          <section className="relative mt-4 overflow-hidden rounded-2xl bg-[#0B0B0C] p-5 text-white shadow-[0_8px_24px_rgba(11,11,12,0.10)]">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
              <span className="absolute -left-10 -top-10 h-32 w-32 rotate-45 rounded-xl border border-[#C9A227]/20" />
              <span className="absolute -right-12 -bottom-14 h-36 w-36 rotate-45 rounded-xl border border-[#C9A227]/15" />
            </div>
            <div className="relative">
              <p className="text-[12px] font-semibold text-white/60">الموفَّر الكلي في الحصالات</p>
              {mainTotal ? (
                <p dir="ltr" className="mt-1.5 text-right text-[32px] font-extrabold leading-10 tabular-nums text-white">
                  {formatMoney(mainTotal[1], mainTotal[0])}
                </p>
              ) : null}
              {totalEntries.length > 1 ? (
                <div className="mt-2 space-y-0.5">
                  {totalEntries.map(([cur, val]) => (
                    <p key={cur} dir="ltr" className="text-right text-[11.5px] font-medium tabular-nums text-white/55">
                      {formatMoney(val, cur)}
                    </p>
                  ))}
                </div>
              ) : null}
              <p className="mt-2 text-[11.5px] font-medium text-white/50">
                {(jars.data?.length ?? 0).toLocaleString("en-US")} هدف ادخاري · أرصدة من الخادم عبر دفتر فعلي
              </p>
            </div>
          </section>

          {/* شبكة الأهداف */}
          <section className="mt-4">
            <div className="grid grid-cols-2 gap-2.5">
              {jars.data?.map((jar) => (
                <SavingsJarCard
                  key={jar.id}
                  jar={jar}
                  onOpen={() => navigate("savings-goal", { id: jar.id })}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {/* زر هدف جديد */}
      {(jars.data?.length ?? 0) > 0 ? (
        <button
          type="button"
          onClick={() => navigate("savings-new")}
          className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#0B0B0C] text-[15px] font-bold text-white transition-colors hover:bg-[#1A1A1C]"
        >
          <Plus strokeWidth={2} className="h-5 w-5 text-[#C9A227]" />
          هدف جديد
        </button>
      ) : null}
    </div>
  );
}

/** بطاقة هدف واحد في الشبكة */
function SavingsJarCard({ jar, onOpen }: { jar: SavingsJarView; onOpen: () => void }) {
  const progress = jar.progress ?? (jar.targetMinor ? Math.min(100, Math.round((jar.savedMinor / jar.targetMinor) * 100)) : 0);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[150px] flex-col rounded-2xl border border-[#E8E6E1]/70 bg-white p-3.5 text-right shadow-[0_2px_8px_rgba(11,11,12,0.03)] transition-colors hover:border-[#C9A227]/40 hover:bg-[#FDFCFA]"
    >
      <span className="flex w-full items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold text-[#141416]">
          {jar.name}
        </span>
        <JarStatusChip status={jar.status} />
      </span>

      <span dir="ltr" className="mt-2 text-right text-[18px] font-extrabold leading-6 tabular-nums text-[#0B0B0C]">
        {formatMoney(jar.savedMinor, jar.currency)}
      </span>
      <span className="text-[11px] font-medium text-[#A3A09B]">
        {jar.targetMinor
          ? `من ${formatMoney(jar.targetMinor, jar.currency)}`
          : "بلا هدف محدد"}
      </span>

      {/* شريط التقدم الذهبي */}
      <span className="mt-auto block pt-3">
        <span className="block h-2 w-full overflow-hidden rounded-full bg-[#F0EEE7]">
          <span
            className={cn(
              "block h-full rounded-full transition-all",
              jar.status === "ACHIEVED" ? "bg-[#15803D]" : "bg-[#C9A227]",
            )}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </span>
        {jar.targetMinor ? (
          <span className="mt-1 block text-[10.5px] font-bold tabular-nums text-[#8A6E14]">
            {Math.max(0, Math.min(100, progress))}% من الهدف
          </span>
        ) : null}
      </span>
    </button>
  );
}
