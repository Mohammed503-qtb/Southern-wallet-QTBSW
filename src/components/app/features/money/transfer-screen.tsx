/**
 * محفظة الجنوب — التحويل (SC-11..SC-14)
 * تبويبات (رقم هاتف / المفضلون / QR) → لوحة أرقام مشتركة تغذّي الحقل النشط
 * → اقتباس T1 (الاسم/الرسوم/الإجمالي) → بطاقة مراجعة → PIN →
 * تنفيذ T2 بمفتاح Idempotency (AC-03/04) → إيصال ReceiptCard
 * + إضافة للمفضلين (F2) بعد النجاح. يعمل params.phone الوارد من مسح QR.
 */

"use client";

import { useState } from "react";
import { QrCode, Send, Star, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAppStore } from "@/lib/app-store";
import type {
  BeneficiaryView,
  CurrencyCode,
  TransferQuoteView,
  TxResultView,
  WalletView,
} from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui/api-hooks";
import { AmountPad } from "@/components/app/ui/amount-pad";
import { AmountInputField } from "@/components/app/ui/amount-input-field";
import { CurrencyTabs } from "@/components/app/ui/currency-tabs";
import { ErrorState } from "@/components/app/ui/error-state";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ReceiptCard } from "@/components/app/ui/receipt-card";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { normalizeWallets } from "@/components/app/home/home-screen-helpers";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  InlineErrorBanner,
  PhoneField,
  PinStep,
  ReviewCard,
  SuccessMark,
  errInfo,
  maskFullName,
  parseAmountToMinor,
  postMoney,
} from "./money-shared";

type Tab = "phone" | "fav" | "qr";
type Step = "form" | "review" | "pin" | "result" | "fail";

export function TransferScreen() {
  const params = useAppStore((s) => s.params);
  const me = useAppStore((s) => s.me);
  const refreshMe = useAppStore((s) => s.refreshMe);
  const navigate = useAppStore((s) => s.navigate);
  const resetTo = useAppStore((s) => s.resetTo);

  // ===== حالة النموذج =====
  const [tab, setTab] = useState<Tab>(() =>
    params.phone ? "phone" : params.tab === "fav" ? "fav" : "phone",
  );
  const [phone, setPhone] = useState<string>(() =>
    params.phone ? params.phone.replace(/\D/g, "").slice(0, 9) : "",
  );
  const [amountInput, setAmountInput] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(
    () => (params.currency as CurrencyCode) || "YER",
  );
  const [note, setNote] = useState("");
  const [focus, setFocus] = useState<"phone" | "amount">(() => (params.phone ? "amount" : "phone"));

  // ===== حالة التدفق =====
  const [step, setStep] = useState<Step>("form");
  const [quote, setQuote] = useState<TransferQuoteView | null>(null);
  const [result, setResult] = useState<TxResultView | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [formError, setFormError] = useState<{ code: string; message: string } | null>(null);
  const [pinError, setPinError] = useState<{ code: string; message: string; lockSeconds?: number } | null>(
    null,
  );
  const [favAdded, setFavAdded] = useState(false);
  const [addingFav, setAddingFav] = useState(false);

  const wallets: WalletView[] = me ? normalizeWallets(me.wallets) : [];
  const activeWallet = wallets.find((w) => w.currency === currency);
  const beneficiaries = useApiData<BeneficiaryView[]>("/api/beneficiaries");

  const amountMinor = parseAmountToMinor(amountInput, currency);
  const phoneValid = phone.length === 9;
  const canContinue = phoneValid && amountMinor !== null && !quoting;

  // مفضل موجود مسبقاً بنفس الرقم؟ (يخفي زر الإضافة بعد النجاح)
  const existingFav = beneficiaries.data?.find((b) => b.phone === phone) ?? null;

  /** إدخال لوحة الأرقام في الحقل النشط */
  const handlePad = (next: string) => {
    if (focus === "phone") {
      const digits = next.replace(/\D/g, "").slice(0, 9);
      setPhone(digits);
      if (digits.length === 9) setFocus("amount");
    } else {
      const decimals = currency === "YER" ? 0 : 2;
      const cleaned = next.replace(/[^\d.]/g, "").slice(0, 13);
      const parts = cleaned.split(".");
      const bounded =
        parts.length > 1 ? `${parts[0].slice(0, 10)}.${parts[1].slice(0, decimals)}` : parts[0];
      setAmountInput(bounded === "" ? "" : bounded);
    }
  };

  /** جلب اقتباس التحويل (T1) */
  const fetchQuote = async () => {
    if (amountMinor === null) return;
    setQuoting(true);
    setFormError(null);
    try {
      const data = await api.post<TransferQuoteView>("/api/transfers/quote", {
        phone,
        currency,
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

  /** تنفيذ التحويل بعد PIN (T2 + Idempotency) */
  const executeTransfer = async (pin: string) => {
    if (amountMinor === null) return;
    setExecuting(true);
    setPinError(null);
    try {
      const body: Record<string, unknown> = { phone, currency, amountMinor, pin };
      if (note.trim()) body.note = note.trim().slice(0, 60);
      const tx = await postMoney<TxResultView>("/api/transfers", body);
      setResult(tx);
      setStep("result");
      void refreshMe();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "PIN-001" || err.code === "PIN-002") {
          const secs =
            err.code === "PIN-002" && err.details && typeof err.details.secondsRemaining === "number"
              ? err.details.secondsRemaining
              : undefined;
          setPinError({ code: err.code, message: err.message, lockSeconds: secs });
        } else {
          // أخطاء العقد المالية: TXN-001/TXN-002/GEO-001/ACC-001… → شاشة فشل
          setStep("fail");
          setFormError({ code: err.code, message: err.message });
        }
      } else {
        setPinError(errInfo(err));
      }
    } finally {
      setExecuting(false);
    }
  };

  /** إضافة المستلم للمفضلين (F2) */
  const addBeneficiary = async () => {
    if (!quote || existingFav || favAdded) return;
    setAddingFav(true);
    try {
      await api.post("/api/beneficiaries", { name: quote.recipientName, phone });
      setFavAdded(true);
      beneficiaries.retry();
      toast({ title: "تمت الإضافة للمفضلين", description: quote.recipientName });
    } catch (err) {
      const info = errInfo(err);
      toast({ title: "تعذّرت الإضافة", description: info.message, variant: "destructive" });
    } finally {
      setAddingFav(false);
    }
  };

  /** حذف مفضل (F3) */
  const removeBeneficiary = async (fav: BeneficiaryView) => {
    try {
      await api.del(`/api/beneficiaries/${fav.id}`);
      beneficiaries.retry();
      toast({ title: "تم حذف المفضل", description: fav.name });
    } catch (err) {
      const info = errInfo(err);
      toast({ title: "تعذّر الحذف", description: info.message, variant: "destructive" });
    }
  };

  // ============================================================
  // النتيجة (SC-14)
  // ============================================================
  if (step === "result" && result && quote) {
    const isFav = existingFav !== null || favAdded;
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="نتيجة التحويل" showBack={false} />
        <SuccessMark
          title="تم التحويل بنجاح"
          amount={formatMoney(result.amountMinor, result.currency)}
          subtitle={`إلى ${quote.recipientName} • ${quote.maskedPhone}`}
        />
        <div className="mt-4 space-y-3">
          <ReceiptCard
            reference={result.ref}
            title="إيصال تحويل"
            status={result.status}
            createdAt={result.createdAt}
            parties={[
              { label: "من", value: me?.user.fullName ?? "أنت" },
              { label: "إلى", value: `${quote.recipientName} (${quote.maskedPhone})` },
            ]}
            fields={[
              { label: "المبلغ", value: formatMoney(result.amountMinor, result.currency) },
              { label: "الرسوم", value: formatMoney(result.feeMinor, result.currency) },
              {
                label: "الإجمالي المخصوم",
                value: formatMoney(result.amountMinor + result.feeMinor, result.currency),
                strong: true,
              },
              ...(note.trim()
                ? [{ label: "ملاحظة", value: note.trim().slice(0, 60) }]
                : []),
            ]}
          />

          <div className="grid grid-cols-1 gap-2">
            {!isFav ? (
              <button
                type="button"
                onClick={() => void addBeneficiary()}
                disabled={addingFav}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#C9A227]/40 bg-[#C9A227]/[0.06] px-4 text-[14px] font-bold text-[#8A6E14] transition-colors hover:bg-[#C9A227]/[0.12] disabled:opacity-60"
              >
                <Star strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
                {addingFav ? "جارٍ الإضافة…" : "إضافة للمفضلين"}
              </button>
            ) : null}
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
        <ScreenHeader title="نتيجة التحويل" showBack={false} />
        <div className="mt-6">
          <ErrorState
            message={formError?.message ?? "تعذّر إتمام التحويل"}
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
  // PIN (SC-13)
  // ============================================================
  if (step === "pin" && quote && amountMinor !== null) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="تأكيد التحويل" />
        <div className="mt-6">
          <PinStep
            contextLabel={`تأكيد تحويل ${formatMoney(amountMinor, currency)} إلى ${maskFullName(
              quote.recipientName,
            )}`}
            error={pinError}
            executing={executing}
            onConfirm={(pin) => void executeTransfer(pin)}
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
  // المراجعة (SC-12)
  // ============================================================
  if (step === "review" && quote && amountMinor !== null) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="مراجعة التحويل" subtitle="راجع التفاصيل قبل التأكيد" />
        <div className="mt-4 space-y-3">
          <ReviewCard
            title="تفاصيل التحويل"
            rows={[
              {
                label: "المستفيد",
                value: `${maskFullName(quote.recipientName)} • ${quote.maskedPhone}`,
              },
              { label: "المبلغ", value: formatMoney(quote.amountMinor, quote.currency) },
              { label: "الرسوم", value: formatMoney(quote.feeMinor, quote.currency) },
              {
                label: "الإجمالي المخصوم",
                value: formatMoney(quote.totalMinor, quote.currency),
                strong: true,
              },
              {
                label: "رصيدك المتاح",
                value: formatMoney(activeWallet?.balanceMinor ?? 0, currency),
                tone: quote.totalMinor > (activeWallet?.balanceMinor ?? 0) ? "error" : undefined,
              },
              ...(note.trim() ? [{ label: "ملاحظة", value: note.trim() }] : []),
            ]}
            note="سيُخصم الإجمالي من محفظتك فور التأكيد ويصل المبلغ للمستلم لحظياً."
          />
          <PrimaryActionButton onClick={() => setStep("pin")}>تأكيد التحويل</PrimaryActionButton>
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
  // النموذج (SC-11)
  // ============================================================
  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader title="تحويل" subtitle="أرسل الأموال لمشترك في المحفظة" />

      {/* تبويبات pill */}
      <div role="tablist" aria-label="طرق اختيار المستلم" className="mt-3 grid grid-cols-3 gap-2">
        {(
          [
            { key: "phone", label: "رقم هاتف" },
            { key: "fav", label: "المفضلون" },
            { key: "qr", label: "QR" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-full px-3 text-[13px] font-bold transition-all",
              tab === t.key
                ? "bg-[#0B0B0C] text-white"
                : "border border-[#E8E6E1] bg-[#F7F6F2] text-[#141416] hover:border-[#C9A227]/50",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "qr" ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-[#E8E6E1] bg-white p-5 text-center shadow-[0_2px_8px_rgba(11,11,12,0.04)]">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#E8E6E1] bg-[#F7F6F2] text-[#C9A227]">
              <QrCode strokeWidth={1.5} className="h-6 w-6" />
            </span>
            <h3 className="mt-3 text-[16px] font-bold text-[#141416]">تحويل بمسح رمز QR</h3>
            <p className="mt-1.5 text-[13px] font-medium leading-5 text-[#5C5A56]">
              افتح الماسح ووجّهه نحو رمز المستلم الشخصي (SWPAY) — أو أدخل رقمه يدوياً من تبويب
              "رقم هاتف".
            </p>
          </div>
          <PrimaryActionButton onClick={() => navigate("scan-qr")}>
            <span className="inline-flex items-center gap-2">
              <QrCode strokeWidth={1.5} className="h-4 w-4" />
              افتح الماسح
            </span>
          </PrimaryActionButton>
        </div>
      ) : null}

      {tab === "fav" ? (
        <div className="mt-4">
          {beneficiaries.loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-2xl" />
              ))}
            </div>
          ) : beneficiaries.error ? (
            <ErrorState
              compact
              message={beneficiaries.error.message}
              code={beneficiaries.error.code}
              onRetry={beneficiaries.retry}
            />
          ) : (beneficiaries.data?.length ?? 0) === 0 ? (
            <div className="rounded-2xl border border-[#E8E6E1] bg-white p-5 text-center">
              <p className="text-[14px] font-bold text-[#141416]">لا مفضلين بعد</p>
              <p className="mt-1 text-[12.5px] font-medium leading-5 text-[#5C5A56]">
                أضف مستلمين متكرري التحويل لتظهر هنا — أو أضفهم بعد أول تحويل ناجح.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {beneficiaries.data?.map((fav) => (
                <div
                  key={fav.id}
                  className="flex items-center gap-3 rounded-2xl border border-[#E8E6E1]/70 bg-white p-3 transition-colors hover:border-[#C9A227]/40"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setPhone(fav.phone);
                      setFocus("amount");
                      setTab("phone");
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 text-right"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#C9A227]/25 bg-[#C9A227]/[0.07] text-[15px] font-extrabold text-[#8A6E14]">
                      {fav.name.trim().charAt(0) || "م"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-[#141416]">
                        {fav.name}
                      </span>
                      <span dir="ltr" className="block text-[12.5px] font-medium tabular-nums text-[#5C5A56]">
                        {fav.phone}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeBeneficiary(fav)}
                    aria-label={`حذف ${fav.name} من المفضلين`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#A3A09B] transition-colors hover:bg-[#B91C1C]/[0.06] hover:text-[#B91C1C]"
                  >
                    <Trash2 strokeWidth={1.5} className="h-[18px] w-[18px]" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "phone" ? (
        <div className="mt-4 space-y-3">
          <PhoneField
            label="رقم المستلم"
            value={phone}
            active={focus === "phone"}
            onActivate={() => setFocus("phone")}
            hint={phone.length > 0 && !phoneValid ? `أكمل الرقم (9 خانات — أدخلت ${phone.length})` : undefined}
          />
          <CurrencyTabs wallets={wallets} value={currency} onChange={setCurrency} />
          <button type="button" onClick={() => setFocus("amount")} className="w-full rounded-2xl" aria-label="حقل المبلغ — اضغط للكتابة بلوحة الأرقام">
            <AmountInputField
              value={amountInput}
              currency={currency}
              hint={
                focus === "amount" && amountInput === ""
                  ? `الرصيد المتاح ${formatMoney(activeWallet?.balanceMinor ?? 0, currency)}`
                  : undefined
              }
              className={cn(
                "rounded-2xl transition-shadow",
                focus === "amount" && "ring-[3px] ring-[#C9A227]/[0.15]",
              )}
            />
          </button>
          {/* حقل الملاحظة الاختياري */}
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 60))}
            placeholder="ملاحظة اختيارية (تظهر للمستلم)"
            className="min-h-11 w-full rounded-xl border border-[#E8E6E1] bg-white px-4 py-2.5 text-[14px] font-medium text-[#141416] placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:outline-none"
          />
          <AmountPad
            value={focus === "phone" ? phone : amountInput}
            onChange={handlePad}
            mode={focus === "phone" ? "phone" : "amount"}
            decimal={focus === "amount" && currency !== "YER"}
          />
          {formError ? <InlineErrorBanner error={formError} /> : null}
          <PrimaryActionButton
            onClick={() => void fetchQuote()}
            disabled={!canContinue}
            loading={quoting}
            disabledReason={
              !phoneValid
                ? "أدخل رقم مستلم مكوّن من 9 خانات"
                : amountMinor === null
                  ? "أدخل مبلغاً صحيحاً أكبر من صفر"
                  : undefined
            }
          >
            <span className="inline-flex items-center gap-2">
              <Send strokeWidth={1.5} className="h-4 w-4" />
              متابعة للمراجعة
            </span>
          </PrimaryActionButton>
        </div>
      ) : null}
    </div>
  );
}
