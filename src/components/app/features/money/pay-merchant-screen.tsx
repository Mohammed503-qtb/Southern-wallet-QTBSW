/**
 * محفظة الجنوب — الدفع للتاجر QR (MERCHANT_PAY — 9-c)
 * ----------------------------------------------------
 * التدفق الهرمي (R-10): lookup → بطاقة معاينة التاجر (اسم/فئة/محافظة/QR)
 * → مبلغ (YER فقط في Beta — يظهر بوضوح) → مراجعة → PIN →
 * POST /api/merchant/pay بمفتاح Idempotency (AC-03/04) → إيصال
 * ReceiptCard + «مشاهدة العملية» + refreshMe.
 * فصل الأدوار: إن لم يكن مالك الرقم تاجراً (MRC-001) تعرض الشاشة زر
 * «تحويل عادي إلى <الرقم>» يوجّه إلى transfer (params.phone) —
 * لذا سلوك المسح الموحد (scan-qr → هنا دائماً) يظل سلساً للطرفين.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, MapPin, Send, Store, Tag } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAppStore } from "@/lib/app-store";
import type { QrPayPreviewView, QrPayResultView, WalletView } from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { AmountInputField } from "@/components/app/ui/amount-input-field";
import { AmountPad } from "@/components/app/ui/amount-pad";
import { ErrorState } from "@/components/app/ui/error-state";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ReceiptCard } from "@/components/app/ui/receipt-card";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { normalizeWallets } from "@/components/app/home/home-screen-helpers";
import {
  InlineErrorBanner,
  PinStep,
  ReviewCard,
  SuccessMark,
  errInfo,
  parseAmountToMinor,
  postMoney,
} from "./money-shared";

const CURRENCY = "YER" as const;

type Step = "lookup" | "form" | "review" | "pin" | "result" | "fail";

export function PayMerchantScreen() {
  const params = useAppStore((s) => s.params);
  const me = useAppStore((s) => s.me);
  const refreshMe = useAppStore((s) => s.refreshMe);
  const navigate = useAppStore((s) => s.navigate);
  const resetTo = useAppStore((s) => s.resetTo);

  // ===== حالة النموذج =====
  const [manualInput, setManualInput] = useState(() =>
    params.payload ? params.payload : "",
  );
  const [amountInput, setAmountInput] = useState("");
  const [note, setNote] = useState("");

  // ===== حالة التدفق =====
  const [step, setStep] = useState<Step>("lookup");
  const [preview, setPreview] = useState<QrPayPreviewView | null>(null);
  const [result, setResult] = useState<QrPayResultView | null>(null);
  const [looking, setLooking] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [lookupError, setLookupError] = useState<{ code: string; message: string } | null>(null);
  const [formError, setFormError] = useState<{ code: string; message: string } | null>(null);
  const [pinError, setPinError] = useState<{ code: string; message: string; lockSeconds?: number } | null>(null);

  const wallets: WalletView[] = me ? normalizeWallets(me.wallets) : [];
  const yerWallet = wallets.find((w) => w.currency === CURRENCY);
  const amountMinor = parseAmountToMinor(amountInput, CURRENCY);

  /** تنقية الرقم من الحمولة (SWPAY:770000020 أو 770000020) */
  const digitsOf = (raw: string) => raw.replace(/\D/g, "").slice(0, 9);

  /** البحث عن التاجر (lookup) */
  const doLookup = useCallback(
    async (payload: string) => {
      const clean = payload.trim();
      if (clean === "") return;
      setLooking(true);
      setLookupError(null);
      setPreview(null);
      try {
        const data = await api.post<QrPayPreviewView>("/api/merchant/lookup", { payload: clean });
        setPreview(data);
        setStep("form");
      } catch (err) {
        setLookupError(errInfo(err));
      } finally {
        setLooking(false);
      }
    },
    [],
  );

  // lookup تلقائي عند القدوم بحمولة (من المسح أو من my-qr)
  useEffect(() => {
    if (params.payload && step === "lookup" && !looking && !lookupError && !preview) {
      void doLookup(params.payload);
    }
  }, [params.payload, step, looking, lookupError, preview, doLookup]);

  /** تنفيذ الدفع بعد PIN (Idempotency) */
  const executePay = async (pin: string) => {
    if (amountMinor === null || !preview) return;
    setExecuting(true);
    setPinError(null);
    try {
      const body: Record<string, unknown> = {
        merchantPhone: preview.merchant.phone,
        amountMinor,
        pin,
      };
      if (note.trim()) body.note = note.trim().slice(0, 60);
      const tx = await postMoney<QrPayResultView>("/api/merchant/pay", body);
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

  // ============================================================
  // النتيجة — إيصال الدفع
  // ============================================================
  if (step === "result" && result && preview) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="نتيجة الدفع" showBack={false} />
        <SuccessMark
          title="تم الدفع للتاجر"
          amount={formatMoney(result.amountMinor, result.currency)}
          subtitle={`إلى ${preview.merchant.shopName} • ${preview.merchant.category}`}
        />
        <div className="mt-4 space-y-3">
          <ReceiptCard
            reference={result.ref}
            title="إيصال دفع لتاجر"
            status={result.status}
            createdAt={result.createdAt}
            parties={[
              { label: "من", value: me?.user.fullName ?? "أنت" },
              { label: "إلى التاجر", value: `${preview.merchant.shopName} (${preview.merchant.phone})` },
            ]}
            fields={[
              { label: "المبلغ المدفوع", value: formatMoney(result.amountMinor, result.currency) },
              { label: "الرسوم", value: "على التاجر (مجانية لك)" },
              {
                label: "رصيدك بعد الدفع",
                value: formatMoney(result.balanceMinor ?? 0, result.currency),
                strong: true,
              },
              ...(note.trim() ? [{ label: "ملاحظة", value: note.trim() }] : []),
            ]}
          />
          <div className="grid grid-cols-1 gap-2">
            <PrimaryActionButton onClick={() => navigate("transaction-details", { ref: result.ref })}>
              مشاهدة العملية
            </PrimaryActionButton>
            <button
              type="button"
              onClick={() => resetTo("home")}
              className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#0B0B0C] text-[16px] font-bold text-white transition-colors hover:bg-[#1A1A1C]"
            >
              تم
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // فشل التنفيذ — ErrorState بكود العقد
  // ============================================================
  if (step === "fail") {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="نتيجة الدفع" showBack={false} />
        <div className="mt-6">
          <ErrorState
            message={formError?.message ?? "تعذّر إتمام الدفع"}
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
      </div>
    );
  }

  // ============================================================
  // PIN
  // ============================================================
  if (step === "pin" && preview && amountMinor !== null) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="تأكيد الدفع" />
        <div className="mt-6">
          <PinStep
            contextLabel={`تأكيد دفع ${formatMoney(amountMinor, CURRENCY)} إلى ${preview.merchant.shopName}`}
            error={pinError}
            executing={executing}
            onConfirm={(pin) => void executePay(pin)}
            onCancel={() => {
              setStep("review");
              setPinError(null);
            }}
          />
        </div>
      </div>
    );
  }

  // ============================================================
  // المراجعة
  // ============================================================
  if (step === "review" && preview && amountMinor !== null) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="مراجعة الدفع" subtitle="راجع التفاصيل قبل التأكيد" />
        <div className="mt-4 space-y-3">
          <ReviewCard
            title="تفاصيل الدفع للتاجر"
            rows={[
              { label: "التاجر", value: preview.merchant.shopName },
              { label: "الفئة", value: preview.merchant.category },
              { label: "المحافظة", value: preview.merchant.governorate },
              { label: "رقم التاجر", value: preview.merchant.phone },
              { label: "المبلغ", value: formatMoney(amountMinor, CURRENCY) },
              { label: "الرسوم", value: "على التاجر — أنت تدفع المبلغ كاملاً", tone: "gold" },
              {
                label: "الإجمالي المخصوم",
                value: formatMoney(amountMinor, CURRENCY),
                strong: true,
              },
              {
                label: "رصيدك المتاح",
                value: formatMoney(yerWallet?.balanceMinor ?? 0, CURRENCY),
                tone: amountMinor > (yerWallet?.balanceMinor ?? 0) ? "error" : undefined,
              },
              ...(note.trim() ? [{ label: "ملاحظة", value: note.trim() }] : []),
            ]}
            note="سيُخصم المبلغ من محفظتك فوراً ويصل التاجر لحظياً (بعد رسوم التاجر)."
          />
          <PrimaryActionButton onClick={() => setStep("pin")}>تأكيد الدفع</PrimaryActionButton>
          <button
            type="button"
            onClick={() => setStep("form")}
            className="flex min-h-11 w-full items-center justify-center gap-1 text-[13px] font-bold text-[#5C5A56] transition-colors hover:text-[#141416]"
          >
            تعديل التفاصيل
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // نموذج المبلغ (بعد نجاح lookup)
  // ============================================================
  if (step === "form" && preview) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="الدفع للتاجر" subtitle="أدخل المبلغ ثم راجع الدفع" />
        <div className="mt-4 space-y-3">
          {/* بطاقة معاينة التاجر */}
          <article className="relative overflow-hidden rounded-2xl bg-[#0B0B0C] p-4 text-white shadow-[0_8px_24px_rgba(11,11,12,0.12)]">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
              <span className="absolute -right-10 -top-12 h-32 w-32 rotate-45 rounded-xl border border-[#C9A227]/20" />
            </div>
            <div className="relative flex items-center gap-3">
              <div className="shrink-0 rounded-xl bg-white p-1.5">
                <img
                  src={`/api/qr?text=${encodeURIComponent(preview.merchant.qrPayload)}&size=96`}
                  alt={`رمز ${preview.merchant.shopName}`}
                  width={84}
                  height={84}
                  className="h-[84px] w-[84px]"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-[16px] font-bold text-white">
                  <BadgeCheck strokeWidth={1.5} className="h-4 w-4 shrink-0 text-[#C9A227]" />
                  {preview.merchant.shopName}
                </p>
                <p className="mt-1 flex items-center gap-1 text-[12px] font-medium text-white/60">
                  <Tag strokeWidth={1.5} className="h-3.5 w-3.5" />
                  {preview.merchant.category}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[12px] font-medium text-white/60">
                  <MapPin strokeWidth={1.5} className="h-3.5 w-3.5" />
                  {preview.merchant.governorate}
                  <span dir="ltr" className="tabular-nums text-white/40">· {preview.merchant.phone}</span>
                </p>
              </div>
            </div>
          </article>

          <button type="button" className="w-full" aria-label="حقل المبلغ — اضغط للكتابة بلوحة الأرقام">
            <AmountInputField
              value={amountInput}
              currency={CURRENCY}
              hint={
                amountInput === ""
                  ? `الرصيد المتاح ${formatMoney(yerWallet?.balanceMinor ?? 0, CURRENCY)} — الدفع بالريال اليمني فقط (Beta)`
                  : undefined
              }
            />
          </button>

          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 60))}
            placeholder="ملاحظة اختيارية (تظهر للتاجر)"
            className="min-h-11 w-full rounded-xl border border-[#E8E6E1] bg-white px-4 py-2.5 text-[14px] font-medium text-[#141416] placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:outline-none"
          />

          <AmountPad
            value={amountInput}
            onChange={(next) => setAmountInput(next.replace(/[^\d]/g, "").slice(0, 12))}
            mode="amount"
          />

          {formError ? <InlineErrorBanner error={formError} /> : null}

          <PrimaryActionButton
            onClick={() => setStep("review")}
            disabled={amountMinor === null || amountMinor > (yerWallet?.balanceMinor ?? 0)}
            loading={executing}
            disabledReason={
              amountMinor === null
                ? "أدخل مبلغاً صحيحاً أكبر من صفر"
                : amountMinor > (yerWallet?.balanceMinor ?? 0)
                  ? "المبلغ يتجاوز رصيدك المتاح"
                  : undefined
            }
          >
            <span className="inline-flex items-center gap-2">
              <Store strokeWidth={1.5} className="h-4 w-4" />
              متابعة للمراجعة
            </span>
          </PrimaryActionButton>
        </div>
      </div>
    );
  }

  // ============================================================
  // خطوة الإدخال/lookup
  // ============================================================
  const manualDigits = digitsOf(manualInput);
  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader title="الدفع للتاجر" subtitle="امسح رمز التاجر أو أدخل رقمه" />
      <div className="mt-4 space-y-3">
        <div className="rounded-2xl border border-[#E8E6E1] bg-white p-4 shadow-[0_2px_8px_rgba(11,11,12,0.04)]">
          <p className="mb-2 flex items-center gap-1.5 text-[14px] font-bold text-[#141416]">
            <Store strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
            رمز التاجر (SWPAY)
          </p>
          <input
            type="text"
            dir="ltr"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value.slice(0, 24))}
            placeholder="SWPAY:77XXXXXXX"
            className="min-h-[64px] w-full rounded-2xl border border-[#E8E6E1] bg-white px-4 text-[20px] font-extrabold tabular-nums tracking-[0.06em] text-[#141416] placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:outline-none focus:ring-[3px] focus:ring-[#C9A227]/[0.12]"
          />
          <div className="mt-3">
            <AmountPad
              value={manualDigits}
              onChange={(next) => {
                const digits = next.replace(/\D/g, "").slice(0, 9);
                setManualInput(digits.length > 0 ? `SWPAY:${digits}` : "");
              }}
              mode="phone"
            />
          </div>
          <div className="mt-3">
            <PrimaryActionButton
              onClick={() => void doLookup(manualInput)}
              disabled={manualDigits.length !== 9 || looking}
              loading={looking}
              disabledReason={manualDigits.length > 0 ? "أكمل 9 خانات" : "أدخل رقم التاجر"}
            >
              <span className="inline-flex items-center gap-2">
                <Send strokeWidth={1.5} className="h-4 w-4" />
                {looking ? "جارٍ التحقق…" : "التحقق من التاجر"}
              </span>
            </PrimaryActionButton>
          </div>
        </div>

        {lookupError ? (
          <div className="space-y-3">
            <InlineErrorBanner error={lookupError} />
            {manualDigits.length === 9 ? (
              <button
                type="button"
                onClick={() => navigate("transfer", { phone: manualDigits })}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#C9A227]/40 bg-[#C9A227]/[0.06] px-4 text-[14px] font-bold text-[#8A6E14] transition-colors hover:bg-[#C9A227]/[0.12]"
              >
                <Send strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
                تحويل عادي إلى <span dir="ltr" className="tabular-nums">{manualDigits}</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
