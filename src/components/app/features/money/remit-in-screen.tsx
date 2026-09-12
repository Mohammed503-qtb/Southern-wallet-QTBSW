/**
 * محفظة الجنوب — الحوالات الواردة من شبكات الصرافة (A-03 — 9-c)
 * ----------------------------------------------------------
 * (أ) شرح الخدمة: حوالة تصلك من شبكة صرافة خارجية برمز مطالبة 6 أرقام.
 * (ب) حقل رمز المطالبة (OTP-style) + زر «استلام» → PIN →
 *     POST /api/remit-in بمفتاح Idempotency → إيصال RemitInClaimResultView.
 * (ج) قائمة حوالاتي الواردة (بطاقات: الشبكة/المرسل/المبلغ/الحالة/الانتهاء
 *     + رمز المطالبة) — زر «استلام» على المعلقة يعبّئ الرمز ويعيد التدفق.
 * EmptyState أنيقة إن لا حوالات + ErrorState عند فشل الجلب.
 */
"use client";

import { useState } from "react";
import { Banknote, Inbox, Landmark, UserRound } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAppStore } from "@/lib/app-store";
import type { InboundRemittanceView, RemitInClaimResultView } from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui/api-hooks";
import { ErrorState } from "@/components/app/ui/error-state";
import { EmptyState } from "@/components/app/ui/empty-state";
import { OTPInput } from "@/components/app/ui/otp-input";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ReceiptCard } from "@/components/app/ui/receipt-card";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { StatusChip } from "@/components/app/ui/status-chip";
import { formatDateTime } from "@/components/app/ui/utils";
import { cn } from "@/lib/utils";
import {
  InlineErrorBanner,
  PinStep,
  ReviewCard,
  SuccessMark,
  errInfo,
  postMoney,
  timeLeftLabel,
} from "./money-shared";

type Step = "claim" | "pin" | "result" | "fail";

/** ملصق حالة الحوالة الواردة */
const INBOUND_STATUS_LABELS: Record<InboundRemittanceView["status"], string> = {
  PENDING: "بانتظار الاستلام",
  CLAIMED: "تم الاستلام",
  EXPIRED: "منتهية أو ملغاة",
};

function InboundStatusChip({ status }: { status: InboundRemittanceView["status"] }) {
  const tone =
    status === "CLAIMED"
      ? "success"
      : status === "PENDING"
        ? "pending"
        : "muted";
  const cls = {
    success: "border-[#15803D]/20 bg-[#15803D]/10 text-[#15803D]",
    pending: "border-[#B45309]/25 bg-[#B45309]/10 text-[#B45309]",
    muted: "border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]",
  }[tone];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4", cls)}>
      {INBOUND_STATUS_LABELS[status]}
    </span>
  );
}

/** بطاقة حوالة واردة في القائمة */
function InboundCard({
  item,
  onClaim,
}: {
  item: InboundRemittanceView;
  onClaim: (item: InboundRemittanceView) => void;
}) {
  const pending = item.status === "PENDING";
  return (
    <article className="overflow-hidden rounded-2xl border border-[#E8E6E1] bg-white shadow-[0_2px_8px_rgba(11,11,12,0.04)]">
      <div aria-hidden="true" className={cn("h-[3px] w-full", pending ? "bg-[#C9A227]" : "bg-[#E8E6E1]")} />
      <div className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[15px] font-bold text-[#141416]">
            <Landmark strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
            {item.networkName}
          </p>
          <InboundStatusChip status={item.status} />
        </div>
        <dl className="mt-2 divide-y divide-[#E8E6E1]/70">
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-[12.5px] font-medium text-[#5C5A56]">المبلغ</dt>
            <dd dir="ltr" className="text-[15px] font-extrabold tabular-nums text-[#141416]">
              {formatMoney(item.amountMinor, item.currency)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="flex items-center gap-1 text-[12.5px] font-medium text-[#5C5A56]">
              <UserRound strokeWidth={1.5} className="h-3.5 w-3.5" />
              المرسل
            </dt>
            <dd className="text-[13.5px] font-semibold text-[#141416]">{item.senderName}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-[12.5px] font-medium text-[#5C5A56]">الانتهاء</dt>
            <dd className="text-[12.5px] font-semibold tabular-nums text-[#5C5A56]">
              {formatDateTime(item.expiresAt)}
              {pending && timeLeftLabel(item.expiresAt) ? (
                <span className="text-[#B45309]"> (متبقٍ {timeLeftLabel(item.expiresAt)})</span>
              ) : null}
            </dd>
          </div>
          {pending ? (
            <div className="flex items-center justify-between gap-3 py-2">
              <dt className="text-[12.5px] font-medium text-[#5C5A56]">رمز المطالبة</dt>
              <dd dir="ltr" className="text-[15px] font-extrabold tracking-[0.16em] tabular-nums text-[#8A6E14]">
                {item.claimCode}
              </dd>
            </div>
          ) : null}
        </dl>
        {pending ? (
          <div className="mt-2">
            <PrimaryActionButton onClick={() => onClaim(item)}>استلام الحوالة</PrimaryActionButton>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function RemitInScreen() {
  const me = useAppStore((s) => s.me);
  const refreshMe = useAppStore((s) => s.refreshMe);
  const resetTo = useAppStore((s) => s.resetTo);
  const list = useApiData<InboundRemittanceView[]>("/api/remit-in");

  const [step, setStep] = useState<Step>("claim");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<RemitInClaimResultView | null>(null);
  const [executing, setExecuting] = useState(false);
  const [formError, setFormError] = useState<{ code: string; message: string } | null>(null);
  const [pinError, setPinError] = useState<{ code: string; message: string; lockSeconds?: number } | null>(null);
  /** آخر حوالة معلقة اختيرت من القائمة (لعنوان خطوة PIN) */
  const [pendingItem, setPendingItem] = useState<InboundRemittanceView | null>(null);

  const beginClaim = (item: InboundRemittanceView) => {
    setCode(item.claimCode);
    setPendingItem(item);
    setStep("pin");
  };

  /** استلام الحوالة بعد PIN — Idempotency AC-03/04 */
  const executeClaim = async (pin: string) => {
    if (!/^\d{6}$/.test(code)) return;
    setExecuting(true);
    setPinError(null);
    try {
      const tx = await postMoney<RemitInClaimResultView>("/api/remit-in", { claimCode: code, pin });
      setResult(tx);
      setStep("result");
      void refreshMe();
      list.retry();
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
  // النتيجة — إيصال الاستلام
  // ============================================================
  if (step === "result" && result) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="نتيجة الاستلام" showBack={false} />
        <SuccessMark
          title="تم استلام الحوالة"
          amount={formatMoney(result.amountMinor, result.currency)}
          subtitle={`من ${result.senderName} عبر ${result.networkName} — أُضيفت لمحفظتك فوراً`}
        />
        <div className="mt-4 space-y-3">
          <ReceiptCard
            reference={result.ref}
            title="إيصال استلام حوالة واردة"
            status={result.status}
            createdAt={result.createdAt}
            parties={[
              { label: "المستلم", value: me?.user.fullName ?? "أنت" },
              { label: "الشبكة المرسلة", value: result.networkName },
            ]}
            fields={[
              { label: "المبلغ المستلم", value: formatMoney(result.amountMinor, result.currency) },
              { label: "المرسل", value: result.senderName },
              { label: "رسوم الاستلام", value: "مجانية (Beta)" },
              {
                label: "رصيدك بعد الاستلام",
                value: formatMoney(result.balanceMinor ?? 0, result.currency),
                strong: true,
              },
            ]}
          />
          <div className="grid grid-cols-1 gap-2">
            <PrimaryActionButton onClick={() => navigate("transactions")}>
              مشاهدة العمليات
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
  // فشل الاستلام
  // ============================================================
  if (step === "fail") {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="نتيجة الاستلام" showBack={false} />
        <div className="mt-6">
          <ErrorState
            message={formError?.message ?? "تعذّر استلام الحوالة"}
            code={formError?.code}
            onRetry={() => {
              setStep("claim");
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
  // PIN (من إدخال الرمز أو من زر بطاقة معلقة)
  // ============================================================
  if (step === "pin") {
    const context = pendingItem
      ? `تأكيد استلام ${formatMoney(pendingItem.amountMinor, pendingItem.currency)} من ${pendingItem.networkName}`
      : `تأكيد استلام الحوالة بالرمز ${code}`;
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="تأكيد الاستلام" />
        <div className="mt-4 space-y-3">
          <ReviewCard
            title="حوالة واردة"
            rows={[
              { label: "رمز المطالبة", value: code || "—", strong: true },
              ...(pendingItem
                ? [
                    { label: "الشبكة المرسلة", value: pendingItem.networkName },
                    { label: "المرسل", value: pendingItem.senderName },
                    {
                      label: "المبلغ",
                      value: formatMoney(pendingItem.amountMinor, pendingItem.currency),
                    },
                  ]
                : []),
            ]}
            note="أدخل رمز PIN لإتمام الاستلام — سيُضاف المبلغ إلى محفظتك الرئيسية فوراً."
          />
          <PinStep
            contextLabel={context}
            error={pinError}
            executing={executing}
            onConfirm={(pin) => void executeClaim(pin)}
            onCancel={() => {
              setStep("claim");
              setPinError(null);
            }}
          />
        </div>
      </div>
    );
  }

  // ============================================================
  // الشاشة الرئيسية: شرح + إدخال الرمز + القائمة
  // ============================================================
  const items = list.data ?? [];
  const pendingCount = items.filter((i) => i.status === "PENDING").length;

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader title="الحوالات الواردة" subtitle="استلم حوالات شبكات الصرافة برمز المطالبة" />

      <div className="mt-4 space-y-3">
        {/* شرح الخدمة */}
        <div className="flex items-start gap-2.5 rounded-xl border border-[#C9A227]/30 bg-[#C9A227]/[0.06] px-3 py-2.5">
          <Banknote strokeWidth={1.5} className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#C9A227]" />
          <p className="text-[12.5px] font-semibold leading-5 text-[#8A6E14]">
            وصلتك حوالة من شبكة صرافة؟ أدخل رمز المطالبة المكوّن من 6 أرقام
            (يصلك في إشعار الوصول) ليُضاف المبلغ فوراً إلى محفظتك. صلاحية الرمز 7 أيام.
          </p>
        </div>

        {/* إدخال رمز المطالبة */}
        <div className="rounded-2xl border border-[#E8E6E1] bg-white p-4 shadow-[0_2px_8px_rgba(11,11,12,0.04)]">
          <p className="mb-1 text-center text-[14px] font-bold text-[#141416]">رمز المطالبة</p>
          <p className="mb-3 text-center text-[12px] font-medium text-[#A3A09B]">
            6 أرقام كما وصلتك من الشبكة المرسلة
          </p>
          <OTPInput
            value={code}
            onChange={(v) => {
              setCode(v);
              setPendingItem(null);
            }}
          />
          <div className="mt-3">
            <PrimaryActionButton
              onClick={() => setStep("pin")}
              disabled={code.length !== 6}
              disabledReason={code.length > 0 ? "أكمل 6 خانات" : "أدخل رمز المطالبة"}
            >
              استلام الحوالة
            </PrimaryActionButton>
          </div>
        </div>

        {formError ? <InlineErrorBanner error={formError} /> : null}

        {/* قائمة حوالاتي الواردة */}
        <section className="mt-2">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[18px] font-semibold leading-6 text-[#141416]">
              <Inbox strokeWidth={1.5} className="h-5 w-5 text-[#C9A227]" />
              حوالاتي الواردة
            </h2>
            {pendingCount > 0 ? (
              <span className="rounded-full border border-[#B45309]/25 bg-[#B45309]/10 px-2 py-0.5 text-[11px] font-semibold text-[#B45309]">
                {pendingCount.toLocaleString("en-US")} بانتظار الاستلام
              </span>
            ) : null}
          </div>

          {list.loading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-40 w-full rounded-2xl" />
              ))}
            </div>
          ) : list.error ? (
            <ErrorState compact message={list.error.message} code={list.error.code} onRetry={list.retry} />
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-[#E8E6E1] bg-white">
              <EmptyState
                compact
                title="لا حوالات واردة بعد"
                description="عندما تصلك حوالة من شبكة صرافة (مثل الفلوس للصرافة) ستجدها هنا مع رمز مطالبتها — أو أدخل الرمز فوراً أعلاه"
              />
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map((item) => (
                <InboundCard key={item.ref} item={item} onClaim={beginClaim} />
              ))}
            </div>
          )}
        </section>

        {/* تلميح الحالة المستلمة للفلاتر المستقبلية */}
        {items.length > 0 && items.every((i) => i.status !== "PENDING") ? (
          <p className="mt-1 text-center text-[12px] font-medium text-[#A3A09B]">
            كل حوالاتك الواردة مستلمة — <StatusChip status="COMPLETED" /> في سجل عملياتك
          </p>
        ) : null}
      </div>
    </div>
  );
}
