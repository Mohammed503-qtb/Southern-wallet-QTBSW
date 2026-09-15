/**
 * محفظة الجنوب — المكون القياسي: محمّل الشعار (LogoLoader)
 * ------------------------------------------------------------
 * موحّد لكل حالات التحميل والانتظار في التطبيق: الشعار الرسمي
 * الشفاف (يظهر الشعار فقط — بلا خلفية) داخل حلقة ذهبية دوّارة
 * وهالة نابضة رقيقة، مع نص اختياري.
 *
 * - variant="dark":  فوق الأسطح الداكنة (شاشة البداية، أوضاع glass)
 * - variant="light": فوق الأسطح الفاتحة (الشاشات الافتراضية)
 * - size: مقاس بصري (px) — 48 صغير داخل الشاشات، 96 للمشاهد الكاملة
 * - يعلن aria-live="polite" وsr-only للقارئات
 */

"use client";

import { cn } from "@/lib/utils";

export interface LogoLoaderProps {
  /** مقاس الحاوية بالبكسل */
  size?: number;
  /** نص اختياري أسفل المحمّل */
  label?: string;
  /** dark: فوق الأسطح الداكنة | light: فوق الفاتحة */
  variant?: "dark" | "light";
  className?: string;
}

export function LogoLoader({ size = 64, label, variant = "light", className }: LogoLoaderProps) {
  const ring = variant === "dark" ? "#E8C766" : "#C9A227";
  const labelColor = variant === "dark" ? "text-white/60" : "text-[#5C5A56]";
  const glow = variant === "dark" ? "rgba(201,162,39,0.22)" : "rgba(201,162,39,0.14)";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center", className)}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        {/* هالة ذهبية نابضة خلف الشعار */}
        <span
          aria-hidden="true"
          className="sw-logo-glow absolute inset-[6%] rounded-full"
          style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 70%)` }}
        />
        {/* الحلقة الدوّارة — ذهبية بقطاع لامع */}
        <span
          aria-hidden="true"
          className="sw-logo-ring absolute inset-0 rounded-full border-[2.5px] border-transparent"
          style={{
            borderTopColor: ring,
            borderRightColor: ring,
            filter: "saturate(1.15)",
            animationDuration: "1.05s",
          }}
        />
        {/* الشعار الرسمي الشفاف — يظهر الشعار فقط */}
        <img
          src="/logo.svg"
          alt=""
          aria-hidden="true"
          className="sw-logo-beat absolute inset-[20%] h-[60%] w-[60%] object-contain"
          style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.12))" }}
        />
      </div>
      {label ? (
        <p className={cn("mt-3 text-[13px] font-bold", labelColor)}>{label}</p>
      ) : null}
      <span className="sr-only">جارٍ التحميل…</span>
    </div>
  );
}
