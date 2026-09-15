/**
 * محفظة الجنوب — توثيق الحساب KYC (SC-39)
 * ثلاث حالات: (أ) NONE ولم يقدّم → نموذج التقديم (K2: الاسم كما في الهوية،
 * نوع الوثيقة/رقمها، المحافظة، العنوان، المهنة، الدخل الشهري اختياري، ورفع
 * فعلي لصورة الوثيقة (إلزامي) والصورة الشخصية (اختياري) — JPEG/PNG/WEBP
 * حتى 5MB لكل ملف مع معاينة مصغّرة وإرسال multipart عبر api.postForm)؛
 * (ب) PENDING → بطاقة انتظار كهرمانية + ملخص ما قُدّم؛
 * (ج) APPROVED/REJECTED → بطاقة خضراء/حمراء + سبب الرفض + إعادة التقديم.
 * مع مقارنة الحدود NONE vs VERIFIED (من me.limits) في جدول صغير دائم.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  BadgeCheck,
  Clock,
  ShieldQuestion,
  Upload,
  XCircle,
} from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { api, ApiError } from "@/lib/api";
import type { LimitView } from "@/lib/api-types";
import { CURRENCY_META, IN_SCOPE_GOVERNORATES, formatMoney } from "@/lib/api-types";
import { ErrorState } from "@/components/app/ui/error-state";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { FieldLabel, SectionCard, TextField } from "./account-shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type IdType = "NATIONAL_ID" | "PASSPORT";

const ID_TYPE_LABELS: Record<IdType, string> = {
  NATIONAL_ID: "بطاقة الهوية الوطنية",
  PASSPORT: "جواز السفر",
};

// ===== قيود رفع مستندات KYC (مطابقة للخادم 12-g) =====
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ACCEPT_ATTR = "image/jpeg,image/png,image/webp";

/** التحقق من ملف صورة مختار — يعيد رسالة خطأ عربية أو null */
function validateImageFile(file: File): string | null {
  const typeOk = ACCEPTED_IMAGE_TYPES.includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!typeOk) return "صيغة غير مدعومة — يقبل صور JPEG/PNG/WEBP فقط";
  if (file.size > MAX_FILE_BYTES) return "حجم الصورة يتجاوز 5MB — اختر صورة أصغر";
  return null;
}

/** تنسيق حجم الملف للعرض */
function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

/** ملف مختار + معاينة object URL — الإنشاء/الإلغاء في معالج الحدث نفسه
 *  (لا setState تزامني داخل تأثير)، والإلغاء الأخير عند التفكيك فقط */
interface PickedFile {
  file: File;
  url: string;
}

function usePickedFile() {
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const urlRef = useRef<string | null>(null);

  const pick = (file: File | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = file ? URL.createObjectURL(file) : null;
    setPicked(file && urlRef.current ? { file, url: urlRef.current } : null);
  };

  // إلغاء آخر object URL عند تفكيك الشاشة — تنظيف خارجي بلا ضبط حالة
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  return { picked, pick };
}

/** بطاقة حد لمستوى واحد (NONE/VERIFIED) — مقارنة الحدود */
function LimitsCard({
  level,
  limits,
  current,
}: {
  level: "NONE" | "VERIFIED";
  limits: LimitView[];
  current: boolean;
}) {
  const rows = limits.filter((l) => l.kycLevel === level);
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-white",
        current ? "border-[#C9A227]/50 shadow-[0_2px_10px_rgba(201,162,39,0.12)]" : "border-[#E8E6E1]",
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-[#E8E6E1]/70 px-3.5 py-2.5">
        <h3 className="text-[13px] font-bold text-[#141416]">
          {level === "NONE" ? "حدود الحساب غير الموثّق" : "حدود الحساب الموثّق"}
        </h3>
        {current ? (
          <span className="rounded-full border border-[#C9A227]/40 bg-[#C9A227]/[0.1] px-2 py-0.5 text-[10.5px] font-bold text-[#8A6E14]">
            مستواك الحالي
          </span>
        ) : null}
      </header>
      <table className="w-full text-right">
        <thead>
          <tr className="text-[10.5px] font-bold text-[#A3A09B]">
            <th className="px-3.5 py-1.5 font-bold">العملة</th>
            <th className="px-1 py-1.5 font-bold">عمليات/يوم</th>
            <th className="px-1 py-1.5 font-bold">قيمة/يوم</th>
            <th className="px-3.5 py-1.5 font-bold">حد العملية</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E8E6E1]/60">
          {rows.map((l) => (
            <tr key={l.currency} className="text-[12px] font-semibold text-[#141416]">
              <td className="px-3.5 py-2">{CURRENCY_META[l.currency].code}</td>
              <td className="px-1 py-2 tabular-nums">{l.dailyTxnCount}</td>
              <td dir="auto" className="px-1 py-2 text-[11.5px] tabular-nums">
                {formatMoney(l.dailyAmountMinor, l.currency)}
              </td>
              <td dir="auto" className="px-3.5 py-2 text-[11.5px] tabular-nums">
                {formatMoney(l.perTxnAmountMinor, l.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function KycScreen() {
  const me = useAppStore((s) => s.me);
  const refreshMe = useAppStore((s) => s.refreshMe);
  const bootstrap = useAppStore((s) => s.bootstrap);

  // ===== نموذج التقديم =====
  const [fullName, setFullName] = useState(me?.user.fullName ?? "");
  const [idType, setIdType] = useState<IdType>("NATIONAL_ID");
  const [idNumber, setIdNumber] = useState("");
  const [governorate, setGovernorate] = useState(me?.user.governorate ?? "");
  const [address, setAddress] = useState("");
  const [occupation, setOccupation] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const doc = usePickedFile();
  const selfie = usePickedFile();
  const [fileError, setFileError] = useState<{ field: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ code: string; message: string } | null>(null);

  // إعادة التقديم بعد الرفض
  const [forceForm, setForceForm] = useState(false);

  if (!me) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="توثيق الحساب" />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
        <div className="mt-4">
          <ErrorState
            compact
            message="انتهت الجلسة أو لم تُحمَل بياناتك"
            onRetry={() => void bootstrap()}
          />
        </div>
      </div>
    );
  }

  const user = me.user;
  const kyc = me.kyc;
  const showForm = forceForm || (!kyc && user.kycLevel === "NONE") || kyc?.status === "REJECTED";

  const nameValid = fullName.trim().length >= 3;
  const idNumberValid = idNumber.trim().length >= 4;
  const govValid = governorate !== "";
  const docValid = doc.picked !== null && fileError === null;
  const formValid = nameValid && idNumberValid && govValid && docValid;

  /** اختيار ملف مع التحقق الفوري — يرفض غير الصور أو ما يتجاوز 5MB */
  const pickFile = (field: "doc" | "selfie") => (file: File | null) => {
    setFileError(null);
    if (!file) return;
    const invalid = validateImageFile(file);
    if (invalid) {
      setFileError({ field, message: invalid });
      (field === "doc" ? doc : selfie).pick(null);
      return;
    }
    (field === "doc" ? doc : selfie).pick(file);
  };

  const submit = async () => {
    if (!formValid || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      // K2 multipart — يرفع الملفات فعلياً (api.postForm يضبط boundary تلقائياً)
      const form = new FormData();
      form.set("fullName", fullName.trim());
      form.set("idType", idType);
      form.set("idNumber", idNumber.trim());
      form.set("governorate", governorate);
      if (address.trim()) form.set("address", address.trim());
      if (occupation.trim()) form.set("occupation", occupation.trim());
      if (monthlyIncome.trim()) {
        form.set("monthlyIncomeMinor", String(Number(monthlyIncome.replace(/[^\d]/g, "")) || 0));
      }
      if (doc.picked) form.set("docFile", doc.picked.file);
      if (selfie.picked) form.set("selfieFile", selfie.picked.file);
      await api.postForm("/api/kyc", form);
      setForceForm(false);
      await refreshMe();
      toast({
        title: "تم إرسال طلب التوثيق",
        description: "سيصلك إشعار عند اكتمال المراجعة (خلال 24 ساعة عمل)",
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError({ code: err.code, message: err.message });
      } else {
        setSubmitError({ code: "SYS-001", message: "تعذّر إرسال الطلب — تحقق من اتصالك" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader title="توثيق الحساب" subtitle="ارفع مستوى حسابك وحدوده اليومية" />

      {/* ===== مقارنة الحدود (دائمة) ===== */}
      <div className="mt-4 space-y-2">
        {user.kycLevel === "NONE" ? (
          <p className="text-[12px] font-semibold leading-5 text-[#5C5A56]">
            التوثيق يرفع حدودك اليومية وفق الجدولين أدناه:
          </p>
        ) : null}
        <LimitsCard level="NONE" limits={me.limits} current={user.kycLevel === "NONE"} />
        <LimitsCard level="VERIFIED" limits={me.limits} current={user.kycLevel === "VERIFIED"} />
      </div>

      <div className="mt-5">
        {showForm ? (
          <SectionCard title="طلب توثيق جديد">
            {kyc?.status === "REJECTED" ? (
              <div className="mb-3 rounded-xl border border-[#B91C1C]/25 bg-[#B91C1C]/[0.05] p-3">
                <p className="text-[13px] font-bold text-[#B91C1C]">
                  طلبك السابق رُفض — يمكنك تصحيح البيانات وإعادة التقديم.
                </p>
                {kyc.reviewNote ? (
                  <p className="mt-1 text-[12.5px] font-medium leading-5 text-[#5C5A56]">
                    سبب الرفض: {kyc.reviewNote}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-4">
              <div>
                <FieldLabel htmlFor="sw-kyc-name">الاسم الكامل كما في الهوية</FieldLabel>
                <TextField
                  id="sw-kyc-name"
                  value={fullName}
                  onChange={setFullName}
                  placeholder="مثال: فاطمة أحمد العريقي"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>نوع الوثيقة</FieldLabel>
                  <Select value={idType} onValueChange={(v) => setIdType(v as IdType)}>
                    <SelectTrigger
                      dir="rtl"
                      className="h-[52px] w-full rounded-xl border-[#E8E6E1] bg-white text-[14px] font-semibold text-[#141416]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ID_TYPE_LABELS) as IdType[]).map((t) => (
                        <SelectItem key={t} value={t} className="text-[14px]">
                          {ID_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel htmlFor="sw-kyc-idnum">رقم الوثيقة</FieldLabel>
                  <TextField
                    id="sw-kyc-idnum"
                    value={idNumber}
                    onChange={setIdNumber}
                    placeholder="مثال: 01234567"
                    inputMode="numeric"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <FieldLabel>المحافظة</FieldLabel>
                <Select value={governorate} onValueChange={setGovernorate}>
                  <SelectTrigger
                    dir="rtl"
                    className="h-[52px] w-full rounded-xl border-[#E8E6E1] bg-white text-[14px] font-semibold text-[#141416]"
                  >
                    <SelectValue placeholder="اختر المحافظة" />
                  </SelectTrigger>
                  <SelectContent>
                    {IN_SCOPE_GOVERNORATES.map((g) => (
                      <SelectItem key={g} value={g} className="text-[14px]">
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <FieldLabel htmlFor="sw-kyc-address" hint="اختياري">
                  العنوان (المديرية/الحي)
                </FieldLabel>
                <TextField
                  id="sw-kyc-address"
                  value={address}
                  onChange={setAddress}
                  placeholder="مثال: الحوبان، حي الروضة"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel htmlFor="sw-kyc-occupation" hint="اختياري">
                    المهنة
                  </FieldLabel>
                  <TextField
                    id="sw-kyc-occupation"
                    value={occupation}
                    onChange={setOccupation}
                    placeholder="مثال: معلمة"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="sw-kyc-income" hint="اختياري">
                    الدخل الشهري
                  </FieldLabel>
                  <TextField
                    id="sw-kyc-income"
                    value={monthlyIncome}
                    onChange={setMonthlyIncome}
                    placeholder="بالريال اليمني"
                    inputMode="numeric"
                  />
                </div>
              </div>

              {/* حقلا الملف — رفع فعلي بصيغ JPEG/PNG/WEBP حتى 5MB مع معاينة */}
              {[
                {
                  key: "doc" as const,
                  label: "بطاقة الهوية",
                  required: true,
                  picked: doc.picked,
                  onPick: pickFile("doc"),
                  id: "sw-kyc-doc-file",
                },
                {
                  key: "selfie" as const,
                  label: "صورة شخصية",
                  required: false,
                  picked: selfie.picked,
                  onPick: pickFile("selfie"),
                  id: "sw-kyc-selfie-file",
                },
              ].map((f) => (
                <div key={f.key}>
                  <FieldLabel htmlFor={f.id} hint={f.required ? undefined : "اختياري"}>
                    {f.label}
                  </FieldLabel>
                  <input
                    id={f.id}
                    type="file"
                    accept={ACCEPT_ATTR}
                    className="sr-only"
                    onChange={(e) => {
                      f.onPick(e.target.files?.[0] ?? null);
                      // السماح بإعادة اختيار نفس الملف بعد رفض التحقق
                      e.target.value = "";
                    }}
                  />
                  <label
                    htmlFor={f.id}
                    className={cn(
                      "flex min-h-[52px] w-full cursor-pointer items-center gap-2.5 rounded-xl border border-dashed p-2.5 text-right transition-colors",
                      f.picked
                        ? "border-[#15803D]/40 bg-[#15803D]/[0.05]"
                        : "border-[#E8E6E1] bg-[#F7F6F2] px-4 hover:border-[#C9A227]/50 hover:bg-[#FDFCFA]",
                    )}
                  >
                    {f.picked ? (
                      <img
                        src={f.picked.url}
                        alt={f.label}
                        className="h-11 w-11 shrink-0 rounded-lg border border-[#E8E6E1] bg-white object-cover"
                      />
                    ) : (
                      <Upload strokeWidth={1.5} className="h-5 w-5 shrink-0 text-[#A3A09B]" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        dir="auto"
                        className={cn(
                          "block truncate text-[14px] font-semibold",
                          f.picked ? "text-[#141416]" : "text-[#A3A09B]",
                        )}
                      >
                        {f.picked ? f.picked.file.name : `اضغط لاختيار ${f.label}`}
                      </span>
                      {f.picked ? (
                        <span className="block text-[11px] font-medium text-[#15803D]">
                          {formatFileSize(f.picked.file.size)} — سيُرفع مع الطلب
                          {!f.required ? " (اختياري)" : ""}
                        </span>
                      ) : (
                        <span className="block text-[11px] font-medium text-[#A3A09B]">
                          JPEG/PNG/WEBP — حتى 5MB
                        </span>
                      )}
                    </span>
                  </label>
                </div>
              ))}

              {fileError ? (
                <div className="rounded-xl border border-[#B91C1C]/25 bg-[#B91C1C]/[0.05] p-3">
                  <p className="text-[13px] font-semibold text-[#B91C1C]">
                    {fileError.field === "doc" ? "بطاقة الهوية" : "الصورة الشخصية"} — {fileError.message}
                  </p>
                </div>
              ) : null}

              {submitError ? (
                <div className="rounded-xl border border-[#B91C1C]/25 bg-[#B91C1C]/[0.05] p-3">
                  <p className="text-[13px] font-semibold text-[#B91C1C]">{submitError.message}</p>
                  {submitError.code !== "SYS-001" ? (
                    <p dir="ltr" className="mt-0.5 text-[11px] font-medium text-[#A3A09B]">
                      {submitError.code}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <PrimaryActionButton
                onClick={() => void submit()}
                loading={submitting}
                disabled={!formValid}
                disabledReason={
                  !nameValid
                    ? "أدخل الاسم الكامل كما في الهوية"
                    : !idNumberValid
                      ? "أدخل رقم وثيقة صحيحاً (4 محارف على الأقل)"
                      : !govValid
                        ? "اختر المحافظة"
                        : !docValid
                          ? "أرفق صورة بطاقة الهوية (JPEG/PNG حتى 5MB)"
                          : undefined
                }
              >
                إرسال طلب التوثيق
              </PrimaryActionButton>

              <p className="text-center text-[11.5px] font-medium leading-5 text-[#A3A09B]">
                تراجع الامتثال الطلبات خلال 24 ساعة عمل. ستحصل على إشعار فور صدور القرار،
                ويُرفع مستوى حسابك تلقائياً عند القبول.
              </p>
            </div>
          </SectionCard>
        ) : kyc?.status === "PENDING" ? (
          /* ===== (ب) بانتظار المراجعة ===== */
          <SectionCard>
            <div className="flex flex-col items-center py-4 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#B45309]/25 bg-[#B45309]/[0.08] text-[#B45309]">
                <Clock strokeWidth={1.5} className="h-7 w-7" />
              </span>
              <h3 className="mt-3 text-[18px] font-bold text-[#141416]">
                طلبك قيد المراجعة
              </h3>
              <p className="mt-1.5 max-w-[300px] text-[13.5px] font-medium leading-6 text-[#5C5A56]">
                سيصلك إشعار عند المراجعة — عادة خلال 24 ساعة عمل. حدك الحالي
                يبقى على مستوى «غير موثّق» حتى صدور القرار.
              </p>

              <div className="mt-4 w-full divide-y divide-[#E8E6E1]/70 rounded-xl bg-[#F7F6F2] p-3 text-right">
                {[
                  { label: "الاسم المقدَّم", value: kyc.fullName },
                  { label: "نوع الوثيقة", value: ID_TYPE_LABELS[kyc.idType] },
                  { label: "رقم الوثيقة", value: kyc.idNumberMasked },
                  { label: "المحافظة", value: kyc.governorate },
                  { label: "تاريخ التقديم", value: new Intl.DateTimeFormat("ar", { dateStyle: "long" }).format(new Date(kyc.submittedAt)) },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-[12.5px] font-medium text-[#5C5A56]">{row.label}</span>
                    <span className="text-[13px] font-semibold text-[#141416]">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        ) : kyc?.status === "APPROVED" ? (
          /* ===== (ج) معتمد ===== */
          <SectionCard>
            <div className="flex flex-col items-center py-4 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#15803D]/25 bg-[#15803D]/[0.08] text-[#15803D]">
                <BadgeCheck strokeWidth={1.5} className="h-7 w-7" />
              </span>
              <h3 className="mt-3 text-[18px] font-bold text-[#15803D]">حسابك موثّق</h3>
              <p className="mt-1.5 max-w-[300px] text-[13.5px] font-medium leading-6 text-[#5C5A56]">
                تمت الموافقة على طلبك — تُطبَّق عليك حدود المستوى الموثّق لكل العملات.
              </p>
              <div className="mt-3 flex items-center gap-1.5 rounded-full border border-[#E8E6E1] bg-[#F7F6F2] px-3 py-1 text-[11.5px] font-semibold text-[#5C5A56]">
                <ArrowLeftRight strokeWidth={1.5} className="h-3.5 w-3.5 text-[#C9A227]" />
                راجع جدولَي الحدود أعلاه
              </div>
            </div>
          </SectionCard>
        ) : (
          /* REJECTED مع عرض الزر في النموذج أعلاه — حالة احتياطية */
          <SectionCard>
            <div className="flex flex-col items-center py-4 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#B91C1C]/25 bg-[#B91C1C]/[0.07] text-[#B91C1C]">
                <XCircle strokeWidth={1.5} className="h-7 w-7" />
              </span>
              <h3 className="mt-3 text-[18px] font-bold text-[#B91C1C]">طلبك مرفوض</h3>
              {kyc?.reviewNote ? (
                <p className="mt-1.5 max-w-[300px] text-[13.5px] font-medium leading-6 text-[#5C5A56]">
                  {kyc.reviewNote}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setForceForm(true)}
                className="mt-4 flex min-h-11 items-center justify-center rounded-xl bg-[#0B0B0C] px-6 text-[14px] font-bold text-white"
              >
                إعادة التقديم
              </button>
            </div>
          </SectionCard>
        )}
      </div>

      <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-[#E8E6E1] bg-white p-3">
        <ShieldQuestion strokeWidth={1.5} className="mt-0.5 h-5 w-5 shrink-0 text-[#C9A227]" />
        <p className="text-[12px] font-medium leading-5 text-[#5C5A56]">
          يقبل رفع صور JPEG/PNG/WEBP حتى 5MB لكل ملف. مستنداتك تُحفظ بصلاحيات
          وصول مقيدة على الخادم ولا يطّلع عليها إلا فريق الامتثال لمراجعة طلبك،
          وتُحذف نسخ التقديم السابق عند إعادة الإرسال.
        </p>
      </div>
    </div>
  );
}
