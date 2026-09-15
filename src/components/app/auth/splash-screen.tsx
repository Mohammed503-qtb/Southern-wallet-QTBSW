/**
 * محفظة الجنوب — شاشة البداية (SC-01 Splash) «تفكك وتشكّل»
 * ------------------------------------------------------------
 * افتتاحية احترافية بجسيمات Canvas:
 *   1) جسيمات ذهبية تتجمع كنص «QTBM» (علامة المشروع) مع وميض حي
 *   2) التفكك: الجسيمات تتطاير للخارج بسرعات ومسارات عشوائية
 *   3) التشكّل: الجسيمات تنساب وتتقارب نحو نقاط الشعار الرسمي الشفاف
 *   4) crossfade إلى الشعار الحاد (SVG) + العنوان ثم bootstrap()
 *
 * إمكانية الوصول: prefers-reduced-motion → تخطي الحركة كلياً
 * (شعار ثابت فوراً) — لا حركة إجبارية على من يطلب تقليلها.
 * فشل الـbootstrap بخطأ غير 401: ErrorState مع إعادة المحاولة.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/lib/app-store";
import { ErrorState } from "@/components/app/ui/error-state";
import { LogoLoader } from "@/components/app/ui/logo-loader";

/** علامة الجنوب الثلاثية (نفس هندسة logo.svg الرسمي) — نسخة معايرة للمعاينة بالجسيمات */
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<g transform="translate(40 40) scale(14.4)">
<path fill="#C9A227" d="M15.47,7.1l-1.3,1.85c-0.2,0.29-0.54,0.47-0.9,0.47h-7.1V7.09C6.16,7.1,15.47,7.1,15.47,7.1z"/>
<polygon fill="#C9A227" points="24.3,7.1 13.14,22.91 5.7,22.91 16.86,7.1"/>
<path fill="#C9A227" d="M14.53,22.91l1.31-1.86c0.2-0.29,0.54-0.47,0.9-0.47h7.09v2.33H14.53z"/>
</g></svg>`;

/** درجات الذهب للجسيمات — عمق معدني بدل لون مسطّح */
const GOLD_SHADES = ["#F0D98A", "#E8C766", "#D9B43F", "#C9A227", "#B8932B"] as const;

/** الخط الزمني (ms) — قابل للضبط الدقيق */
const T = {
  hold: 1050, // QTBM متماسك (وقت كافٍ لقراءة العلامة)
  explode: 780, // التفكك والتطاير
  converge: 1250, // الانسياب نحو الشعار
  settle: 420, // تثبيت الشعار الجسيمي
  fade: 420, // crossfade إلى الشعار الحاد
  postHold: 900, // عرض الشعار الحاد + العنوان قبل المتابعة
} as const;
const TOTAL = T.hold + T.explode + T.converge + T.settle + T.fade;

interface Particle {
  sx: number; sy: number; // موضع QTBM (المصدر)
  tx: number; ty: number; // موضع الشعار (الهدف)
  ex: number; ey: number; // موضع التفكك (بعد التطاير)
  size: number;
  color: string;
  phase: number; // طور الوميض
  stagger: number; // تأخير فردي في طور التقارب
}

/** أخذ عيّنة من بكسلات الرسم حيث الشفافية > حد — بكسل كل step */
function samplePoints(
  draw: (ctx: CanvasRenderingContext2D) => void,
  size: number,
  step: number,
): Array<{ x: number; y: number }> {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return [];
  draw(ctx);
  const { data } = ctx.getImageData(0, 0, size, size);
  const pts: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      if (data[(y * size + x) * 4 + 3] > 140) pts.push({ x, y });
    }
  }
  return pts;
}

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutQuint = (t: number): number => 1 - Math.pow(1 - t, 5);

export function SplashScreen() {
  const bootstrap = useAppStore((s) => s.bootstrap);
  const meLoading = useAppStore((s) => s.meLoading);
  const bootstrapError = useAppStore((s) => s.bootstrapError);

  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const [animDone, setAnimDone] = useState(false);
  const [minDelayDone, setMinDelayDone] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // الحد الأدنى لعرض شاشة البداية: الحركة كاملة + تثبيت الشعار الحاد
  useEffect(() => {
    const timer = setTimeout(
      () => setMinDelayDone(true),
      reducedMotion ? 500 : TOTAL + T.postHold,
    );
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  // ثم فحص الجلسة مرة واحدة
  useEffect(() => {
    if (minDelayDone && animDone) void bootstrap();
  }, [minDelayDone, animDone, bootstrap]);

  // محرك جسيمات الافتتاحية: QTBM → تفكك → تشكّل الشعار
  useEffect(() => {
    if (reducedMotion) {
      // تقليل الحركة: الشعار الحاد فوراً — لا حركة إجبارية (إمكانية وصول)
      const raf = requestAnimationFrame(() => setAnimDone(true));
      return () => cancelAnimationFrame(raf);
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    let cancelled = false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    (async () => {
      // 1) تجهيز القياسات (DPR-aware)
      const cssSize = canvas.clientWidth || 320;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = Math.round(cssSize * dpr);
      canvas.width = size;
      canvas.height = size;
      const cx = size / 2;
      const cy = size / 2;

      // 2) ضمان جاهزية خط Cairo قبل معاينة النص
      try {
        await Promise.race([
          document.fonts.load(`800 ${Math.round(size * 0.235)}px Cairo`),
          new Promise((r) => setTimeout(r, 900)),
        ]);
      } catch {
        /* الخط الاحتياطي مقبول */
      }
      if (cancelled) return;

      // 3) معاينة نقاط المصدر: نص QTBM ذهبي عريض
      const textPts = samplePoints(
        (c) => {
          c.fillStyle = "#C9A227";
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.font = `800 ${Math.round(size * 0.235)}px Cairo, "Segoe UI", sans-serif`;
          c.fillText("QTBM", cx, cy);
        },
        size,
        Math.max(2, Math.round(dpr * 1.6)),
      );
      // 4) معاينة نقاط الهدف: علامة الجنوب (SVG مرسوم على canvas)
      const img = new Image();
      img.decoding = "sync";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("logo raster failed"));
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(MARK_SVG)}`;
      }).catch(() => undefined);
      if (cancelled) return;

      const logoSide = Math.round(size * 0.66);
      const logoOff = Math.round((size - logoSide) / 2);
      const logoPts = samplePoints(
        (c) => c.drawImage(img, logoOff, logoOff, logoSide, logoSide),
        size,
        Math.max(2, Math.round(dpr * 1.8)),
      );

      if (textPts.length < 8 || logoPts.length < 8) {
        // تعذّر المعاينة (بيئة مقيدة) → قفز مباشر إلى الشعار الحاد
        setAnimDone(true);
        return;
      }

      // 5) بناء الجسيمات: العدد متوازن بين النص والشعار
      // المصدر والهدف يُخلطان معاً — المعاينة صفّاً بصف، وبدون خلط
      // سيغطي أول N جسيمات الشريط العلوي من النص فقط (خلل التوزيع)
      const N = Math.min(1500, Math.max(textPts.length, Math.round(logoPts.length * 0.92)));
      const shuffle = <X,>(arr: X[]): X[] => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      const sources = shuffle(textPts);
      const targets = shuffle(logoPts);
      const particles: Particle[] = Array.from({ length: N }, (_, i) => {
        const s = sources[i % sources.length];
        const t = targets[i % targets.length];
        // اتجاه التفكك: شعاعي من المركز + انحراف عشوائي — «تفتت» عضوي
        const ang = Math.atan2(s.y - cy, s.x - cx) + (Math.random() - 0.5) * 1.5;
        const dist = size * (0.22 + Math.random() * 0.34);
        return {
          sx: s.x,
          sy: s.y,
          tx: t.x,
          ty: t.y,
          ex: s.x + Math.cos(ang) * dist,
          ey: s.y + Math.sin(ang) * dist,
          size: (1.4 + Math.random() * 1.2) * dpr,
          color: GOLD_SHADES[Math.floor(Math.random() * GOLD_SHADES.length)],
          phase: Math.random() * Math.PI * 2,
          stagger: Math.random() * 0.34,
        };
      });

      // 6) حلقة الرسم بالخط الزمني
      const t0 = performance.now();
      const drawFrame = (now: number) => {
        if (cancelled) return;
        const el = now - t0;
        ctx.clearRect(0, 0, size, size);

        // توهج مركزي يشتد مع اقتراب التشكّل
        const convProg = Math.min(1, Math.max(0, (el - T.hold - T.explode) / T.converge));
        if (el > T.hold) {
          const g = ctx.createRadialGradient(cx, cy, size * 0.05, cx, cy, size * 0.42);
          const glowA = 0.05 + 0.16 * easeInOutCubic(convProg) * (0.75 + 0.25 * Math.sin(now / 300));
          g.addColorStop(0, `rgba(201,162,39,${glowA.toFixed(3)})`);
          g.addColorStop(1, "rgba(201,162,39,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, size, size);
        }

        for (const p of particles) {
          let x: number, y: number, alpha: number;

          if (el < T.hold) {
            // أ) QTBM متماسك مع وميض حي
            x = p.sx;
            y = p.sy;
            alpha = 0.82 + 0.18 * Math.sin(now / 260 + p.phase);
          } else if (el < T.hold + T.explode) {
            // ب) التفكك: تطاير شعاعي مُتباطئ مع تلاشي جزئي
            const k = easeOutQuint((el - T.hold) / T.explode);
            x = p.sx + (p.ex - p.sx) * k;
            y = p.sy + (p.ey - p.sy) * k;
            alpha = 1 - 0.55 * k;
          } else if (el < T.hold + T.explode + T.converge) {
            // ج) التشكّل: انسياب مُتدرّج (stagger فردي) من موضع التطاير إلى هدف الشعار
            const raw = (el - T.hold - T.explode) / T.converge;
            const k = easeInOutCubic(Math.min(1, Math.max(0, (raw - p.stagger) / (1 - p.stagger))));
            x = p.ex + (p.tx - p.ex) * k;
            y = p.ey + (p.ty - p.ey) * k;
            alpha = 0.45 + 0.55 * k;
            // انحناء انسيابي: تعامدياً على المسار، يخفت مع الوصول — «سرب» عضوي
            const drift = Math.sin(k * Math.PI) * size * 0.05;
            const dx = p.tx - p.ex;
            const dy = p.ty - p.ey;
            const len = Math.hypot(dx, dy) || 1;
            x += (-dy / len) * drift * p.stagger;
            y += (dx / len) * drift * p.stagger;
          } else {
            // د) الشعار الجسيمي مثبّت — تنفس ذهبي خفيف
            x = p.tx;
            y = p.ty;
            alpha = 0.88 + 0.12 * Math.sin(now / 420 + p.phase);
          }

          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;

        if (el < TOTAL) {
          raf = requestAnimationFrame(drawFrame);
        } else {
          setAnimDone(true); // crossfade إلى الشعار الحاد يبدأ
        }
      };
      raf = requestAnimationFrame(drawFrame);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  const showCrispLogo = animDone;

  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center bg-[#0B0B0C] px-8 py-12 text-center">
      {/* منطقة الافتتاحية: Canvas الجسيمات ثم crossfade إلى الشعار الحاد */}
      <div className="relative flex items-center justify-center" style={{ width: "min(72vw, 300px)", height: "min(72vw, 300px)" }}>
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 h-full w-full transition-opacity duration-[420ms]"
          style={{ opacity: showCrispLogo ? 0 : 1 }}
        />
        {showCrispLogo ? (
          <img
            src="/logo.svg"
            alt="شعار محفظة الجنوب"
            className="sw-rise-in h-[62%] w-[62%] object-contain"
            style={{ filter: "drop-shadow(0 4px 18px rgba(201,162,39,0.25))" }}
          />
        ) : null}
      </div>

      {/* العنوان — يظهر مع الشعار الحاد (أو فوراً مع تقليل الحركة) */}
      {showCrispLogo ? (
        <div className="sw-rise-in mt-6 flex flex-col items-center" style={{ animationDelay: "120ms" }}>
          <h1 className="text-[28px] font-extrabold leading-9 text-white">محفظة الجنوب</h1>
          <p className="mt-2 text-[14px] font-semibold text-[#C9A227]">محفظتك المالية الذكية</p>
          <p dir="ltr" className="mt-1 text-[12px] font-medium tracking-wide text-white/40">
            South Wallet — Yemen
          </p>
        </div>
      ) : null}

      {/* مؤشر الانتظار الموحّد — الشعار الشفاف داخل حلقة ذهبية */}
      {animDone && meLoading && !bootstrapError ? (
        <LogoLoader size={44} variant="dark" className="mt-9" label="جارٍ تجهيز محفظتك…" />
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
