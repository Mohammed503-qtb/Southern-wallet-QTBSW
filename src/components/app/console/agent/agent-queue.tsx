/**
 * محفظة الجنوب — طابور عمليات الوكيل (G2 + G3 + G4) — 8-d
 * (أ) طلباتي المعلقة: بطاقات (النوع/العميل/هاتفه/المبلغ/الرمز مخفي بعين/الانتهاء)
 *     + زر «إتمام العملية» يفتح حوار إدخال الرمز → G3 (cashOpId+code) مع
 *     عرض واضح لأخطاء CWD-001/002/003.
 * (ب) دفع حوالة: حقل «رمز التسليم» + تحقق → G4 (بلا confirm) يعرض تفاصيل
 *     الحوالة ثم زر «تأكيد الدفع النقدي» (confirm:true) → نجاح.
 * + قسم «آخر ما أُتم اليوم» (G2 يعيد المعلقة فقط → نعرض عمولات اليوم كنشاط).
 */
"use client";

import { useState } from "react";
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  Eye,
  EyeOff,
  HandCoins,
  Send,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import type {
  AgentQueueItem,
  CashOperationView,
  CommissionListView,
  RemittancePayPreviewView,
  RemittanceView,
} from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { useApiData, formatDateTime } from "@/components/app/ui";
import { toastSuccess } from "../console-hooks";
import { useActionRunner } from "../console-hooks";
import { CodeInputDialog } from "../confirm-dialog";
import { ConsoleButton, ConsoleCard, MoneyText, SectionHeader, Skeleton } from "../console-ui";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<string, string> = {
  CASH_DEPOSIT: "إيداع نقدي",
  CASH_WITHDRAW: "سحب نقدي",
};

/** بطاقة طلب معلق في طابور الوكيل */
function QueueRequestCard({
  item,
  onComplete,
}: {
  item: AgentQueueItem;
  onComplete: (item: AgentQueueItem) => void;
}) {
  const [codeVisible, setCodeVisible] = useState(false);
  const isDeposit = item.kind === "CASH_DEPOSIT";
  return (
    <ConsoleCard className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0EEE9] pb-2.5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl",
              isDeposit ? "bg-[#15803D]/10 text-[#15803D]" : "bg-[#B91C1C]/10 text-[#B91C1C]",
            )}
          >
            <Banknote strokeWidth={1.6} className="h-4.5 w-4.5" />
          </span>
          <div>
            <p className="text-[14.5px] font-extrabold text-[#141416]">{KIND_LABELS[item.kind]}</p>
            <p dir="ltr" className="text-right text-[11.5px] tabular-nums text-[#8A8783]">{item.ref}</p>
          </div>
        </div>
        <MoneyText minor={item.amountMinor} currency={item.currency} className="text-[15px]" />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <p className="flex items-center gap-1 text-[11px] font-semibold text-[#8A8783]">
            <UserRound strokeWidth={1.6} className="h-3.5 w-3.5" />
            العميل
          </p>
          <p className="text-[13.5px] font-bold text-[#141416]">{item.userName}</p>
          <p dir="ltr" className="text-right text-[12px] tabular-nums text-[#8A8783]">{item.userPhone}</p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-[11px] font-semibold text-[#8A8783]">
            <CalendarClock strokeWidth={1.6} className="h-3.5 w-3.5" />
            الانتهاء
          </p>
          <p className="text-[12.5px] font-semibold text-[#5C5A56]">{formatDateTime(item.expiresAt)}</p>
        </div>
      </div>

      {/* الرمز مخفي بوضع عين — الرمز لدى العميل (G2 لا يعيده للوكيل أمنياً) */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#E8E6E1] bg-[#FAF9F6] px-3.5 py-2">
        <span className="text-[11.5px] font-semibold text-[#8A8783]">رمز العملية</span>
        <span className="flex items-center gap-2">
          {codeVisible ? (
            <span className="text-[12px] font-bold text-[#8A6E14]">يُطلب من العميل عند الإتمام</span>
          ) : (
            <span dir="ltr" className="text-[14px] font-extrabold tracking-[0.2em] tabular-nums text-[#8A8783]">
              ••••••
            </span>
          )}
          <button
            type="button"
            onClick={() => setCodeVisible((v) => !v)}
            title={codeVisible ? "إخفاء" : "إظهار"}
            aria-label={codeVisible ? "إخفاء بيانات الرمز" : "إظهار بيانات الرمز"}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8E6E1] bg-white text-[#5C5A56] transition-colors hover:border-[#C9A227]/60 hover:text-[#8A6E14]"
          >
            {codeVisible ? <EyeOff strokeWidth={1.6} className="h-4 w-4" /> : <Eye strokeWidth={1.6} className="h-4 w-4" />}
          </button>
        </span>
      </div>

      <div className="mt-auto flex flex-row-reverse justify-start border-t border-[#F0EEE9] pt-3">
        <ConsoleButton variant="gold" onClick={() => onComplete(item)}>
          <CheckCircle2 strokeWidth={1.6} className="h-4 w-4" />
          إتمام العملية
        </ConsoleButton>
      </div>
    </ConsoleCard>
  );
}

export function AgentQueue() {
  const queue = useApiData<AgentQueueItem[]>("/api/agent/queue");
  const commissions = useApiData<CommissionListView>("/api/agent/commissions");

  // G3 — إتمام عملية نقدية
  const [completing, setCompleting] = useState<AgentQueueItem | null>(null);
  const completeRunner = useActionRunner();

  const submitComplete = async (code: string) => {
    if (!completing) return;
    const result = await completeRunner.run(() =>
      api.post<CashOperationView>("/api/agent/cash/complete", {
        cashOpId: completing.id,
        code,
      }),
    );
    if (result.ok) {
      toastSuccess(
        `أُتمت ${KIND_LABELS[completing.kind]} ${result.value.ref}`,
        "العمولة سُجّلت تلقائياً — العميل أُشعر فوراً.",
      );
      setCompleting(null);
      queue.retry();
      commissions.retry();
    }
  };

  // G4 — دفع حوالة برمز التسليم
  const [deliveryCode, setDeliveryCode] = useState("");
  const [preview, setPreview] = useState<RemittancePayPreviewView | null>(null);
  const [paid, setPaid] = useState<RemittanceView | null>(null);
  const payRunner = useActionRunner();
  const [payError, setPayError] = useState<{ message: string; code: string } | null>(null);

  const verifyCode = async () => {
    const code = deliveryCode.trim();
    if (!code) return;
    setPayError(null);
    setPaid(null);
    setPreview(null);
    const result = await payRunner.run(() =>
      api.post<RemittancePayPreviewView>("/api/agent/remittance/pay", { deliveryCode: code }),
    );
    if (result.ok) setPreview(result.value);
    else setPayError({ message: result.error.message, code: result.error.code });
  };

  const confirmPay = async () => {
    const code = deliveryCode.trim();
    if (!code || !preview) return;
    setPayError(null);
    const result = await payRunner.run(() =>
      api.post<{ remittance: RemittanceView }>("/api/agent/remittance/pay", {
        deliveryCode: code,
        confirm: true,
      }),
    );
    if (result.ok) {
      setPaid(result.value.remittance);
      setPreview(null);
      toastSuccess(
        `سُلّمت الحوالة ${result.value.remittance.ref}`,
        "سُجّلت عمولتك وخصم المبلغ من عومك — المرسل أُشعر فوراً.",
      );
      setDeliveryCode("");
      queue.retry();
      commissions.retry();
    } else {
      setPayError({ message: result.error.message, code: result.error.code });
    }
  };

  // نشاط اليوم من العمولات
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCommissions = (commissions.data?.items ?? []).filter(
    (entry) => new Date(entry.createdAt) >= todayStart,
  );

  const COMMISSION_LABELS: Record<string, string> = {
    CASH_IN: "عمولة إيداع",
    WITHDRAW: "عمولة سحب",
    REMITTANCE: "عمولة تسليم حوالة",
  };

  return (
    <div className="relative flex flex-col gap-5">
      <SectionHeader
        title="طابور العمليات"
        description="إتمام الإيداعات والسحوبات المعلقة لديك ودفع الحوالات برمز التسليم"
        onRefresh={queue.retry}
        refreshing={queue.loading}
      />

      {/* (أ) طلباتي المعلقة */}
      <section className="flex flex-col gap-3">
        <h3 className="flex items-center gap-2 text-[15px] font-extrabold text-[#0B0B0C]">
          <HandCoins strokeWidth={1.6} className="h-4 w-4 text-[#C9A227]" />
          طلباتي المعلقة
          {queue.data ? (
            <span className="rounded-full bg-[#F1EFEA] px-2 py-px text-[11px] font-bold tabular-nums text-[#8A8783]">
              {queue.data.length}
            </span>
          ) : null}
        </h3>

        {queue.loading && !queue.data ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-[220px]" />
            ))}
          </div>
        ) : null}

        {queue.error && !queue.data ? (
          <ConsoleCard className="p-6">
            <p className="text-center text-[14px] font-semibold text-[#B91C1C]">
              {queue.error.message}
              <span dir="ltr" className="ms-2 text-[11px] text-[#A3A09B]">{queue.error.code}</span>
            </p>
            <div className="mt-4 flex justify-center">
              <ConsoleButton onClick={queue.retry}>إعادة المحاولة</ConsoleButton>
            </div>
          </ConsoleCard>
        ) : null}

        {queue.data && queue.data.length === 0 ? (
          <ConsoleCard className="p-8 text-center">
            <p className="text-[15px] font-bold text-[#141416]">لا طلبات معلقة لديك</p>
            <p className="mt-1 text-[13px] font-medium text-[#5C5A56]">
              ستظهر هنا طلبات الإيداع والسحب التي يطلبها العملاء من وكالتك فور إنشائها.
            </p>
          </ConsoleCard>
        ) : null}

        {queue.data && queue.data.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {queue.data.map((item) => (
              <QueueRequestCard key={item.id} item={item} onComplete={setCompleting} />
            ))}
          </div>
        ) : null}
      </section>

      {/* (ب) دفع حوالة برمز التسليم */}
      <section className="flex flex-col gap-3">
        <h3 className="flex items-center gap-2 text-[15px] font-extrabold text-[#0B0B0C]">
          <Send strokeWidth={1.6} className="h-4 w-4 text-[#C9A227]" />
          دفع حوالة برمز التسليم
        </h3>

        <ConsoleCard className="flex flex-col gap-3 p-4">
          <p className="text-[12.5px] font-medium leading-6 text-[#5C5A56]">
            أدخل رمز التسليم الذي أعطاه المرسل للمستلم — تحقق من التفاصيل قبل تسليم النقد.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-11 min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-[#E8E6E1] bg-white px-3.5 transition-colors focus-within:border-[#C9A227]/70">
              <span className="shrink-0 text-[12px] font-semibold text-[#8A8783]">رمز التسليم</span>
              <input
                dir="ltr"
                inputMode="numeric"
                value={deliveryCode}
                onChange={(e) => setDeliveryCode(e.target.value.replace(/[^\d]/g, "").slice(0, 8))}
                placeholder="— — — — — —"
                className="min-w-0 flex-1 bg-transparent text-center text-[17px] font-extrabold tracking-[0.25em] tabular-nums text-[#141416] outline-none placeholder:text-[#A3A09B]"
              />
            </label>
            <ConsoleButton variant="primary" onClick={() => void verifyCode()} loading={payRunner.busy && !preview} disabled={deliveryCode.trim().length === 0}>
              تحقق
            </ConsoleButton>
          </div>

          {payError ? (
            <div className="rounded-xl border border-[#B91C1C]/25 bg-[#B91C1C]/[0.06] px-3.5 py-2.5 text-[13px] font-semibold leading-6 text-[#B91C1C]">
              {payError.message}
              <span dir="ltr" className="ms-2 text-[11px] tabular-nums opacity-80">{payError.code}</span>
            </div>
          ) : null}

          {/* تفاصيل الحوالة قبل التأكيد (G4 مرحلة 1) */}
          {preview ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-[#C9A227]/40 bg-[#C9A227]/[0.06] p-4">
              <div className="flex items-center justify-between gap-2 border-b border-[#C9A227]/25 pb-2.5">
                <span dir="ltr" className="text-[13px] font-bold tabular-nums tracking-wide text-[#8A6E14]">
                  {preview.ref}
                </span>
                <span className="text-[11.5px] font-semibold text-[#705908]">
                  بانتظار تأكيد الدفع النقدي
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] font-semibold text-[#8A8783]">المرسل</p>
                  <p className="text-[13.5px] font-bold text-[#141416]">{preview.senderName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#8A8783]">المستلم</p>
                  <p className="text-[13.5px] font-bold text-[#141416]">{preview.receiverName}</p>
                  <p dir="ltr" className="text-right text-[12px] tabular-nums text-[#8A8783]">{preview.receiverPhone}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#8A8783]">المبلغ المسلَّم</p>
                  <MoneyText minor={preview.amountMinor} currency={preview.currency} className="text-[16px] text-[#8A6E14]" />
                  <p className="text-[11.5px] text-[#8A8783]">رسوم: {formatMoney(preview.feeMinor, preview.currency)}</p>
                </div>
              </div>
              <div className="flex flex-row-reverse items-center justify-between gap-2">
                <ConsoleButton variant="gold" onClick={() => void confirmPay()} loading={payRunner.busy && !!preview}>
                  <CheckCircle2 strokeWidth={1.6} className="h-4 w-4" />
                  تأكيد الدفع النقدي
                </ConsoleButton>
                <p className="text-[12px] font-semibold text-[#705908]">
                  ينتهي سريان الرمز: {formatDateTime(preview.expiresAt)}
                </p>
              </div>
            </div>
          ) : null}

          {/* نجاح الدفع */}
          {paid ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-[#15803D]/30 bg-[#15803D]/[0.06] p-4">
              <p className="flex items-center gap-2 text-[14px] font-extrabold text-[#15803D]">
                <CheckCircle2 strokeWidth={1.75} className="h-5 w-5" />
                سُلّمت الحوالة بنجاح
              </p>
              <p className="text-[13px] font-medium leading-6 text-[#5C5A56]">
                <span dir="ltr" className="font-bold tabular-nums text-[#8A6E14]">{paid.ref}</span> ·{" "}
                {formatMoney(paid.amountMinor, paid.currency)} إلى {paid.receiverName}
                {paid.payingAgentName ? ` — عبر ${paid.payingAgentName}` : ""} · سُجّلت عمولتك تلقائياً.
              </p>
            </div>
          ) : null}
        </ConsoleCard>
      </section>

      {/* آخر ما أُتم اليوم (عمولات كنشاط — G2 يعيد المعلقة فقط) */}
      <section className="flex flex-col gap-3">
        <h3 className="flex items-center gap-2 text-[15px] font-extrabold text-[#0B0B0C]">
          <CalendarClock strokeWidth={1.6} className="h-4 w-4 text-[#C9A227]" />
          آخر ما أُتم اليوم
        </h3>
        <ConsoleCard className="p-4">
          {commissions.loading && !commissions.data ? (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : todayCommissions.length === 0 ? (
            <p className="py-4 text-center text-[13px] font-medium text-[#A3A09B]">
              لا عمليات مكتملة اليوم بعد — ستظهر عمولات اليوم هنا كنشاط.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[#F0EEE9]">
              {todayCommissions.slice(0, 8).map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#C9A227]/12 text-[#C9A227]">
                      <HandCoins strokeWidth={1.6} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-[#141416]">
                        {COMMISSION_LABELS[entry.opType] ?? entry.opType}
                      </p>
                      <p dir="ltr" className="text-right text-[11px] tabular-nums text-[#8A8783]">{entry.sourceRef}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-[13.5px] font-extrabold tabular-nums text-[#8A6E14]">
                      + {formatMoney(entry.amountMinor, "YER")}
                    </p>
                    <p className="text-[11px] text-[#A3A09B]">{formatDateTime(entry.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ConsoleCard>
      </section>

      {/* حوار إدخال رمز إتمام العملية (G3) */}
      <CodeInputDialog
        open={completing !== null}
        title={completing ? `إتمام ${KIND_LABELS[completing.kind]}` : ""}
        description={
          completing
            ? `العميل: ${completing.userName} · ${completing.userPhone} — المبلغ: ${formatMoney(
                completing.amountMinor,
                completing.currency,
              )}. أدخل رمز العملية الذي قدّمه العميل لإتمام ${KIND_LABELS[completing.kind]} وتسجيل عمولتك.`
            : null
        }
        inputLabel="رمز العملية (من العميل)"
        placeholder="— — — — — —"
        confirmLabel="تنفيذ الإتمام"
        busy={completeRunner.busy}
        error={completeRunner.error}
        onConfirm={(code) => void submitComplete(code)}
        onCancel={() => {
          completeRunner.setError(null);
          setCompleting(null);
        }}
      />
    </div>
  );
}
