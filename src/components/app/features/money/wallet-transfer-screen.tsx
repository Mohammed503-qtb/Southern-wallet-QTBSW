/**
 * محفظة الجنوب — التحويل بين محافظي (SC-15)
 * صفّا اختيار (من عملة / إلى عملة) باستثناء التكرار + المبلغ بلوحة الأرقام
 * → اقتباس W3 (rate/fee/receive/totalDebit) → بطاقة السعر والاستلام
 * → PIN → تنفيذ W4 بمفتاح Idempotency → إيصال FX_EXCHANGE + refreshMe.
 */

"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAppStore } from "@/lib/app-store";
import type {
  CurrencyCode,
  ExchangeQuoteView,
  TxResultView,
  WalletView,
} from "@/lib/api-types";
import { CURRENCIES, CURRENCY_META, formatMoney } from "@/lib/api-types";
import { AmountInputField } from "@/components/app/ui/amount-input-field";
import { AmountPad } from "@/components/app/ui/amount-pad";
import { ErrorState } from "@/components/app/ui/error-state";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ReceiptCard } from "@/components/app/ui/receipt-card";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { normalizeWallets } from "@/components/app/home/home-screen-helpers";
import { cn } from "@/lib/utils";
import {
  InlineErrorBanner,
  PinStep,
  ReviewCard,
  SuccessMark,
  errInfo,
  formatRateValue,
  parseAmountToMinor,
  postMoney,
} from "./money-shared";

type Step = "form" | "review" | "pin" | "result" | "fail";

export function WalletTransferScreen() {
  const me = useAppStore((s) => s.me);
  const refreshMe = useAppStore((s) => s.refreshMe);
  const navigate = useAppStore((s) => s.navigate);
  const resetTo = useAppStore((s) => s.resetTo);

  // من/إلى — نبدأ من العملة ذات أعلى رصيد غير صفري ثم عملة مختلفة
  const wallets: WalletView[] = me ? normalizeWallets(me.wallets) : [];
  const initialFrom: CurrencyCode =
    (wallets.find((w) => w.currency !== "YER" && w.balanceMinor > 0)?.currency as CurrencyCode) ??
    "YER";
  const initialTo: CurrencyCode = initialFrom === "YER" ? "SAR" : "YER";

  const [from, setFrom] = useState<CurrencyCode>(initialFrom);
  const [to, setTo] = useState<CurrencyCode>(initialTo);
  const [amountInput, setAmountInput] = useState("");

  const [step, setStep] = useState<Step>("form");
  const [quote, setQuote] = useState<ExchangeQuoteView | null>(null);
  const [result, setResult] = useState<TxResultView | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [formError, setFormError] = useState<{ code: string; message: string } | null>(null);
  const [pinError, setPinError] = useState<{ code: string; message: string; lockSeconds?: number } | null>(
    null,
  );

  const fromWallet = wallets.find((w) => w.currency === from);
  const toWallet = wallets.find((w) => w.currency === to);
  const amountMinor = parseAmountToMinor(amountInput, from);

  /** اختيار "من" — يبدّل "إلى" إن تكررت */
  const pickFrom = (c: CurrencyCode) => {
    setFrom(c);
    if (c === to) setTo(CURRENCIES.find((x) => x !== c) ?? "YER");
  };
  const pickTo = (c: CurrencyCode) => {
    if (c === from) return;
    setTo(c);
  };

  const fetchQuote = async () => {
    if (amountMinor === null) return;
    setQuoting(true);
    setFormError(null);
    try {
      const data = await api.post<ExchangeQuoteView>("/api/wallet/exchange-quote", {
        fromCurrency: from,
        toCurrency: to,
        amountMinor,
      });
      setQuote(data);
      setStep("review");
    } catch (err) {
      setFormError(errInfo(err));
    } finally {
      setQuoting(false);
    }
  };

  const executeExchange = async (pin: string) => {
    if (amountMinor === null) return;
    setExecuting(true);
    setPinError(null);
    try {
      const tx = await postMoney<TxResultView>("/api/wallet/exchange", {
        fromCurrency: from,
        toCurrency: to,
        amountMinor,
        pin,
      });
      setResult(tx);
      setStep("result");
      void refreshMe();
    } catch (err) {
      if (err instanceof ApiError && (err.code === "PIN-001" || err.code === "PIN-002")) {
        const secs =
          err.code === "PIN-002" && err.details && typeof err.details.secondsRemaining === "number"
            ? err.details.secondsRemaining
            : undefined;
        setPinError({ code: err.code, message: err.message, lockSeconds: secs });
      } else {
        setStep("fail");
        setFormError(errInfo(err));
      }
    } finally {
      setExecuting(false);
    }
  };

  // ===== النتيجة =====
  if (step === "result" && result && quote) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="نتيجة التحويل بين المحافظ" showBack={false} />
        <SuccessMark
          title="تم التبديل بنجاح"
          amount={formatMoney(quote.receiveMinor, to)}
          subtitle={`تحويل ${formatMoney(quote.amountMinor, from)} إلى ${CURRENCY_META[to].symbolAr}`}
        />
        <div className="mt-4 space-y-3">
          <ReceiptCard
            reference={result.ref}
            title="إيصال تحويل بين المحافظ"
            status={result.status}
            createdAt={result.createdAt}
            parties={[
              { label: "من محفظة", value: `${from} — ${me?.user.fullName ?? "أنت"}` },
              { label: "إلى محفظة", value: `${to} — ${me?.user.fullName ?? "أنت"}` },
            ]}
            fields={[
              { label: "المبلغ المحوَّل", value: formatMoney(quote.amountMinor, from) },
              { label: "سعر الصرف", value: `1 ${from} = ${formatRateValue(quote.rate)} ${to}` },
              { label: "الرسوم", value: formatMoney(quote.feeMinor, from) },
              { label: "الإجمالي المخصوم", value: formatMoney(quote.totalDebitMinor, from), strong: true },
              { label: "المستلم في محفظتك", value: formatMoney(quote.receiveMinor, to), strong: true },
            ]}
          />
          <div className="grid grid-cols-1 gap-2">
            <PrimaryActionButton onClick={() => navigate("transaction-details", { ref: result.ref })}>
              مشاهدة العملية
            </PrimaryActionButton>
            <button
              type="button"
              onClick={() => resetTo("home")}
              className="flex min-h-[52px] w-full items-center justify-center rounded-xl border border-[#E8E6E1] bg-white text-[16px] font-bold text-[#5C5A56] transition-colors hover:bg-[#F7F6F2]"
            >
              تم
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== الفشل =====
  if (step === "fail") {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="نتيجة التحويل بين المحافظ" showBack={false} />
        <div className="mt-6">
          <ErrorState
            message={formError?.message ?? "تعذّر إتمام التحويل"}
            code={formError?.code}
            onRetry={() => {
              setStep("form");
              setFormError(null);
            }}
          >
            <button
              type="button"
              onClick={() => resetTo("home")}
              className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-[#E8E6E1] bg-white px-6 text-[14px] font-bold text-[#5C5A56] transition-colors hover:bg-[#F7F6F2]"
            >
              العودة للرئيسية
            </button>
          </ErrorState>
        </div>
      </div>
    );
  }

  // ===== PIN =====
  if (step === "pin" && quote) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="تأكيد التحويل" />
        <div className="mt-6">
          <PinStep
            contextLabel={`تأكيد تبديل ${formatMoney(quote.amountMinor, from)} من ${from} إلى ${to}`}
            error={pinError}
            executing={executing}
            onConfirm={(pin) => void executeExchange(pin)}
            onCancel={() => {
              setStep("review");
              setPinError(null);
            }}
          />
        </div>
      </div>
    );
  }

  // ===== المراجعة =====
  if (step === "review" && quote) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="مراجعة التحويل بين المحافظ" />
        <div className="mt-4 space-y-3">
          {/* بطاقة السعر */}
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#C9A227]/30 bg-[#C9A227]/[0.06] px-4 py-3.5">
            <span className="text-[13px] font-bold text-[#8A6E14]">{from}</span>
            <ArrowLeftRight strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
            <span dir="ltr" className="text-[15px] font-extrabold tabular-nums text-[#8A6E14]">
              1 {from} = {formatRateValue(quote.rate)} {to}
            </span>
          </div>
          <ReviewCard
            title="تفاصيل التبديل"
            rows={[
              { label: "المبلغ المحوَّل", value: formatMoney(quote.amountMinor, from) },
              { label: "الرسوم", value: formatMoney(quote.feeMinor, from) },
              { label: "الإجمالي المخصوم", value: formatMoney(quote.totalDebitMinor, from), strong: true },
              {
                label: `ستصلك في محفظة ${to}`,
                value: formatMoney(quote.receiveMinor, to),
                strong: true,
                tone: "success",
              },
              {
                label: "رصيدك المتاح",
                value: formatMoney(fromWallet?.balanceMinor ?? 0, from),
                tone: quote.totalDebitMinor > (fromWallet?.balanceMinor ?? 0) ? "error" : undefined,
              },
            ]}
            note="يُنفَّذ التبديل بسعر الصرف اللحظي المثبَّت لحظة التنفيذ داخل معاملة واحدة."
          />
          <PrimaryActionButton onClick={() => setStep("pin")}>تأكيد التحويل</PrimaryActionButton>
          <button
            type="button"
            onClick={() => setStep("form")}
            className="flex min-h-11 w-full items-center justify-center text-[13px] font-bold text-[#5C5A56] transition-colors hover:text-[#141416]"
          >
            تعديل التفاصيل
          </button>
        </div>
      </div>
    );
  }

  // ===== النموذج =====
  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader title="التحويل بين محافظي" subtitle="بدّل بين اليمني والريال والدولار" />

      {/* من / إلى */}
      <div className="mt-4 space-y-3">
        <div className="rounded-2xl border border-[#E8E6E1] bg-white p-4 shadow-[0_2px_8px_rgba(11,11,12,0.04)]">
          <p className="mb-2 text-[12px] font-bold text-[#5C5A56]">من محفظة</p>
          <div className="grid grid-cols-3 gap-2">
            {CURRENCIES.map((c) => {
              const w = wallets.find((x) => x.currency === c);
              return (
                <button
                  key={`f-${c}`}
                  type="button"
                  onClick={() => pickFrom(c)}
                  aria-pressed={from === c}
                  className={cn(
                    "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-full px-2 py-1.5 transition-all",
                    from === c
                      ? "bg-[#0B0B0C] text-white"
                      : "border border-[#E8E6E1] bg-[#F7F6F2] text-[#141416] hover:border-[#C9A227]/50",
                  )}
                >
                  <span dir="ltr" className="text-[12px] font-bold">{c}</span>
                  <span dir="ltr" className={cn("text-[10px] font-medium tabular-nums", from === c ? "text-white/70" : "opacity-70")}>
                    {formatMoney(w?.balanceMinor ?? 0, c)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* سهم التبديل (RTL) */}
        <div className="flex items-center justify-center gap-2 text-[12px] font-bold text-[#A3A09B]">
          <span className="h-[1px] w-14 bg-[#E8E6E1]" />
          <ArrowLeftRight strokeWidth={1.5} className="h-4 w-4 rotate-90 text-[#C9A227]" />
          <span>يُحوَّل إلى</span>
          <span className="h-[1px] w-14 bg-[#E8E6E1]" />
        </div>

        <div className="rounded-2xl border border-[#E8E6E1] bg-white p-4 shadow-[0_2px_8px_rgba(11,11,12,0.04)]">
          <p className="mb-2 text-[12px] font-bold text-[#5C5A56]">إلى محفظة</p>
          <div className="grid grid-cols-3 gap-2">
            {CURRENCIES.map((c) => {
              const disabled = c === from;
              return (
                <button
                  key={`t-${c}`}
                  type="button"
                  onClick={() => pickTo(c)}
                  disabled={disabled}
                  aria-pressed={to === c}
                  className={cn(
                    "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-full px-2 py-1.5 transition-all",
                    to === c
                      ? "bg-[#C9A227] text-[#0B0B0C]"
                      : disabled
                        ? "cursor-not-allowed border border-[#E8E6E1]/60 bg-[#F7F6F2]/60 text-[#A3A09B]"
                        : "border border-[#E8E6E1] bg-[#F7F6F2] text-[#141416] hover:border-[#C9A227]/50",
                  )}
                >
                  <span dir="ltr" className="text-[12px] font-bold">{c}</span>
                  <span dir="ltr" className={cn("text-[10px] font-medium tabular-nums", to === c ? "text-[#0B0B0C]/70" : "opacity-70")}>
                    {formatMoney(wallets.find((x) => x.currency === c)?.balanceMinor ?? 0, c)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <AmountInputField
          value={amountInput}
          currency={from}
          hint={
            amountInput === ""
              ? `المتاح في محفظة ${from}: ${formatMoney(fromWallet?.balanceMinor ?? 0, from)}`
              : undefined
          }
        />
        <AmountPad
          value={amountInput}
          onChange={setAmountInput}
          mode="amount"
          decimal={from !== "YER"}
        />
        {formError ? <InlineErrorBanner error={formError} /> : null}
        <PrimaryActionButton
          onClick={() => void fetchQuote()}
          disabled={amountMinor === null || from === to}
          loading={quoting}
          disabledReason={
            from === to
              ? "اختر عملتين مختلفتين"
              : amountMinor === null
                ? "أدخل مبلغاً صحيحاً أكبر من صفر"
                : undefined
          }
        >
          متابعة للمراجعة
        </PrimaryActionButton>
      </div>
    </div>
  );
}
