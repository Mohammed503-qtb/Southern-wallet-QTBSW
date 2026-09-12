/**
 * محفظة الجنوب — شاشة تسجيل الدخول (SC-03 Login)
 * رقم الهاتف (+967 و9 أرقام) → POST /api/auth/otp → setPendingOtp → otp.
 * AUTH-004 (انتظار الإرسال) يظهر بعدّاد ثوانٍ. "حسابات تجريبية" تفتح Sheet
 * بأزرار الدخول السريع (Seed) — مفيد على الجوال. رابط إنشاء حساب → register.
 */
"use client";

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { api, ApiError } from "@/lib/api";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { PhoneField } from "./phone-field";
import { DemoLoginButtons } from "../shell/demo-login";

/** ثواني انتظار AUTH-004 من تفاصيل الخطأ (secondsRemaining عند 8-a أو retryAfterSeconds) */
function readAuth004Seconds(details?: Record<string, string | number>): number {
  for (const key of ["secondsRemaining", "retryAfterSeconds"]) {
    const v = details?.[key];
    if (typeof v === "number" && v > 0) return Math.round(v);
  }
  return 60;
}

export function LoginScreen() {
  const navigate = useAppStore((s) => s.navigate);
  const setPendingOtp = useAppStore((s) => s.setPendingOtp);

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const phoneValid = /^7\d{8}$/.test(phone);

  const submit = async () => {
    if (!phoneValid || cooldown > 0) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<{ mode: "REGISTER" | "LOGIN"; devCode: string | null; expiresInSeconds: number }>(
        "/api/auth/otp",
        { phone },
      );
      setPendingOtp({ phone, mode: data.mode, devCode: data.devCode });
      navigate("otp");
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ code: err.code, message: err.message });
        if (err.code === "AUTH-004") {
          const retry = readAuth004Seconds(err.details);
          setCooldown(Math.max(1, Math.round(retry)));
        }
      } else {
        setError({ code: "SYS-001", message: "تعذر إرسال رمز التحقق — حاول مجدداً" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[440px] flex-col px-4 pb-8">
      {/* ترويسة الشاشة */}
      <div className="flex items-center gap-3 pb-2 pt-8">
        <img src="/logo.svg" alt="" className="h-12 w-12" />
        <div>
          <h1 className="text-[22px] font-bold leading-[30px] text-[#141416]">
            تسجيل الدخول
          </h1>
          <p className="text-[13px] font-medium text-[#5C5A56]">
            أدخل رقم هاتفك اليمني لإرسال رمز التحقق
          </p>
        </div>
      </div>

      <div className="mt-6">
        <PhoneField
          value={phone}
          onChange={setPhone}
          error={error && error.code !== "AUTH-004" ? error.message : null}
          hint="رقم يمني يبدأ بـ 7 — 9 أرقام بلا مفتاح الدولة"
          disabled={loading}
          autoFocus
        />
      </div>

      {/* خطأ AUTH-004 مع عدّاد الانتظار */}
      {error && error.code === "AUTH-004" ? (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-[#B45309]/25 bg-[#B45309]/[0.07] px-3 py-2.5 text-[13px] font-semibold text-[#B45309]">
          <span>{error.message}</span>
          {cooldown > 0 ? (
            <span className="tabular-nums font-bold">
              {cooldown} ث
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6">
        <PrimaryActionButton
          onClick={() => void submit()}
          loading={loading}
          disabled={!phoneValid || cooldown > 0}
          disabledReason={
            cooldown > 0
              ? `انتظر ${cooldown} ثانية قبل إعادة الإرسال`
              : !phoneValid
                ? "أدخل رقماً يمنياً صحيحاً يبدأ بـ 7 (9 أرقام)"
                : undefined
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

      {/* دخول سريع بالحسابات التجريبية */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="mt-auto mb-2 flex min-h-11 items-center justify-center gap-2 self-center rounded-xl border border-[#E8E6E1] bg-white px-5 py-3 text-[13px] font-bold text-[#5C5A56] transition-colors hover:border-[#C9A227]/60 hover:text-[#141416]"
      >
        <FlaskConical strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
        حسابات تجريبية (Seed)
      </button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-3xl px-4 pb-6">
          <SheetHeader className="pb-1 text-right">
            <SheetTitle className="text-right text-[18px] font-bold">حسابات تجريبية</SheetTitle>
            <SheetDescription className="text-right text-[13px] text-[#5C5A56]">
              دخول سريع بحسابات Seed (Alpha) — كل زر يفتح عالم الدور المناسب
            </SheetDescription>
          </SheetHeader>
          <DemoLoginButtons layout="sheet" onDone={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
