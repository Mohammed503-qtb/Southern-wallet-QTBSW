/**
 * محفظة الجنوب — قسم طابور KYC (M4 + M5) — 8-d
 * تبويبات (قيد المراجعة/معتمد/مرفوض) + بطاقات طلبات التوثيق بكل بياناتها
 * (الاسم/الهاتف/نوع ورقم الوثيقة المقنّن/المحافظة/المهنة/الدخل/تاريخ التقديم)
 * + زرا "اعتماد" و"رفض" (M5): الرفض يتطلب note إلزامية، الاعتماد اختيارية.
 * يظهر لADMIN وCOMPLIANCE (كلاهما مخوّل على القرار خادمياً).
 */
"use client";

import { useState } from "react";
import { BadgeCheck, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { AdminKycRow, CurrencyCode, KycSubmissionView, UserRole } from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { formatDateTime, useApiData } from "@/components/app/ui";
import { toastSuccess } from "../console-hooks";
import { useActionRunner } from "../console-hooks";
import { ReasonDialog } from "../confirm-dialog";
import { ConsoleButton, ConsoleCard, PillTabs, SectionHeader, Skeleton } from "../console-ui";

const ID_TYPE_LABELS: Record<string, string> = {
  NATIONAL_ID: "هوية وطنية",
  PASSPORT: "جواز سفر",
};

type KycTab = "PENDING" | "APPROVED" | "REJECTED";

const TABS: { value: KycTab; label: string }[] = [
  { value: "PENDING", label: "قيد المراجعة" },
  { value: "APPROVED", label: "معتمد" },
  { value: "REJECTED", label: "مرفوض" },
];

/** سطر بيانات داخل بطاقة الطلب */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3">
      <span className="shrink-0 text-[12px] font-semibold text-[#8A8783]">{label}</span>
      <span className="min-w-0 truncate text-[13.5px] font-bold text-[#141416]">{children}</span>
    </div>
  );
}

export function KycSection({ role: _role }: { role: UserRole }) {
  const [tab, setTab] = useState<KycTab>("PENDING");
  const { data, loading, error, retry } = useApiData<AdminKycRow[]>(`/api/admin/kyc?status=${tab}`);

  const [decision, setDecision] = useState<{ row: AdminKycRow; kind: "APPROVE" | "REJECT" } | null>(null);
  const runner = useActionRunner();

  const submitDecision = async (note: string) => {
    if (!decision) return;
    const result = await runner.run(() =>
      api.post<KycSubmissionView>(`/api/admin/kyc/${decision.row.id}/decision`, {
        decision: decision.kind,
        note,
      }),
    );
    if (result.ok) {
      toastSuccess(
        decision.kind === "APPROVE"
          ? `اعتُمد توثيق ${decision.row.fullName} — ترقية إلى «موثّق»`
          : `رُفض توثيق ${decision.row.fullName}`,
        note ? `الملاحظة: ${note}` : undefined,
      );
      setDecision(null);
      retry();
    }
  };

  return (
    <div className="relative flex flex-col gap-4">
      <SectionHeader
        title="طابور KYC"
        description="مراجعة طلبات التوثيق وترقية مستويات المشتركين"
        onRefresh={retry}
        refreshing={loading}
      />

      <PillTabs items={TABS} value={tab} onChange={setTab} className="self-start" />

      {/* القائمة */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {loading && (!data || data.length === 0)
          ? Array.from({ length: 4 }).map((_, i) => (
              <ConsoleCard key={i} className="space-y-3 p-4">
                <Skeleton className="h-5 w-2/5" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-9 w-full" />
              </ConsoleCard>
            ))
          : null}

        {error && (!data || data.length === 0) ? (
          <ConsoleCard className="p-6 lg:col-span-2">
            <p className="text-center text-[14px] font-semibold text-[#B91C1C]">
              {error.message}
              <span dir="ltr" className="ms-2 text-[11px] text-[#A3A09B]">{error.code}</span>
            </p>
            <div className="mt-4 flex justify-center">
              <ConsoleButton onClick={retry}>إعادة المحاولة</ConsoleButton>
            </div>
          </ConsoleCard>
        ) : null}

        {!loading && !error && data && data.length === 0 ? (
          <ConsoleCard className="p-8 text-center lg:col-span-2">
            <p className="text-[15px] font-bold text-[#141416]">
              {tab === "PENDING" ? "لا طلبات قيد المراجعة" : tab === "APPROVED" ? "لا طلبات معتمدة بعد" : "لا طلبات مرفوضة"}
            </p>
            <p className="mt-1 text-[13px] font-medium text-[#5C5A56]">
              {tab === "PENDING" ? "الطابور نظيف — ستظهر الطلبات الجديدة هنا فور تقديمها." : "غيّر التبويب لعرض حالة أخرى."}
            </p>
          </ConsoleCard>
        ) : null}

        {data && data.length > 0 && !error
          ? data.map((row) => (
              <ConsoleCard key={row.id} className="flex flex-col gap-3 p-4">
                {/* رأس البطاقة */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0EEE9] pb-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15.5px] font-extrabold text-[#0B0B0C]">{row.fullName}</p>
                    <p dir="ltr" className="text-right text-[12.5px] font-semibold tabular-nums text-[#8A8783]">
                      {row.phone}
                    </p>
                  </div>
                  <span className="text-[12px] font-medium text-[#8A8783]">
                    قُدِّم {formatDateTime(row.submittedAt)}
                  </span>
                </div>

                {/* تفاصيل الطلب */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <DetailRow label="الوثيقة">
                    {ID_TYPE_LABELS[row.idType] ?? row.idType} · <span dir="ltr">{row.idNumberMasked}</span>
                  </DetailRow>
                  <DetailRow label="المحافظة">{row.governorate}</DetailRow>
                  <DetailRow label="المهنة">{row.occupation ?? "—"}</DetailRow>
                  <DetailRow label="الدخل الشهري">
                    {row.monthlyIncomeMinor > 0
                      ? formatMoney(row.monthlyIncomeMinor, row.incomeCurrency as CurrencyCode)
                      : "—"}
                  </DetailRow>
                </div>

                {/* أزرار القرار — للطلبات قيد المراجعة فقط */}
                {tab === "PENDING" ? (
                  <div className="mt-auto flex flex-row-reverse items-center justify-start gap-2 border-t border-[#F0EEE9] pt-3">
                    <ConsoleButton
                      variant="primary"
                      onClick={() => setDecision({ row, kind: "APPROVE" })}
                      title="اعتماد الطلب وترقية المستوى — M5"
                    >
                      <BadgeCheck strokeWidth={1.6} className="h-4 w-4" />
                      اعتماد
                    </ConsoleButton>
                    <ConsoleButton
                      variant="danger"
                      onClick={() => setDecision({ row, kind: "REJECT" })}
                      title="رفض الطلب بملاحظة إلزامية — M5"
                    >
                      <XCircle strokeWidth={1.6} className="h-4 w-4" />
                      رفض
                    </ConsoleButton>
                  </div>
                ) : null}
              </ConsoleCard>
            ))
          : null}
      </div>

      <ReasonDialog
        open={decision !== null}
        title={decision?.kind === "APPROVE" ? "اعتماد طلب توثيق" : "رفض طلب توثيق"}
        description={
          decision
            ? `المقدم: ${decision.row.fullName} · ${decision.row.phone}${
                decision.kind === "APPROVE"
                  ? " — سيُرقّى حسابه إلى «موثّق» وترتفع حدوده اليومية."
                  : " — سيُبلغ المستخدم بالرفض مع ملاحظتك."
              }`
            : null
        }
        reasonLabel={decision?.kind === "REJECT" ? "سبب الرفض (إلزامي — يُرسل للمستخدم)" : "ملاحظة الاعتماد (اختيارية)"}
        reasonPlaceholder={
          decision?.kind === "REJECT" ? "مثال: صورة الوثيقة غير واضحة — أعد التقديم…" : "اختياري — تُحفظ في سجل التدقيق"
        }
        reasonOptional={decision?.kind === "APPROVE"}
        confirmLabel={decision?.kind === "APPROVE" ? "تأكيد الاعتماد" : "تأكيد الرفض"}
        confirmVariant={decision?.kind === "REJECT" ? "danger" : "primary"}
        busy={runner.busy}
        error={runner.error}
        onConfirm={(note) => void submitDecision(note)}
        onCancel={() => {
          runner.setError(null);
          setDecision(null);
        }}
      />
    </div>
  );
}
