/**
 * محفظة الجنوب — شاشة إنشاء رمز PIN (SC-06 Create PIN)
 * مرحلتان: إدخال رمز جديد (6 أرقام) ثم تأكيده — التطابق → POST /api/pin
 * → فتح التطبيق مباشرة (bootstrap). عدم التطابق أو نمط ضعيف → رسالة وإعادة.
 */
"use client";

import { useRef, useState } from "react";
import { useAppStore } from "@/lib/app-store";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { PINPad } from "@/components/app/ui/pin-pad";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { cn } from "@/lib/utils";

type Phase = "enter" | "confirm";

/** كشف الأنماط الضعيفة: تكرار كامل أو تسلسل تصاعدي/تنازلي */
function isWeakPin(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true; // 111111
  const asc = "0123456789";
  if (asc.includes(pin)) return true; // 123456
  if (asc.includes([...pin].reverse().join(""))) return true; // 654321
  return false;
}

export function PinCreateScreen() {
  const resetTo = useAppStore((s) => s.resetTo);

  const [phase, setPhase] = useState<Phase>("enter");
  const [pin, setPin] = useState("");
  const firstPin = useRef<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weakWarning, setWeakWarning] = useState(false);

  const savePin = async (value: string) => {
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/pin", { pin: value });
      toast({ title: "تم تعيين رمز PIN بنجاح", description: "احفظه جيداً — ستحتاجه لكل عملية حساسة" });
      await useAppStore.getState().bootstrap();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "تعذّر حفظ الرمز — حاول مجدداً";
      setError(message);
      // عد إلى مرحلة الإدخال الأولى بتصفير الحقول
      firstPin.current = "";
      setPin("");
      setPhase("enter");
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = (value: string) => {
    if (loading) return;
    if (phase === "enter") {
      firstPin.current = value;
      setWeakWarning(isWeakPin(value));
      // مهلة قصيرة ليرى المستخدم امتلاء النقاط ثم الانتقال للتأكيد
      setTimeout(() => {
        setPin("");
        setPhase("confirm");
      }, 260);
      return;
    }
    // مرحلة التأكيد
    if (value !== firstPin.current) {
      setError("الرمزان غير متطابقين — أدخل رمزاً جديداً");
      firstPin.current = "";
      setTimeout(() => {
        setPin("");
        setError(null);
        setPhase("enter");
      }, 900);
      return;
    }
    void savePin(value);
  };

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-4 pb-8">
      <ScreenHeader
        title="إنشاء رمز PIN"
        subtitle="رمز سري من 6 أرقام لكل العمليات الحساسة"
        showBack={false}
      />

      {/* مؤشر المرحلتين */}
      <div className="mx-auto mt-4 flex items-center gap-2" aria-hidden="true">
        <span
          className={cn(
            "h-1.5 w-10 rounded-full transition-colors",
            phase === "enter" ? "bg-[#C9A227]" : "bg-[#E8E6E1]",
          )}
        />
        <span
          className={cn(
            "h-1.5 w-10 rounded-full transition-colors",
            phase === "confirm" ? "bg-[#C9A227]" : "bg-[#E8E6E1]",
          )}
        />
      </div>
      <p className="mt-1.5 text-center text-[12px] font-semibold text-[#A3A09B]">
        {phase === "enter" ? "المرحلة 1 من 2 — الإدخال" : "المرحلة 2 من 2 — التأكيد"}
      </p>

      {weakWarning && phase === "enter" && !error ? (
        <p className="mt-3 text-center text-[13px] font-semibold text-[#B45309]">
          تحذير: هذا الرمز ضعيف (تسلسل أو تكرار) — يُنصح باختيار نمط أقل توقعاً
        </p>
      ) : null}

      <div className="mt-5">
        <PINPad
          contextLabel={
            phase === "enter" ? "أنشئ رمز PIN (6 أرقام)" : "أعد إدخال الرمز للتأكيد"
          }
          pin={pin}
          onChange={setPin}
          onComplete={handleComplete}
          error={error ?? undefined}
          disabled={loading}
        />
      </div>

      <p className="mt-auto pt-6 text-center text-[12px] font-medium leading-5 text-[#A3A09B]">
        لا يُخزَّن الرمز في جهازك أبداً — يُحفظ مشفراً في الخادم فقط،
        والقفل التصاعدي يحميه بعد المحاولات الخاطئة.
      </p>
    </div>
  );
}
