/**
 * محفظة الجنوب — بوابة نقطة البيع للتاجر (MERCHANT_POS — 9-c)
 * ---------------------------------------------------------
 * دور MERCHANT (يبقى في تطبيق الهاتف): رمز QR كبير للمتجر (SWPAY:<phone>)
 * لعرضه للزبائن + إحصاءات اليوم (عدد/الحجم/الصافي بعد الرسوم) +
 * الرصيد المستحق للتسوية + آخر 10 مبيعات من GET /api/merchant/pos.
 * EmptyState أنيقة إن لا مبيعات + ErrorState عند الفشل + Skeleton للتحميل.
 * ملاحظة: نموذج العرض محلي (عقد api-types مُغلق — الأنواع التعاقدية
 * الجديدة لهذه البوابة لم تُعرَّف فيه؛ الشكل من الخادم موثق هنا).
 */
"use client";

import { Copy, RefreshCw, Store, TrendingUp } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import type { CurrencyCode, TxView } from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui/api-hooks";
import { EmptyState } from "@/components/app/ui/empty-state";
import { ErrorState } from "@/components/app/ui/error-state";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { TransactionRow } from "@/components/app/ui/transaction-row";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/** نموذج عرض /api/merchant/pos (محلي — العقد المغلق لا يضمنه) */
interface MerchantPosView {
  shopName: string;
  phone: string;
  qrPayload: string;
  currency: CurrencyCode;
  today: { count: number; grossMinor: number; netMinor: number; feesMinor: number };
  total: { count: number; netMinor: number };
  /** الرصيد المستحق للتسوية = مجموع صافي كل المبيعات المكتملة */
  dueSettlementMinor: number;
  recentSales: TxView[];
}

/** بطاقة إحصائية صغيرة (ترويسة overline + قيمة كبيرة) */
function StatCard({
  label,
  value,
  hint,
  gold = false,
}: {
  label: string;
  value: string;
  hint?: string;
  gold?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3.5",
        gold
          ? "border-[#C9A227]/40 bg-[#C9A227]/[0.06]"
          : "border-[#E8E6E1] bg-white",
      )}
    >
      <p className={cn("text-[11px] font-semibold", gold ? "text-[#8A6E14]" : "text-[#A3A09B]")}>
        {label}
      </p>
      <p
        dir="ltr"
        className={cn(
          "mt-1 text-right text-[19px] font-extrabold leading-7 tabular-nums",
          gold ? "text-[#8A6E14]" : "text-[#141416]",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] font-medium text-[#A3A09B]">{hint}</p> : null}
    </div>
  );
}

export function MerchantPosScreen() {
  const me = useAppStore((s) => s.me);
  const navigate = useAppStore((s) => s.navigate);
  const pos = useApiData<MerchantPosView>("/api/merchant/pos");

  const myPhone = me?.user.phone ?? "";
  const qrSrc = pos.data
    ? `/api/qr?text=${encodeURIComponent(pos.data.qrPayload)}&size=300`
    : "";

  const copyPayload = async () => {
    if (!pos.data) return;
    try {
      await navigator.clipboard.writeText(pos.data.qrPayload);
      toast({ title: "تم نسخ رمز الدفع", description: pos.data.qrPayload });
    } catch {
      toast({ title: "تعذّر النسخ", variant: "destructive" });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader
        title="نقطة البيع"
        subtitle="رمز دفع متجرك ومبيعاتك لحظياً"
        action={
          <button
            type="button"
            onClick={pos.retry}
            aria-label="تحديث المبيعات"
            title="تحديث"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#E8E6E1] bg-white text-[#5C5A56] transition-colors hover:border-[#C9A227]/50 hover:text-[#8A6E14]"
          >
            <RefreshCw strokeWidth={1.5} className={cn("h-5 w-5", pos.loading && "animate-spin text-[#C9A227]")} />
          </button>
        }
      />

      {/* ===== رمز الدفع الكبير للمتجر ===== */}
      <div className="mt-4 space-y-3">
        <div className="relative overflow-hidden rounded-2xl bg-[#0B0B0C] p-5 text-white shadow-[0_8px_24px_rgba(11,11,12,0.12)]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
            <span className="absolute -left-10 -top-10 h-32 w-32 rotate-45 rounded-xl border border-[#C9A227]/20" />
            <span className="absolute -right-12 -bottom-14 h-36 w-36 rotate-45 rounded-xl border border-[#C9A227]/15" />
          </div>
          <div className="relative flex flex-col items-center">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-white/60">
              <Store strokeWidth={1.5} className="h-3.5 w-3.5 text-[#C9A227]" />
              رمز الدفع — اعرضه للزبون ليتمسحه
            </p>
            <p className="mt-1 text-[17px] font-bold text-white/95">
              {pos.data?.shopName ?? me?.user.fullName ?? "متجر"}
            </p>
            <div className="mt-3 rounded-2xl bg-white p-3">
              {qrSrc ? (
                <img
                  src={qrSrc}
                  alt="رمز الدفع الخاص بالمتجر"
                  width={240}
                  height={240}
                  className="h-[240px] w-[240px]"
                />
              ) : (
                <Skeleton className="h-[240px] w-[240px]" />
              )}
            </div>
            <p dir="ltr" className="mt-3 text-[20px] font-extrabold tabular-nums tracking-[0.12em] text-[#C9A227]">
              {pos.data?.qrPayload ?? (myPhone ? `SWPAY:${myPhone}` : "—")}
            </p>
            <button
              type="button"
              onClick={() => void copyPayload()}
              disabled={!pos.data}
              className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-4 text-[13px] font-bold text-white/90 transition-colors hover:bg-white/15 disabled:opacity-50"
            >
              <Copy strokeWidth={1.5} className="h-4 w-4" />
              نسخ رمز الدفع
            </button>
          </div>
        </div>

        {/* ===== إحصاءات اليوم + المستحق ===== */}
        {pos.loading && !pos.data ? (
          <div className="grid grid-cols-2 gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[86px] w-full rounded-2xl" />
            ))}
          </div>
        ) : pos.error ? (
          <ErrorState compact message={pos.error.message} code={pos.error.code} onRetry={pos.retry} />
        ) : pos.data ? (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard
                label="مبيعات اليوم"
                value={String(pos.data.today.count)}
                hint={`${pos.data.today.count > 0 ? "عملية" : "لا عمليات بعد"}`}
              />
              <StatCard
                label="حجم اليوم"
                value={formatMoney(pos.data.today.grossMinor, pos.data.currency)}
                hint="إجمالي قبل الرسوم"
              />
              <StatCard
                label="صافي اليوم"
                value={formatMoney(pos.data.today.netMinor, pos.data.currency)}
                hint={`رسوم اليوم ${formatMoney(pos.data.today.feesMinor, pos.data.currency)}`}
              />
              <StatCard
                label="الرصيد المستحق للتسوية"
                value={formatMoney(pos.data.dueSettlementMinor, pos.data.currency)}
                hint={`صافي ${pos.data.total.count} عملية إجمالاً`}
                gold
              />
            </div>

            {/* ===== آخر المبيعات ===== */}
            <section className="mt-2">
              <div className="mb-2.5 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-[18px] font-semibold leading-6 text-[#141416]">
                  <TrendingUp strokeWidth={1.5} className="h-5 w-5 text-[#C9A227]" />
                  آخر المبيعات
                </h2>
                <span className="text-[12px] font-bold text-[#A3A09B]">
                  {pos.data.recentSales.length.toLocaleString("en-US")}
                </span>
              </div>

              {pos.data.recentSales.length === 0 ? (
                <div className="rounded-2xl border border-[#E8E6E1] bg-white">
                  <EmptyState
                    compact
                    title="لا مبيعات بعد"
                    description={`اعرض رمز الدفع أعلى الشاشة للزبائن — أول عملية بيع ل${pos.data.shopName} ستظهر هنا فوراً`}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  {pos.data.recentSales.map((tx) => (
                    <TransactionRow
                      key={tx.ref}
                      tx={tx}
                      onOpen={(ref) => navigate("transaction-details", { ref })}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
