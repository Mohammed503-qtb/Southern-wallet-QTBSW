/**
 * محفظة الجنوب — تفاصيل العملية (SC-35)
 * params.ref → GET /api/transactions/:ref (T4) → بطاقة إيصال كاملة (ReceiptCard
 * بQR تحقق ومشاركة وإبلاغ عن مشكلة) + قسم «قيود الدفتر (Σ=0)» المصغّر +
 * زر تنزيل الإيصال (طباعة window.print بمنطقة طباعة فقط عبر CSS print).
 */
"use client";

import { ArrowDownLeft, ArrowUpRight, Printer } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import type { TxDetailView } from "@/lib/api-types";
import {
  CURRENCY_META,
  TX_TYPE_LABELS,
  formatMoney,
} from "@/lib/api-types";
import { useApiData } from "@/components/app/ui";
import { ErrorState } from "@/components/app/ui/error-state";
import { Skeleton } from "@/components/app/ui/skeleton";
import { ReceiptCard, type ReceiptField, type ReceiptParty } from "@/components/app/ui/receipt-card";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { formatDateTime } from "@/components/app/ui/utils";
import { SectionCard } from "./account-shared";
import { cn } from "@/lib/utils";

/** أنماط الطباعة: إخفاء كل شيء عدا منطقة الإيصال (تُركَّب عند التفاصيل فقط) */
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .sw-print-area, .sw-print-area * { visibility: visible !important; }
  .sw-print-area {
    position: absolute !important;
    right: 0; left: 0; top: 0;
    width: 100% !important;
    box-shadow: none !important;
  }
  .sw-print-chrome { display: none !important; }
}
`;

/** اختصار معرف المحفظة للعرض: آخر 8 محارف LTR */
function shortWallet(id: string): string {
  return id.length > 10 ? `…${id.slice(-8)}` : id;
}

export function TransactionDetailsScreen() {
  const params = useAppStore((s) => s.params);
  const navigate = useAppStore((s) => s.navigate);
  const meName = useAppStore((s) => s.me?.user.fullName);
  const ref = params.ref ?? "";

  const details = useApiData<TxDetailView>(
    ref ? `/api/transactions/${encodeURIComponent(ref)}` : null,
  );

  if (!ref) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="تفاصيل العملية" />
        <ErrorState message="لم يُحدَّد مرجع العملية — افتح العملية من السجل" />
      </div>
    );
  }

  if (details.loading && !details.data) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="تفاصيل العملية" subtitle={ref} />
        <Skeleton className="mt-4 h-72 w-full rounded-2xl" />
        <Skeleton className="mt-3 h-24 w-full rounded-2xl" />
      </div>
    );
  }

  if (details.error || !details.data) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="تفاصيل العملية" subtitle={ref} />
        <div className="mt-4">
          <ErrorState
            message={details.error?.message ?? "تعذّر جلب تفاصيل العملية"}
            code={details.error?.code}
            onRetry={details.retry}
          />
        </div>
      </div>
    );
  }

  const tx = details.data;
  const isDebit = tx.direction === "DEBIT";
  const currencyMeta = CURRENCY_META[tx.currency];

  // ===== الأطراف =====
  const meLabel = meName ?? "أنت";
  const parties: ReceiptParty[] = [];
  if (tx.counterpartyName || tx.counterpartyPhone) {
    const counterparty = tx.counterpartyName ?? tx.counterpartyPhone ?? "—";
    if (isDebit) {
      parties.push({ label: "من", value: meLabel });
      parties.push({ label: "إلى", value: counterparty });
    } else {
      parties.push({ label: "من", value: counterparty });
      parties.push({ label: "إلى", value: meLabel });
    }
  }

  // ===== الحقول =====
  const fields: ReceiptField[] = [
    {
      label: isDebit ? "المبلغ المخصوم" : "المبلغ المُستلم",
      value: formatMoney(tx.amountMinor, tx.currency),
      strong: true,
    },
    { label: "الرسوم", value: tx.feeMinor > 0 ? formatMoney(tx.feeMinor, tx.currency) : "مجاناً" },
    {
      label: isDebit ? "الإجمالي المخصوم" : "صافي المُضاف",
      value: formatMoney(
        isDebit ? tx.amountMinor + tx.feeMinor : tx.amountMinor - tx.feeMinor,
        tx.currency,
      ),
    },
    { label: "العملة", value: `${tx.currency} · ${currencyMeta.symbolAr}` },
    { label: "النوع", value: TX_TYPE_LABELS[tx.type] },
  ];
  if (tx.description) {
    fields.push({ label: "الوصف", value: tx.description });
  }
  if (tx.relatedRef) {
    fields.push({ label: "مرجع مرتبط", value: tx.relatedRef });
  }
  if (tx.completedAt) {
    fields.push({ label: "وقت الإتمام", value: formatDateTime(tx.completedAt) });
  }

  // ===== قيود الدفتر (Σ=0) =====
  const ledger = tx.ledger ?? [];
  const ledgerSum = ledger.reduce((acc, l) => acc + (l.direction === "CREDIT" ? l.amountMinor : -l.amountMinor), 0);

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <style>{PRINT_CSS}</style>
      <div className="sw-print-chrome">
        <ScreenHeader title="تفاصيل العملية" subtitle={TX_TYPE_LABELS[tx.type]} />
      </div>

      {/* منطقة الطباعة: الإيصال + القيود */}
      <div className="sw-print-area mt-4 space-y-3">
        <ReceiptCard
          reference={tx.ref}
          title={`إيصال — ${TX_TYPE_LABELS[tx.type]}`}
          parties={parties}
          fields={fields}
          status={tx.status}
          createdAt={tx.createdAt}
          qrPayload={tx.ref}
          shareText={`إيصال ${TX_TYPE_LABELS[tx.type]} — المرجع ${tx.ref} — المبلغ ${formatMoney(
            tx.amountMinor,
            tx.currency,
          )} — محفظة الجنوب (Alpha تجريبي)`}
          onReportProblem={() =>
            navigate("ticket-new", {
              ref: tx.ref,
              subject: `مشكلة في عملية ${tx.ref}`,
            })
          }
        />

        {/* قيود الدفتر المصغّرة (T4 details.ledger) */}
        {ledger.length > 0 ? (
          <SectionCard
            title="قيود الدفتر (Σ=0)"
            action={
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums",
                  ledgerSum === 0
                    ? "border-[#15803D]/20 bg-[#15803D]/10 text-[#15803D]"
                    : ledger.length >= 4
                      ? "border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]"
                      : "border-[#B91C1C]/25 bg-[#B91C1C]/10 text-[#B91C1C]",
                )}
              >
                {ledgerSum === 0
                  ? "Σ = 0 متوازنة"
                  : ledger.length >= 4
                    ? "Σ الكاملة = 0 (على الخادم)"
                    : `Σ = ${ledgerSum}`}
              </span>
            }
          >
            <div className="divide-y divide-[#E8E6E1]/70">
              <div className="grid grid-cols-4 gap-1 px-1 pb-1.5 text-[10.5px] font-bold text-[#A3A09B]">
                <span>المحفظة</span>
                <span className="text-center">الاتجاه</span>
                <span className="text-center">المبلغ</span>
                <span className="text-left">الرصيد بعده</span>
              </div>
              {ledger.map((l, i) => (
                <div key={`${l.walletId}-${i}`} className="grid grid-cols-4 items-center gap-1 py-1.5">
                  <span dir="ltr" className="truncate text-[11px] font-semibold tabular-nums text-[#5C5A56]">
                    {shortWallet(l.walletId)}
                  </span>
                  <span className="flex items-center justify-center gap-0.5">
                    {l.direction === "CREDIT" ? (
                      <ArrowDownLeft strokeWidth={1.5} className="h-3.5 w-3.5 text-[#15803D]" />
                    ) : (
                      <ArrowUpRight strokeWidth={1.5} className="h-3.5 w-3.5 text-[#B91C1C]" />
                    )}
                    <span
                      className={cn(
                        "text-[11px] font-bold",
                        l.direction === "CREDIT" ? "text-[#15803D]" : "text-[#B91C1C]",
                      )}
                    >
                      {l.direction === "CREDIT" ? "دائن" : "مدين"}
                    </span>
                  </span>
                  <span
                    dir="ltr"
                    className={cn(
                      "text-center text-[11px] font-bold tabular-nums",
                      l.direction === "CREDIT" ? "text-[#15803D]" : "text-[#B91C1C]",
                    )}
                  >
                    {l.direction === "CREDIT" ? "+" : "−"}
                    {(l.amountMinor / Math.pow(10, currencyMeta.decimals)).toLocaleString("en-US", {
                      maximumFractionDigits: currencyMeta.decimals,
                    })}
                  </span>
                  <span dir="ltr" className="truncate text-left text-[11px] font-semibold tabular-nums text-[#141416]">
                    {(l.balanceAfterMinor / Math.pow(10, currencyMeta.decimals)).toLocaleString("en-US", {
                      maximumFractionDigits: currencyMeta.decimals,
                    })}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 rounded-xl bg-[#F7F6F2] p-2 text-center text-[11px] font-medium leading-5 text-[#A3A09B]">
              {ledger.length >= 4
                ? "عُرضت أول 4 قيود من دفتر العملية — الدفتر الكامل متوازن (Σ=0) ويُفحص على الخادم."
                : "كل عملية مالية تُقيَّد في دفتر مزدوج — مجموع المدين والدائن يساوي صفراً دائماً (فحص توازن الخادم)."}
            </p>
          </SectionCard>
        ) : null}
      </div>

      {/* زر تنزيل الإيصال (طباعة المنطقة فقط) */}
      <button
        type="button"
        onClick={() => window.print()}
        className="sw-print-chrome mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-[#E8E6E1] bg-white text-[15px] font-bold text-[#141416] transition-colors hover:border-[#C9A227]/50 hover:bg-[#FDFCFA]"
      >
        <Printer strokeWidth={1.5} className="h-5 w-5 text-[#5C5A56]" />
        تنزيل الإيصال (طباعة)
      </button>
    </div>
  );
}
