/**
 * محفظة الجنوب — شاشة البداية (SC-01 Splash)
 * 1.8 ثانية: شعار متحرك (fade+scale) على أسود الجنوب + الاسم + شارة
 * "Alpha الداخلي" ثم bootstrap() الذي يقرر الوجهة (تعريف/دخول/رئيسية/لوحة).
 * عند فشل الـbootstrap بخطأ غير 401: ErrorState مع إعادة المحاولة.
 */
"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/app-store";
import { ErrorState } from "@/components/app/ui/error-state";
import { Skeleton } from "@/components/app/ui/skeleton";

export function SplashScreen() {
  const bootstrap = useAppStore((s) => s.bootstrap);
  const meLoading = useAppStore((s) => s.meLoading);
  const bootstrapError = useAppStore((s) => s.bootstrapError);
  const [minDelayDone, setMinDelayDone] = useState(false);

  // الحد الأدنى 1.8 ثانية لعرض الشعار
  useEffect(() => {
    const timer = setTimeout(() => setMinDelayDone(true), 1800);
    return () => clearTimeout(timer);
  }, []);

  // ثم فحص الجلسة مرة واحدة
  useEffect(() => {
    if (minDelayDone) void bootstrap();
  }, [minDelayDone, bootstrap]);

  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center bg-[#0B0B0C] px-8 py-12 text-center">
      <div className="sw-splash-logo flex flex-col items-center">
        <img src="/logo.svg" alt="شعار محفظة الجنوب" className="h-28 w-28" />
        <h1 className="mt-7 text-[28px] font-extrabold leading-9 text-white">
          محفظة الجنوب
        </h1>
        <p className="mt-2 text-[14px] font-semibold text-[#C9A227]">Alpha الداخلي</p>
        <p dir="ltr" className="mt-1 text-[12px] font-medium tracking-wide text-white/40">
          South Wallet — Internal Alpha
        </p>
      </div>

      {/* مؤشر جلب رقيق أسفل الشعار */}
      {meLoading && !bootstrapError ? (
        <div className="mt-10 w-40">
          <Skeleton className="h-1.5 w-full !bg-[#C9A227]/15" />
        </div>
      ) : null}

      {/* فشل الخادم (غير 401) — إعادة المحاولة */}
      {bootstrapError ? (
        <div className="mt-8 w-full max-w-[300px] rounded-2xl bg-white p-2">
          <ErrorState
            compact
            message={bootstrapError.message}
            code={bootstrapError.code}
            onRetry={() => void bootstrap()}
          />
        </div>
      ) : null}
    </div>
  );
}
