/**
 * محفظة الجنوب — تتبع الحوالات (SC-17/18)
 * GET /api/remittances → بطاقات (المستلم/المبلغ/الحالة/الرمز/الوكيل/الانتهاء).
 * PENDING: عرض رمز التسليم + زر إلغاء (تأكيد بPIN → R4) مع استرجاع.
 * PAID: الوكيل الدافع والتاريخ. EXPIRED/CANCELLED: إشعار الاسترجاع.
 * تفاصيل قابلة للتوسيع + EmptyState عند الفراغ + Skeleton/ErrorState.
 */

"use client";

import { useState } from "react";
import { Ban, ChevronDown, ChevronUp, Plus, RotateCw } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAppStore } from "@/lib/app-store";
import type { RemittanceView } from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui/api-hooks";
import { EmptyState } from "@/components/app/ui/empty-state";
import { ErrorState } from "@/components/app/ui/error-state";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { StatusChip } from "@/components/app/ui/status-chip";
import { formatDateTime, formatShortDateTime } from "@/components/app/ui/utils";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { BigCodeCard, PinStep, errInfo, timeLeftLabel } from "./money-shared";

export function RemittancesScreen() {
  const refreshMe = useAppStore((s) => s.refreshMe);
  const navigate = useAppStore((s) => s.navigate);

  const list = useApiData<RemittanceView[]>("/api/remittances");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<{ code: string; message: string; lockSeconds?: number } | null>(
    null,
  );

  const cancelTarget = list.data?.find((r) => r.id === cancelId) ?? null;

  /** إلغاء الحوالة (R4) بعد PIN */
  const cancelRemittance = async (pin: string) => {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await api.post(`/api/remittances/${cancelTarget.id}/cancel`, { pin });
      toast({
        title: "تم إلغاء الحوالة",
        description: `استُرد ${formatMoney(cancelTarget.amountMinor, cancelTarget.currency)} لمحفظتك`,
      });
      setCancelId(null);
      list.retry();
      void refreshMe();
    } catch (err) {
      if (err instanceof ApiError && (err.code === "PIN-001" || err.code === "PIN-002")) {
        const secs =
          err.code === "PIN-002" && err.details && typeof err.details.secondsRemaining === "number"
            ? err.details.secondsRemaining
            : undefined;
        setCancelError({ code: err.code, message: err.message, lockSeconds: secs });
      } else {
        setCancelError(errInfo(err));
      }
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader
        title="الحوالات"
        subtitle="تتبّع حوالاتك المرسلة"
        action={
          <button
            type="button"
            onClick={list.retry}
            aria-label="تحديث القائمة"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#E8E6E1] bg-white text-[#5C5A56] transition-colors hover:bg-[#F7F6F2]"
          >
            <RotateCw strokeWidth={1.5} className="h-5 w-5" />
          </button>
        }
      />

      {/* إرسال حوالة جديدة */}
      <button
        type="button"
        onClick={() => navigate("remittance-create")}
        className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-[#C9A227]/30 bg-[#C9A227]/[0.06] p-3.5 text-right transition-colors hover:bg-[#C9A227]/[0.12]"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#C9A227]">
          <Plus strokeWidth={2} className="h-5 w-5" />
        </span>
        <span className="flex-1">
          <span className="block text-[14px] font-bold text-[#141416]">حوالة جديدة</span>
          <span className="block text-[11.5px] font-medium text-[#5C5A56]">
            أرسل نقدياً لمستلم غير مشترك برمز تسليم
          </span>
        </span>
      </button>

      {/* القائمة */}
      <section className="mt-4">
        {list.loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        ) : list.error ? (
          <ErrorState
            message={list.error.message}
            code={list.error.code}
            onRetry={list.retry}
          />
        ) : (list.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="لا حوالات بعد"
            description="أنشئ أول حوالة لتصل الأموال نقداً لمستلم غير مشترك عبر أي وكيل"
            actionLabel="إنشاء حوالة"
            onAction={() => navigate("remittance-create")}
          />
        ) : (
          <div className="space-y-2.5">
            {list.data?.map((rem) => (
              <RemittanceCard
                key={rem.id}
                rem={rem}
                expanded={expandedId === rem.id}
                onToggle={() => setExpandedId(expandedId === rem.id ? null : rem.id)}
                onCancel={() => {
                  setCancelId(rem.id);
                  setCancelError(null);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* PIN إلغاء الحوالة */}
      {cancelTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button
            type="button"
            aria-label="إغلاق"
            onClick={() => setCancelId(null)}
            className="absolute inset-0 bg-[#0B0B0C]/45 backdrop-blur-[2px]"
          />
          <div className="sw-sheet-up relative z-10 max-h-[88vh] w-full max-w-[440px] overflow-y-auto rounded-t-3xl border-t border-[#E8E6E1] bg-[#FAF9F6] p-4 pb-6 shadow-[0_-8px_32px_rgba(11,11,12,0.18)]">
            <style>{`@keyframes sw-sheet-up { from { transform: translateY(48px); opacity: 0.6; } to { transform: translateY(0); opacity: 1; } } .sw-sheet-up { animation: sw-sheet-up 260ms cubic-bezier(0.22, 1, 0.36, 1) both; }`}</style>
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#E8E6E1]" />
            <h3 className="mb-1 text-center text-[17px] font-bold text-[#141416]">
              إلغاء الحوالة {cancelTarget.ref}
            </h3>
            <p className="mb-3 text-center text-[12.5px] font-medium leading-5 text-[#5C5A56]">
              سيُسترد {formatMoney(cancelTarget.amountMinor + cancelTarget.feeMinor, cancelTarget.currency)}{" "}
              إلى محفظتك. هذا الإجراء لا يمكن التراجع عنه.
            </p>
            <PinStep
              contextLabel={`تأكيد إلغاء حوالة ${formatMoney(cancelTarget.amountMinor, cancelTarget.currency)}`}
              error={cancelError}
              executing={cancelling}
              onConfirm={(pin) => void cancelRemittance(pin)}
              onCancel={() => setCancelId(null)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** بطاقة حوالة واحدة قابلة للتوسيع */
function RemittanceCard({
  rem,
  expanded,
  onToggle,
  onCancel,
}: {
  rem: RemittanceView;
  expanded: boolean;
  onToggle: () => void;
  onCancel: () => void;
}) {
  const pending = rem.status === "PENDING";
  const refunded = rem.status === "EXPIRED" || rem.status === "CANCELLED";

  return (
    <article
      className={cn(
        "w-full overflow-hidden rounded-2xl border bg-white shadow-[0_2px_8px_rgba(11,11,12,0.04)] transition-colors",
        pending ? "border-[#B45309]/25" : "border-[#E8E6E1]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3.5 text-right"
        aria-expanded={expanded}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-bold text-[#141416]">{rem.receiverName}</span>
            <StatusChip status={rem.status} />
          </span>
          <span dir="ltr" className="mt-0.5 block text-[12px] font-medium tabular-nums text-[#5C5A56]">
            {rem.receiverPhone}
          </span>
          <span className="mt-0.5 block text-[11px] font-medium text-[#A3A09B]">
            {formatShortDateTime(rem.createdAt)} · {rem.ref}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span dir="ltr" className="text-[16px] font-extrabold tabular-nums text-[#141416]">
            {formatMoney(rem.amountMinor, rem.currency)}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-[#A3A09B]">
            {expanded ? "إخفاء" : "التفاصيل"}
            {expanded ? (
              <ChevronUp strokeWidth={1.5} className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown strokeWidth={1.5} className="h-3.5 w-3.5" />
            )}
          </span>
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-[#E8E6E1]/70 p-3.5">
          {/* رمز التسليم — للمعلقة فقط */}
          {pending && rem.deliveryCode ? (
            <div className="mb-3">
              <BigCodeCard
                code={rem.deliveryCode}
                title="رمز تسليم الحوالة"
                warning="لا تشارك الرمز إلا مع المستلم — يعمل مرة واحدة لدى الوكيل"
                expiryIso={rem.expiresAt}
                showQr
              />
            </div>
          ) : null}

          <dl className="divide-y divide-[#E8E6E1]/70">
            <Row label="المرجع" value={rem.ref} ltr />
            <Row label="المبلغ" value={formatMoney(rem.amountMinor, rem.currency)} />
            <Row label="الرسوم" value={formatMoney(rem.feeMinor, rem.currency)} />
            <Row label="تاريخ الإنشاء" value={formatDateTime(rem.createdAt)} />
            <Row label="تنتهي في" value={formatDateTime(rem.expiresAt)} />
            {rem.status === "PAID" ? (
              <>
                <Row label="الوكيل الدافع" value={rem.payingAgentName ?? "—"} />
                <Row label="تاريخ التسليم" value={rem.paidAt ? formatDateTime(rem.paidAt) : "—"} />
              </>
            ) : null}
            {pending && timeLeftLabel(rem.expiresAt) !== null ? (
              <Row label="المتبقي" value={timeLeftLabel(rem.expiresAt) ?? "—"} />
            ) : null}
          </dl>

          {refunded ? (
            <p className="mt-3 rounded-xl bg-[#F7F6F2] px-3 py-2.5 text-[12.5px] font-semibold leading-5 text-[#5C5A56]">
              {rem.status === "EXPIRED"
                ? "انتهت صلاحية الحوالة — استُرد المبلغ تلقائياً إلى محفظتك"
                : "الحوالة ملغاة — استُرد المبلغ إلى محفظتك"}
            </p>
          ) : null}

          {pending ? (
            <button
              type="button"
              onClick={onCancel}
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#B91C1C]/30 bg-[#B91C1C]/[0.05] px-4 text-[14px] font-bold text-[#B91C1C] transition-colors hover:bg-[#B91C1C]/[0.1]"
            >
              <Ban strokeWidth={1.5} className="h-4 w-4" />
              إلغاء الحوالة واسترداد المبلغ
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/** صف تفاصيل صغير */
function Row({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="shrink-0 text-[12.5px] font-medium text-[#5C5A56]">{label}</dt>
      <dd
        dir={ltr ? "ltr" : "auto"}
        className="min-w-0 text-right text-[13px] font-semibold tabular-nums text-[#141416]"
      >
        {value}
      </dd>
    </div>
  );
}
