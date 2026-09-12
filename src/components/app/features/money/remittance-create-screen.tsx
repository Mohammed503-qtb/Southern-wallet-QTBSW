/**
 * محفظة الجنوب — إنشاء حوالة (SC-16)
 * نموذج (اسم المستلم الكامل + هاتفه غير المسجل + المبلغ بYER فقط)
 * → اقتباس R1 → مراجعة (المبلغ/الرسوم/الإجمالي + شرح التسليم نقداً بالرمز)
 * → PIN → إنشاء R2 بمفتاح Idempotency → النتيجة تعرض رمز التسليم
 * ببطاقة ذهبية بارزة + تحذير الخصوصية + ReceiptCard كامل.
 */

"use client";

import { useState } from "react";
import { Banknote } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAppStore } from "@/lib/app-store";
import type { FeeQuoteView, RemittanceResultView, WalletView } from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { AmountInputField } from "@/components/app/ui/amount-input-field";
import { AmountPad } from "@/components/app/ui/amount-pad";
import { ErrorState } from "@/components/app/ui/error-state";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ReceiptCard } from "@/components/app/ui/receipt-card";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { normalizeWallets } from "@/components/app/home/home-screen-helpers";
import { cn } from "@/lib/utils";
import {
  BigCodeCard,
  InlineErrorBanner,
  PinStep,
  ReviewCard,
  SuccessMark,
  errInfo,
  parseAmountToMinor,
  postMoney,
} from "./money-shared";

type Step = "form" | "review" | "pin" | "result" | "fail";

const REMITTANCE_CURRENCY = "YER" as const;

export function RemittanceCreateScreen() {
  const me = useAppStore((s) => s.me);
  const refreshMe = useAppStore((s) => s.refreshMe);
  const navigate = useAppStore((s) => s.navigate);
  const resetTo = useAppStore((s) => s.resetTo);

  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [focus, setFocus] = useState<"phone" | "amount">("phone");

  const [step, setStep] = useState<Step>("form");
  const [quote, setQuote] = useState<FeeQuoteView | null>(null);
  const [result, setResult] = useState<RemittanceResultView | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [formError, setFormError] = useState<{ code: string; message: string } | null>(null);
  const [pinError, setPinError] = useState<{ code: string; message: string; lockSeconds?: number } | null>(
    null,
  );

  const wallets: WalletView[] = me ? normalizeWallets(me.wallets) : [];
  const yerWallet = wallets.find((w) => w.currency === REMITTANCE_CURRENCY);
  const amountMinor = parseAmountToMinor(amountInput, REMITTANCE_CURRENCY);

  const nameValid = receiverName.trim().length >= 3;
  const phoneValid = receiverPhone.length === 9;
  const canContinue = nameValid && phoneValid && amountMinor !== null && !quoting;

  const handlePad = (next: string) => {
    if (focus === "phone") {
      const digits = next.replace(/\D/g, "").slice(0, 9);
      setReceiverPhone(digits);
      if (digits.length === 9) setFocus("amount");
    } else {
      setAmountInput(next.replace(/[^\d]/g, "").slice(0, 12));
    }
  };

  const fetchQuote = async () => {
    if (amountMinor === null) return;
    setQuoting(true);
    setFormError(null);
    try {
      const data = await api.post<FeeQuoteView>("/api/remittances/quote", {
        currency: REMITTANCE_CURRENCY,
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

  const executeRemittance = async (pin: string) => {
    if (amountMinor === null) return;
    setExecuting(true);
    setPinError(null);
    try {
      const rem = await postMoney<RemittanceResultView>("/api/remittances", {
        receiverName: receiverName.trim(),
        receiverPhone: receiverPhone,
        currency: REMITTANCE_CURRENCY,
        amountMinor,
        pin,
      });
      setResult(rem);
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

  // ===== النتيجة: رمز التسليم + الإيصال =====
  if (step === "result" && result && quote) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="نتيجة الحوالة" showBack={false} />
        <SuccessMark
          title="تم إنشاء الحوالة"
          amount={formatMoney(result.amountMinor, result.currency)}
          subtitle={`إلى ${result.receiverName} • يُسلَّم نقداً لدى أي وكيل`}
        />
        <div className="mt-4 space-y-3">
          {result.deliveryCode ? (
            <BigCodeCard
              code={result.deliveryCode}
              title="رمز تسليم الحوالة"
              warning="لا تشارك الرمز إلا مع المستلم نفسه — يُستخدم مرة واحدة لدى الوكيل"
              expiryIso={result.expiresAt}
              showQr
            />
          ) : null}
          <ReceiptCard
            reference={result.ref}
            title="إيصال حوالة"
            status={result.status}
            createdAt={result.createdAt}
            parties={[
              { label: "المرسل", value: me?.user.fullName ?? "أنت" },
              { label: "المستلم", value: `${result.receiverName} (${result.receiverPhone})` },
            ]}
            fields={[
              { label: "المبلغ", value: formatMoney(result.amountMinor, result.currency) },
              { label: "الرسوم", value: formatMoney(result.feeMinor, result.currency) },
              {
                label: "الإجمالي المخصوم",
                value: formatMoney(result.amountMinor + result.feeMinor, result.currency),
                strong: true,
              },
            ]}
          />
          <div className="grid grid-cols-1 gap-2">
            <PrimaryActionButton onClick={() => navigate("remittances")}>
              تتبع الحوالة
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
        <ScreenHeader title="نتيجة الحوالة" showBack={false} />
        <div className="mt-6">
          <ErrorState
            message={formError?.message ?? "تعذّر إنشاء الحوالة"}
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
  if (step === "pin" && quote && amountMinor !== null) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="تأكيد الحوالة" />
        <div className="mt-6">
          <PinStep
            contextLabel={`تأكيد حوالة ${formatMoney(amountMinor, REMITTANCE_CURRENCY)} إلى ${receiverName.trim()}`}
            error={pinError}
            executing={executing}
            onConfirm={(pin) => void executeRemittance(pin)}
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
  if (step === "review" && quote && amountMinor !== null) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="مراجعة الحوالة" subtitle="راجع التفاصيل قبل التأكيد" />
        <div className="mt-4 space-y-3">
          <ReviewCard
            title="تفاصيل الحوالة"
            rows={[
              { label: "المستلم", value: receiverName.trim() },
              { label: "هاتف المستلم", value: receiverPhone },
              { label: "المبلغ", value: formatMoney(amountMinor, REMITTANCE_CURRENCY) },
              { label: "الرسوم", value: formatMoney(quote.feeMinor, REMITTANCE_CURRENCY) },
              {
                label: "الإجمالي المخصوم",
                value: formatMoney(quote.totalMinor, REMITTANCE_CURRENCY),
                strong: true,
              },
              {
                label: "رصيدك المتاح",
                value: formatMoney(yerWallet?.balanceMinor ?? 0, REMITTANCE_CURRENCY),
                tone: quote.totalMinor > (yerWallet?.balanceMinor ?? 0) ? "error" : undefined,
              },
            ]}
            note="يستلم المبلغ نقداً لدى أي وكيل معتمد برمز التسليم. صلاحية الحوالة 7 أيام — بعدها تُسترد تلقائياً لمحفظتك."
          />
          <PrimaryActionButton onClick={() => setStep("pin")}>تأكيد الحوالة</PrimaryActionButton>
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
      <ScreenHeader title="إنشاء حوالة" subtitle="أرسل نقدياً لمستلم غير مشترك" />

      <div className="mt-4 space-y-3">
        {/* شرح الحوالة */}
        <div className="flex items-start gap-2.5 rounded-xl border border-[#C9A227]/30 bg-[#C9A227]/[0.06] px-3 py-2.5">
          <Banknote strokeWidth={1.5} className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#C9A227]" />
          <p className="text-[12.5px] font-semibold leading-5 text-[#8A6E14]">
            الحوالة تُسلَّم نقداً لدى أي وكيل معتمد برمز تسليم يعمل مرة واحدة — لا يشترط أن يكون
            المستلم مشتركاً في المحفظة.
          </p>
        </div>

        {/* الاسم الكامل */}
        <div className="w-full">
          <label htmlFor="rem-name" className="mb-1.5 block text-[12px] font-semibold text-[#5C5A56]">
            الاسم الكامل للمستلم
          </label>
          <input
            id="rem-name"
            type="text"
            value={receiverName}
            onChange={(e) => setReceiverName(e.target.value.slice(0, 60))}
            placeholder="مثال: سالم ناصر باعلوي"
            className="min-h-11 w-full rounded-xl border border-[#E8E6E1] bg-white px-4 py-2.5 text-[14px] font-semibold text-[#141416] placeholder:font-medium placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:outline-none"
          />
        </div>

        {/* هاتف المستلم */}
        <button
          type="button"
          onClick={() => setFocus("phone")}
          className={cn(
            "flex min-h-[64px] w-full items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 text-right transition-colors",
            focus === "phone"
              ? "border-[#C9A227] shadow-[0_0_0_3px_rgba(201,162,39,0.12)]"
              : "border-[#E8E6E1] hover:border-[#C9A227]/50",
          )}
          aria-label="حقل هاتف المستلم"
        >
          <span className="text-[12px] font-semibold text-[#5C5A56]">هاتف المستلم</span>
          <span
            dir="ltr"
            className={cn(
              "text-[22px] font-extrabold leading-7 tabular-nums tracking-[0.08em]",
              receiverPhone ? "text-[#141416]" : "text-[#A3A09B]",
            )}
          >
            {receiverPhone || "77XXXXXXX"}
          </span>
        </button>
        <p className="-mt-1 text-center text-[11.5px] font-medium text-[#B45309]">
          يجب أن يكون الرقم غير مسجل في المحفظة (المشتركون يستلمون تحويلاً مباشراً)
        </p>

        {/* المبلغ — YER فقط */}
        <button
          type="button"
          onClick={() => setFocus("amount")}
          className="w-full"
          aria-label="حقل المبلغ — اضغط للكتابة بلوحة الأرقام"
        >
          <AmountInputField
            value={amountInput}
            currency={REMITTANCE_CURRENCY}
            hint={
              amountInput === ""
                ? `الرصيد المتاح ${formatMoney(yerWallet?.balanceMinor ?? 0, REMITTANCE_CURRENCY)} — الحوالات باليمني فقط`
                : undefined
            }
          />
        </button>

        <AmountPad
          value={focus === "phone" ? receiverPhone : amountInput}
          onChange={handlePad}
          mode={focus === "phone" ? "phone" : "amount"}
        />

        {formError ? <InlineErrorBanner error={formError} /> : null}

        <PrimaryActionButton
          onClick={() => void fetchQuote()}
          disabled={!canContinue}
          loading={quoting}
          disabledReason={
            !nameValid
              ? "أدخل اسم المستلم الكامل"
              : !phoneValid
                ? "أدخل هاتف المستلم (9 خانات)"
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
