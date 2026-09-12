/**
 * محفظة الجنوب — تفاصيل المحفظة/العملة (SC-10 Wallet Details)
 * params.currency → رصيد العملة الكبير + 4 إجراءات (تحويل/استلام/إيداع/سحب)
 * + سجل عمليات العملة فقط (T3 بفلتر currency) مع حالات loading/empty/error.
 */
"use client";

import { ArrowDownToLine, ArrowUpFromLine, QrCode, Send } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import type { CurrencyCode, PageView, TxView } from "@/lib/api-types";
import { CURRENCIES, CURRENCY_META, formatMoney } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui/api-hooks";
import { EmptyState } from "@/components/app/ui/empty-state";
import { ErrorState } from "@/components/app/ui/error-state";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { TransactionRow } from "@/components/app/ui/transaction-row";
import { normalizeWallets } from "./home-screen-helpers";

export function WalletDetailsScreen() {
  const params = useAppStore((s) => s.params);
  const me = useAppStore((s) => s.me);
  const navigate = useAppStore((s) => s.navigate);

  // العملة مشتقة مباشرة من المعامل (بديل YER عند فقدانه أو خطأه)
  const currency: CurrencyCode = CURRENCIES.includes(params.currency as CurrencyCode)
    ? (params.currency as CurrencyCode)
    : "YER";

  const wallets = me ? normalizeWallets(me.wallets) : [];
  const wallet = wallets.find((w) => w.currency === currency);
  const balance = formatMoney(wallet?.balanceMinor ?? 0, currency);

  const txs = useApiData<PageView<TxView>>(`/api/transactions?currency=${currency}&limit=20`);

  const actions = [
    { label: "تحويل", icon: Send, screen: "transfer" as const },
    { label: "استلام", icon: QrCode, screen: "scan-qr" as const },
    { label: "إيداع", icon: ArrowDownToLine, screen: "cash-deposit" as const },
    { label: "سحب", icon: ArrowUpFromLine, screen: "cash-withdraw" as const },
  ];

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader
        title={`محفظة ${CURRENCY_META[currency].symbolAr}`}
        subtitle={`${currency} — رصيدك وسجل هذه العملة`}
        action={
          <button
            type="button"
            onClick={() => navigate("wallet-transfer")}
            className="flex min-h-11 items-center rounded-xl border border-[#E8E6E1] bg-white px-3 text-[12px] font-bold text-[#5C5A56] transition-colors hover:border-[#C9A227]/50 hover:text-[#141416]"
          >
            بين محافظي
          </button>
        }
      />

      {/* بطاقة الرصيد الكبير */}
      <section className="relative mt-4 overflow-hidden rounded-2xl border border-[#E8E6E1] bg-white p-5 shadow-[0_2px_8px_rgba(11,11,12,0.04)]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
          <span className="absolute -left-10 -top-10 h-32 w-32 rotate-45 rounded-xl border border-[#C9A227]/15" />
          <span className="absolute -right-12 -bottom-14 h-36 w-36 rotate-45 rounded-xl border border-[#C9A227]/10" />
        </div>
        <div className="relative">
          <p className="text-[12px] font-semibold text-[#5C5A56]">
            الرصيد المتاح · {CURRENCY_META[currency].symbolAr}
          </p>
          <p dir="ltr" className="mt-1.5 text-right text-[32px] font-extrabold leading-10 tabular-nums text-[#0B0B0C]">
            {balance}
          </p>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => navigate(a.screen)}
                className="flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl bg-[#F7F6F2] py-2 text-[#141416] transition-colors hover:bg-[#F0EEE7] active:bg-[#EAE7DE]"
              >
                <a.icon strokeWidth={1.5} className="h-5 w-5 text-[#C9A227]" />
                <span className="text-[11.5px] font-bold">{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* سجل هذه العملة */}
      <section className="mt-5">
        <h2 className="mb-2.5 text-[18px] font-semibold leading-6 text-[#141416]">
          عمليات {CURRENCY_META[currency].symbolAr}
        </h2>

        {txs.loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        ) : txs.error ? (
          <ErrorState
            compact
            message={txs.error.message}
            code={txs.error.code}
            onRetry={txs.retry}
          />
        ) : (txs.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            compact
            title="لا عمليات بهذه العملة"
            description="ستظهر هنا كل عمليات هذه العملة بمجرد حدوثها"
            actionLabel="حوّل الآن"
            onAction={() => navigate("transfer")}
          />
        ) : (
          <div className="space-y-2">
            {txs.data?.items.map((tx) => (
              <TransactionRow
                key={tx.ref}
                tx={tx}
                onOpen={(ref) => navigate("transaction-details", { ref })}
              />
            ))}
            {txs.data?.nextCursor ? (
              <p className="pt-1 text-center text-[12px] font-medium text-[#A3A09B]">
                تعرض أحدث 20 عملية — السجل الكامل في شاشة السجل
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
