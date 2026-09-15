/**
 * محفظة الجنوب — الفواتير (SC القسم المرحلة 2 / 9-b)
 * كتالوج مزودي الفواتير مصنّفاً بالفئات (BILLER_CATEGORY_LABELS) مع أيقونات
 * + بحث بالاسم + «آخر مدفوعاتك» (آخر عمليات BILL_PAY من /api/transactions
 * بفلتر types=BILL_PAY — النقر يعيد فتح المزود مع تمليء رقم الحساب).
 * اختيار مزود → navigate("bill-pay", { billerCode, account? }).
 */
"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  Droplets,
  Landmark,
  Phone,
  Receipt,
  Search,
  Wifi,
  Zap,
} from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import type { BillerCategory, BillerView, PageView, TxView } from "@/lib/api-types";
import { BILLER_CATEGORY_LABELS, formatMoney } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui/api-hooks";
import { EmptyState } from "@/components/app/ui/empty-state";
import { ErrorState } from "@/components/app/ui/error-state";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { formatShortDateTime } from "@/components/app/ui/utils";
import { cn } from "@/lib/utils";

/** أيقونات الفئات بالترتيب الثابت للعرض */
const CATEGORY_ORDER: BillerCategory[] = ["ELECTRIC", "WATER", "TELECOM", "INTERNET", "GOV"];
const CATEGORY_ICONS: Record<BillerCategory, typeof Zap> = {
  ELECTRIC: Zap,
  WATER: Droplets,
  TELECOM: Phone,
  INTERNET: Wifi,
  GOV: Landmark,
};

/** استخراج رقم الحساب من وصف عملية BILL_PAY (سداد فاتورة … — 23456789) */
function accountFromDescription(description: string | null): string | null {
  if (!description) return null;
  const m = description.match(/[—-]\s*(\d{4,12})\s*$/);
  return m ? m[1] : null;
}

export function BillsScreen() {
  const navigate = useAppStore((s) => s.navigate);
  const [query, setQuery] = useState("");

  const billers = useApiData<BillerView[]>("/api/bills");
  const recent = useApiData<PageView<TxView>>("/api/transactions?types=BILL_PAY&limit=5");

  /** تصفية البحث (تطبيع بسيط للعربية) */
  const filtered = useMemo(() => {
    const q = query.trim().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
    if (!q) return billers.data ?? [];
    return (billers.data ?? []).filter((b) =>
      b.name.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").includes(q),
    );
  }, [billers.data, query]);

  /** خريطة اسم المزود → code (لفتح آخر مدفوعات الفواتير) */
  const byName = useMemo(() => {
    const m = new Map<string, BillerView>();
    for (const b of billers.data ?? []) m.set(b.name, b);
    return m;
  }, [billers.data]);

  const openBiller = (billerCode: string, account?: string) => {
    navigate("bill-pay", account ? { billerCode, account } : { billerCode });
  };

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader title="الفواتير" subtitle="سداد فواتير الخدمات من محفظتك — بالريال اليمني" />

      {/* البحث */}
      <div className="relative mt-3">
        <Search
          strokeWidth={1.5}
          className="pointer-events-none absolute right-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#A3A09B]"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 40))}
          placeholder="ابحث عن مزوّد… (كهرباء، مياه، يمن موبايل)"
          className="min-h-12 w-full rounded-2xl border border-[#E8E6E1] bg-white pr-11 pl-4 py-3 text-[14px] font-medium text-[#141416] placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:outline-none"
        />
      </div>

      {billers.loading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />
          ))}
        </div>
      ) : billers.error ? (
        <div className="mt-6">
          <ErrorState message={billers.error.message} code={billers.error.code} onRetry={billers.retry} />
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {/* آخر مدفوعات الفواتير */}
          {recent.data && recent.data.items.length > 0 && query.trim() === "" ? (
            <section>
              <h2 className="mb-2.5 flex items-center gap-1.5 text-[15px] font-semibold leading-6 text-[#141416]">
                <Receipt strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
                آخر مدفوعاتك
              </h2>
              <div className="space-y-2">
                {recent.data.items.slice(0, 3).map((tx) => {
                  const biller = tx.counterpartyName ? byName.get(tx.counterpartyName) : undefined;
                  const account = accountFromDescription(tx.description);
                  return (
                    <button
                      key={tx.ref}
                      type="button"
                      onClick={() => biller && openBiller(biller.code, account ?? undefined)}
                      disabled={!biller}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border border-[#E8E6E1]/70 bg-white p-3 text-right transition-colors",
                        biller ? "hover:border-[#C9A227]/50 hover:bg-[#FDFCFA]" : "opacity-80",
                      )}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#15803D]/20 bg-[#15803D]/[0.07] text-[#15803D]">
                        <Receipt strokeWidth={1.5} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-bold text-[#141416]">
                          {tx.counterpartyName ?? "سداد فاتورة"}
                        </span>
                        <span className="block truncate text-[12px] font-medium text-[#5C5A56]">
                          {account ? `حساب ${account} • ` : ""}
                          {formatShortDateTime(tx.createdAt)}
                        </span>
                      </span>
                      <span className="shrink-0 text-left">
                        <span className="block text-[14px] font-extrabold tabular-nums text-[#141416]">
                          {formatMoney(tx.amountMinor, tx.currency)}
                        </span>
                        <span className="block text-[11px] font-medium text-[#A3A09B]">مكتملة</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* الكتالوج بالفئات */}
          {filtered.length === 0 ? (
            <EmptyState
              compact
              title="لا نتائج مطابقة"
              description="جرّب كلمة أخرى — مثلاً «كهرباء» أو «مياه» أو «يمن موبايل»."
            />
          ) : (
            CATEGORY_ORDER.map((cat) => {
              const items = filtered.filter((b) => b.category === cat);
              if (items.length === 0) return null;
              const Icon = CATEGORY_ICONS[cat];
              return (
                <section key={cat}>
                  <h2 className="mb-2.5 flex items-center gap-2 text-[16px] font-semibold leading-6 text-[#141416]">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#C9A227]/25 bg-[#C9A227]/[0.07] text-[#8A6E14]">
                      <Icon strokeWidth={1.5} className="h-4 w-4" />
                    </span>
                    {BILLER_CATEGORY_LABELS[cat]}
                  </h2>
                  <div className="space-y-2">
                    {items.map((b) => (
                      <button
                        key={b.code}
                        type="button"
                        onClick={() => openBiller(b.code)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-[#E8E6E1]/70 bg-white p-3.5 text-right transition-colors hover:border-[#C9A227]/50 hover:bg-[#FDFCFA] active:bg-[#F7F6F2]"
                      >
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]">
                          <Icon strokeWidth={1.5} className="h-5 w-5" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[15px] font-bold text-[#141416]">{b.name}</span>
                          <span className="truncate text-[12px] font-medium text-[#5C5A56]">
                            {b.accountFormatHint}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          <span className="rounded-full border border-[#C9A227]/25 bg-[#C9A227]/[0.06] px-2 py-0.5 text-[10.5px] font-bold text-[#8A6E14]">
                            رسوم {formatMoney(b.feeMinor, b.currency)}
                          </span>
                          <ChevronLeft strokeWidth={1.5} className="h-4 w-4 text-[#A3A09B]" />
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })
          )}

          {/* ملاحظة الخدمة */}
          <p className="rounded-xl bg-[#F7F6F2] px-3 py-2.5 text-center text-[12px] font-medium leading-5 text-[#5C5A56]">
            المبالغ المعروضة تقديرية وتُعتمد نهائياً عند إتمام السداد.
            السداد من محفظة الريال اليمني فقط.
          </p>
        </div>
      )}
    </div>
  );
}
