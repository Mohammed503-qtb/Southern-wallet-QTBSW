/**
 * محفظة الجنوب — تفاصيل هدف الحصالة (SC-32/33)
 * params.id → من GET /api/savings: ترويسة (الاسم/الهدف/تقدم كبير)
 * + إيداع في الحصالة (AmountPad → PIN → S3 + Idempotency)
 * + سحب منها (S4) + سجل عمليات الحصالة (T3 بفلتر types)
 * + تحطيم الحصالة (تأكيد مزدوج + PIN → S5) للحالة ACTIVE فقط.
 */

"use client";

import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Ban, Hammer, RotateCw } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAppStore } from "@/lib/app-store";
import type {
  CurrencyCode,
  PageView,
  SavingsJarView,
  SavingsOpResultView,
  TxView,
  WalletView,
} from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui/api-hooks";
import { AmountInputField } from "@/components/app/ui/amount-input-field";
import { AmountPad } from "@/components/app/ui/amount-pad";
import { ErrorState } from "@/components/app/ui/error-state";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { TransactionRow } from "@/components/app/ui/transaction-row";
import { normalizeWallets } from "@/components/app/home/home-screen-helpers";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  InlineErrorBanner,
  PinStep,
  ReviewCard,
  errInfo,
  minorToAmountInput,
  parseAmountToMinor,
  postMoney,
} from "./money-shared";
import { JarStatusChip, findJar } from "./savings-shared";

type Mode = "view" | "deposit-amount" | "deposit-review" | "withdraw-amount" | "withdraw-review" | "pin";
type PinAction = "deposit" | "withdraw" | "break";

export function SavingsGoalScreen() {
  const params = useAppStore((s) => s.params);
  const me = useAppStore((s) => s.me);
  const refreshMe = useAppStore((s) => s.refreshMe);
  const navigate = useAppStore((s) => s.navigate);
  const back = useAppStore((s) => s.back);

  const jars = useApiData<SavingsJarView[]>("/api/savings");
  const jar = findJar(jars.data, params.id);

  const history = useApiData<PageView<TxView>>(
    "/api/transactions?types=SAVING_IN,SAVING_OUT&limit=20",
  );

  const [mode, setMode] = useState<Mode>("view");
  const [pinAction, setPinAction] = useState<PinAction | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [executing, setExecuting] = useState(false);
  const [formError, setFormError] = useState<{ code: string; message: string } | null>(null);
  const [pinError, setPinError] = useState<{ code: string; message: string; lockSeconds?: number } | null>(
    null,
  );
  const [breakStage, setBreakStage] = useState<"idle" | "confirm">("idle");

  const wallets: WalletView[] = me ? normalizeWallets(me.wallets) : [];
  const jarCurrency: CurrencyCode = jar?.currency ?? "YER";
  const wallet = wallets.find((w) => w.currency === jarCurrency);
  const amountMinor = parseAmountToMinor(amountInput, jarCurrency);

  /** سجل الحصالة — فلترة وصفية بذكر الهدف إن أمكن */
  const jarHistory = useMemo(() => {
    const items = history.data?.items ?? [];
    if (!jar) return items;
    const needle = `«${jar.name}»`;
    const specific = items.filter((t) => t.description?.includes(needle));
    return specific.length > 0 ? specific : items;
  }, [history.data, jar]);

  // ===== تنفيذ إيداع/سحب/تحطيم =====
  const runSavingsOp = async (action: PinAction, pin: string) => {
    if (!jar) return;
    if ((action === "deposit" || action === "withdraw") && amountMinor === null) return;
    setExecuting(true);
    setPinError(null);
    try {
      if (action === "break") {
        const res = await api.post<SavingsOpResultView>(`/api/savings/${jar.id}/break`, { pin });
        toast({
          title: "تم تحطيم الحصالة",
          description: res.tx
            ? `سُحب ${formatMoney(res.tx.amountMinor, res.tx.currency)} إلى محفظتك`
            : "الحصالة كانت فارغة",
        });
      } else {
        const endpoint = action === "deposit" ? "contribute" : "withdraw";
        const res = await postMoney<SavingsOpResultView>(`/api/savings/${jar.id}/${endpoint}`, {
          amountMinor,
          pin,
        });
        toast({
          title: action === "deposit" ? "تم الإيداع في الحصالة" : "تم السحب من الحصالة",
          description: formatMoney(amountMinor ?? 0, jarCurrency),
        });
        setAmountInput("");
        setMode("view");
      }
      jars.retry();
      history.retry();
      void refreshMe();
      if (action === "break") back();
    } catch (err) {
      if (err instanceof ApiError && (err.code === "PIN-001" || err.code === "PIN-002")) {
        const secs =
          err.code === "PIN-002" && err.details && typeof err.details.secondsRemaining === "number"
            ? err.details.secondsRemaining
            : undefined;
        setPinError({ code: err.code, message: err.message, lockSeconds: secs });
      } else {
        setFormError(errInfo(err));
      }
    } finally {
      setExecuting(false);
    }
  };

  // ===== تحميل/خطأ =====
  if (jars.loading) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="تفاصيل الهدف" />
        <Skeleton className="mt-4 h-48 w-full rounded-2xl" />
        <Skeleton className="mt-3 h-24 w-full rounded-2xl" />
        <Skeleton className="mt-3 h-16 w-full rounded-2xl" />
      </div>
    );
  }

  if (jars.error) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="تفاصيل الهدف" />
        <div className="mt-6">
          <ErrorState message={jars.error.message} code={jars.error.code} onRetry={jars.retry} />
        </div>
      </div>
    );
  }

  if (!jar) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="تفاصيل الهدف" />
        <div className="mt-6">
          <ErrorState
            message="لم يتم العثور على هذا الهدف — قد يكون حُذف أو أُنشئ من جهاز آخر."
            code="SAV-NOT-FOUND"
            onRetry={jars.retry}
          >
            <button
              type="button"
              onClick={() => navigate("savings")}
              className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-[#E8E6E1] bg-white px-6 text-[14px] font-bold text-[#5C5A56] transition-colors hover:bg-[#F7F6F2]"
            >
              العودة للحصالات
            </button>
          </ErrorState>
        </div>
      </div>
    );
  }

  const progress = jar.targetMinor
    ? Math.max(0, Math.min(100, Math.round((jar.savedMinor / jar.targetMinor) * 100)))
    : 0;
  const remaining = jar.targetMinor ? Math.max(0, jar.targetMinor - jar.savedMinor) : null;
  const isActive = jar.status === "ACTIVE";

  // ===== خطوة PIN =====
  if (mode === "pin" && pinAction) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader
          title={
            pinAction === "deposit"
              ? "تأكيد الإيداع في الحصالة"
              : pinAction === "withdraw"
                ? "تأكيد السحب من الحصالة"
                : "تأكيد تحطيم الحصالة"
          }
        />
        <div className="mt-6">
          <PinStep
            contextLabel={
              pinAction === "deposit"
                ? `إيداع ${formatMoney(amountMinor ?? 0, jarCurrency)} في «${jar.name}»`
                : pinAction === "withdraw"
                  ? `سحب ${formatMoney(amountMinor ?? 0, jarCurrency)} من «${jar.name}»`
                  : `تحطيم حصالة «${jar.name}» وسحب ${formatMoney(jar.savedMinor, jarCurrency)}`
            }
            error={pinError}
            executing={executing}
            onConfirm={(pin) => void runSavingsOp(pinAction, pin)}
            onCancel={() => {
              setMode(
                pinAction === "deposit"
                  ? "deposit-review"
                  : pinAction === "withdraw"
                    ? "withdraw-review"
                    : "view",
              );
              setPinError(null);
            }}
          />
        </div>
      </div>
    );
  }

  // ===== خطوة مراجعة إيداع/سحب =====
  if ((mode === "deposit-review" || mode === "withdraw-review") && amountMinor !== null) {
    const isDeposit = mode === "deposit-review";
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader
          title={isDeposit ? "مراجعة الإيداع" : "مراجعة السحب"}
          subtitle={`حصالة «${jar.name}»`}
        />
        <div className="mt-4 space-y-3">
          <ReviewCard
            title={isDeposit ? "إيداع في الحصالة" : "سحب من الحصالة"}
            rows={[
              { label: "المبلغ", value: formatMoney(amountMinor, jarCurrency) },
              { label: "الرسوم", value: formatMoney(0, jarCurrency) },
              {
                label: isDeposit ? "سيُخصم من محفظتك" : "سيُضاف لمحفظتك",
                value: formatMoney(amountMinor, jarCurrency),
                strong: true,
              },
              {
                label: isDeposit ? "رصيد المحفظة المتاح" : "رصيد الحصالة الحالي",
                value: formatMoney(
                  isDeposit ? (wallet?.balanceMinor ?? 0) : jar.savedMinor,
                  jarCurrency,
                ),
                tone:
                  isDeposit && amountMinor > (wallet?.balanceMinor ?? 0)
                    ? "error"
                    : !isDeposit && amountMinor > jar.savedMinor
                      ? "error"
                      : undefined,
              },
              {
                label: "رصيد الحصالة بعد العملية",
                value: formatMoney(
                  isDeposit ? jar.savedMinor + amountMinor : Math.max(0, jar.savedMinor - amountMinor),
                  jarCurrency,
                ),
                tone: "success",
              },
            ]}
            note={
              isDeposit
                ? "الإيداع في الحصالة مجاني — المبلغ ينتقل من محفظتك الرئيسية لحصالة الهدف."
                : "سحبك من الحصالة يعود فوراً لمحفظتك الرئيسية بنفس العملة."
            }
          />
          {formError ? <InlineErrorBanner error={formError} /> : null}
          <PrimaryActionButton
            onClick={() => {
              setPinAction(isDeposit ? "deposit" : "withdraw");
              setMode("pin");
            }}
          >
            {isDeposit ? "تأكيد الإيداع" : "تأكيد السحب"}
          </PrimaryActionButton>
          <button
            type="button"
            onClick={() => setMode(isDeposit ? "deposit-amount" : "withdraw-amount")}
            className="flex min-h-11 w-full items-center justify-center text-[13px] font-bold text-[#5C5A56] transition-colors hover:text-[#141416]"
          >
            تعديل المبلغ
          </button>
        </div>
      </div>
    );
  }

  // ===== خطوة مبلغ إيداع/سحب =====
  if (mode === "deposit-amount" || mode === "withdraw-amount") {
    const isDeposit = mode === "deposit-amount";
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader
          title={isDeposit ? "إيداع في الحصالة" : "سحب من الحصالة"}
          subtitle={`حصالة «${jar.name}»`}
        />
        <div className="mt-4 space-y-3">
          <AmountInputField
            value={amountInput}
            currency={jarCurrency}
            hint={
              amountInput === ""
                ? isDeposit
                  ? `المتاح في محفظتك ${formatMoney(wallet?.balanceMinor ?? 0, jarCurrency)}`
                  : `المتاح في الحصالة ${formatMoney(jar.savedMinor, jarCurrency)}`
                : undefined
            }
          />
          <AmountPad
            value={amountInput}
            onChange={(next) => setAmountInput(next.replace(/[^\d.]/g, "").slice(0, 13))}
            mode="amount"
            decimal={jarCurrency !== "YER"}
          />
          {isDeposit ? (
            <div className="flex gap-2">
              {[0.25, 0.5, 1].map((frac) => {
                const val = Math.floor((wallet?.balanceMinor ?? 0) * frac);
                if (val <= 0) return null;
                return (
                  <button
                    key={frac}
                    type="button"
                    onClick={() => setAmountInput(minorToAmountInput(val, jarCurrency))}
                    className="min-h-11 flex-1 rounded-full border border-[#E8E6E1] bg-white text-[12px] font-bold text-[#141416] transition-colors hover:border-[#C9A227]/50"
                  >
                    {formatMoney(val, jarCurrency)}
                  </button>
                );
              })}
            </div>
          ) : null}
          {formError ? <InlineErrorBanner error={formError} /> : null}
          <PrimaryActionButton
            onClick={() => setMode(isDeposit ? "deposit-review" : "withdraw-review")}
            disabled={amountMinor === null}
            disabledReason={amountMinor === null ? "أدخل مبلغاً صحيحاً أكبر من صفر" : undefined}
          >
            متابعة للمراجعة
          </PrimaryActionButton>
          <button
            type="button"
            onClick={() => {
              setMode("view");
              setAmountInput("");
              setFormError(null);
            }}
            className="flex min-h-11 w-full items-center justify-center text-[13px] font-bold text-[#5C5A56] hover:text-[#141416]"
          >
            إلغاء
          </button>
        </div>
      </div>
    );
  }

  // ===== العرض الرئيسي (SC-33) =====
  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader
        title={jar.name}
        subtitle={`حصالة ${jarCurrency}`}
        action={
          <button
            type="button"
            onClick={() => {
              jars.retry();
              history.retry();
            }}
            aria-label="تحديث"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#E8E6E1] bg-white text-[#5C5A56] transition-colors hover:bg-[#F7F6F2]"
          >
            <RotateCw strokeWidth={1.5} className="h-5 w-5" />
          </button>
        }
      />

      {/* بطاقة الترويسة */}
      <section className="relative mt-4 overflow-hidden rounded-2xl bg-[#0B0B0C] p-5 text-white shadow-[0_8px_24px_rgba(11,11,12,0.10)]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
          <span className="absolute -left-10 -top-10 h-32 w-32 rotate-45 rounded-xl border border-[#C9A227]/20" />
          <span className="absolute -right-12 -bottom-14 h-36 w-36 rotate-45 rounded-xl border border-[#C9A227]/15" />
        </div>
        <div className="relative">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold text-white/60">الموفَّر في الحصالة</p>
            <JarStatusChip status={jar.status} className="!border-[#C9A227]/40 !bg-[#C9A227]/[0.15] !text-[#E9DFC3]" />
          </div>
          <p dir="ltr" className="mt-1.5 text-[32px] font-extrabold leading-10 tabular-nums text-white">
            {formatMoney(jar.savedMinor, jar.currency)}
          </p>
          {jar.targetMinor ? (
            <>
              <p className="mt-1 text-[12px] font-medium text-white/55">
                الهدف: <span dir="ltr" className="tabular-nums">{formatMoney(jar.targetMinor, jar.currency)}</span>
                {remaining !== null && remaining > 0 ? (
                  <>
                    {" "}· متبقٍ <span dir="ltr" className="tabular-nums">{formatMoney(remaining, jar.currency)}</span>
                  </>
                ) : null}
              </p>
              {/* شريط التقدم الكبير */}
              <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    jar.status === "ACHIEVED" ? "bg-[#15803D]" : "bg-[#C9A227]",
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1.5 text-right text-[11px] font-bold tabular-nums text-[#C9A227]">
                {progress}% من الهدف
              </p>
            </>
          ) : (
            <p className="mt-2 text-[12px] font-medium text-white/55">هدف مفتوح بلا مبلغ محدد</p>
          )}
        </div>
      </section>

      {/* أزرار إيداع/سحب */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("deposit-amount");
            setAmountInput("");
            setFormError(null);
          }}
          className="flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl bg-[#0B0B0C] text-white transition-colors hover:bg-[#1A1A1C]"
        >
          <ArrowDownToLine strokeWidth={1.5} className="h-5 w-5 text-[#C9A227]" />
          <span className="text-[12.5px] font-bold">إيداع في الحصالة</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("withdraw-amount");
            setAmountInput("");
            setFormError(null);
          }}
          disabled={jar.savedMinor <= 0}
          className={cn(
            "flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl border transition-colors",
            jar.savedMinor <= 0
              ? "cursor-not-allowed border-[#E8E6E1] bg-[#F7F6F2] text-[#A3A09B]"
              : "border-[#0B0B0C]/15 bg-white text-[#141416] hover:bg-[#F7F6F2]",
          )}
        >
          <ArrowUpFromLine strokeWidth={1.5} className={cn("h-5 w-5", jar.savedMinor <= 0 ? "text-[#A3A09B]" : "text-[#5C5A56]")} />
          <span className="text-[12.5px] font-bold">سحب من الحصالة</span>
        </button>
      </div>

      {formError ? <InlineErrorBanner error={formError} className="mt-3" /> : null}

      {/* سجل عمليات الحصالة */}
      <section className="mt-5">
        <h2 className="mb-2.5 text-[17px] font-semibold leading-6 text-[#141416]">
          عمليات الحصالة
        </h2>
        {history.loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        ) : history.error ? (
          <ErrorState
            compact
            message={history.error.message}
            code={history.error.code}
            onRetry={history.retry}
          />
        ) : jarHistory.length === 0 ? (
          <p className="rounded-2xl border border-[#E8E6E1] bg-white p-5 text-center text-[13px] font-semibold text-[#5C5A56]">
            لا عمليات في هذه الحصالة بعد — ابدأ بأول إيداع
          </p>
        ) : (
          <div className="space-y-2">
            {jarHistory.map((tx) => (
              <TransactionRow
                key={tx.ref}
                tx={tx}
                onOpen={(ref) => navigate("transaction-details", { ref })}
              />
            ))}
          </div>
        )}
      </section>

      {/* تحطيم الحصالة — ACTIVE فقط */}
      {isActive ? (
        <section className="mt-6">
          {breakStage === "idle" ? (
            <button
              type="button"
              onClick={() => setBreakStage("confirm")}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#B91C1C]/25 px-4 text-[13px] font-bold text-[#B91C1C] transition-colors hover:bg-[#B91C1C]/[0.05]"
            >
              <Hammer strokeWidth={1.5} className="h-4 w-4" />
              تحطيم الحصالة
            </button>
          ) : (
            <div className="rounded-2xl border border-[#B91C1C]/30 bg-[#B91C1C]/[0.04] p-4">
              <div className="flex items-start gap-2.5">
                <Ban strokeWidth={1.5} className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#B91C1C]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-bold leading-6 text-[#B91C1C]">
                    سيُسحب كامل المبلغ (
                    <span dir="ltr" className="tabular-nums">
                      {formatMoney(jar.savedMinor, jar.currency)}
                    </span>
                    ) إلى محفظتك ويُغلق الهدف نهائياً — لا يمكن التراجع.
                  </p>
                  <p className="mt-1 text-[12px] font-medium text-[#5C5A56]">
                    يتطلب تأكيداً برمز PIN (S5) — يبقى الأثر المحاسبي في السجل.
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPinAction("break");
                    setMode("pin");
                  }}
                  className="flex min-h-11 items-center justify-center rounded-xl bg-[#B91C1C] px-4 text-[14px] font-bold text-white transition-colors hover:bg-[#991B1B]"
                >
                  متابعة وإدخال PIN
                </button>
                <button
                  type="button"
                  onClick={() => setBreakStage("idle")}
                  className="flex min-h-11 items-center justify-center rounded-xl border border-[#E8E6E1] bg-white px-4 text-[14px] font-bold text-[#5C5A56] transition-colors hover:bg-[#F7F6F2]"
                >
                  تراجع
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
