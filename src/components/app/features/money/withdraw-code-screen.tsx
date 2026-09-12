/**
 * محفظة الجنوب — رمز السحب (SC-24)
 * يقرأ params (id أو ref) → GET /api/cash → بطاقة رمز كبيرة (6 خانات)
 * + انتهاء الصلاحية + الحالة + بيانات الوكيل + زر إلغاء (C6) بتأكيد مزدوج.
 * يعمل مع عمليات السحب والإيداع المعلقة على حد سواء (نفس الدلالة).
 */

"use client";

import { useState } from "react";
import { Ban, MapPin, RotateCw, Store } from "lucide-react";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/app-store";
import type { CashOperationView } from "@/lib/api-types";
import { CASH_OP_TYPE_LABELS, formatMoney } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui/api-hooks";
import { ErrorState } from "@/components/app/ui/error-state";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { StatusChip } from "@/components/app/ui/status-chip";
import { formatDateTime } from "@/components/app/ui/utils";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { BigCodeCard, errInfo, timeLeftLabel } from "./money-shared";

export function WithdrawCodeScreen() {
  const params = useAppStore((s) => s.params);
  const refreshMe = useAppStore((s) => s.refreshMe);
  const back = useAppStore((s) => s.back);
  const resetTo = useAppStore((s) => s.resetTo);

  const cash = useApiData<CashOperationView[]>("/api/cash");

  const [confirmStage, setConfirmStage] = useState<"idle" | "confirm" | "cancelling">("idle");
  const [cancelError, setCancelError] = useState<{ code: string; message: string } | null>(null);

  const ops = cash.data ?? [];
  const op =
    (params.id && ops.find((o) => o.id === params.id)) ||
    (params.ref && ops.find((o) => o.ref === params.ref)) ||
    (params.code && ops.find((o) => o.code === params.code)) ||
    null;

  /** إلغاء الطلب (C6) — بدون PIN وفق العقد */
  const cancelOp = async () => {
    if (!op) return;
    setConfirmStage("cancelling");
    setCancelError(null);
    try {
      await api.post(`/api/cash/${op.id}/cancel`, {});
      toast({
        title: "تم إلغاء الطلب",
        description:
          op.type === "WITHDRAW"
            ? `استُرد ${formatMoney(op.amountMinor + op.feeMinor, op.currency)} إلى محفظتك`
            : "أُلغي طلب الإيداع",
      });
      setConfirmStage("idle");
      cash.retry();
      void refreshMe();
    } catch (err) {
      setCancelError(errInfo(err));
      setConfirmStage("confirm");
    }
  };

  const title = op?.type === "DEPOSIT" ? "رمز الإيداع" : "رمز السحب";

  // ===== تحميل =====
  if (cash.loading) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="رمز السحب" />
        <Skeleton className="mt-4 h-44 w-full rounded-2xl" />
        <Skeleton className="mt-3 h-24 w-full rounded-2xl" />
        <Skeleton className="mt-3 h-16 w-full rounded-2xl" />
      </div>
    );
  }

  // ===== خطأ =====
  if (cash.error) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="رمز السحب" />
        <div className="mt-6">
          <ErrorState message={cash.error.message} code={cash.error.code} onRetry={cash.retry} />
        </div>
      </div>
    );
  }

  // ===== غير موجودة =====
  if (!op) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="رمز السحب" />
        <div className="mt-6">
          <ErrorState
            message="لم يتم العثور على العملية المطلوبة — قد تكون أُنشئت من جهاز آخر أو حُذفت."
            code="CASH-NOT-FOUND"
            onRetry={cash.retry}
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

  const pending = op.status === "PENDING";

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader
        title={title}
        subtitle={`${CASH_OP_TYPE_LABELS[op.type]} · ${op.ref}`}
        action={
          <button
            type="button"
            onClick={cash.retry}
            aria-label="تحديث الحالة"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#E8E6E1] bg-white text-[#5C5A56] transition-colors hover:bg-[#F7F6F2]"
          >
            <RotateCw strokeWidth={1.5} className="h-5 w-5" />
          </button>
        }
      />

      <div className="mt-4 space-y-3">
        {/* بطاقة الرمز */}
        {op.code && pending ? (
          <BigCodeCard
            code={op.code}
            title={op.type === "DEPOSIT" ? "رمز الإيداع" : "رمز السحب النقدي"}
            warning={
              op.type === "DEPOSIT"
                ? "قدّم هذا الرمز مع المبلغ نقداً للوكيل خلال مدة الصلاحية"
                : "قدّم هذا الرمز لهوية موثقة لدى الوكيل لاستلام النقد"
            }
            expiryIso={op.expiresAt}
            showQr
          />
        ) : (
          <div className="rounded-2xl border border-[#E8E6E1] bg-white p-5 text-center shadow-[0_2px_8px_rgba(11,11,12,0.04)]">
            <span className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]">
              <Ban strokeWidth={1.5} className="h-6 w-6" />
            </span>
            <p className="text-[15px] font-bold text-[#141416]">
              {op.status === "COMPLETED"
                ? "تمت العملية بنجاح"
                : op.status === "CANCELLED"
                  ? "الطلب ملغى"
                  : op.status === "EXPIRED"
                    ? "انتهت صلاحية الطلب"
                    : "الرمز غير متاح"}
            </p>
            {op.status !== "COMPLETED" ? (
              <p className="mt-1 text-[12.5px] font-medium leading-5 text-[#5C5A56]">
                {op.type === "WITHDRAW"
                  ? "استُرد المبلغ المجمَّد إلى محفظتك"
                  : "لم يعد الرمز صالحاً للاستخدام"}
              </p>
            ) : (
              <p className="mt-1 text-[12.5px] font-medium leading-5 text-[#5C5A56]">
                {op.processedAt ? formatDateTime(op.processedAt) : ""}
              </p>
            )}
          </div>
        )}

        {/* الملخص */}
        <div className="rounded-2xl border border-[#E8E6E1] bg-white p-4 shadow-[0_2px_8px_rgba(11,11,12,0.04)]">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[14px] font-bold text-[#141416]">تفاصيل الطلب</h3>
            <StatusChip status={op.status} />
          </div>
          <dl className="divide-y divide-[#E8E6E1]/70">
            <SummaryRow label="النوع" value={CASH_OP_TYPE_LABELS[op.type]} />
            <SummaryRow label="المبلغ" value={formatMoney(op.amountMinor, op.currency)} />
            <SummaryRow label="الرسوم" value={formatMoney(op.feeMinor, op.currency)} />
            <SummaryRow
              label="الإجمالي"
              value={formatMoney(op.amountMinor + op.feeMinor, op.currency)}
              strong
            />
            <SummaryRow label="المرجع" value={op.ref} ltr />
            <SummaryRow label="تاريخ الطلب" value={formatDateTime(op.createdAt)} />
            {pending ? (
              <SummaryRow
                label="ينتهي في"
                value={`${formatDateTime(op.expiresAt)}${timeLeftLabel(op.expiresAt) ? ` (متبقٍ ${timeLeftLabel(op.expiresAt)})` : ""}`}
              />
            ) : (
              <SummaryRow
                label="وقت المعالجة"
                value={op.processedAt ? formatDateTime(op.processedAt) : "—"}
              />
            )}
          </dl>
          {op.type === "WITHDRAW" && pending ? (
            <p className="mt-3 rounded-xl bg-[#F7F6F2] px-3 py-2.5 text-[12px] font-semibold leading-5 text-[#5C5A56]">
              المبلغ مجمَّد (Hold) في محفظتك حتى تسليمه للوكيل أو انتهاء الصلاحية — لن يختفي بصمت.
            </p>
          ) : null}
        </div>

        {/* بيانات الوكيل */}
        <div className="rounded-2xl border border-[#E8E6E1] bg-white p-4 shadow-[0_2px_8px_rgba(11,11,12,0.04)]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]">
              <Store strokeWidth={1.5} className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-[#141416]">{op.agentShop}</p>
              <p dir="ltr" className="text-[12px] font-medium tabular-nums text-[#5C5A56]">
                {op.agentCode}
              </p>
            </div>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-[#5C5A56]">
            <MapPin strokeWidth={1.5} className="h-4 w-4 shrink-0 text-[#A3A09B]" />
            <span className="flex-1">اذهب إلى هذا الوكيل لإنجاز العملية خلال مدة الصلاحية</span>
          </p>
        </div>

        {/* إلغاء بتأكيد مزدوج */}
        {pending ? (
          confirmStage === "idle" ? (
            <button
              type="button"
              onClick={() => setConfirmStage("confirm")}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-[#B91C1C]/30 bg-[#B91C1C]/[0.05] px-4 text-[15px] font-bold text-[#B91C1C] transition-colors hover:bg-[#B91C1C]/[0.1]"
            >
              <Ban strokeWidth={1.5} className="h-4 w-4" />
              إلغاء الطلب
            </button>
          ) : (
            <div className="rounded-2xl border border-[#B91C1C]/30 bg-[#B91C1C]/[0.04] p-4">
              <p className="text-center text-[13.5px] font-bold leading-6 text-[#B91C1C]">
                {op.type === "WITHDRAW"
                  ? `سيُلغى طلب السحب ويُسترد ${formatMoney(op.amountMinor + op.feeMinor, op.currency)} إلى محفظتك. هل أنت متأكد؟`
                  : "سيُلغى طلب الإيداع نهائياً. هل أنت متأكد؟"}
              </p>
              {cancelError ? (
                <p className="mt-2 text-center text-[12px] font-semibold text-[#B91C1C]">
                  {cancelError.message}{" "}
                  <span dir="ltr" className="tabular-nums">({cancelError.code})</span>
                </p>
              ) : null}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void cancelOp()}
                  disabled={confirmStage === "cancelling"}
                  className={cn(
                    "flex min-h-11 items-center justify-center rounded-xl bg-[#B91C1C] px-4 text-[14px] font-bold text-white transition-colors hover:bg-[#991B1B] disabled:opacity-60",
                  )}
                >
                  {confirmStage === "cancelling" ? "جارٍ الإلغاء…" : "نعم، إلغاء نهائي"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmStage("idle")}
                  disabled={confirmStage === "cancelling"}
                  className="flex min-h-11 items-center justify-center rounded-xl border border-[#E8E6E1] bg-white px-4 text-[14px] font-bold text-[#5C5A56] transition-colors hover:bg-[#F7F6F2]"
                >
                  تراجع
                </button>
              </div>
            </div>
          )
        ) : null}

        <button
          type="button"
          onClick={() => back()}
          className="flex min-h-11 w-full items-center justify-center text-[13px] font-bold text-[#5C5A56] hover:text-[#141416]"
        >
          رجوع
        </button>
      </div>
    </div>
  );
}

/** صف ملخص صغير */
function SummaryRow({
  label,
  value,
  strong = false,
  ltr = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  ltr?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="shrink-0 text-[12.5px] font-medium text-[#5C5A56]">{label}</dt>
      <dd
        dir={ltr ? "ltr" : "auto"}
        className={cn(
          "min-w-0 text-right tabular-nums text-[#141416]",
          strong ? "text-[15px] font-extrabold" : "text-[13px] font-semibold",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
