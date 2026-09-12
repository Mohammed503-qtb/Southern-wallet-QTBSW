/**
 * محفظة الجنوب — مسار طلب نقدي مشترك (SC-22 إيداع / SC-23 سحب)
 * ---------------------------------------------------------------
 * يملكه 8-c-1 داخلياً وتغلفه CashDepositScreen وCashWithdrawScreen.
 * المسار: اختيار الوكيل (inline أو عبر params.agentId من دليل الوكلاء)
 * → المبلغ (YER فقط — حد Alpha) → اقتباس C3 → مراجعة →
 * (السحب فقط: PIN) → تنفيذ C4 بمفتاح Idempotency →
 * السحب: انتقال لشاشة رمز السحب · الإيداع: نتيجة بالرمز وتعليمات.
 */

"use client";

import { useMemo, useState } from "react";
import { MapPin, RotateCw, Search, Store } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAppStore } from "@/lib/app-store";
import type { AgentView, CashOpResultView, CashOpType, FeeQuoteView, WalletView } from "@/lib/api-types";
import { CASH_OP_TYPE_LABELS, formatMoney } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui/api-hooks";
import { AmountInputField } from "@/components/app/ui/amount-input-field";
import { AmountPad } from "@/components/app/ui/amount-pad";
import { ErrorState } from "@/components/app/ui/error-state";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ReceiptCard } from "@/components/app/ui/receipt-card";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { StatusChip } from "@/components/app/ui/status-chip";
import { normalizeWallets } from "@/components/app/home/home-screen-helpers";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
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

type Step = "agent" | "amount" | "review" | "pin" | "result" | "fail";

const CASH_CURRENCY = "YER" as const;

export function CashRequestFlow({ type }: { type: CashOpType }) {
  const isWithdraw = type === "WITHDRAW";
  const params = useAppStore((s) => s.params);
  const me = useAppStore((s) => s.me);
  const refreshMe = useAppStore((s) => s.refreshMe);
  const navigate = useAppStore((s) => s.navigate);
  const resetTo = useAppStore((s) => s.resetTo);

  const [step, setStep] = useState<Step>("agent");
  const [agent, setAgent] = useState<AgentView | null>(null);
  const [agentSearched, setAgentSearched] = useState("");
  const [amountInput, setAmountInput] = useState("");

  const [quote, setQuote] = useState<FeeQuoteView | null>(null);
  const [result, setResult] = useState<CashOpResultView | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [formError, setFormError] = useState<{ code: string; message: string } | null>(null);
  const [pinError, setPinError] = useState<{ code: string; message: string; lockSeconds?: number } | null>(
    null,
  );

  // ===== الوكلاء (C1) =====
  const agentsList = useApiData<AgentView[]>("/api/agents");
  const myGovernorate = me?.user.governorate ?? null;

  // params.agentId قادم من دليل الوكلاء → اختيار مباشر
  const agents = agentsList.data ?? [];
  const preselected = params.agentId ? agents.find((a) => a.id === params.agentId) : null;
  const selectedAgent = agent ?? preselected ?? null;

  const filteredAgents = useMemo(() => {
    const q = agentSearched.trim();
    const src = agents;
    if (q) {
      return src.filter(
        (a) =>
          a.shopName.includes(q) ||
          a.code.toLowerCase().includes(q.toLowerCase()) ||
          (a.district ?? "").includes(q) ||
          (a.address ?? "").includes(q),
      );
    }
    // افتراضياً: محافظة المستخدم أولاً
    if (myGovernorate) {
      const mine = src.filter((a) => a.governorate === myGovernorate);
      const others = src.filter((a) => a.governorate !== myGovernorate);
      return [...mine, ...others];
    }
    return src;
  }, [agents, agentSearched, myGovernorate]);

  const wallets: WalletView[] = me ? normalizeWallets(me.wallets) : [];
  const yerWallet = wallets.find((w) => w.currency === CASH_CURRENCY);
  const amountMinor = parseAmountToMinor(amountInput, CASH_CURRENCY);

  // حد العملية الواحدة (من محرك الحدود — عرض استرشادي)
  const perTxnLimit = me?.limits.find(
    (l) => l.currency === CASH_CURRENCY && l.kycLevel === (me.user.kycLevel ?? "NONE"),
  );

  const fetchQuote = async () => {
    if (amountMinor === null) return;
    setQuoting(true);
    setFormError(null);
    try {
      const data = await api.post<FeeQuoteView>("/api/cash/quote", {
        type,
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

  const executeCash = async (pin?: string) => {
    if (amountMinor === null || !selectedAgent) return;
    setExecuting(true);
    setPinError(null);
    try {
      const body: Record<string, unknown> = {
        type,
        agentId: selectedAgent.id,
        amountMinor,
      };
      if (isWithdraw && pin) body.pin = pin;
      const op = await postMoney<CashOpResultView>("/api/cash", body);
      setResult(op);
      void refreshMe();
      if (isWithdraw) {
        // السحب → شاشة رمز السحب مباشرة (SC-24)
        toast({ title: "تم إنشاء طلب السحب", description: `المرجع ${op.ref}` });
        navigate("withdraw-code", { id: op.id });
      } else {
        setStep("result");
      }
    } catch (err) {
      if (
        isWithdraw &&
        err instanceof ApiError &&
        (err.code === "PIN-001" || err.code === "PIN-002")
      ) {
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

  const screenTitle = isWithdraw ? "سحب نقدي" : "إيداع نقدي";

  // ===== النتيجة (إيداع فقط — السحب ينتقل لرمز السحب) =====
  if (step === "result" && result && quote) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="نتيجة طلب الإيداع" showBack={false} />
        <SuccessMark
          title="تم إنشاء طلب الإيداع"
          amount={formatMoney(result.amountMinor, result.currency)}
          subtitle={`لدى ${result.agentShop} — بانتظار تأكيد الوكيل`}
        />
        <div className="mt-4 space-y-3">
          {result.code ? (
            <BigCodeCard
              code={result.code}
              title="رمز الإيداع"
              warning="اذهب للوكيل وقدّم هذا الرمز مع المبلغ نقداً خلال مدة الصلاحية — لا يُضاف الرصيد قبل تأكيد الوكيل"
              expiryIso={result.expiresAt}
              showQr
            />
          ) : null}
          <ReceiptCard
            reference={result.ref}
            title="إيصال طلب إيداع"
            status={result.status}
            createdAt={result.createdAt}
            parties={[
              { label: "الوكيل", value: `${result.agentShop} (${result.agentCode})` },
              { label: "الحالة", value: "بانتظار تأكيد الوكيل" },
            ]}
            fields={[
              { label: "المبلغ", value: formatMoney(result.amountMinor, result.currency) },
              { label: "الرسوم", value: formatMoney(result.feeMinor, result.currency) },
            ]}
          />
          <div className="grid grid-cols-1 gap-2">
            <PrimaryActionButton onClick={() => navigate("transactions")}>
              مشاهدة العمليات
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
        <ScreenHeader title={`نتيجة طلب ${CASH_OP_TYPE_LABELS[type]}`} showBack={false} />
        <div className="mt-6">
          <ErrorState
            message={formError?.message ?? "تعذّر إنشاء الطلب"}
            code={formError?.code}
            onRetry={() => {
              setStep("amount");
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

  // ===== PIN (سحب فقط) =====
  if (step === "pin" && quote && amountMinor !== null) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="تأكيد السحب" />
        <div className="mt-6">
          <PinStep
            contextLabel={`تأكيد سحب ${formatMoney(amountMinor, CASH_CURRENCY)} من ${selectedAgent?.shopName ?? "الوكيل"}`}
            error={pinError}
            executing={executing}
            onConfirm={(pin) => void executeCash(pin)}
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
  if (step === "review" && quote && amountMinor !== null && selectedAgent) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title={`مراجعة ${CASH_OP_TYPE_LABELS[type]}`} subtitle="راجع التفاصيل قبل التأكيد" />
        <div className="mt-4 space-y-3">
          {/* بطاقة الوكيل */}
          <div className="rounded-2xl border border-[#E8E6E1] bg-white p-4 shadow-[0_2px_8px_rgba(11,11,12,0.04)]">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]">
                <Store strokeWidth={1.5} className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-[#141416]">{selectedAgent.shopName}</p>
                <p dir="ltr" className="text-[12px] font-medium tabular-nums text-[#5C5A56]">
                  {selectedAgent.code}
                </p>
              </div>
              <StatusChip status={selectedAgent.status} />
            </div>
            <p className="mt-2 text-[12.5px] font-medium leading-5 text-[#5C5A56]">
              {selectedAgent.governorate}
              {selectedAgent.district ? ` · ${selectedAgent.district}` : ""}
              {selectedAgent.address ? ` · ${selectedAgent.address}` : ""}
            </p>
          </div>

          <ReviewCard
            title={`تفاصيل ${CASH_OP_TYPE_LABELS[type]}`}
            rows={[
              { label: "المبلغ", value: formatMoney(amountMinor, CASH_CURRENCY) },
              { label: "الرسوم", value: formatMoney(quote.feeMinor, CASH_CURRENCY) },
              {
                label: "الإجمالي",
                value: formatMoney(quote.totalMinor, CASH_CURRENCY),
                strong: true,
              },
              ...(isWithdraw
                ? [
                    {
                      label: "رصيدك المتاح",
                      value: formatMoney(yerWallet?.balanceMinor ?? 0, CASH_CURRENCY),
                      tone:
                        quote.totalMinor > (yerWallet?.balanceMinor ?? 0)
                          ? ("error" as const)
                          : undefined,
                    },
                  ]
                : []),
            ]}
            note={
              isWithdraw
                ? "سيُخصم الإجمالي فوراً ويُجمَّد (Hold) حتى استلام النقد من الوكيل أو انتهاء المهلة (24 ساعة) — والإلغاء يسترده فوراً."
                : "الإيداع مجاني — اذهب للوكيل وقدّم الرمز مع المبلغ نقداً خلال 24 ساعة، ويُضاف الرصيد بعد تأكيد الوكيل."
            }
          />
          <PrimaryActionButton onClick={() => (isWithdraw ? setStep("pin") : void executeCash())}>
            {isWithdraw ? "تأكيد السحب" : "إنشاء طلب الإيداع"}
          </PrimaryActionButton>
          <button
            type="button"
            onClick={() => setStep("amount")}
            className="flex min-h-11 w-full items-center justify-center text-[13px] font-bold text-[#5C5A56] transition-colors hover:text-[#141416]"
          >
            تعديل التفاصيل
          </button>
        </div>
      </div>
    );
  }

  // ===== المبلغ =====
  if (step === "amount") {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader
          title={screenTitle}
          subtitle={`المبلغ ${isWithdraw ? "المطلوب سحبه" : "المودَع"} — باليمني فقط`}
        />

        {/* الوكيل المختار */}
        {selectedAgent ? (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[#C9A227]/30 bg-[#C9A227]/[0.06] p-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#C9A227]">
              <Store strokeWidth={1.5} className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-[#141416]">
                {selectedAgent.shopName}
              </span>
              <span className="block text-[11.5px] font-medium text-[#5C5A56]">
                {selectedAgent.governorate}
                {selectedAgent.district ? ` · ${selectedAgent.district}` : ""}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setStep("agent")}
              className="min-h-11 shrink-0 text-[12px] font-bold text-[#8A6E14] underline underline-offset-4"
            >
              تغيير
            </button>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          <AmountInputField
            value={amountInput}
            currency={CASH_CURRENCY}
            hint={
              amountInput === ""
                ? `المتاح ${formatMoney(yerWallet?.balanceMinor ?? 0, CASH_CURRENCY)}${
                    perTxnLimit
                      ? ` · حد العملية الواحدة ${formatMoney(perTxnLimit.perTxnAmountMinor, CASH_CURRENCY)}`
                      : ""
                  }`
                : undefined
            }
          />
          <AmountPad value={amountInput} onChange={setAmountInput} mode="amount" />
          {formError ? <InlineErrorBanner error={formError} /> : null}
          <PrimaryActionButton
            onClick={() => void fetchQuote()}
            disabled={!selectedAgent || amountMinor === null}
            loading={quoting}
            disabledReason={
              !selectedAgent
                ? "اختر الوكيل أولاً"
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

  // ===== اختيار الوكيل (الخطوة الأولى) =====
  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader
        title={screenTitle}
        subtitle={isWithdraw ? "اختر الوكيل الذي ستسحب منه" : "اختر الوكيل الذي ستودع لديه"}
      />

      <div className="mt-4 space-y-3">
        {/* بحث */}
        <div className="relative">
          <Search
            strokeWidth={1.5}
            className="pointer-events-none absolute right-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#A3A09B]"
          />
          <input
            type="text"
            value={agentSearched}
            onChange={(e) => setAgentSearched(e.target.value.slice(0, 40))}
            placeholder="ابحث باسم المتجر أو الكود أو المديرية…"
            className="min-h-11 w-full rounded-xl border border-[#E8E6E1] bg-white py-2.5 pl-4 pr-11 text-[14px] font-medium text-[#141416] placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:outline-none"
          />
        </div>

        {/* زر الدليل الكامل */}
        <button
          type="button"
          onClick={() => navigate("agents-map", { picker: "cash" })}
          className="flex w-full items-center gap-3 rounded-2xl border border-[#C9A227]/30 bg-[#C9A227]/[0.06] p-3 text-right transition-colors hover:bg-[#C9A227]/[0.12]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#C9A227]">
            <MapPin strokeWidth={1.5} className="h-[18px] w-[18px]" />
          </span>
          <span className="flex-1 text-[13.5px] font-bold text-[#8A6E14]">
            استعراض دليل الوكلاء الكامل (بحث وفلترة محافظة)
          </span>
        </button>

        {/* القائمة المصغرة */}
        {agentsList.loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : agentsList.error ? (
          <ErrorState
            compact
            message={agentsList.error.message}
            code={agentsList.error.code}
            onRetry={agentsList.retry}
          />
        ) : (
          <div className="space-y-2">
            {filteredAgents.length === 0 ? (
              <p className="rounded-2xl border border-[#E8E6E1] bg-white p-5 text-center text-[13px] font-semibold text-[#5C5A56]">
                لا نتائج مطابقة — جرّب كلمة أخرى أو افتح الدليل الكامل.
              </p>
            ) : (
              filteredAgents.map((a) => (
                <AgentPickRow
                  key={a.id}
                  agent={a}
                  highlightGov={myGovernorate ?? undefined}
                  onPick={() => {
                    setAgent(a);
                    setStep("amount");
                  }}
                />
              ))
            )}
          </div>
        )}

        {selectedAgent ? (
          <PrimaryActionButton onClick={() => setStep("amount")}>
            {`المتابعة مع ${selectedAgent.shopName}`}
          </PrimaryActionButton>
        ) : null}
      </div>
    </div>
  );
}

/** صف اختيار وكيل مصغّر */
function AgentPickRow({
  agent,
  highlightGov,
  onPick,
}: {
  agent: AgentView;
  highlightGov?: string;
  onPick: () => void;
}) {
  const suspended = agent.status === "SUSPENDED";
  const inMyGov = highlightGov !== undefined && agent.governorate === highlightGov;
  return (
    <button
      type="button"
      onClick={suspended ? undefined : onPick}
      disabled={suspended}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border bg-white p-3 text-right transition-colors",
        suspended
          ? "cursor-not-allowed border-[#E8E6E1]/70 opacity-60"
          : "border-[#E8E6E1]/70 hover:border-[#C9A227]/40 hover:bg-[#FDFCFA]",
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]">
        <Store strokeWidth={1.5} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14.5px] font-bold text-[#141416]">{agent.shopName}</span>
          {inMyGov ? (
            <span className="shrink-0 rounded-full border border-[#C9A227]/40 bg-[#C9A227]/[0.08] px-1.5 py-px text-[9.5px] font-bold text-[#8A6E14]">
              محافظتك
            </span>
          ) : null}
        </span>
        <span className="block truncate text-[11.5px] font-medium text-[#5C5A56]">
          {agent.governorate}
          {agent.district ? ` · ${agent.district}` : ""}
          {agent.address ? ` · ${agent.address}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span dir="ltr" className="text-[10.5px] font-semibold tabular-nums text-[#A3A09B]">
          {agent.code}
        </span>
        <StatusChip status={agent.status} />
      </span>
    </button>
  );
}
