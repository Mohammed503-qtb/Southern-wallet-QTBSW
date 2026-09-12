/**
 * محفظة الجنوب — شاشة رمز التحقق (SC-04 OTP)
 * OTPInput بـ6 خانات + بطاقة ذهبية رفيعة تعرض devCode (وضع Alpha) مع زر نسخ،
 * إعادة إرسال بعد 60 ثانية، ثم POST /api/auth/verify:
 * - وضع REGISTER: يُنشئ الحساب (يُرفق fullName/governorate من مسودة التسجيل)
 *   ثم needsPin → pin-create.
 * - وضع LOGIN: جلسة مباشرة → bootstrap() يوجّه (رئيسية/لوحة).
 * أخطاء AUTH-002/003 معروضة داخل الحقل، وإعادة الإرسال تحترم AUTH-004.
 */
"use client";

import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { api, ApiError, saveSessionToken } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { OTPInput } from "@/components/app/ui/otp-input";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ScreenHeader } from "@/components/app/ui/screen-header";

/** ثواني انتظار AUTH-004 من تفاصيل الخطأ (secondsRemaining أو retryAfterSeconds) */
function readAuth004Seconds(details?: Record<string, string | number>): number {
  for (const key of ["secondsRemaining", "retryAfterSeconds"]) {
    const v = details?.[key];
    if (typeof v === "number" && v > 0) return Math.round(v);
  }
  return 60;
}

export function OtpScreen() {
  const pendingOtp = useAppStore((s) => s.pendingOtp);
  const setPendingOtp = useAppStore((s) => s.setPendingOtp);
  const registerDraft = useAppStore((s) => s.registerDraft);
  const setRegisterDraft = useAppStore((s) => s.setRegisterDraft);
  const resetTo = useAppStore((s) => s.resetTo);
  const bootstrap = useAppStore((s) => s.bootstrap);

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(60);

  // حماية: دخول الشاشة بلا سياق OTP → عودة للدخول
  useEffect(() => {
    if (!pendingOtp) resetTo("login");
  }, [pendingOtp, resetTo]);

  // عدّاد إعادة الإرسال
  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setInterval(() => setResendSeconds((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [resendSeconds]);

  if (!pendingOtp) return null;

  const isRegister = pendingOtp.mode === "REGISTER";

  const verify = async (value: string) => {
    if (value.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const data = await api.post<{
        user: { id: string; role: string; status: string };
        needsPin: boolean;
        sessionToken?: string;
      }>("/api/auth/verify", {
        phone: pendingOtp.phone,
        code: value,
        // بيانات إنشاء الحساب (وضع REGISTER فقط — يتجاهلها الخادم في LOGIN)
        ...(isRegister && registerDraft
          ? {
              fullName: registerDraft.fullName,
              governorate: registerDraft.governorate,
            }
          : {}),
      });
      if (data.sessionToken) saveSessionToken(data.sessionToken);
      setPendingOtp(null);
      setRegisterDraft(null);
      if (data.needsPin) {
        resetTo("pin-create");
      } else {
        // bootstrap يقرر: عميل → رئيسية، غيره → لوحة
        await bootstrap();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrorCode(err.code);
        // إدخال خاطئ: صفّر الحقل ليدخل من جديد
        if (err.code === "AUTH-002" || err.code === "AUTH-003") setCode("");
        if (err.code === "AUTH-003") setResendSeconds(900); // قفل 15 دقيقة
      } else {
        setError("تعذر التحقق من الرمز — تحقق من اتصالك");
        setErrorCode("NET-000");
      }
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (resending || resendSeconds > 0) return;
    setResending(true);
    setError(null);
    setErrorCode(null);
    try {
      const data = await api.post<{
        mode: "REGISTER" | "LOGIN";
        devCode: string;
        expiresInSeconds: number;
      }>("/api/auth/otp", { phone: pendingOtp.phone });
      setPendingOtp({ ...pendingOtp, devCode: data.devCode, mode: data.mode });
      setResendSeconds(60);
      setCode("");
      toast({ title: "أُعيد إرسال رمز التحقق", description: "تحقق من الرسالة الجديدة" });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrorCode(err.code);
        if (err.code === "AUTH-004") {
          const retry =
            readAuth004Seconds(err.details);
          setResendSeconds(Math.max(1, Math.round(retry)));
        }
      } else {
        setError("تعذر إعادة إرسال الرمز — تحقق من اتصالك");
        setErrorCode("NET-000");
      }
    } finally {
      setResending(false);
    }
  };

  const copyDevCode = async () => {
    if (!pendingOtp.devCode) return;
    try {
      await navigator.clipboard.writeText(pendingOtp.devCode);
      toast({ title: "تم نسخ رمز التحقق" });
    } catch {
      toast({ title: "تعذّر النسخ", variant: "destructive" });
    }
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[440px] flex-col px-4 pb-8">
      <ScreenHeader
        title="رمز التحقق"
        subtitle={
          isRegister
            ? "أدخل الرمز لإتمام إنشاء حسابك الجديد"
            : "أدخل الرمز لتسجيل الدخول"
        }
        onBack={() => resetTo("login")}
      />

      <p className="mt-4 text-center text-[14px] font-medium leading-6 text-[#5C5A56]">
        أرسلنا رمزاً من 6 أرقام إلى{" "}
        <span dir="ltr" className="font-bold tabular-nums text-[#141416]">
          +967 {pendingOtp.phone}
        </span>
      </p>

      {/* بطاقة devCode الذهبية (وضع Alpha) */}
      {pendingOtp.devCode ? (
        <div className="mx-auto mt-4 flex w-full max-w-[320px] items-center justify-between gap-3 rounded-xl border border-[#C9A227]/35 bg-[#C9A227]/[0.08] px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold text-[#8A6E14]">وضع Alpha — رمز التحقق</p>
            <p dir="ltr" className="text-[20px] font-extrabold tracking-[0.2em] tabular-nums text-[#141416]">
              {pendingOtp.devCode}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyDevCode()}
            aria-label="نسخ رمز التحقق"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#5C5A56] transition-colors hover:text-[#141416]"
          >
            <Copy strokeWidth={1.5} className="h-5 w-5" />
          </button>
        </div>
      ) : null}

      <div className="mt-6">
        <OTPInput
          value={code}
          onChange={setCode}
          onComplete={(c) => void verify(c)}
          error={error ?? undefined}
          resendSeconds={resendSeconds}
          onResend={() => void resend()}
          disabled={loading}
        />
      </div>

      <div className="mt-6">
        <PrimaryActionButton
          onClick={() => void verify(code)}
          loading={loading}
          disabled={code.length !== 6}
          disabledReason={code.length !== 6 ? "أدخل الرمز المكوّن من 6 أرقام" : undefined}
        >
          تحقّق وتابع
        </PrimaryActionButton>
      </div>

      <p className="mt-auto pt-6 text-center text-[12px] font-medium text-[#A3A09B]">
        انتهت صلاحية الرمز؟ استخدم إعادة الإرسال بعد انتهاء العدّاد
      </p>
    </div>
  );
}
