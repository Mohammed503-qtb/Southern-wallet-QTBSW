/**
 * محفظة الجنوب — شاشة تسجيل الدخول (SC-03 Login)
 * رقم الهاتف (+967 و9 أرقام) → POST /api/auth/login → setPendingLogin
 * → totp-verify (رمز المصادقة أو رمز التفعيل). الحساب غير الموجود
 * يُوجَّه لإنشاء حساب جديد.
 */
"use client";

import { useState } from "react";
import { CircleAlert, UserPlus } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { api, ApiError } from "@/lib/api";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { PhoneField } from "./phone-field";

interface LoginInitView {
  exists: boolean;
  enrolled: boolean;
  frozen: boolean;
}

export function LoginScreen() {
  const navigate = useAppStore((s) => s.navigate);
  const setPendingLogin = useAppStore((s) => s.setPendingLogin);
  const setRegisterDraft = useAppStore((s) => s.setRegisterDraft);

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [notFound, setNotFound] = useState(false);

  const phoneValid = /^7\d{8}$/.test(phone);

  const submit = async () => {
    if (!phoneValid || loading) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await api.post<LoginInitView>("/api/auth/login", { phone });
      if (!data.exists) {
        // لا حساب بهذا الرقم — توجيه لإنشاء حساب
        setNotFound(true);
        return;
      }
      setRegisterDraft(null);
      setPendingLogin({ phone, enrolled: data.enrolled });
      navigate("totp-verify");
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ code: err.code, message: err.message });
      } else {
        setError({ code: "SYS-001", message: "تعذر بدء تسجيل الدخول — تحقق من اتصالك" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-4 pb-8">
      {/* ترويسة الشاشة */}
      <div className="flex items-center gap-3 pb-2 pt-8">
        <img src="/logo.svg" alt="" className="h-12 w-12" />
        <div>
          <h1 className="text-[22px] font-bold leading-[30px] text-[#141416]">
            تسجيل الدخول
          </h1>
          <p className="text-[13px] font-medium text-[#5C5A56]">
            أدخل رقم هاتفك اليمني للمتابعة برمز المصادقة
          </p>
        </div>
      </div>

      <div className="mt-6">
        <PhoneField
          value={phone}
          onChange={(v) => {
            setPhone(v);
            setNotFound(false);
            setError(null);
          }}
          error={error ? error.message : null}
          hint="رقم يمني يبدأ بـ 7 — 9 أرقام بلا مفتاح الدولة"
          disabled={loading}
          autoFocus
        />
      </div>

      {/* الرقم غير مسجل — توجيه للإنشاء */}
      {notFound ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2.5 rounded-xl border border-[#C9A227]/30 bg-[#C9A227]/[0.06] p-3"
        >
          <CircleAlert strokeWidth={1.5} className="mt-0.5 h-5 w-5 shrink-0 text-[#8A6E14]" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-6 text-[#8A6E14]">
              لا يوجد حساب بهذا الرقم بعد
            </p>
            <button
              type="button"
              onClick={() => {
                setRegisterDraft(phone ? { fullName: "", governorate: "" } : null);
                setPendingLogin(null);
                navigate("register");
              }}
              className="mt-1 flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-[#8A6E14] underline underline-offset-4"
            >
              <UserPlus strokeWidth={1.5} className="h-4 w-4" />
              إنشاء حساب جديد بهذا الرقم
            </button>
          </div>
        </div>
      ) : null}

      {error && !notFound ? (
        <p className="mt-3 text-[13px] font-semibold text-[#B91C1C]">{error.message}</p>
      ) : null}

      <div className="mt-6">
        <PrimaryActionButton
          onClick={() => void submit()}
          loading={loading}
          disabled={!phoneValid}
          disabledReason={
            !phoneValid ? "أدخل رقماً يمنياً صحيحاً يبدأ بـ 7 (9 أرقام)" : undefined
          }
        >
          تسجيل الدخول
        </PrimaryActionButton>
      </div>

      {/* إنشاء حساب */}
      <div className="mt-5 text-center">
        <p className="text-[14px] font-medium text-[#5C5A56]">
          ليس لديك حساب؟{" "}
          <button
            type="button"
            onClick={() => navigate("register")}
            className="min-h-11 font-bold text-[#C9A227] underline decoration-[#C9A227]/40 underline-offset-4 hover:text-[#A2831B]"
          >
            أنشئ حساباً
          </button>
        </p>
      </div>

      <p className="mt-auto pt-6 text-center text-[12px] font-medium leading-5 text-[#A3A09B]">
        محفظتك محمية بمصادقة ثنائية (TOTP) ورمز PIN لكل عملية مالية.
      </p>
    </div>
  );
}
