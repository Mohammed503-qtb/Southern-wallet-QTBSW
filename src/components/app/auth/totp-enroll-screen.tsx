/**
 * محفظة الجنوب — شاشة إلحاق المصادقة (TOTP Enrollment)
 * تُعرض مرة واحدة: رمز QR + المفتاح اليدوي + إرشادات تطبيق المصادقة،
 * ثم تأكيد برمز 6 خانات:
 *  • وضع REGISTER → POST /api/auth/register/confirm → recovery-codes.
 *  • وضع REENROLL → POST /api/auth/login/reenroll-confirm (مع رمز التفعيل)
 *    → recovery-codes (ثم التطبيق مباشرة).
 */
"use client";

import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff, ScanLine } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { api, ApiError, saveSessionToken } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { OTPInput } from "@/components/app/ui/otp-input";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import type { AuthResultView } from "@/lib/api-types";

export function TotpEnrollScreen() {
  const enrollment = useAppStore((s) => s.enrollment);
  const setEnrollment = useAppStore((s) => s.setEnrollment);
  const setRecoveryCodesState = useAppStore((s) => s.setRecoveryCodesState);
  const resetTo = useAppStore((s) => s.resetTo);

  const [code, setCode] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // حماية: دخول الشاشة بلا سياق إلحاق → عودة للدخول
  useEffect(() => {
    if (!enrollment) resetTo("login");
  }, [enrollment, resetTo]);

  if (!enrollment) return null;

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      toast({ title: "تم نسخ المفتاح" });
    } catch {
      toast({ title: "تعذّر النسخ", variant: "destructive" });
    }
  };

  const confirm = async (value: string) => {
    if (value.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const data =
        enrollment.mode === "REGISTER"
          ? await api.post<AuthResultView>("/api/auth/register/confirm", {
              phone: enrollment.phone,
              code: value,
            })
          : await api.post<AuthResultView>("/api/auth/login/reenroll-confirm", {
              phone: enrollment.phone,
              token: enrollment.token,
              code: value,
            });
      if (data.sessionToken) saveSessionToken(data.sessionToken);
      setEnrollment(null);
      if (data.recoveryCodes?.length) {
        setRecoveryCodesState({
          codes: data.recoveryCodes,
          // التسجيل الجديد يحتاج تعيين PIN — إعادة الإلحاق تدخل التطبيق مباشرة
          next: enrollment.mode === "REGISTER" ? "pin" : "app",
        });
        resetTo("recovery-codes");
      } else if (data.needsPin) {
        resetTo("pin-create");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.code === "AUTH-002" || err.code === "AUTH-003") setCode("");
      } else {
        setError("تعذر التحقق من الرمز — تحقق من اتصالك");
      }
    } finally {
      setLoading(false);
    }
  };

  // تنسيق المفتاح اليدوي: مجموعات من 4 محارف
  const spacedSecret = enrollment.secret.replace(/(.{4})/g, "$1 ").trim();

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-4 pb-8">
      <ScreenHeader
        title={enrollment.mode === "REGISTER" ? "تفعيل المصادقة" : "إعادة تفعيل المصادقة"}
        subtitle="اربط حسابك بتطبيق مصادقة على جهازك — خطوة إلزامية واحدة"
        showBack={false}
      />

      <p className="mt-3 text-center text-[13px] font-medium leading-6 text-[#5C5A56]">
        {enrollment.mode === "REGISTER"
          ? "خطوة أخيرة لإتمام إنشاء حسابك — تُنشئ رمز دخول يتجدد كل 30 ثانية بلا اتصال."
          : "ألحق جهاز مصادقة جديداً — الرمز القديم بُطل نهائياً."}
      </p>

      {/* خطوات الإعداد */}
      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#E8E6E1] bg-white p-3">
        <ScanLine strokeWidth={1.5} className="mt-0.5 h-5 w-5 shrink-0 text-[#C9A227]" />
        <div className="text-[12.5px] font-medium leading-6 text-[#5C5A56]">
          <p className="font-bold text-[#141416]">ثلاث خطوات:</p>
          <p>1. ثبّت تطبيق مصادقة (Google Authenticator أو أي تطبيق TOTP).</p>
          <p>2. امسح الرمز أدناه أو أدخل المفتاح يدوياً.</p>
          <p>3. أدخل الرمز الظاهر لديك للتأكيد.</p>
        </div>
      </div>

      {/* رمز QR */}
      <div className="mt-5 flex flex-col items-center">
        <div className="rounded-2xl border border-[#E8E6E1] bg-white p-4 shadow-[0_8px_24px_rgba(11,11,12,0.06)]">
          <img
            src={enrollment.qrDataUrl}
            alt="رمز إعداد المصادقة"
            width={232}
            height={232}
            className="h-[232px] w-[232px]"
          />
        </div>

        {/* المفتاح اليدوي */}
        <div className="mt-4 w-full">
          <button
            type="button"
            onClick={() => setShowSecret((v) => !v)}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#E8E6E1] bg-white text-[13px] font-bold text-[#5C5A56] transition-colors hover:border-[#C9A227]/60 hover:text-[#141416]"
          >
            {showSecret ? (
              <EyeOff strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
            ) : (
              <Eye strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
            )}
            {showSecret ? "إخفاء المفتاح اليدوي" : "لا تستطيع المسح؟ إدخال المفتاح يدوياً"}
          </button>
          {showSecret ? (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-[#C9A227]/35 bg-[#C9A227]/[0.06] px-4 py-3">
              <p
                dir="ltr"
                className="min-w-0 break-all text-[13px] font-bold tracking-widest text-[#141416]"
              >
                {spacedSecret}
              </p>
              <button
                type="button"
                onClick={() => void copySecret()}
                aria-label="نسخ المفتاح"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#5C5A56] transition-colors hover:text-[#141416]"
              >
                <Copy strokeWidth={1.5} className="h-5 w-5" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* تأكيد الرمز */}
      <div className="mt-6">
        <p className="mb-1.5 text-[11px] font-semibold text-[#5C5A56]">
          أدخل الرمز الظاهر في تطبيق المصادقة للتأكيد
        </p>
        <OTPInput
          value={code}
          onChange={setCode}
          onComplete={(c) => void confirm(c)}
          error={error ?? undefined}
          disabled={loading}
        />
      </div>

      <div className="mt-6">
        <PrimaryActionButton
          onClick={() => void confirm(code)}
          loading={loading}
          disabled={code.length !== 6}
          disabledReason={code.length !== 6 ? "أدخل الرمز المكوّن من 6 أرقام" : undefined}
        >
          تأكيد وتفعيل
        </PrimaryActionButton>
      </div>

      <p className="mt-auto pt-6 text-center text-[12px] font-medium leading-5 text-[#A3A09B]">
        احتفظ بجهازك بأمان — ستحصل بعد التفعيل على رموز استرداد للطوارئ.
      </p>
    </div>
  );
}
