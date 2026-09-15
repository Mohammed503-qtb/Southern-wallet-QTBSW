/**
 * محفظة الجنوب — الشاشة الرئيسية (SC-08 Home)
 * الترويسة (تحية + أفاتار) + بطاقة الرصيد السوداء بزخرفة معيّنات ذهبية
 * (CurrencyTabs + رصيد display + عين إخفاء + أزرار سريعة) + بانرات
 * (KYC/النطاق/التجميد) + شبكة الخدمات الثماني بحالاتها من /api/services +
 * آخر العمليات (5 من /api/transactions) + شريط رمز الاستلام QR.
 * كل البيانات من الخادم — بلا أي بيانات وهمية، مع skeleton وErrorState.
 */
"use client";

import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  ChevronLeft,
  Eye,
  EyeOff,
  Grid2x2,
  PiggyBank,
  QrCode,
  ReceiptText,
  Send,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppStore, type ScreenKey } from "@/lib/app-store";
import type {
  CurrencyCode,
  FxRateView,
  PageView,
  ServiceStateView,
  ServiceStateValue,
  TxView,
} from "@/lib/api-types";
import { CURRENCY_META, formatMoney } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui/api-hooks";
import { ErrorState } from "@/components/app/ui/error-state";
import { EmptyState } from "@/components/app/ui/empty-state";
import { CurrencyTabs } from "@/components/app/ui/currency-tabs";
import { Skeleton } from "@/components/app/ui/skeleton";
import { TransactionRow } from "@/components/app/ui/transaction-row";
import { greetingLabel, firstNameOf, initialOf } from "@/components/app/ui/utils";
import { ServiceInfoSheet } from "./service-info-sheet";
import { toStateMap } from "./service-catalog";
import { normalizeWallets } from "./home-screen-helpers";
import { cn } from "@/lib/utils";

interface QuickService {
  title: string;
  description: string;
  icon: LucideIcon;
  /** وجهة التنقل — null = خدمة غير متاحة (Sheet تفسير فقط) */
  screen: ScreenKey | null;
  stateKey?: string;
}

const HOME_SERVICES: QuickService[] = [
  { title: "تحويل", description: "تحويل فوري لمشترك", icon: Send, screen: "transfer" },
  { title: "حوالة", description: "نقدي لغير المشتركين", icon: Banknote, screen: "remittance-create" },
  { title: "إيداع نقدي", description: "لدى وكيل معتمد", icon: ArrowDownToLine, screen: "cash-deposit" },
  { title: "سحب نقدي", description: "برمز تحقق", icon: ArrowUpFromLine, screen: "cash-withdraw" },
  {
    title: "الفواتير",
    description: "سداد فواتير الخدمات",
    icon: ReceiptText,
    screen: "bills",
    stateKey: "BILLS",
  },
  {
    title: "شحن رصيد",
    description: "رصيد وبطاقات",
    icon: Smartphone,
    screen: "topup",
    stateKey: "TOPUP",
  },
  { title: "الحصالة", description: "أهداف ادخارية", icon: PiggyBank, screen: "savings" },
  { title: "المزيد", description: "كل الخدمات", icon: Grid2x2, screen: "services" },
];

export function HomeScreen() {
  const me = useAppStore((s) => s.me);
  const meLoading = useAppStore((s) => s.meLoading);
  const bootstrap = useAppStore((s) => s.bootstrap);
  const refreshMe = useAppStore((s) => s.refreshMe);
  const navigate = useAppStore((s) => s.navigate);
  const resetTo = useAppStore((s) => s.resetTo);
  const balanceHidden = useAppStore((s) => s.balanceHidden);
  const toggleBalanceHidden = useAppStore((s) => s.toggleBalanceHidden);

  const [activeCurrency, setActiveCurrency] = useState<CurrencyCode>("YER");
  const [sheet, setSheet] = useState<QuickService | null>(null);

  const recent = useApiData<PageView<TxView>>("/api/transactions?limit=5");
  const services = useApiData<ServiceStateView[]>("/api/services");
  const fx = useApiData<FxRateView[]>("/api/fx");

  const stateMap = toStateMap(services.data);

  // ===== لا جلسة بعد (bootstrap جارٍ أو فشلت) =====
  if (!me) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <div className="flex items-center gap-3 pt-6">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="mt-4 h-64 w-full rounded-2xl" />
        <Skeleton className="mt-4 h-3 w-32" />
        <div className="mt-3 grid grid-cols-4 gap-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        {!meLoading ? (
          <div className="mt-6">
            <ErrorState
              compact
              message="انتهت الجلسة أو لم تُحمَل بياناتك"
              onRetry={() => void bootstrap()}
            />
          </div>
        ) : null}
      </div>
    );
  }

  const wallets = normalizeWallets(me.wallets);
  const activeWallet =
    wallets.find((w) => w.currency === activeCurrency) ?? wallets[0];
  const activeBalance = formatMoney(activeWallet.balanceMinor, activeCurrency);

  /** الرصيد الكلي التقريبي باليمني من أسعار الصرف الحية (W2) */
  const approxYer = (() => {
    if (!fx.data) return null;
    let total = 0;
    let complete = true;
    for (const w of wallets) {
      if (w.currency === "YER") {
        total += w.balanceMinor;
        continue;
      }
      const rate = fx.data.find(
        (r) => r.fromCurrency === w.currency && r.toCurrency === "YER",
      );
      if (!rate) {
        complete = false;
        continue;
      }
      const major = w.balanceMinor / Math.pow(10, CURRENCY_META[w.currency].decimals);
      total += major * rate.rate;
    }
    return complete ? total : null;
  })();

  const user = me.user;
  const kycPending = me.kyc?.status === "PENDING";
  const sheetState: ServiceStateValue =
    sheet?.stateKey
      ? (stateMap.get(sheet.stateKey)?.state ?? "COMING_LATER")
      : "COMING_LATER";

  const openService = (svc: QuickService) => {
    if (svc.stateKey) {
      // الخدمة المتاحة ON تُفتح مباشرة — والSheet فقط للحالات الأخرى
      const state = stateMap.get(svc.stateKey)?.state ?? "COMING_LATER";
      if (state === "ON" && svc.screen) {
        navigate(svc.screen);
        return;
      }
      setSheet(svc);
      return;
    }
    if (svc.screen === "services") {
      resetTo("services");
      return;
    }
    if (svc.screen) navigate(svc.screen);
  };

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      {/* ===== الترويسة ===== */}
      <header className="flex items-center gap-3 pt-4">
        <button
          type="button"
          onClick={() => navigate("profile")}
          aria-label="الملف الشخصي"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0B0B0C] text-[17px] font-extrabold text-[#C9A227]"
        >
          {initialOf(user.fullName)}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold leading-6 text-[#141416]">
            {greetingLabel()}، {firstNameOf(user.fullName)}
          </p>
          <p className="text-[12px] font-medium text-[#A3A09B]">
            أرصدتك وخدماتك في مكان واحد
          </p>
        </div>
        <img src="/logo.svg" alt="محفظة الجنوب" className="h-9 w-9 shrink-0" />
      </header>

      {/* ===== بطاقة نقطة البيع (تاجر فقط — 9-c) ===== */}
      {user.role === "MERCHANT" ? (
        <button
          type="button"
          onClick={() => navigate("merchant-pos")}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-[#C9A227]/50 bg-[#C9A227]/[0.08] p-3.5 text-right transition-colors hover:bg-[#C9A227]/[0.14]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0B0B0C] text-[#C9A227]">
            <QrCode strokeWidth={1.5} className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-bold text-[#8A6E14]">نقطة البيع — رمز دفع متجرك</span>
            <span className="block text-[12px] font-medium text-[#8A6E14]/80">
              اعرض رمز QR للزبائن وتابع مبيعات اليوم والمستحق للتسوية
            </span>
          </span>
          <ChevronLeft strokeWidth={1.5} className="h-5 w-5 shrink-0 text-[#C9A227]" />
        </button>
      ) : null}

      {/* ===== بطاقة الرصيد (أسود الجنوب + زخرفة معيّنات ذهبية) ===== */}
      <section className="relative mt-4 overflow-hidden rounded-2xl bg-[#0B0B0C] p-5 text-white shadow-[0_8px_24px_rgba(11,11,12,0.10)]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
          <span className="absolute -left-12 -top-12 h-40 w-40 rotate-45 rounded-xl border border-[#C9A227]/20" />
          <span className="absolute -left-4 top-10 h-20 w-20 rotate-45 rounded-lg border border-[#C9A227]/25" />
          <span className="absolute -left-8 top-4 h-28 w-28 rotate-45 rounded-xl border border-[#C9A227]/10" />
          <span className="absolute -right-14 bottom-[-64px] h-44 w-44 rotate-45 rounded-2xl border border-[#C9A227]/15" />
          <span className="absolute -right-8 bottom-[-40px] h-24 w-24 rotate-45 rounded-lg border border-[#C9A227]/25" />
        </div>

        <div className="relative">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold text-white/60">
              الرصيد المتاح · {CURRENCY_META[activeCurrency].symbolAr}
            </p>
            <button
              type="button"
              onClick={toggleBalanceHidden}
              aria-label={balanceHidden ? "إظهار الرصيد" : "إخفاء الرصيد"}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              {balanceHidden ? (
                <EyeOff strokeWidth={1.5} className="h-5 w-5" />
              ) : (
                <Eye strokeWidth={1.5} className="h-5 w-5" />
              )}
            </button>
          </div>

          {/* نقر الرصيد يفتح تفاصيل المحفظة/العملة (SC-10) */}
          <button
            type="button"
            onClick={() => navigate("wallet-details", { currency: activeCurrency })}
            className="mt-1.5 flex min-h-11 w-full flex-col items-start text-right"
            aria-label={`تفاصيل محفظة ${CURRENCY_META[activeCurrency].symbolAr}`}
          >
            <p
              dir="ltr"
              className="w-full text-right text-[32px] font-extrabold leading-10 tabular-nums text-white"
            >
              {balanceHidden ? "••••••" : activeBalance}
            </p>
            <p className="mt-1 text-[11px] font-medium text-white/50">
              الرصيد الكلي التقريبي باليمني:{" "}
              <span dir="ltr" className="tabular-nums">
                {balanceHidden
                  ? "•••"
                  : approxYer !== null
                    ? `${Math.round(approxYer).toLocaleString("en-US")} ر.ي`
                    : "غير متاح حالياً"}
              </span>
            </p>
          </button>

          <div className="mt-4">
            <CurrencyTabs
              wallets={wallets}
              value={activeCurrency}
              onChange={setActiveCurrency}
              variant="dark"
              formatBalance={(w) =>
                balanceHidden ? "•••" : formatMoney(w.balanceMinor, w.currency)
              }
            />
          </div>

          {/* أزرار سريعة شفافة */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { label: "إرسال", icon: Send, screen: "transfer" as const },
              { label: "استلام", icon: QrCode, screen: "scan-qr" as const },
              { label: "إيداع", icon: ArrowDownToLine, screen: "cash-deposit" as const },
            ].map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => navigate(q.screen)}
                className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border border-white/15 bg-white/[0.08] py-2.5 text-white/90 transition-colors hover:bg-white/15 active:bg-white/20"
              >
                <q.icon strokeWidth={1.5} className="h-5 w-5 text-[#C9A227]" />
                <span className="text-[12px] font-bold">{q.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ===== البانرات (KYC / النطاق / التجميد) ===== */}
      <div className="mt-3 space-y-2">
        {user.status === "FROZEN" ? (
          <button
            type="button"
            onClick={() => navigate("help")}
            className="flex w-full items-center gap-2.5 rounded-xl border border-[#B91C1C]/25 bg-[#B91C1C]/[0.06] px-3 py-2.5 text-right"
          >
            <TriangleAlert strokeWidth={1.5} className="h-[18px] w-[18px] shrink-0 text-[#B91C1C]" />
            <span className="flex-1 text-[13px] font-bold text-[#B91C1C]">
              الحساب مجمّد — الدخول للاطلاع فقط. تواصل مع الدعم.
            </span>
            <ChevronLeft strokeWidth={1.5} className="h-4 w-4 text-[#B91C1C]" />
          </button>
        ) : null}

        {user.scopeRestricted ? (
          <button
            type="button"
            onClick={() => navigate("help")}
            className="flex w-full items-center gap-2.5 rounded-xl border border-[#B91C1C]/20 bg-[#B91C1C]/[0.04] px-3 py-2 text-right"
          >
            <TriangleAlert strokeWidth={1.5} className="h-4 w-4 shrink-0 text-[#B91C1C]" />
            <span className="flex-1 text-[12.5px] font-semibold text-[#B91C1C]">
              {me.scopeNotice ?? "أنت خارج نطاق الخدمة — الاطلاع فقط"}
            </span>
          </button>
        ) : null}

        {user.kycLevel === "NONE" && !kycPending ? (
          <button
            type="button"
            onClick={() => navigate("kyc")}
            className="flex w-full items-center gap-2.5 rounded-xl border border-[#B45309]/25 bg-[#B45309]/[0.07] px-3 py-2.5 text-right transition-colors hover:bg-[#B45309]/[0.12]"
          >
            <TriangleAlert strokeWidth={1.5} className="h-[18px] w-[18px] shrink-0 text-[#B45309]" />
            <span className="flex-1 text-[13px] font-bold text-[#B45309]">
              وثّق حسابك لرفع الحدود اليومية والسماح بكل العمليات
            </span>
            <ChevronLeft strokeWidth={1.5} className="h-4 w-4 text-[#B45309]" />
          </button>
        ) : null}

        {kycPending ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-[#E8E6E1] bg-[#F7F6F2] px-3 py-2">
            <span className="h-2 w-2 shrink-0 rotate-45 rounded-[2px] bg-[#C9A227]" />
            <span className="flex-1 text-[12.5px] font-semibold text-[#5C5A56]">
              طلب التوثيق قيد المراجعة — سيصلك إشعار بالقرار
            </span>
          </div>
        ) : null}
      </div>

      {/* ===== شبكة الخدمات الثماني ===== */}
      <section className="mt-5">
        <h2 className="mb-2.5 text-[18px] font-semibold leading-6 text-[#141416]">الخدمات</h2>
        {services.error ? (
          <div className="mb-2.5 flex items-center justify-between rounded-xl border border-[#B45309]/20 bg-[#B45309]/[0.05] px-3 py-2">
            <span className="text-[12px] font-semibold text-[#B45309]">
              تعذّر جلب حالات الخدمات من الخادم
            </span>
            <button
              type="button"
              onClick={services.retry}
              className="min-h-11 text-[12px] font-bold text-[#B45309] underline underline-offset-4"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-4 gap-2.5">
          {HOME_SERVICES.map((svc) => {
            const isComing = svc.stateKey
              ? (stateMap.get(svc.stateKey)?.state ?? "COMING_LATER") !== "ON"
              : false;
            const Icon = svc.icon;
            return (
              <button
                key={svc.title}
                type="button"
                onClick={() => openService(svc)}
                className={cn(
                  "relative flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-[#E8E6E1]/70 bg-white p-2 transition-colors",
                  isComing
                    ? "hover:border-[#E8E6E1]"
                    : "hover:border-[#C9A227]/50 hover:bg-[#FDFCFA] active:bg-[#F7F6F2]",
                )}
              >
                {isComing ? (
                  <span className="absolute left-1.5 top-1.5 rounded-full border border-[#E8E6E1] bg-[#F7F6F2] px-1.5 py-px text-[9px] font-bold text-[#A3A09B]">
                    قريباً
                  </span>
                ) : null}
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full border border-[#E8E6E1] bg-[#F7F6F2]",
                    isComing ? "text-[#A3A09B]" : "text-[#5C5A56]",
                  )}
                >
                  <Icon strokeWidth={1.5} className="h-5 w-5" />
                </span>
                <span
                  className={cn(
                    "text-[11.5px] font-semibold leading-4",
                    isComing ? "text-[#A3A09B]" : "text-[#141416]",
                  )}
                >
                  {svc.title}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ===== آخر العمليات (5) ===== */}
      <section className="mt-5">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[18px] font-semibold leading-6 text-[#141416]">آخر العمليات</h2>
          <button
            type="button"
            onClick={() => resetTo("transactions")}
            className="flex min-h-11 items-center gap-1 text-[13px] font-bold text-[#C9A227] hover:text-[#A2831B]"
          >
            عرض الكل
            <ChevronLeft strokeWidth={1.5} className="h-4 w-4" />
          </button>
        </div>

        {recent.loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        ) : recent.error ? (
          <ErrorState
            compact
            message={recent.error.message}
            code={recent.error.code}
            onRetry={recent.retry}
          />
        ) : (recent.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            compact
            title="لا عمليات بعد"
            description="ابدأ بتحويل بسيط أو إيداع نقدي لدى وكيل"
            actionLabel="أرسل أول تحويل"
            onAction={() => navigate("transfer")}
          />
        ) : (
          <div className="space-y-2">
            {recent.data?.items.map((tx) => (
              <TransactionRow
                key={tx.ref}
                tx={tx}
                onOpen={(ref) => navigate("transaction-details", { ref })}
              />
            ))}
          </div>
        )}
      </section>

      {/* ===== شريط رمز الاستلام QR ===== */}
      <button
        type="button"
        onClick={() => navigate("scan-qr")}
        className="mt-5 flex w-full items-center gap-3 rounded-2xl bg-[#0B0B0C] p-3.5 text-white transition-colors hover:bg-[#161618]"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-[#C9A227]">
          <QrCode strokeWidth={1.5} className="h-5 w-5" />
        </span>
        <span className="flex-1 text-right">
          <span className="block text-[14px] font-bold">رمز استلامي QR</span>
          <span className="block text-[11.5px] font-medium text-white/55">
            اعرض رمزك الشخصي لاستلام التحويلات
          </span>
        </span>
        <ChevronLeft strokeWidth={1.5} className="h-5 w-5 text-white/50" />
      </button>

      {/* تحديث لقطة الجلسة (R-01: البيانات من الخادم دائماً) */}
      <button
        type="button"
        onClick={() => void refreshMe()}
        className="mx-auto mt-4 block min-h-11 px-4 text-[12px] font-bold text-[#A3A09B] underline decoration-[#E8E6E1] underline-offset-4 hover:text-[#5C5A56]"
      >
        تحديث الأرصدة من الخادم
      </button>

      {/* Sheet تفسير الخدمات غير المتاحة */}
      {sheet ? (
        <ServiceInfoSheet
          open={sheet !== null}
          onOpenChange={(o) => !o && setSheet(null)}
          title={sheet.title}
          description={sheet.description}
          icon={sheet.icon}
          state={sheetState}
          note={sheet.stateKey ? (stateMap.get(sheet.stateKey)?.note ?? null) : null}
        />
      ) : null}
    </div>
  );
}
