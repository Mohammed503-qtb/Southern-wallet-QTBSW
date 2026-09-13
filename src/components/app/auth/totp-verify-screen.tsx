/**
 * محفظة الجنوب — شاشة رمز المصادقة (SC-04 Verify) — إنتاجية
 * وضعان بحسب حالة الحساب:
 *  • مفعّل المصادقة (enrolled): OTPInput بـ6 خانات لرمز TOTP من تطبيق
 *    المصادقة (يتجدد كل 30 ثانية) — أو رمز استرداد XXXX-XXXX.
 *  • غير مفعّل (بعد إعادة تعيين إدارية): إدخال رمز التفعيل R+7 الصادر
 *    من الدعم → الانتقال لشاشة إعادة الإلحاق (totp-enroll).
 * النجاح → needsPin → pin-create أو bootstrap. أخطاء AUTH-002/003/007
 * معروضة مع تصفير الحقل.
 */
"use client";

import { useEffect, useState } from "react";
import { KeyRound, LifeBuoy } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { api, ApiError, saveSessionToken } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { OTPInput } from "@/components/app/ui/otp-input";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import type { AuthResultView, EnrollmentView } from "@/lib/api-types";

interface VerifyOk {
  reEnroll?: { token: string; enrollment: EnrollmentView };
}

export function TotpVerifyScreen() {
  const pendingLogin = useAppStore((s) => s.pendingLogin);
  const setPendingLogin = useAppStore((s) => s.setPendingLogin);
  const setEnrollment = useAppStore((s) => s.setEnrollment);
  const resetTo = useAppStore((s) => s.resetTo);
  const bootstrap = useAppStore((s) => s.bootstrap);

  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // حماية: دخول الشاشة بلا سياق → عودة للدخول
  useEffect(() => {
    if (!pendingLogin) resetTo("login");
  }, [pendingLogin, resetTo]);

  if (!pendingLogin) return null;

  const enrolled = pendingLogin.enrolled;

  const handleAuthResult = async (data: AuthResultView) => {
    if (data.sessionToken) saveSessionToken(data.sessionToken);
    setPendingLogin(null);
    if (data.notice) {
      toast({ title: data.notice, description: "تواصل مع الدعم للمتابعة" });
    }
    if (data.needsPin) {
      resetTo("pin-create");
    } else {
      await bootstrap();
    }
  };

  const verify = async (value: string) => {
    if (loading) return;
    const submitted = enrolled ? value : value.trim().toUpperCase();
    if (enrolled ? submitted.length !== 6 : submitted.length !== 8) return;
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const data = await api.post<VerifyOk & AuthResultView>("/api/auth/login/verify", {
        phone: pendingLogin.phone,
        code: submitted,
      });
      if (data.reEnroll?.enrollment) {
        // رمز تفعيل صحيح → الانتقال لإعادة إلحاق المصادقة
        setEnrollment({
          phone: pendingLogin.phone,
          mode: "REENROLL",
          secret: data.reEnroll.enrollment.secret,
          otpauthUrl: data.reEnroll.enrollment.otpauthUrl,
          qrDataUrl: data.reEnroll.enrollment.qrDataUrl,
          token: data.reEnroll.token,
        });
        setPendingLogin(null);
        toast({ title: "رمز التفعيل صحيح", description: "ألحق جهاز مصادقة جديداً للمتابعة" });
        resetTo("totp-enroll");
        return;
      }
      await handleAuthResult(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrorCode(err.code);
        if (err.code === "AUTH-002" || err.code === "AUTH-003") {
          setCode("");
          setToken("");
        }
      } else {
        setError("تعذر التحقق من الرمز — تحقق من اتصالك");
        setErrorCode("NET-000");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[440px] flex-col px-4 pb-8">
      <ScreenHeader
        title="رمز المصادقة"
        subtitle={
          enrolled
            ? "أدخل الرمز من تطبيق المصادقة لتسجيل الدخول"
            : "أدخل رمز التفعيل الصادر لك من الدعم"
        }
        onBack={() => resetTo("login")}
      />

      <p className="mt-4 text-center text-[14px] font-medium leading-6 text-[#5C5A56]">
        {enrolled ? (
          <>
            الرمز الحالي لحساب{" "}
            <span dir="ltr" className="font-bold tabular-nums text-[#141416]">
              +967 {pendingLogin.phone}
            </span>{" "}
            من تطبيق المصادقة
          </>
        ) : (
          "حسابك بحاجة إلى تفعيل المصادقة من جديد — أدخل الرمز الذي سلّمك إياه فريق الدعم بعد التحقق"
        )}
      </p>

      {/* إدخال الرمز حسب الوضع */}
      <div className="mt-6">
        {enrolled ? (
          <OTPInput
            value={code}
            onChange={setCode}
            onComplete={(c) => void verify(c)}
            error={error ?? undefined}
            disabled={loading}
          />
        ) : (
          <div>
            <label
              htmlFor="sw-reenroll-token"
              className="mb-1.5 block text-center text-[11px] font-semibold text-[#5C5A56]"
            >
              رمز التفعيل (8 محارف يبدأ بـ R)
            </label>
            <input
              id="sw-reenroll-token"
              dir="ltr"
              inputMode="text"
              autoComplete="one-time-code"
              value={token}
              onChange={(e) => {
                setToken(e.target.value.toUpperCase().replace(/[^R2-9A-Z]/g, ""));
                setError(null);
              }}
              disabled={loading}
              placeholder="RXXXXXXX"
              className="h-[56px] w-full rounded-xl border border-[#E8E6E1] bg-white text-center text-[20px] font-extrabold tracking-[0.25em] text-[#141416] placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:outline-none"
            />
            {error ? (
              <p className="mt-2 text-center text-[13px] font-semibold text-[#B91C1C]">{error}</p>
            ) : null}
          </div>
        )}
      </div>

      {/* إجراء */}
      <div className="mt-6">
        <PrimaryActionButton
          onClick={() => void verify(enrolled ? code : token)}
          loading={loading}
          disabled={enrolled ? code.length !== 6 : token.length !== 8}
          disabledReason={
            enrolled
              ? code.length !== 6
                ? "أدخل الرمز المكوّن من 6 أرقام"
                : undefined
              : token.length !== 8
                ? "أدخل رمز التفعيل كاملاً (8 محارف)"
                : undefined
          }
        >
          تحقّق وتابع
        </PrimaryActionButton>
      </div>

      {/* تلميحات السفلية */}
      <div className="mt-auto space-y-2 pt-6">
        {enrolled ? (
          <p className="text-center text-[12px] font-medium leading-5 text-[#A3A09B]">
            الرمز يتجدد كل 30 ثانية — انتظر الرمز الجديد إذا انتهت صلاحيته.
            لديك{" "}
            <KeyRound strokeWidth={1.5} className="inline h-3.5 w-3.5 text-[#C9A227]" />{" "}
            رموز استرداد؟ أدخل أحدها بنفس الحقل.
          </p>
        ) : null}
        <p className="text-center text-[12px] font-medium leading-5 text-[#A3A09B]">
          <LifeBuoy strokeWidth={1.5} className="ml-1 inline h-3.5 w-3.5 text-[#C9A227]" />
          فقدت الوصول لمصادقتك؟{" "}
          <button
            type="button"
            onClick={() => useAppStore.getState().navigate("help")}
            className="min-h-11 font-bold text-[#C9A227] underline underline-offset-4"
          >
            مركز المساعدة
          </button>
        </p>
        {errorCode === "AUTH-003" ? (
          <p className="text-center text-[12px] font-semibold text-[#B45309]">
            قُفل الدخول مؤقتاً بعد محاولات خاطئة — انتظر 15 دقيقة ثم أعد المحاولة
          </p>
        ) : null}
      </div>
    </div>
  );
}
