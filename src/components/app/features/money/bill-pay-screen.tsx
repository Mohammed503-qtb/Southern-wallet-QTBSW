/**
 * محفظة الجنوب — سداد فاتورة (المرحلة 2 / 9-b)
 * نمط الالتزام المالي الحاكم (R-10):
 * إدخال رقم الحساب (مع تلميح الصيغة) → استعلام preview → اختيار المبلغ
 * (المستحق أو مبلغ مخصص للمزودات المفتوحة) → مراجعة (الرسوم/الإجمالي/الرصيد)
 * → PIN → تنفيذ /api/bills/pay بمفتاح Idempotency → إيصال ReceiptCard كامل.
 * params: { billerCode, account? (تمليء من آخر المدفوعات) }
 */
"use client";

import { useMemo, useState, type ReactNode } from "react";
import { FileText } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAppStore } from "@/lib/app-store";
import type { BillerView, BillPayResultView, BillPreviewView, WalletView } from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui/api-hooks";
import { AmountInputField } from "@/components/app/ui/amount-input-field";
import { AmountPad } from "@/components/app/ui/amount-pad";
import { ErrorState } from "@/components/app/ui/error-state";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ReceiptCard } from "@/components/app/ui/receipt-card";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { normalizeWallets } from "@/components/app/home/home-screen-helpers";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  InlineErrorBanner,
  PinStep,
  ReviewCard,
  SuccessMark,
  errInfo,
  parseAmountToMinor,
  postMoney,
} from "./money-shared";

type Step = "account" | "amount" | "review" | "pin" | "result" | "fail";

/** طول رقم الحساب من تلميح المزود («رقم العداد — 8 أرقام») */
function accountLengthOf(biller: BillerView): number | null {
  const m = biller.accountFormatHint.match(/(\d+)\s*أرقام/);
  return m ? Number(m[1]) : null;
}

export function BillPayScreen() {
  const params = useAppStore((s) => s.params);
  const me = useAppStore((s) => s.me);
  const refreshMe = useAppStore((s) => s.refreshMe);
  const navigate = useAppStore((s) => s.navigate);
  const resetTo = useAppStore((s) => s.resetTo);
  const back = useAppStore((s) => s.back);

  const billerCode = params.billerCode ?? "";
  const billers = useApiData<BillerView[]>(billerCode ? "/api/bills" : null);
  const biller = useMemo(
    () => (billers.data ?? []).find((b) => b.code === billerCode) ?? null,
    [billers.data, billerCode],
  );

  // ===== حالة النموذج =====
  const [account, setAccount] = useState<string>(() =>
    params.account ? params.account.replace(/\D/g, "").slice(0, 12) : "",
  );
  const [mode, setMode] = useState<"due" | "custom">("due");
  const [amountInput, setAmountInput] = useState("");

  // ===== حالة التدفق =====
  const [step, setStep] = useState<Step>("account");
  const [preview, setPreview] = useState<BillPreviewView | null>(null);
  const [result, setResult] = useState<BillPayResultView | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [formError, setFormError] = useState<{ code: string; message: string } | null>(null);
  const [pinError, setPinError] = useState<{ code: string; message: string; lockSeconds?: number } | null>(
    null,
  );

  const wallets: WalletView[] = me ? normalizeWallets(me.wallets) : [];
  const yerWallet = wallets.find((w) => w.currency === "YER");

  const accountLen = biller ? accountLengthOf(biller) : null;
  const accountValid = biller
    ? accountLen !== null
      ? account.length === accountLen
      : account.length >= 4
    : false;

  const customMinor = parseAmountToMinor(amountInput, "YER");
  const selectedMinor =
    mode === "due" ? preview?.dueAmountMinor ?? null : customMinor;
  const feeMinor = preview?.biller.feeMinor ?? biller?.feeMinor ?? 0;
  const totalMinor = selectedMinor !== null ? selectedMinor + feeMinor : null;

  /** استعلام الفاتورة (preview) */
  const fetchPreview = async () => {
    if (!biller || !accountValid) return;
    setQuoting(true);
    setFormError(null);
    try {
      const data = await api.post<BillPreviewView>("/api/bills/preview", {
        billerCode: biller.code,
        accountNumber: account,
      });
      setPreview(data);
      setMode("due");
      setAmountInput("");
      setStep("amount");
    } catch (err) {
      setFormError(errInfo(err));
    } finally {
      setQuoting(false);
    }
  };

  /** تنفيذ السداد بعد PIN (pay + Idempotency) */
  const executePay = async (pin: string) => {
    if (selectedMinor === null || !biller) return;
    setExecuting(true);
    setPinError(null);
    try {
      const tx = await postMoney<BillPayResultView>("/api/bills/pay", {
        billerCode: biller.code,
        accountNumber: account,
        amountMinor: selectedMinor,
        pin,
      });
      setResult(tx);
      setStep("result");
      void refreshMe();
      toast({
        title: "تم سداد الفاتورة",
        description: `${biller.name} — ${formatMoney(tx.amountMinor, tx.currency)}`,
      });
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

  // ===== غلاف الشاشة =====
  const shell = (children: ReactNode) => (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">{children}</div>
  );

  // ===== مزود غير معروف =====
  if (!billerCode) {
    return shell(
      <>
        <ScreenHeader title="سداد فاتورة" />
        <div className="mt-6">
          <ErrorState message="لم يُحدَّد المزوّد — اختر فاتورة من كتالوج الفواتير" />
        </div>
      </>,
    );
  }
  if (billers.loading) {
    return shell(
      <>
        <ScreenHeader title="سداد فاتورة" />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-[72px] w-full rounded-2xl" />
          <Skeleton className="h-[72px] w-full rounded-2xl" />
        </div>
      </>,
    );
  }
  if (billers.error || !biller) {
    return shell(
      <>
        <ScreenHeader title="سداد فاتورة" />
        <div className="mt-6">
          <ErrorState
            message={billers.error?.message ?? "المزوّد غير موجود (BIL-001)"}
            code={billers.error?.code ?? "BIL-001"}
            onRetry={billers.retry}
          />
        </div>
      </>,
    );
  }

  // ===== النتيجة =====
  if (step === "result" && result) {
    return shell(
      <>
        <ScreenHeader title="نتيجة السداد" showBack={false} />
        <SuccessMark
          title="تم سداد الفاتورة"
          amount={formatMoney(result.amountMinor, result.currency)}
          subtitle={`${result.billerName} • حساب ${result.accountNumber}`}
        />
        <div className="mt-4 space-y-3">
          <ReceiptCard
            reference={result.ref}
            title="إيصال سداد فاتورة"
            status={result.status}
            createdAt={result.createdAt}
            parties={[
              { label: "من", value: me?.user.fullName ?? "أنت" },
              { label: "إلى", value: result.billerName },
            ]}
            fields={[
              { label: "رقم الحساب", value: result.accountNumber },
              { label: "المبلغ المسدد", value: formatMoney(result.amountMinor, result.currency) },
              { label: "الرسوم", value: formatMoney(result.feeMinor, result.currency) },
              {
                label: "الإجمالي المخصوم",
                value: formatMoney(result.amountMinor + result.feeMinor, result.currency),
                strong: true,
              },
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
      </>,
    );
  }

  // ===== الفشل =====
  if (step === "fail") {
    return shell(
      <>
        <ScreenHeader title="نتيجة السداد" showBack={false} />
        <div className="mt-6">
          <ErrorState
            message={formError?.message ?? "تعذّر إتمام السداد"}
            code={formError?.code}
            onRetry={() => {
              setStep("amount");
              setFormError(null);
              setPinError(null);
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
      </>,
    );
  }

  // ===== PIN =====
  if (step === "pin" && totalMinor !== null) {
    return shell(
      <>
        <ScreenHeader title="تأكيد السداد" />
        <div className="mt-6">
          <PinStep
            contextLabel={`تأكيد سداد ${formatMoney(selectedMinor ?? 0, "YER")} — ${biller.name} (حساب ${account})`}
            error={pinError}
            executing={executing}
            onConfirm={(pin) => void executePay(pin)}
            onCancel={() => {
              setStep("review");
              setPinError(null);
            }}
          />
        </div>
      </>,
    );
  }

  // ===== المراجعة =====
  if (step === "review" && totalMinor !== null && selectedMinor !== null) {
    const partial = preview?.dueAmountMinor != null && selectedMinor < preview.dueAmountMinor;
    return shell(
      <>
        <ScreenHeader title="مراجعة السداد" subtitle="راجع التفاصيل قبل التأكيد" />
        <div className="mt-4 space-y-3">
          <ReviewCard
            title="تفاصيل سداد الفاتورة"
            rows={[
              { label: "المزوّد", value: biller.name },
              { label: "رقم الحساب", value: account },
              ...(preview?.dueLabel
                ? [{ label: "تاريخ الاستحقاق", value: preview.dueLabel, tone: "pending" as const }]
                : []),
              { label: "المبلغ", value: formatMoney(selectedMinor, "YER") },
              { label: "الرسوم", value: formatMoney(feeMinor, "YER") },
              { label: "الإجمالي المخصوم", value: formatMoney(totalMinor, "YER"), strong: true },
              {
                label: "رصيدك المتاح",
                value: formatMoney(yerWallet?.balanceMinor ?? 0, "YER"),
                tone: totalMinor > (yerWallet?.balanceMinor ?? 0) ? ("error" as const) : undefined,
              },
            ]}
            note={
              partial
                ? "سداد جزئي — يبقى على الحساب مبلغ مستحق. يصل السداد للمزوّد فوراً (محاكاة Beta بالريال اليمني)."
                : "يصل السداد للمزوّد فوراً ويُخصم الإجمالي من محفظة الريال اليمني مباشرة."
            }
          />
          <PrimaryActionButton onClick={() => setStep("pin")}>تأكيد السداد</PrimaryActionButton>
          <button
            type="button"
            onClick={() => setStep("amount")}
            className="flex min-h-11 w-full items-center justify-center text-[13px] font-bold text-[#5C5A56] transition-colors hover:text-[#141416]"
          >
            تعديل التفاصيل
          </button>
        </div>
      </>,
    );
  }

  // ===== اختيار المبلغ بعد الاستعلام =====
  if (step === "amount" && preview) {
    const due = preview.dueAmountMinor ?? 0;
    const canCustom = preview.biller.openAmount;
    const customInvalid = mode === "custom" && (customMinor === null || customMinor <= 0);
    return shell(
      <>
        <ScreenHeader title={`سداد — ${biller.name}`} subtitle="الفاتورة المستعلم عنها" />
        <div className="mt-4 space-y-3">
          {/* بطاقة الفاتورة المستعلم عنها */}
          <article className="w-full overflow-hidden rounded-2xl border border-[#E8E6E1] bg-white shadow-[0_2px_8px_rgba(11,11,12,0.04)]">
            <div aria-hidden="true" className="h-[3px] w-full bg-[#C9A227]" />
            <div className="p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#C9A227]/25 bg-[#C9A227]/[0.07] text-[#8A6E14]">
                  <FileText strokeWidth={1.5} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-bold text-[#141416]">{biller.name}</p>
                  <p dir="ltr" className="text-[12.5px] font-medium tabular-nums text-[#5C5A56]">
                    حساب {account}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-[#F7F6F2] px-3 py-2.5">
                <span className="text-[12.5px] font-semibold text-[#5C5A56]">المبلغ المستحق</span>
                <span className="text-[18px] font-extrabold tabular-nums text-[#141416]">
                  {formatMoney(due, "YER")}
                </span>
              </div>
              {preview.dueLabel ? (
                <p className="mt-1.5 text-center text-[12px] font-medium text-[#B45309]">
                  آخر موعد للسداد: {preview.dueLabel}
                </p>
              ) : null}
            </div>
          </article>

          {/* خيار السداد الكامل */}
          <button
            type="button"
            onClick={() => setMode("due")}
            aria-pressed={mode === "due"}
            className={cn(
              "flex min-h-[60px] w-full items-center justify-between rounded-2xl border px-4 text-right transition-colors",
              mode === "due"
                ? "border-[#C9A227] bg-[#C9A227]/[0.05] shadow-[0_0_0_3px_rgba(201,162,39,0.12)]"
                : "border-[#E8E6E1] bg-white hover:border-[#C9A227]/50",
            )}
          >
            <span className="text-[14px] font-bold text-[#141416]">سداد المستحق كاملاً</span>
            <span className="text-[15px] font-extrabold tabular-nums text-[#141416]">
              {formatMoney(due, "YER")}
            </span>
          </button>

          {/* خيار مبلغ مخصص — للمزودات المفتوحة فقط */}
          {canCustom ? (
            <button
              type="button"
              onClick={() => setMode("custom")}
              aria-pressed={mode === "custom"}
              className={cn(
                "flex min-h-[60px] w-full items-center justify-between rounded-2xl border px-4 text-right transition-colors",
                mode === "custom"
                  ? "border-[#C9A227] bg-[#C9A227]/[0.05] shadow-[0_0_0_3px_rgba(201,162,39,0.12)]"
                  : "border-[#E8E6E1] bg-white hover:border-[#C9A227]/50",
              )}
            >
              <span className="text-[14px] font-bold text-[#141416]">مبلغ مخصص (سداد جزئي)</span>
              <span className="text-[12px] font-medium text-[#5C5A56]">
                الحد الأقصى {formatMoney(due, "YER")}
              </span>
            </button>
          ) : null}

          {mode === "custom" && canCustom ? (
            <div className="space-y-2 pt-1">
              <AmountInputField
                value={amountInput}
                currency="YER"
                hint={`رصيدك ${formatMoney(yerWallet?.balanceMinor ?? 0, "YER")} — بحد أقصى ${formatMoney(due, "YER")}`}
              />
              <AmountPad value={amountInput} onChange={(v) => setAmountInput(v.replace(/\D/g, "").slice(0, 10))} mode="amount" />
            </div>
          ) : null}

          {formError ? <InlineErrorBanner error={formError} onRetry={() => void fetchPreview()} /> : null}

          <PrimaryActionButton
            onClick={() => setStep("review")}
            disabled={
              mode === "due"
                ? due <= 0
                : customInvalid || (customMinor !== null && customMinor > due)
            }
            disabledReason={
              mode === "due"
                ? "لا يوجد مبلغ مستحق"
                : customInvalid
                  ? "أدخل مبلغاً صحيحاً أكبر من صفر"
                  : customMinor !== null && customMinor > due
                    ? "المبلغ يتجاوز المستحق"
                    : undefined
            }
          >
            متابعة للمراجعة
          </PrimaryActionButton>
          <button
            type="button"
            onClick={() => {
              setStep("account");
              setPreview(null);
              setFormError(null);
            }}
            className="flex min-h-11 w-full items-center justify-center gap-1 text-[13px] font-bold text-[#5C5A56] transition-colors hover:text-[#141416]"
          >
            استعلام عن حساب آخر
          </button>
        </div>
      </>,
    );
  }

  // ===== إدخال رقم الحساب (البداية) =====
  return shell(
    <>
      <ScreenHeader title={`سداد — ${biller.name}`} onBack={back} subtitle={biller.accountFormatHint} />
      <div className="mt-4 space-y-3">
        {/* حقل رقم الحساب */}
        <div className="w-full">
          <label htmlFor="bill-account" className="mb-1.5 block text-[12px] font-semibold text-[#5C5A56]">
            رقم الحساب / العداد
          </label>
          <input
            id="bill-account"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={account}
            onChange={(e) => setAccount(e.target.value.replace(/\D/g, "").slice(0, accountLen ?? 12))}
            placeholder={biller.accountFormatHint}
            dir="ltr"
            className={cn(
              "min-h-[64px] w-full rounded-2xl border bg-white px-4 text-right text-[22px] font-extrabold tabular-nums tracking-[0.08em] placeholder:text-[#A3A09B] focus:outline-none",
              account && !accountValid
                ? "border-[#B91C1C]/50"
                : "border-[#E8E6E1] focus:border-[#C9A227] focus:shadow-[0_0_0_3px_rgba(201,162,39,0.12)]",
              account ? "text-[#141416]" : "text-[#A3A09B]",
            )}
          />
          <p className="mt-1.5 text-center text-[12px] font-medium text-[#5C5A56]">
            {accountLen
              ? `أدخل ${accountLen} أرقاماً كما في فاتورة ${biller.name}`
              : "أدخل رقم الحساب كما في الفاتورة"}
            {account.length > 0 && !accountValid && accountLen
              ? ` (أدخلت ${account.length})`
              : ""}
          </p>
        </div>

        {formError ? <InlineErrorBanner error={formError} /> : null}

        <PrimaryActionButton
          onClick={() => void fetchPreview()}
          disabled={!accountValid}
          loading={quoting}
          disabledReason={accountValid ? undefined : "أكمل رقم الحساب أولاً"}
        >
          استعلام الفاتورة
        </PrimaryActionButton>

        <p className="rounded-xl bg-[#F7F6F2] px-3 py-2.5 text-center text-[12px] font-medium leading-5 text-[#5C5A56]">
          رسوم السداد {formatMoney(biller.feeMinor, biller.currency)} — تُضاف للمبلغ عند الخصم.
          الفواتير بالريال اليمني فقط.
        </p>
      </div>
    </>,
  );
}
