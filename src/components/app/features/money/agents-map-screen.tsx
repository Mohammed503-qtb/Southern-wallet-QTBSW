/**
 * محفظة الجنوب — دليل الوكلاء (SC-25/26)
 * GET /api/agents → بحث نصي + فلتر محافظة (المحافظات الثماني)
 * → بطاقات وكيل (المتجر/الكود/المديرية/العنوان/الحالة)
 * → نقر يفتح Sheet تفاصيل (C2) بأزرار إيداع/سحب لدى الوكيل
 * → navigate("cash-deposit"/"cash-withdraw", { agentId }).
 * وضع picker=cash قادم من شاشات النقدي (نفس الأزرار مع تلوين اختيار).
 */

"use client";

import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, MapPin, RotateCw, Search, Store } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import type { AgentView } from "@/lib/api-types";
import { IN_SCOPE_GOVERNORATES } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui/api-hooks";
import { EmptyState } from "@/components/app/ui/empty-state";
import { ErrorState } from "@/components/app/ui/error-state";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { StatusChip } from "@/components/app/ui/status-chip";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./money-shared";

const GOV_OPTIONS = ["الكل", ...IN_SCOPE_GOVERNORATES] as const;

export function AgentsMapScreen() {
  const params = useAppStore((s) => s.params);
  const me = useAppStore((s) => s.me);
  const navigate = useAppStore((s) => s.navigate);
  const back = useAppStore((s) => s.back);

  const isPicker = params.picker === "cash";
  const myGov = me?.user.governorate ?? null;

  const [query, setQuery] = useState("");
  const [gov, setGov] = useState<string>("الكل");
  const [openAgent, setOpenAgent] = useState<AgentView | null>(null);

  const agents = useApiData<AgentView[]>("/api/agents");

  const filtered = useMemo(() => {
    const src = agents.data ?? [];
    const q = query.trim();
    return src.filter((a) => {
      if (gov !== "الكل" && a.governorate !== gov) return false;
      if (!q) return true;
      return (
        a.shopName.includes(q) ||
        a.code.toLowerCase().includes(q.toLowerCase()) ||
        a.district?.includes(q) ||
        a.address?.includes(q)
      );
    });
  }, [agents.data, query, gov]);

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader
        title="دليل الوكلاء"
        subtitle={isPicker ? "اختر وكيل لتنفيذ العملية" : "وكلاء معتمدون في المحافظات الثماني"}
        onBack={isPicker ? back : undefined}
        action={
          <button
            type="button"
            onClick={agents.retry}
            aria-label="تحديث القائمة"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#E8E6E1] bg-white text-[#5C5A56] transition-colors hover:bg-[#F7F6F2]"
          >
            <RotateCw strokeWidth={1.5} className="h-5 w-5" />
          </button>
        }
      />

      {/* بحث */}
      <div className="relative mt-3">
        <Search
          strokeWidth={1.5}
          className="pointer-events-none absolute right-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#A3A09B]"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 40))}
          placeholder="ابحث باسم المتجر أو الكود أو المديرية…"
          className="min-h-11 w-full rounded-xl border border-[#E8E6E1] bg-white py-2.5 pl-4 pr-11 text-[14px] font-medium text-[#141416] placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:outline-none"
        />
      </div>

      {/* فلتر المحافظة — شرائح قابلة للتمرير */}
      <div className="gold-scroll -mx-4 mt-3 overflow-x-auto px-4 pb-1">
        <div className="flex w-max gap-2">
          {GOV_OPTIONS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGov(g)}
              aria-pressed={gov === g}
              className={cn(
                "flex min-h-9 items-center rounded-full px-3.5 text-[12.5px] font-bold transition-all",
                gov === g
                  ? g === "الكل"
                    ? "bg-[#0B0B0C] text-white"
                    : "bg-[#C9A227] text-[#0B0B0C]"
                  : "border border-[#E8E6E1] bg-white text-[#141416] hover:border-[#C9A227]/50",
              )}
            >
              {g}
              {g === myGov && g !== "الكل" ? " ·" : ""}
            </button>
          ))}
        </div>
      </div>
      {myGov && gov === "الكل" ? (
        <p className="mt-2 text-[11.5px] font-medium text-[#A3A09B]">
          وكلاء محافظتك ({myGov}) يظهرون أولاً
        </p>
      ) : null}

      {/* القائمة */}
      <section className="mt-3">
        {agents.loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[84px] w-full rounded-2xl" />
            ))}
          </div>
        ) : agents.error ? (
          <ErrorState message={agents.error.message} code={agents.error.code} onRetry={agents.retry} />
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            title="لا وكلاء بهذا الفلتر"
            description="جرّب محافظة أخرى أو امسح البحث — الوكلاء متواجدون في كل المحافظات الجنوبية الثماني"
            actionLabel="عرض الكل"
            onAction={() => {
              setQuery("");
              setGov("الكل");
            }}
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setOpenAgent(a)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border bg-white p-3.5 text-right shadow-[0_2px_8px_rgba(11,11,12,0.03)] transition-colors",
                  a.status === "SUSPENDED"
                    ? "border-[#E8E6E1]/70 opacity-70"
                    : "border-[#E8E6E1]/70 hover:border-[#C9A227]/40 hover:bg-[#FDFCFA]",
                )}
              >
                <span
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border",
                    a.status === "SUSPENDED"
                      ? "border-[#E8E6E1] bg-[#F7F6F2] text-[#A3A09B]"
                      : "border-[#C9A227]/25 bg-[#C9A227]/[0.07] text-[#8A6E14]",
                  )}
                >
                  <Store strokeWidth={1.5} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-bold text-[#141416]">{a.shopName}</span>
                    <StatusChip status={a.status} />
                  </span>
                  <span className="block truncate text-[12px] font-medium text-[#5C5A56]">
                    {a.governorate}
                    {a.district ? ` · ${a.district}` : ""}
                    {a.address ? ` · ${a.address}` : ""}
                  </span>
                  <span dir="ltr" className="block text-[10.5px] font-semibold tabular-nums text-[#A3A09B]">
                    {a.code}
                  </span>
                </span>
              </button>
            ))}
            <p className="pt-1 text-center text-[11.5px] font-medium text-[#A3A09B]">
              {filtered.length.toLocaleString("en-US")} وكيل — البيانات من الخادم
            </p>
          </div>
        )}
      </section>

      {/* شيت التفاصيل (SC-26) — مع C2 */}
      <AgentDetailsSheet
        agent={openAgent}
        onClose={() => setOpenAgent(null)}
        onDeposit={(id) => navigate("cash-deposit", { agentId: id })}
        onWithdraw={(id) => navigate("cash-withdraw", { agentId: id })}
      />
    </div>
  );
}

/** شيت تفاصيل الوكيل — يجلب C2 للتأكيد الحي */
function AgentDetailsSheet({
  agent,
  onClose,
  onDeposit,
  onWithdraw,
}: {
  agent: AgentView | null;
  onClose: () => void;
  onDeposit: (id: string) => void;
  onWithdraw: (id: string) => void;
}) {
  // C2: تفاصيل حية من الخادم عند فتح الشيت
  const detail = useApiData<AgentView>(agent ? `/api/agents/${agent.id}` : null);
  const view = agent ? (detail.data ?? agent) : null;
  const suspended = view?.status === "SUSPENDED";

  return (
    <BottomSheet open={agent !== null} onClose={onClose} title="تفاصيل الوكيل">
      {view ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-[#E8E6E1] bg-white p-4">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full border",
                  suspended
                    ? "border-[#E8E6E1] bg-[#F7F6F2] text-[#A3A09B]"
                    : "border-[#C9A227]/25 bg-[#C9A227]/[0.07] text-[#8A6E14]",
                )}
              >
                <Store strokeWidth={1.5} className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-bold text-[#141416]">{view.shopName}</p>
                <p dir="ltr" className="text-[12px] font-semibold tabular-nums text-[#A3A09B]">
                  {view.code}
                </p>
              </div>
              <StatusChip status={view.status} />
            </div>

            <dl className="mt-3 divide-y divide-[#E8E6E1]/70">
              <div className="flex items-center justify-between gap-3 py-2">
                <dt className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#5C5A56]">
                  <MapPin strokeWidth={1.5} className="h-4 w-4 text-[#A3A09B]" />
                  المحافظة
                </dt>
                <dd className="text-[13.5px] font-semibold text-[#141416]">{view.governorate}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <dt className="text-[12.5px] font-medium text-[#5C5A56]">المديرية</dt>
                <dd className="text-[13.5px] font-semibold text-[#141416]">{view.district ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <dt className="text-[12.5px] font-medium text-[#5C5A56]">العنوان</dt>
                <dd className="max-w-[60%] text-left text-[13px] font-semibold leading-5 text-[#141416]">
                  {view.address ?? "—"}
                </dd>
              </div>
            </dl>
          </div>

          {suspended ? (
            <p className="rounded-xl border border-[#E8E6E1] bg-[#F7F6F2] px-3 py-2.5 text-center text-[12.5px] font-bold text-[#5C5A56]">
              هذا الوكيل موقوف مؤقتاً — لا يستقبل طلبات إيداع أو سحب
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onDeposit(view.id)}
                className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl bg-[#0B0B0C] px-3 text-[13.5px] font-bold text-white transition-colors hover:bg-[#1A1A1C]"
              >
                <ArrowDownToLine strokeWidth={1.5} className="h-5 w-5 text-[#C9A227]" />
                إيداع لدى الوكيل
              </button>
              <button
                type="button"
                onClick={() => onWithdraw(view.id)}
                className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border border-[#0B0B0C]/15 bg-white px-3 text-[13.5px] font-bold text-[#141416] transition-colors hover:bg-[#F7F6F2]"
              >
                <ArrowUpFromLine strokeWidth={1.5} className="h-5 w-5 text-[#5C5A56]" />
                سحب من الوكيل
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      )}
    </BottomSheet>
  );
}
