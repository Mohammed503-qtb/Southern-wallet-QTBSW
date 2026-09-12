/**
 * محفظة الجنوب — كشف الحساب (SC-36)
 * نطاق تاريخ (أسبوع/شهر/90 يوماً/تخصيص) + عملة → GET /api/statement (T5) →
 * ملخص (عدد/إجمالي دخل/إجمالي خرج/الرسوم) ببطاقات + قائمة العمليات +
 * زر تنزيل CSV (blob نصي UTF-8 بBOM \uFEFF ليدعم العربية).
 */
"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Download } from "lucide-react";
import type { StatementView, TxView } from "@/lib/api-types";
import {
  CURRENCIES,
  CURRENCY_META,
  TX_STATUS_LABELS,
  TX_TYPE_LABELS,
  formatMoney,
} from "@/lib/api-types";
import { useApiData } from "@/components/app/ui";
import { ErrorState } from "@/components/app/ui/error-state";
import { EmptyState } from "@/components/app/ui/empty-state";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { TransactionRow } from "@/components/app/ui/transaction-row";
import { downloadTextFile, PillTabs } from "./account-shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useAppStore } from "@/lib/app-store";

type RangeKey = "WEEK" | "MONTH" | "D90" | "CUSTOM";

const RANGE_OPTIONS: { value: RangeKey; label: string; days: number }[] = [
  { value: "WEEK", label: "أسبوع", days: 7 },
  { value: "MONTH", label: "شهر", days: 30 },
  { value: "D90", label: "90 يوماً", days: 90 },
  { value: "CUSTOM", label: "تخصيص", days: 0 },
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** التاريخ بالنمط yyyy-MM-dd لحقول input[type=date] */
function localInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function StatementScreen() {
  const navigate = useAppStore((s) => s.navigate);
  const [range, setRange] = useState<RangeKey>("MONTH");
  const [currency, setCurrency] = useState<string>("YER");
  const today = useMemo(() => new Date(), []);
  const [customFrom, setCustomFrom] = useState(localInputDate(new Date(today.getTime() - 30 * 86_400_000)));
  const [customTo, setCustomTo] = useState(localInputDate(today));

  // ===== حساب from/to =====
  const { from, to } = useMemo(() => {
    const preset = RANGE_OPTIONS.find((r) => r.value === range);
    if (preset && preset.days > 0) {
      return {
        from: new Date(today.getTime() - preset.days * 86_400_000),
        to: today,
      };
    }
    const f = new Date(`${customFrom}T00:00:00`);
    const t = new Date(`${customTo}T23:59:59`);
    return { from: isNaN(f.getTime()) ? today : f, to: isNaN(t.getTime()) ? today : t };
  }, [range, today, customFrom, customTo]);

  const path = useMemo(
    () =>
      `/api/statement?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(
        to.toISOString(),
      )}&currency=${currency}`,
    [from, to, currency],
  );

  const statement = useApiData<StatementView>(path);
  const cur = currency as keyof typeof CURRENCY_META;

  // ===== تنزيل CSV (UTF-8 بBOM لدعم العربية في Excel) =====
  const downloadCsv = () => {
    const items = statement.data?.items ?? [];
    if (items.length === 0) {
      toast({ title: "لا توجد عمليات للتنزيل في هذا النطاق" });
      return;
    }
    const header = ["المرجع", "التاريخ", "النوع", "الطرف", "المبلغ", "الرسوم", "الحالة"];
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const div = Math.pow(10, CURRENCY_META[cur].decimals);
    const rows = items.map((t: TxView) => {
      const amount = (t.amountMinor / div).toFixed(CURRENCY_META[cur].decimals);
      const fee = (t.feeMinor / div).toFixed(CURRENCY_META[cur].decimals);
      return [
        t.ref,
        t.createdAt,
        TX_TYPE_LABELS[t.type],
        t.counterpartyName ?? t.counterpartyPhone ?? "",
        amount,
        fee,
        TX_STATUS_LABELS[t.status],
      ]
        .map(esc)
        .join(",");
    });
    const csv = `\uFEFF${[header.join(","), ...rows].join("\r\n")}`;
    downloadTextFile(
      `كشف-محفظة-الجنوب-${currency}-${isoDate(from)}-${isoDate(to)}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
    toast({
      title: "تم تنزيل كشف الحساب",
      description: `${items.length} عملية · ${CURRENCY_META[cur].code} · ${isoDate(from)} ← ${isoDate(to)}`,
    });
  };

  const loading = statement.loading && !statement.data;

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader
        title="كشف الحساب"
        subtitle="ملخص حركة محفظتك خلال فترة محددة"
      />

      {/* ===== الفلاتر ===== */}
      <div className="mt-4 space-y-3 rounded-2xl border border-[#E8E6E1] bg-white p-3 shadow-[0_2px_8px_rgba(11,11,12,0.03)]">
        <PillTabs<RangeKey>
          options={RANGE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
          value={range}
          onChange={setRange}
        />

        {range === "CUSTOM" ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="sw-stmt-from" className="mb-1.5 block text-[11px] font-semibold text-[#5C5A56]">
                من تاريخ
              </label>
              <input
                id="sw-stmt-from"
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#E8E6E1] bg-white px-3 text-[13px] font-semibold tabular-nums text-[#141416] focus:border-[#C9A227] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="sw-stmt-to" className="mb-1.5 block text-[11px] font-semibold text-[#5C5A56]">
                إلى تاريخ
              </label>
              <input
                id="sw-stmt-to"
                type="date"
                value={customTo}
                min={customFrom}
                max={localInputDate(today)}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#E8E6E1] bg-white px-3 text-[13px] font-semibold tabular-nums text-[#141416] focus:border-[#C9A227] focus:outline-none"
              />
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <CalendarRange strokeWidth={1.5} className="h-4 w-4 shrink-0 text-[#A3A09B]" />
          <p dir="auto" className="flex-1 text-[12px] font-semibold tabular-nums text-[#5C5A56]">
            {isoDate(from)} ← {isoDate(to)}
          </p>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger
              dir="rtl"
              aria-label="عملة الكشف"
              className="h-11 w-[130px] rounded-xl border-[#E8E6E1] bg-white text-[13px] font-semibold text-[#141416]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c} className="text-[13px]">
                  {CURRENCY_META[c].code} · {CURRENCY_META[c].symbolAr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ===== الملخص ===== */}
      {loading ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : statement.error ? (
        <div className="mt-3">
          <ErrorState
            compact
            message={statement.error.message}
            code={statement.error.code}
            onRetry={statement.retry}
          />
        </div>
      ) : statement.data ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-[#E8E6E1] bg-white p-3">
              <p className="text-[11px] font-semibold text-[#A3A09B]">عدد العمليات</p>
              <p className="mt-1 text-[22px] font-extrabold tabular-nums leading-7 text-[#141416]">
                {statement.data.summary.count}
              </p>
            </div>
            <div className="rounded-2xl border border-[#15803D]/20 bg-[#15803D]/[0.05] p-3">
              <p className="text-[11px] font-semibold text-[#15803D]">إجمالي الدخل</p>
              <p dir="auto" className="mt-1 text-[17px] font-extrabold tabular-nums leading-7 text-[#15803D]">
                {formatMoney(statement.data.summary.totalInMinor, cur)}
              </p>
            </div>
            <div className="rounded-2xl border border-[#B91C1C]/20 bg-[#B91C1C]/[0.04] p-3">
              <p className="text-[11px] font-semibold text-[#B91C1C]">إجمالي الخرج</p>
              <p dir="auto" className="mt-1 text-[17px] font-extrabold tabular-nums leading-7 text-[#B91C1C]">
                {formatMoney(statement.data.summary.totalOutMinor, cur)}
              </p>
            </div>
            <div className="rounded-2xl border border-[#E8E6E1] bg-white p-3">
              <p className="text-[11px] font-semibold text-[#A3A09B]">إجمالي الرسوم</p>
              <p dir="auto" className="mt-1 text-[17px] font-extrabold tabular-nums leading-7 text-[#5C5A56]">
                {formatMoney(statement.data.summary.feesMinor, cur)}
              </p>
            </div>
          </div>

          {/* زر CSV */}
          <button
            type="button"
            onClick={downloadCsv}
            disabled={(statement.data.items?.length ?? 0) === 0}
            className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#0B0B0C] text-[15px] font-bold text-white transition-colors hover:bg-[#1A1A1C] disabled:bg-[#A3A09B]"
          >
            <Download strokeWidth={1.5} className="h-5 w-5" />
            تنزيل الكشف CSV
          </button>

          {/* قائمة العمليات */}
          <h2 className="mt-5 mb-2.5 text-[18px] font-semibold leading-6 text-[#141416]">
            العمليات ({statement.data.items.length})
          </h2>
          {(statement.data.items?.length ?? 0) === 0 ? (
            <EmptyState
              compact
              title="لا عمليات في هذه الفترة"
              description="جرّب توسيع نطاق التاريخ أو تغيير العملة"
            />
          ) : (
            <div className="space-y-2">
              {statement.data.items.map((tx) => (
                <TransactionRow
                  key={tx.ref}
                  tx={tx}
                  onOpen={(r) => navigate("transaction-details", { ref: r })}
                />
              ))}
              <p className="pt-1 text-center text-[11px] font-medium text-[#A3A09B]">
                أُظهرت أول 200 عملية من الفترة المحددة
              </p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
