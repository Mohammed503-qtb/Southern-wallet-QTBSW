/**
 * محفظة الجنوب — شاشة إنشاء حساب جديد (SC-05 Register)
 * الاسم الكامل (حقلان: الاسم/اللقب) + المحافظة:
 * قائمة المحافظات الثماني داخل النطاق + خيار "محافظة أخرى (خارج نطاق الخدمة)"
 * (يُظهر تحذيراً كهرمانياً بوضع الاطلاع فقط — AC-07).
 * المتابعة → POST /api/auth/register → شاشة إلحاق المصادقة (totp-enroll).
 */
"use client";

import { useState } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { api, ApiError } from "@/lib/api";
import { IN_SCOPE_GOVERNORATES, OUT_OF_SCOPE_EXAMPLES } from "@/lib/api-types";
import type { EnrollmentView } from "@/lib/api-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { PhoneField } from "./phone-field";
import { cn } from "@/lib/utils";

const OTHER = "__OTHER__";

/** محافظات خارج النطاق (مع تصفية أي تكرار مع قائمة الداخل) */
const OUT_OF_SCOPE = OUT_OF_SCOPE_EXAMPLES.filter(
  (g) => !IN_SCOPE_GOVERNORATES.includes(g as (typeof IN_SCOPE_GOVERNORATES)[number]),
);

export function RegisterScreen() {
  const resetTo = useAppStore((s) => s.resetTo);
  const navigate = useAppStore((s) => s.navigate);
  const setEnrollment = useAppStore((s) => s.setEnrollment);
  const setRegisterDraft = useAppStore((s) => s.setRegisterDraft);

  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [governorate, setGovernorate] = useState<string>("");
  const [outGovernorate, setOutGovernorate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const isOther = governorate === OTHER;
  const effectiveGovernorate = isOther ? outGovernorate : governorate;

  const phoneValid = /^7\d{8}$/.test(phone);
  const nameValid = firstName.trim().length >= 2 && lastName.trim().length >= 2;
  const govValid = isOther ? OUT_OF_SCOPE.includes(outGovernorate) : governorate !== "";
  const formValid = phoneValid && nameValid && govValid;

  const submit = async () => {
    if (!formValid) return;
    setFieldError(null);
    setError(null);
    setLoading(true);
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    try {
      const data = await api.post<{ enrollment: EnrollmentView }>("/api/auth/register", {
        phone,
        fullName,
        governorate: effectiveGovernorate,
      });
      // نجح إنشاء الحساب (أو تجديد تسجيل مهجور) → إلحاق المصادقة
      setRegisterDraft(null);
      setEnrollment({
        phone,
        mode: "REGISTER",
        secret: data.enrollment.secret,
        otpauthUrl: data.enrollment.otpauthUrl,
        qrDataUrl: data.enrollment.qrDataUrl,
      });
      navigate("totp-enroll");
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ code: err.code, message: err.message });
      } else {
        setError({ code: "SYS-001", message: "تعذر بدء التسجيل — تحقق من اتصالك" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-4 pb-8">
      <ScreenHeader
        title="إنشاء حساب جديد"
        subtitle="حساب عميل في محفظة الجنوب — التسجيل عبر رمز تحقق"
        onBack={() => resetTo("login")}
      />

      <div className="mt-5">
        <PhoneField
          value={phone}
          onChange={(v) => {
            setPhone(v);
            setFieldError(null);
          }}
          disabled={loading}
          hint="سيُرسل رمز تحقق إلى هذا الرقم"
        />
      </div>

      {/* الاسم الكامل: الاسم واللقب */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="sw-first" className="mb-1.5 block text-[11px] font-semibold text-[#5C5A56]">
            الاسم
          </label>
          <input
            id="sw-first"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={loading}
            placeholder="مثال: أحمد"
            className="h-[52px] w-full rounded-xl border border-[#E8E6E1] bg-white px-4 text-[15px] font-semibold text-[#141416] placeholder:font-medium placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="sw-last" className="mb-1.5 block text-[11px] font-semibold text-[#5C5A56]">
            اللقب
          </label>
          <input
            id="sw-last"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={loading}
            placeholder="مثال: السُّقطري"
            className="h-[52px] w-full rounded-xl border border-[#E8E6E1] bg-white px-4 text-[15px] font-semibold text-[#141416] placeholder:font-medium placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:outline-none"
          />
        </div>
      </div>

      {/* المحافظة */}
      <div className="mt-4">
        <p className="mb-1.5 text-[11px] font-semibold text-[#5C5A56]">المحافظة</p>
        <Select
          value={governorate}
          onValueChange={(v) => {
            setGovernorate(v);
            setOutGovernorate("");
            setFieldError(null);
          }}
          disabled={loading}
        >
          <SelectTrigger className="h-[52px] w-full rounded-xl border-[#E8E6E1] bg-white text-[15px] font-semibold text-[#141416]">
            <SelectValue placeholder="اختر محافظتك" />
          </SelectTrigger>
          <SelectContent>
            {IN_SCOPE_GOVERNORATES.map((g) => (
              <SelectItem key={g} value={g} className="text-[15px]">
                {g}
              </SelectItem>
            ))}
            <SelectItem value={OTHER} className="text-[15px] text-[#B45309]">
              محافظة أخرى (خارج نطاق الخدمة)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* محافظة خارجية فرعية */}
      {isOther ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-semibold text-[#5C5A56]">حدّد محافظتك</p>
          <Select
            value={outGovernorate}
            onValueChange={(v) => {
              setOutGovernorate(v);
              setFieldError(null);
            }}
            disabled={loading}
          >
            <SelectTrigger className="h-[52px] w-full rounded-xl border-[#E8E6E1] bg-white text-[15px] font-semibold text-[#141416]">
              <SelectValue placeholder="اختر من القائمة" />
            </SelectTrigger>
            <SelectContent>
              {OUT_OF_SCOPE.map((g) => (
                <SelectItem key={g} value={g} className="text-[15px]">
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {/* تحذير سياسة النطاق الجغرافي (AC-07) */}
      {isOther ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2.5 rounded-xl border border-[#B45309]/30 bg-[#B45309]/[0.07] p-3"
        >
          <TriangleAlert strokeWidth={1.5} className="mt-0.5 h-5 w-5 shrink-0 text-[#B45309]" />
          <p className="text-[13px] font-semibold leading-6 text-[#B45309]">
            سيُنشأ حساب بوضع الاطلاع فقط — لا عمليات مالية (سياسة النطاق الجغرافي).
            نطاق الخدمة الحالي: المحافظات الجنوبية الثماني.
          </p>
        </div>
      ) : null}

      {/* خطأ عام (رقم مستخدم/انتظار/شبكة) */}
      {error ? (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-[#B91C1C]/25 bg-[#B91C1C]/[0.05] p-3">
          <CircleAlert strokeWidth={1.5} className="mt-0.5 h-5 w-5 shrink-0 text-[#B91C1C]" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-6 text-[#B91C1C]">{error.message}</p>
            {error.code === "AUTH-901" ? (
              <button
                type="button"
                onClick={() => resetTo("login")}
                className="mt-1 min-h-11 text-[13px] font-bold text-[#B91C1C] underline underline-offset-4"
              >
                الانتقال لتسجيل الدخول
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {fieldError ? (
        <p className="mt-3 text-[13px] font-medium text-[#B91C1C]">{fieldError}</p>
      ) : null}

      <div className={cn("mt-6", !formValid && !error && "mt-auto pt-6")}>
        <PrimaryActionButton
          onClick={() => void submit()}
          loading={loading}
          disabled={!formValid}
          disabledReason={
            !phoneValid
                ? "أدخل رقماً يمنياً صحيحاً (9 أرقام تبدأ بـ 7)"
                : !nameValid
                  ? "أدخل الاسم واللقب (حرفان على الأقل لكل منهما)"
                  : !govValid
                    ? "اختر المحافظة (وحدّد محافظتك إن كانت خارج النطاق)"
                    : undefined
          }
        >
          متابعة — إرسال رمز التحقق
        </PrimaryActionButton>
      </div>

      <p className="mt-4 text-center text-[12px] font-medium leading-5 text-[#A3A09B]">
        بإنشاء الحساب أنت توافق على شروط الخدمة وسياسة الخصوصية.
        ستحتاج بعدها إلى تعيين رمز PIN من 6 أرقام.
      </p>
    </div>
  );
}
