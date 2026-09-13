/**
 * محفظة الجنوب — شحن رصيد الهاتف (المرحلة 2 / 9-b)
 * مشغلو اليمن (You/MTN/Sabafon/YTelecom) بفئات شحن ثابتة:
 * اختيار المشغل → الرقم (رقمك أو رقم آخر — مع تحقق بادئة المشغل) →
 * الفئة → مراجعة → PIN → تنفيذ /api/topup بمفتاح Idempotency → إيصال.
 */
"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Smartphone } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAppStore } from "@/lib/app-store";
import type { TopupOperatorView, TxResultView, WalletView } from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui/api-hooks";
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
  PhoneField,
  PinStep,
  ReviewCard,
  SuccessMark,
  errInfo,
  postMoney,
} from "./money-shared";

type Step = "operator" | "form" | "review" | "pin" | "result" | "fail";

/** نتيجة الشحن المحلية (TxResultView + مشغل + رقم) — api-types مغلق أمام الإضافة */
interface TopupResultView extends TxResultView {
  operatorName: string;
  phone: string;
}

export function TopupScreen() {
  const me = useAppStore((s) => s.me);
  const refreshMe = useAppStore((s) => s.refreshMe);
  const navigate = useAppStore((s) => s.navigate);
  const resetTo = useAppStore((s) => s.resetTo);

  const operators = useApiData<TopupOperatorView[]>("/api/topup");

  // ===== حالة النموذج =====
  const [operatorCode, setOperatorCode] = useState<string | null>(null);
  const [phoneTarget, setPhoneTarget] = useState<"mine" | "other">("mine");
  const [phone, setPhone] = useState("");
  const [packageMinor, setPackageMinor] = useState<number | null>(null);
  const [focusPhone, setFocusPhone] = useState(true);

  // ===== حالة التدفق =====
  const [step, setStep] = useState<Step>("operator");
  const [result, setResult] = useState<TopupResultView | null>(null);
  const [executing, setExecuting] = useState(false);
  const [formError, setFormError] = useState<{ code: string; message: string } | null>(null);
  const [pinError, setPinError] = useState<{ code: string; message: string; lockSeconds?: number } | null>(
    null,
  );

  const operator = useMemo(
    () => (operators.data ?? []).find((o) => o.code === operatorCode) ?? null,
    [operators.data, operatorCode],
  );
  const myPhone = me?.user.phone ?? "";
  const activePhone = phoneTarget === "mine" ? myPhone : phone;
  const prefixes = operator ? operator.prefix.split("/") : [];
  const phoneValid = /^7\d{8}$/.test(activePhone);
  const prefixMatches =
    phoneValid && prefixes.length > 0 ? prefixes.some((p) => activePhone.startsWith(p)) : false;

  const wallets: WalletView[] = me ? normalizeWallets(me.wallets) : [];
  const yerWallet = wallets.find((w) => w.currency === "YER");
  const feeMinor = operator?.feeMinor ?? 0;
  const totalMinor = packageMinor !== null ? packageMinor + feeMinor : null;

  /** تنفيذ الشحن بعد PIN (topup + Idempotency) */
  const executeTopup = async (pin: string) => {
    if (packageMinor === null || !operator) return;
    setExecuting(true);
    setPinError(null);
    try {
      const tx = await postMoney<TopupResultView>("/api/topup", {
        operatorCode: operator.code,
        phone: activePhone,
        amountMinor: packageMinor,
        pin,
      });
      setResult(tx);
      setStep("result");
      void refreshMe();
      toast({
        title: "تم شحن الرصيد",
        description: `${formatMoney(tx.amountMinor, tx.currency)} → ${tx.phone} (${tx.operatorName})`,
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

  const shell = (children: ReactNode) => (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">{children}</div>
  );

  // ===== النتيجة =====
  if (step === "result" && result) {
    return shell(
      <>
        <ScreenHeader title="نتيجة الشحن" showBack={false} />
        <SuccessMark
          title="تم شحن الرصيد بنجاح"
          amount={formatMoney(result.amountMinor, result.currency)}
          subtitle={`${result.operatorName} • الرقم ${result.phone}`}
        />
        <div className="mt-4 space-y-3">
          <ReceiptCard
            reference={result.ref}
            title="إيصال شحن رصيد"
            status={result.status}
            createdAt={result.createdAt}
            parties={[
              { label: "من", value: me?.user.fullName ?? "أنت" },
              { label: "إلى", value: `${result.operatorName} — ${result.phone}` },
            ]}
            fields={[
              { label: "قيمة الشحن", value: formatMoney(result.amountMinor, result.currency) },
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
        <ScreenHeader title="نتيجة الشحن" showBack={false} />
        <div className="mt-6">
          <ErrorState
            message={formError?.message ?? "تعذّر إتمام الشحن"}
            code={formError?.code}
            onRetry={() => {
              setStep("form");
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
  if (step === "pin" && totalMinor !== null && operator) {
    return shell(
      <>
        <ScreenHeader title="تأكيد الشحن" />
        <div className="mt-6">
          <PinStep
            contextLabel={`تأكيد شحن ${formatMoney(packageMinor ?? 0, "YER")} إلى ${activePhone} (${operator.name})`}
            error={pinError}
            executing={executing}
            onConfirm={(pin) => void executeTopup(pin)}
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
  if (step === "review" && totalMinor !== null && operator && packageMinor !== null) {
    return shell(
      <>
        <ScreenHeader title="مراجعة الشحن" subtitle="راجع التفاصيل قبل التأكيد" />
        <div className="mt-4 space-y-3">
          <ReviewCard
            title="تفاصيل شحن الرصيد"
            rows={[
              { label: "المشغل", value: operator.name },
              { label: "الرقم المشحون", value: activePhone },
              { label: "قيمة الشحن", value: formatMoney(packageMinor, "YER") },
              { label: "الرسوم", value: formatMoney(feeMinor, "YER") },
              { label: "الإجمالي المخصوم", value: formatMoney(totalMinor, "YER"), strong: true },
              {
                label: "رصيدك المتاح",
                value: formatMoney(yerWallet?.balanceMinor ?? 0, "YER"),
                tone: totalMinor > (yerWallet?.balanceMinor ?? 0) ? ("error" as const) : undefined,
              },
            ]}
            note="يصل الرصيد للرقم فوراً  ويُخصم الإجمالي من محفظة الريال اليمني."
          />
          <PrimaryActionButton onClick={() => setStep("pin")}>تأكيد الشحن</PrimaryActionButton>
          <button
            type="button"
            onClick={() => setStep("form")}
            className="flex min-h-11 w-full items-center justify-center text-[13px] font-bold text-[#5C5A56] transition-colors hover:text-[#141416]"
          >
            تعديل التفاصيل
          </button>
        </div>
      </>,
    );
  }

  // ===== اختيار الرقم والفئة =====
  if (step === "form" && operator) {
    const canContinue = phoneValid && prefixMatches && packageMinor !== null;
    return shell(
      <>
        <ScreenHeader
          title={`شحن — ${operator.name}`}
          subtitle={`أرقام المشغل تبدأ بـ ${operator.prefix}`}
          onBack={() => setStep("operator")}
        />
        <div className="mt-4 space-y-3">
          {/* لمن الشحن */}
          <div role="tablist" aria-label="جهة الشحن" className="grid grid-cols-2 gap-2">
            {(
              [
                { key: "mine", label: "لهذا الهاتف" },
                { key: "other", label: "رقم آخر" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                role="tab"
                type="button"
                aria-selected={phoneTarget === t.key}
                onClick={() => {
                  setPhoneTarget(t.key);
                  setPhone("");
                  setFocusPhone(true);
                }}
                className={cn(
                  "flex min-h-11 items-center justify-center rounded-full px-3 text-[13px] font-bold transition-all",
                  phoneTarget === t.key
                    ? "bg-[#0B0B0C] text-white"
                    : "border border-[#E8E6E1] bg-[#F7F6F2] text-[#141416] hover:border-[#C9A227]/50",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {phoneTarget === "mine" ? (
            <div className="rounded-2xl border border-[#E8E6E1] bg-white px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[12px] font-semibold text-[#5C5A56]">
                  <Smartphone strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
                  رقمك في المحفظة
                </span>
                <span dir="ltr" className="text-[22px] font-extrabold tabular-nums tracking-[0.08em] text-[#141416]">
                  {myPhone}
                </span>
              </div>
              {myPhone && !prefixes.some((p) => myPhone.startsWith(p)) ? (
                <p className="mt-2 text-center text-[12px] font-medium text-[#B45309]">
                  رقمك يبدأ بـ {myPhone.slice(0, 2)} وهو تابع لمشغل آخر — استخدم «رقم آخر» أو غيّر المشغل.
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <PhoneField
                label="الرقم المُراد شحنه"
                value={phone}
                active={focusPhone}
                onActivate={() => setFocusPhone(true)}
                hint={
                  phone.length > 0 && !phoneValid
                    ? `أكمل الرقم (9 خانات — أدخلت ${phone.length})`
                    : phoneValid && !prefixMatches
                      ? `الرقم لا يتبع ${operator.name} — أرقامه تبدأ بـ ${operator.prefix}`
                      : `أرقام ${operator.name}: ${operator.prefix}`
                }
              />
              <AmountPad value={phone} onChange={(v) => setPhone(v.replace(/\D/g, "").slice(0, 9))} mode="phone" />
            </>
          )}

          {/* الفئات */}
          <div>
            <p className="mb-2 text-[13px] font-bold text-[#141416]">اختر فئة الشحن</p>
            <div className="grid grid-cols-3 gap-2">
              {operator.packagesMinor.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={packageMinor === p}
                  onClick={() => setPackageMinor(p)}
                  className={cn(
                    "flex min-h-[56px] flex-col items-center justify-center rounded-2xl border transition-all",
                    packageMinor === p
                      ? "border-[#C9A227] bg-[#C9A227]/[0.07] shadow-[0_0_0_3px_rgba(201,162,39,0.12)]"
                      : "border-[#E8E6E1] bg-white hover:border-[#C9A227]/50",
                  )}
                >
                  <span className="text-[15px] font-extrabold tabular-nums text-[#141416]">
                    {p.toLocaleString("en-US")}
                  </span>
                  <span className="text-[10.5px] font-semibold text-[#5C5A56]">ر.ي</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-center text-[12px] font-medium text-[#5C5A56]">
              رسوم الشحن {formatMoney(feeMinor, "YER")} لكل عملية — من محفظة الريال اليمني
              (الرصيد {formatMoney(yerWallet?.balanceMinor ?? 0, "YER")})
            </p>
          </div>

          {formError ? <InlineErrorBanner error={formError} /> : null}

          <PrimaryActionButton
            onClick={() => setStep("review")}
            disabled={!canContinue}
            disabledReason={
              !phoneValid
                ? "أدخل رقماً يمنياً صحيحاً (9 خانات)"
                : !prefixMatches
                  ? `الرقم لا يتبع ${operator.name}`
                  : packageMinor === null
                    ? "اختر فئة الشحن"
                    : undefined
            }
          >
            متابعة للمراجعة
          </PrimaryActionButton>
        </div>
      </>,
    );
  }

  // ===== اختيار المشغل (البداية) =====
  if (operators.loading) {
    return shell(
      <>
        <ScreenHeader title="شحن رصيد" subtitle="مشغلو الهاتف في اليمن" />
        <div className="mt-4 grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px] w-full rounded-2xl" />
          ))}
        </div>
      </>,
    );
  }
  if (operators.error || (operators.data ?? []).length === 0) {
    return shell(
      <>
        <ScreenHeader title="شحن رصيد" />
        <div className="mt-6">
          <ErrorState
            message={operators.error?.message ?? "تعذّر جلب المشغلين"}
            code={operators.error?.code}
            onRetry={operators.retry}
          />
        </div>
      </>,
    );
  }
  return shell(
    <>
      <ScreenHeader title="شحن رصيد" subtitle="اختر مشغل الهاتف — بالريال اليمني" />
      <div className="mt-4 grid grid-cols-2 gap-2">
        {(operators.data ?? []).map((op) => (
          <button
            key={op.code}
            type="button"
            onClick={() => {
              setOperatorCode(op.code);
              setPackageMinor(null);
              setStep("form");
            }}
            className="flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-2xl border border-[#E8E6E1]/70 bg-white p-3 transition-colors hover:border-[#C9A227]/50 hover:bg-[#FDFCFA] active:bg-[#F7F6F2]"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#C9A227]/25 bg-[#C9A227]/[0.07] text-[#8A6E14]">
              <Smartphone strokeWidth={1.5} className="h-5 w-5" />
            </span>
            <span className="text-[15px] font-bold text-[#141416]">{op.name}</span>
            <span dir="ltr" className="text-[11.5px] font-semibold tabular-nums text-[#5C5A56]">
              {op.prefix}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 rounded-xl bg-[#F7F6F2] px-3 py-2.5 text-center text-[12px] font-medium leading-5 text-[#5C5A56]">
        اشحن رصيد رقمك أو أي رقم آخر لدى نفس المشغل — الفئات ثابتة ورسوم الشحن
        تظهر قبل التأكيد.
      </p>
    </>,
  );
}
