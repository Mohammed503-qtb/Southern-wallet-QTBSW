/**
 * محفظة الجنوب — شاشة إنشاء حساب جديد (SC-05 Register)
 * الاسم الكامل (حقلان: الاسم/اللقب) + المحافظة:
 * قائمة المحافظات الثماني داخل النطاق + خيار "محافظة أخرى (خارج نطاق الخدمة)"
 * (يكشف محافظات خارجية فرعية ويُظهر تحذيراً كهرمانياً بوضع الاطلاع فقط — AC-07).
 * المتابعة → POST /api/auth/otp (وضع REGISTER) → شاشة OTP → verify ينشئ الحساب.
 */
"use client";

import { useEffect, useState } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { api, ApiError } from "@/lib/api";
import {
  IN_SCOPE_GOVERNORATES,
  OUT_OF_SCOPE_EXAMPLES,
} from "@/lib/api-types";
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

/** ثواني انتظار AUTH-004 من تفاصيل الخطأ (secondsRemaining أو retryAfterSeconds) */
function readAuth004Seconds(details?: Record<string, string | number>): number {
  for (const key of ["secondsRemaining", "retryAfterSeconds"]) {
    const v = details?.[key];
    if (typeof v === "number" && v > 0) return Math.round(v);
  }
  return 60;
}

export function RegisterScreen() {
  const resetTo = useAppStore((s) => s.resetTo);
  const navigate = useAppStore((s) => s.navigate);
  const setPendingOtp = useAppStore((s) => s.setPendingOtp);
  const setRegisterDraft = useAppStore((s) => s.setRegisterDraft);

  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [governorate, setGovernorate] = useState<string>("");
  const [outGovernorate, setOutGovernorate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const isOther = governorate === OTHER;
  const effectiveGovernorate = isOther ? outGovernorate : governorate;

  const phoneValid = /^7\d{8}$/.test(phone);
  const nameValid = firstName.trim().length >= 2 && lastName.trim().length >= 2;
  const govValid = isOther ? OUT_OF_SCOPE.includes(outGovernorate) : governorate !== "";
  const formValid = phoneValid && nameValid && govValid && cooldown === 0;

  const submit = async () => {
    if (!formValid) return;
    setFieldError(null);
    setError(null);
    setLoading(true);
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    try {
      const data = await api.post<{ mode: "REGISTER" | "LOGIN"; devCode: string }>(
        "/api/auth/otp",
        { phone },
      );
      if (data.mode === "LOGIN") {
        setError({
          code: "AUTH-900",
          message: "هذا الرقم مسجّل مسبقاً — سجّل الدخول بدلاً من إنشاء حساب جديد",
        });
        return;
      }
      // وضع REGISTER: خزّن بيانات النموذج ليُرفقها verify عند إنشاء الحساب
      setRegisterDraft({ fullName, governorate: effectiveGovernorate });
      setPendingOtp({ phone, mode: "REGISTER", devCode: data.devCode });
      navigate("otp");
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ code: err.code, message: err.message });
        if (err.code === "AUTH-004") {
          const retry =
            readAuth004Seconds(err.details);
          setCooldown(Math.max(1, Math.round(retry)));
        }
      } else {
        setError({ code: "SYS-001", message: "تعذر بدء التسجيل — تحقق من اتصالك" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[440px] flex-col px-4 pb-8">
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
            {error.code === "AUTH-900" ? (
              <button
                type="button"
                onClick={() => resetTo("login")}
                className="mt-1 min-h-11 text-[13px] font-bold text-[#B91C1C] underline underline-offset-4"
              >
                الانتقال لتسجيل الدخول
              </button>
            ) : cooldown > 0 ? (
              <p className="mt-0.5 text-[12px] font-medium text-[#B45309]">
                أعد المحاولة بعد <span className="tabular-nums font-bold">{cooldown}</span> ثانية
              </p>
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
            cooldown > 0
              ? `انتظر ${cooldown} ثانية قبل إعادة المحاولة`
              : !phoneValid
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
