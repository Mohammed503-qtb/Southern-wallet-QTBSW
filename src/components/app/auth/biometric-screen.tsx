/**
 * محفظة الجنوب — شاشة تفعيل البصمة (SC-07 Biometric)
 * بطاقة بصمة كبيرة ذهبية: "تفعيل" → PUT /api/me/biometric { enabled: true }
 * (نجاح فوري في Alpha) ثم bootstrap → الرئيسية. "لاحقاً" → bootstrap مباشرة.
 */
"use client";

import { useState } from "react";
import { Fingerprint } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ScreenHeader } from "@/components/app/ui/screen-header";

export function BiometricScreen() {
  const bootstrap = useAppStore((s) => s.bootstrap);

  const [enabling, setEnabling] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goHome = async () => {
    setSkipping(true);
    await bootstrap();
    setSkipping(false);
  };

  const enable = async () => {
    setEnabling(true);
    setError(null);
    try {
      // Alpha: موافقة فورية — الطلب ينجح خادمياً
      await api.put("/api/me/biometric", { enabled: true });
      toast({ title: "تم تفعيل البصمة", description: "يمكنك تعطيلها لاحقاً من الأمان" });
      await bootstrap();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "تعذّر تفعيل البصمة — يمكنك المتابعة لاحقاً";
      setError(message);
    } finally {
      setEnabling(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[440px] flex-col px-4 pb-8">
      <ScreenHeader title="تفعيل البصمة" showBack={false} />

      <div className="mt-10 flex flex-col items-center text-center">
        <span className="relative flex h-32 w-32 items-center justify-center">
          <span
            aria-hidden="true"
            className="absolute inset-0 rotate-45 rounded-3xl border-[1.5px] border-[#C9A227]/35"
          />
          <span
            aria-hidden="true"
            className="absolute inset-4 rotate-45 rounded-2xl border-[1.5px] border-[#C9A227]/55"
          />
          <span className="sw-breathe flex h-20 w-20 items-center justify-center rounded-full bg-[#C9A227]/[0.1] text-[#C9A227]">
            <Fingerprint strokeWidth={1.5} className="h-10 w-10" />
          </span>
        </span>

        <h2 className="mt-8 text-[20px] font-bold text-[#141416]">فعّل الدخول بالبصمة؟</h2>
        <p className="mt-2.5 max-w-[300px] text-[14px] font-medium leading-7 text-[#5C5A56]">
          استخدم بصمتك لفتح التطبيق وتأكيد العمليات الحساسة بدلاً من إدخال رمز PIN
          في كل مرة. يمكنك تعطيلها متى شئت من إعدادات الأمان — ورمز PIN يبقى
          المسار الاحتياطي دائماً.
        </p>
        <p className="mt-3 rounded-full border border-[#C9A227]/30 bg-[#C9A227]/[0.07] px-3 py-1 text-[11px] font-semibold text-[#8A6E14]">
          Alpha الداخلي — محاكاة موافقة فورية
        </p>
      </div>

      {error ? (
        <p className="mt-4 text-center text-[13px] font-semibold text-[#B91C1C]">{error}</p>
      ) : null}

      <div className="mt-auto space-y-2.5 pt-8">
        <PrimaryActionButton onClick={() => void enable()} loading={enabling}>
          تفعيل البصمة
        </PrimaryActionButton>
        <button
          type="button"
          onClick={() => void goHome()}
          disabled={skipping}
          className="flex min-h-11 w-full items-center justify-center rounded-xl border border-[#E8E6E1] bg-white px-4 text-[15px] font-bold text-[#5C5A56] transition-colors hover:border-[#C9A227]/50 hover:text-[#141416] disabled:opacity-60"
        >
          {skipping ? "جارٍ فتح التطبيق…" : "لاحقاً"}
        </button>
      </div>
    </div>
  );
}
