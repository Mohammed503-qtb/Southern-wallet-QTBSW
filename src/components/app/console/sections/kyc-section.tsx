/**
 * محفظة الجنوب — قسم طابور KYC (M4 + M5) — 8-d + 12-g
 * تبويبات (قيد المراجعة/معتمد/مرفوض) + بطاقات طلبات التوثيق بكل بياناتها
 * (الاسم/الهاتف/نوع ورقم الوثيقة المقنّن/المحافظة/المهنة/الدخل/تاريخ التقديم)
 * + مستندات مرفقة حقيقية (12-g): مصغّرات الوثيقة والصورة الشخصية تُجلب عبر
 * api.getBlob (قناة x-sw-session نفسها) من /api/kyc/file — والنقر يفتح معاينة
 * بالحجم الكامل في حوار فوق الصفحة مع فتح في تبويب جديد.
 * + زرا "اعتماد" و"رفض" (M5): الرفض يتطلب note إلزامية، الاعتماد اختيارية.
 * يظهر لADMIN وCOMPLIANCE (كلاهما مخوّل على القرار خادمياً).
 */
"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, ImageOff, Maximize2, X, XCircle } from "lucide-react";
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
type KycDocKind = "doc" | "selfie";

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

/** مسار ملف KYC المحمي — يُجلب عبر قناة الجلسة (x-sw-session) وليس <img> مباشرة */
function kycFileUrl(userId: string, kind: KycDocKind): string {
  return `/api/kyc/file?userId=${encodeURIComponent(userId)}&kind=${kind}`;
}

/** مصغّرة مستند مرفق: تحميل blob → object URL، وإخفاء مهذب عند غياب الملف
 *  (طلبات Alpha القديمة قبل الرفع الفعلي) — النقر يفتح المعاينة الكاملة */
function KycDocThumb({
  userId,
  kind,
  label,
  onOpen,
}: {
  userId: string;
  kind: KycDocKind;
  label: string;
  onOpen: (kind: KycDocKind) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    api
      .getBlob(kycFileUrl(userId, kind))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId, kind]);

  if (failed) {
    // لا ملف لهذا الطلب (تقديم قديم بلا رفع فعلي) — عرض مهذب بلا كسر
    return (
      <div
        title="لا يوجد ملف مرفوع لهذا الطلب"
        className="flex h-[96px] w-[112px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#E8E6E1] bg-[#FAF9F6]/60 text-[#A3A09B]"
      >
        <ImageOff strokeWidth={1.5} className="h-4 w-4" />
        <span className="text-[10.5px] font-bold">{label}</span>
        <span className="text-[10px] font-medium">غير مرفق</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => url && onOpen(kind)}
      disabled={!url}
      title={`عرض ${label} بالحجم الكامل`}
      className="group flex w-[112px] flex-col items-center gap-1 text-center"
    >
      {url ? (
        <span className="relative block">
          <img
            src={url}
            alt={label}
            className="h-[96px] w-[112px] rounded-xl border border-[#E8E6E1] bg-white object-cover transition-colors group-hover:border-[#C9A227]/70"
          />
          <span className="absolute bottom-1 left-1 flex h-6 w-6 items-center justify-center rounded-lg bg-[#0B0B0C]/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
            <Maximize2 strokeWidth={1.75} className="h-3.5 w-3.5" />
          </span>
        </span>
      ) : (
        <Skeleton className="h-[96px] w-[112px] rounded-xl" />
      )}
      <span className="text-[10.5px] font-bold text-[#5C5A56] group-hover:text-[#8A6E14]">{label}</span>
    </button>
  );
}

/** معاينة المستند بالحجم الكامل — حوار فوق الصفحة (Escape/النقر خارجها للإغلاق) */
function KycDocLightbox({
  userId,
  kind,
  title,
  onClose,
}: {
  userId: string;
  kind: KycDocKind;
  title: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // إغلاق بزر Escape — إمكانية وصول (نفس نمط DialogShell)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // جلب نسخة خاصة بالحوار (مستقلة عن عمر المصغّرة) — تُلغى عند الإغلاق
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    api
      .getBlob(kycFileUrl(userId, kind))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError("تعذّر تحميل المستند — أعد المحاولة أو افتح التبويب من جديد");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId, kind]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0B0C]/60 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sw-fade-in flex max-h-full w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-[#E8E6E1] bg-white shadow-[0_24px_60px_rgba(11,11,12,0.25)]">
        <header className="flex items-center justify-between gap-3 border-b border-[#F0EEE9] px-5 py-3.5">
          <h3 className="min-w-0 truncate text-[15px] font-extrabold text-[#0B0B0C]">{title}</h3>
          <div className="flex shrink-0 items-center gap-2">
            {url ? (
              <ConsoleButton size="sm" variant="ghost" onClick={() => window.open(url, "_blank", "noopener")}>
                فتح في تبويب جديد
              </ConsoleButton>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق المعاينة"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E8E6E1] bg-white text-[#5C5A56] transition-colors hover:border-[#C9A227]/60 hover:text-[#8A6E14]"
            >
              <X strokeWidth={1.75} className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="gold-scroll max-h-[72vh] overflow-auto bg-[#FAF9F6] p-4">
          {error ? (
            <p className="py-12 text-center text-[14px] font-semibold text-[#B91C1C]">{error}</p>
          ) : url ? (
            <img
              src={url}
              alt={title}
              className="mx-auto max-h-[64vh] w-auto max-w-full rounded-xl border border-[#E8E6E1] bg-white object-contain"
            />
          ) : (
            <Skeleton className="mx-auto h-[420px] w-full max-w-[560px] rounded-xl" />
          )}
        </div>
      </div>
    </div>
  );
}

export function KycSection({ role: _role }: { role: UserRole }) {
  const [tab, setTab] = useState<KycTab>("PENDING");
  const { data, loading, error, retry } = useApiData<AdminKycRow[]>(`/api/admin/kyc?status=${tab}`);

  const [decision, setDecision] = useState<{ row: AdminKycRow; kind: "APPROVE" | "REJECT" } | null>(null);
  const [preview, setPreview] = useState<{ row: AdminKycRow; kind: KycDocKind } | null>(null);
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

  const docLabel = (kind: KycDocKind): string =>
    kind === "doc" ? "بطاقة الهوية" : "صورة شخصية";

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

                {/* المستندات المرفقة — رؤية فعلية لفاتورة القرار (M5 / 12-g) */}
                <div className="flex items-start gap-3 rounded-xl border border-[#F0EEE9] bg-[#FAF9F6] p-2.5">
                  <KycDocThumb
                    userId={row.userId}
                    kind="doc"
                    label="بطاقة الهوية"
                    onOpen={(k) => setPreview({ row, kind: k })}
                  />
                  <KycDocThumb
                    userId={row.userId}
                    kind="selfie"
                    label="صورة شخصية"
                    onOpen={(k) => setPreview({ row, kind: k })}
                  />
                  <p className="min-w-0 flex-1 self-center text-[11px] font-medium leading-5 text-[#A3A09B]">
                    اطّلع على المستندات قبل القرار — الصور محمية بصلاحيات وصول
                    ولا تُخزَّن في المتصفح.
                  </p>
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

      {/* معاينة المستند بالحجم الكامل */}
      {preview ? (
        <KycDocLightbox
          userId={preview.row.userId}
          kind={preview.kind}
          title={`${docLabel(preview.kind)} — ${preview.row.fullName}`}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}
