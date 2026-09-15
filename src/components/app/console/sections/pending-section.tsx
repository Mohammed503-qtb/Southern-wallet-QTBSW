/**
 * محفظة الجنوب — قسم المعلّق (M14 + M15) — ADMIN فقط
 * قسمان: حوالات PENDING (بطاقات مع زر «إلغاء واسترجاع») وعمليات نقدية
 * PENDING (كذلك) — الإلغاء الإداري (M15) يسترجع المبالغ للعملاء ويفتح
 * ReasonDialog بسبب إلزامي (يُسجَّل في التدقيق ويُشعر العميل).
 */
"use client";

import { useState } from "react";
import { Ban, Banknote, Send } from "lucide-react";
import { api } from "@/lib/api";
import type { AdminPendingView, CashOperationView, RemittanceView } from "@/lib/api-types";
import { CASH_OP_TYPE_LABELS, formatMoney } from "@/lib/api-types";
import { formatDateTime, useApiData, StatusChip } from "@/components/app/ui";
import { toastSuccess } from "../console-hooks";
import { useActionRunner } from "../console-hooks";
import { ReasonDialog } from "../confirm-dialog";
import { ConsoleButton, ConsoleCard, MoneyText, SectionHeader } from "../console-ui";

type PendingTarget =
  | { kind: "remittance"; view: RemittanceView }
  | { kind: "cash"; view: CashOperationView };

export function PendingSection() {
  const { data, loading, error, retry } = useApiData<AdminPendingView>("/api/admin/pending");
  const [target, setTarget] = useState<PendingTarget | null>(null);
  const runner = useActionRunner();

  const submitCancel = async (reason: string) => {
    if (!target) return;
    const path =
      target.kind === "remittance"
        ? `/api/admin/pending/remittance/${target.view.id}/cancel`
        : `/api/admin/pending/cash/${target.view.id}/cancel`;
    const result = await runner.run(() => api.post(path, { reason }));
    if (!result.ok) return;
    toastSuccess(
      target.kind === "remittance" ? `أُلغيت الحوالة ${target.view.ref} واستُرجع مبلغها` : `أُلغيت العملية ${target.view.ref}`,
      `السبب المسجَّل: ${reason}`,
    );
    setTarget(null);
    retry();
  };

  const renderRemittanceCard = (rem: RemittanceView) => (
    <ConsoleCard key={rem.id} className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0EEE9] pb-2.5">
        <span dir="ltr" className="text-[13px] font-bold tabular-nums tracking-wide text-[#8A6E14]">
          {rem.ref}
        </span>
        <StatusChip status={rem.status} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <p className="text-[11px] font-semibold text-[#8A8783]">المستلم</p>
          <p className="text-[14px] font-bold text-[#141416]">{rem.receiverName}</p>
          <p dir="ltr" className="text-right text-[12px] tabular-nums text-[#8A8783]">{rem.receiverPhone}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#8A8783]">المبلغ</p>
          <MoneyText minor={rem.amountMinor} currency={rem.currency} className="text-[15px]" />
          <p className="text-[11.5px] text-[#8A8783]">رسوم: {formatMoney(rem.feeMinor, rem.currency)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#8A8783]">الانتهاء</p>
          <p className="text-[12.5px] font-semibold text-[#5C5A56]">{formatDateTime(rem.expiresAt)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#8A8783]">الإنشاء</p>
          <p className="text-[12.5px] font-semibold text-[#5C5A56]">{formatDateTime(rem.createdAt)}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-row-reverse justify-start border-t border-[#F0EEE9] pt-3">
        <ConsoleButton variant="danger" size="sm" onClick={() => setTarget({ kind: "remittance", view: rem })}>
          <Ban strokeWidth={1.6} className="h-3.5 w-3.5" />
          إلغاء واسترجاع
        </ConsoleButton>
      </div>
    </ConsoleCard>
  );

  const renderCashCard = (op: CashOperationView) => (
    <ConsoleCard key={op.id} className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0EEE9] pb-2.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={
              op.type === "DEPOSIT"
                ? "flex h-8 w-8 items-center justify-center rounded-xl bg-[#15803D]/10 text-[#15803D]"
                : "flex h-8 w-8 items-center justify-center rounded-xl bg-[#B91C1C]/10 text-[#B91C1C]"
            }
          >
            <Banknote strokeWidth={1.6} className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[14px] font-bold text-[#141416]">{CASH_OP_TYPE_LABELS[op.type]}</p>
            <p dir="ltr" className="text-right text-[11.5px] tabular-nums text-[#8A8783]">{op.ref}</p>
          </div>
        </div>
        <StatusChip status={op.status} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <p className="text-[11px] font-semibold text-[#8A8783]">الوكيل</p>
          <p className="text-[14px] font-bold text-[#141416]">{op.agentShop}</p>
          <p className="text-[11.5px] text-[#8A8783]">كود {op.agentCode}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#8A8783]">المبلغ</p>
          <MoneyText minor={op.amountMinor} currency={op.currency} className="text-[15px]" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#8A8783]">الانتهاء</p>
          <p className="text-[12.5px] font-semibold text-[#5C5A56]">{formatDateTime(op.expiresAt)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#8A8783]">الإنشاء</p>
          <p className="text-[12.5px] font-semibold text-[#5C5A56]">{formatDateTime(op.createdAt)}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-row-reverse justify-start border-t border-[#F0EEE9] pt-3">
        <ConsoleButton variant="danger" size="sm" onClick={() => setTarget({ kind: "cash", view: op })}>
          <Ban strokeWidth={1.6} className="h-3.5 w-3.5" />
          إلغاء واسترجاع
        </ConsoleButton>
      </div>
    </ConsoleCard>
  );

  const remittances = data?.remittances ?? [];
  const cashOps = data?.cashOps ?? [];
  const empty = !loading && !error && remittances.length === 0 && cashOps.length === 0;

  return (
    <div className="relative flex flex-col gap-5">
      <SectionHeader
        title="المعلّق"
        description="حوالات وعمليات نقدية بانتظار التسوية — إلغاء إداري باسترجاع فوري للمبلغ"
        onRefresh={retry}
        refreshing={loading}
      />

      {error && !data ? (
        <ConsoleCard className="p-6">
          <p className="text-center text-[14px] font-semibold text-[#B91C1C]">
            {error.message}
            <span dir="ltr" className="ms-2 text-[11px] text-[#A3A09B]">{error.code}</span>
          </p>
          <div className="mt-4 flex justify-center">
            <ConsoleButton onClick={retry}>إعادة المحاولة</ConsoleButton>
          </div>
        </ConsoleCard>
      ) : null}

      {empty ? (
        <ConsoleCard className="p-10 text-center">
          <span aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#C9A227]/10 text-[#C9A227]">
            <Send strokeWidth={1.5} className="h-7 w-7" />
          </span>
          <p className="mt-4 text-[16px] font-bold text-[#141416]">لا معلّقات الآن</p>
          <p className="mt-1 text-[13px] font-medium text-[#5C5A56]">
            كل الحوالات والعمليات النقدية مسوّاة — ستظهر المعلقة الجديدة هنا تلقائياً.
          </p>
        </ConsoleCard>
      ) : null}

      {/* الحوالات المعلقة */}
      {remittances.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 text-[15px] font-extrabold text-[#0B0B0C]">
            <Send strokeWidth={1.6} className="h-4 w-4 text-[#C9A227]" />
            حوالات معلقة ({remittances.length})
          </h3>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{remittances.map(renderRemittanceCard)}</div>
        </div>
      ) : null}

      {/* العمليات النقدية المعلقة */}
      {cashOps.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 text-[15px] font-extrabold text-[#0B0B0C]">
            <Banknote strokeWidth={1.6} className="h-4 w-4 text-[#C9A227]" />
            عمليات نقدية معلقة ({cashOps.length})
          </h3>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{cashOps.map(renderCashCard)}</div>
        </div>
      ) : null}

      <ReasonDialog
        open={target !== null}
        title={target?.kind === "remittance" ? "إلغاء حوالة معلقة" : "إلغاء عملية نقدية معلقة"}
        description={
          target
            ? target.kind === "remittance"
              ? `الحوالة ${target.view.ref} · ${formatMoney(target.view.amountMinor, target.view.currency)} إلى ${target.view.receiverName} — سيُسترجع المبلغ كاملاً إلى محفظة المرسل.`
              : `${CASH_OP_TYPE_LABELS[target.view.type]} ${target.view.ref} · ${formatMoney(target.view.amountMinor, target.view.currency)} لدى ${target.view.agentShop} — سيُسترجع المبلغ للعميل${target.view.type === "WITHDRAW" ? " (السحب كان محجوزاً من رصيده)" : ""}.`
            : null
        }
        confirmLabel="تأكيد الإلغاء والاسترجاع"
        confirmVariant="danger"
        busy={runner.busy}
        error={runner.error}
        onConfirm={(reason) => void submitCancel(reason)}
        onCancel={() => {
          runner.setError(null);
          setTarget(null);
        }}
      />
    </div>
  );
}
