/**
 * محفظة الجنوب — سجل العمليات (SC-34)
 * شريط فلاتر pill (الكل/دخل/خرج → types) + Select حالة + Select عملة +
 * بحث نصي محلي (الاسم/المرجع/الهاتف) → GET /api/transactions (T3) بقائمة
 * لانهائية (زر تحميل المزيد عند nextCursor) + ترويسة إحصاء لاصقة (عدد/صافي).
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Search } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { api } from "@/lib/api";
import type { PageView, TxType, TxView } from "@/lib/api-types";
import {
  CURRENCIES,
  CURRENCY_META,
  TX_STATUS_LABELS,
  formatMoney,
} from "@/lib/api-types";
import { useApiData } from "@/components/app/ui";
import { ErrorState } from "@/components/app/ui/error-state";
import { EmptyState } from "@/components/app/ui/empty-state";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { TransactionRow } from "@/components/app/ui/transaction-row";
import { PillTabs } from "./account-shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type DirectionFilter = "ALL" | "IN" | "OUT";

/** خريطة شرائح الاتجاه إلى أنواع العمليات (T3 ?types) — الاتجاه من منظور محفظتك */
const TYPES_BY_DIRECTION: Record<DirectionFilter, TxType[]> = {
  ALL: [],
  IN: ["TRANSFER_IN", "CASH_IN", "SAVING_OUT", "CASH_REFUND", "REMITTANCE_REFUND"],
  OUT: ["TRANSFER_OUT", "REMITTANCE", "CASH_OUT", "SAVING_IN", "FX_EXCHANGE", "SYSTEM_ADJUST"],
};

const STATUS_OPTIONS = ["", "PENDING", "COMPLETED", "FAILED", "CANCELLED", "EXPIRED"] as const;
const CURRENCY_OPTIONS = ["", ...CURRENCIES] as const;

export function TransactionsScreen() {
  const navigate = useAppStore((s) => s.navigate);

  const [direction, setDirection] = useState<DirectionFilter>("ALL");
  const [status, setStatus] = useState<string>("");
  const [currency, setCurrency] = useState<string>("");
  const [query, setQuery] = useState("");

  // ===== مسار T3 حسب الفلاتر =====
  const path = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "20");
    const types = TYPES_BY_DIRECTION[direction];
    if (types.length > 0) params.set("types", types.join(","));
    if (status) params.set("status", status);
    if (currency) params.set("currency", currency);
    return `/api/transactions?${params.toString()}`;
  }, [direction, status, currency]);

  const first = useApiData<PageView<TxView>>(path);

  // ===== الصفحات الإضافية (تحميل المزيد عبر nextCursor) =====
  const [extraItems, setExtraItems] = useState<TxView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // تغيّر الفلاتر → تصفير الصفحات المجمّعة
  useEffect(() => {
    setExtraItems([]);
    setNextCursor(null);
  }, [path]);

  // وصول الصفحة الأولى → تحديث المؤشر
  useEffect(() => {
    if (first.data) setNextCursor(first.data.nextCursor);
  }, [first.data]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.get<PageView<TxView>>(
        `${path}&cursor=${encodeURIComponent(nextCursor)}`,
      );
      setExtraItems((prev) => {
        const seen = new Set(prev.map((t) => t.ref));
        return [...prev, ...page.items.filter((t) => !seen.has(t.ref))];
      });
      setNextCursor(page.nextCursor);
    } catch {
      toast({
        title: "تعذّر تحميل المزيد",
        description: "تحقق من اتصالك ثم أعد المحاولة",
        variant: "destructive",
      });
    } finally {
      setLoadingMore(false);
    }
  };

  // ===== البحث المحلي (الاسم/المرجع/الهاتف/الوصف) =====
  const items = useMemo(() => {
    const all = [...(first.data?.items ?? []), ...extraItems];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((t) =>
      [t.ref, t.counterpartyName ?? "", t.counterpartyPhone ?? "", t.description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [first.data, extraItems, query]);

  // ===== إحصاء الترويسة اللاصقة: عدد المعروض + الصافي =====
  const stats = useMemo(() => {
    let credit = 0;
    let debit = 0;
    const nets = new Map<string, number>();
    for (const t of items) {
      const signed = t.direction === "CREDIT" ? t.amountMinor : -t.amountMinor;
      if (t.direction === "CREDIT") credit += t.amountMinor;
      else debit += t.amountMinor;
      nets.set(t.currency, (nets.get(t.currency) ?? 0) + signed);
    }
    const preferred = (["YER", "SAR", "USD"] as const).find((c) => nets.has(c));
    return {
      count: items.length,
      credit,
      debit,
      netLabel:
        preferred !== undefined ? formatMoney(nets.get(preferred) ?? 0, preferred) : "—",
      netCurrency: preferred ?? null,
      multiCurrency: nets.size > 1,
    };
  }, [items]);

  const loading = first.loading;
  const error = first.error;

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader
        title="سجل العمليات"
        subtitle="كل حركات محفظتك في مكان واحد"
        action={
          <button
            type="button"
            onClick={() => navigate("statement")}
            aria-label="كشف الحساب"
            title="كشف الحساب"
            className="flex h-11 items-center gap-1.5 rounded-xl border border-[#E8E6E1] bg-white px-3 text-[12.5px] font-bold text-[#5C5A56] transition-colors hover:border-[#C9A227]/50 hover:text-[#141416]"
          >
            <CalendarRange strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
            كشف الحساب
          </button>
        }
      />

      {/* ترويسة إحصاء لاصقة (عدد المعروض / صافي الحركة) */}
      <div className="sticky top-0 z-20 -mx-4 mb-3 bg-[#FAF9F6]/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[#E8E6E1] bg-white px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#5C5A56]">
            المعروض
            <span className="rounded-full bg-[#F7F6F2] px-2 py-0.5 text-[12px] font-bold tabular-nums text-[#141416]">
              {stats.count}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#5C5A56]">
            صافي المعروض
            <span
              dir="auto"
              className={cn(
                "text-[13px] font-bold tabular-nums",
                (stats.credit - stats.debit) >= 0 ? "text-[#15803D]" : "text-[#B91C1C]",
              )}
            >
              {stats.netLabel}
            </span>
            {stats.multiCurrency ? (
              <span className="text-[10px] font-bold text-[#A3A09B]">· عملات أخرى</span>
            ) : null}
          </span>
        </div>
      </div>

      {/* ===== الفلاتر ===== */}
      <div className="space-y-3 rounded-2xl border border-[#E8E6E1] bg-white p-3 shadow-[0_2px_8px_rgba(11,11,12,0.03)]">
        <PillTabs<DirectionFilter>
          options={[
            { value: "ALL", label: "الكل" },
            { value: "IN", label: "دخل" },
            { value: "OUT", label: "خرج" },
          ]}
          value={direction}
          onChange={setDirection}
        />

        <div className="grid grid-cols-2 gap-2">
          <Select value={status || "ALL"} onValueChange={(v) => setStatus(v === "ALL" ? "" : v)}>
            <SelectTrigger
              dir="rtl"
              aria-label="تصفية الحالة"
              className="h-11 w-full rounded-xl border-[#E8E6E1] bg-white text-[13px] font-semibold text-[#141416]"
            >
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-[13px]">
                كل الحالات
              </SelectItem>
              {STATUS_OPTIONS.filter((s) => s !== "").map((s) => (
                <SelectItem key={s} value={s} className="text-[13px]">
                  {TX_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={currency || "ALL"} onValueChange={(v) => setCurrency(v === "ALL" ? "" : v)}>
            <SelectTrigger
              dir="rtl"
              aria-label="تصفية العملة"
              className="h-11 w-full rounded-xl border-[#E8E6E1] bg-white text-[13px] font-semibold text-[#141416]"
            >
              <SelectValue placeholder="العملة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-[13px]">
                كل العملات
              </SelectItem>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c} className="text-[13px]">
                  {CURRENCY_META[c].code} · {CURRENCY_META[c].symbolAr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* بحث نصي محلي */}
        <div className="relative">
          <Search
            strokeWidth={1.5}
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A3A09B]"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث بالاسم أو المرجع…"
            aria-label="بحث في العمليات"
            className="h-11 w-full rounded-xl border border-[#E8E6E1] bg-[#F7F6F2] pr-4 pl-9 text-[14px] font-semibold text-[#141416] placeholder:font-medium placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* ===== القائمة ===== */}
      <div className="mt-3">
        {loading && first.data === null ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <ErrorState compact message={error.message} code={error.code} onRetry={first.retry} />
        ) : items.length === 0 ? (
          query.trim() ? (
            <EmptyState
              compact
              title="لا نتائج مطابقة"
              description={`لم نجد عمليات تطابق «${query.trim()}» ضمن الفلاتر الحالية`}
              actionLabel="مسح البحث"
              onAction={() => setQuery("")}
            />
          ) : (
            <EmptyState
              compact
              title="لا عمليات بعد"
              description="ستظهر هنا كل عملياتك بعد أول تحويل أو إيداع"
              actionLabel="ابدأ من الرئيسية"
              onAction={() => navigate("home")}
            />
          )
        ) : (
          <>
            <div className="space-y-2">
              {items.map((tx) => (
                <TransactionRow
                  key={tx.ref}
                  tx={tx}
                  onOpen={(ref) => navigate("transaction-details", { ref })}
                />
              ))}
            </div>

            {/* تحميل المزيد عند وجود صفحة تالية */}
            {nextCursor ? (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-[#E8E6E1] bg-white text-[14px] font-bold text-[#5C5A56] transition-colors hover:border-[#C9A227]/50 hover:text-[#141416] disabled:opacity-60"
              >
                {loadingMore ? "جارٍ التحميل…" : "تحميل المزيد"}
              </button>
            ) : (
              <p className="mt-3 text-center text-[12px] font-medium text-[#A3A09B]">
                وصلت إلى نهاية السجل
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
