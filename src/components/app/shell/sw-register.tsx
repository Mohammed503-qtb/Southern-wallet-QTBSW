/**
 * محفظة الجنوب — تسجيل Service Worker + إشعار التحديث (Beta)
 * ------------------------------------------------------------
 * سياسة التسجيل:
 *   • يُسجَّل دائماً في الإنتاج (البناء المستقل) وخارج المضيف المحلي
 *     (بوابة المعاينة الخارجية) — لأن كاش HTML معطّل عمداً في sw.js
 *     والتنقلات شبكة-أولاً، فلا خطر تقادم أثناء التطوير.
 *   • على localhost/127.0.0.1 يُتجاهل التسجيل حفاظاً على Fast Refresh
 *     لبيئة التطوير النشطة — إلا مع المعامل ?sw=force للاختبار.
 *   • تعطيل كامل عبر NEXT_PUBLIC_SW_DISABLED=1.
 * التحديث: عند ظهور إصدار جديد (waiting) يظهر إشعار بموافقة المستخدم
 *   → SKIP_WAITING → controllerchange → إعادة تحميل واحدة.
 */
"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // كل 6 ساعات

export function SwRegister() {
  const { toast } = useToast();
  const toastShownRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NEXT_PUBLIC_SW_DISABLED === "1") return;

    const { hostname, search } = window.location;
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
    const forced = new URLSearchParams(search).get("sw") === "force";
    if (isLocalHost && !forced) return;

    let updateIntervalId: number | undefined;
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const notifyUpdate = (worker: ServiceWorker) => {
      if (toastShownRef.current) return; // إشعار واحد لكل جلسة
      toastShownRef.current = true;
      toast({
        title: "تحديث جديد متاح",
        description: "صدر إصدار محدّث من التطبيق — حدّث الآن للحصول على أحدث نسخة وأصلح مختبرة.",
        duration: 60000,
        action: (
          <ToastAction
            altText="تحديث التطبيق الآن"
            onClick={() => worker.postMessage({ type: "SKIP_WAITING" })}
          >
            تحديث الآن
          </ToastAction>
        ),
      });
    };

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        // فحص دوري عن تحديثات (بالإضافة لفحص المتصفح عند التنقل)
        updateIntervalId = window.setInterval(() => {
          void registration.update().catch(() => {});
        }, UPDATE_CHECK_INTERVAL_MS);

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // إصدار جديد مثبَّت بانتظار التفعيل — والمستخدم يملك نسخة عاملة
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              notifyUpdate(installing);
            }
          });
        });
      } catch {
        // فشل تسجيل SW ليس فادحاً — التطبيق يعمل كاملاً بدونه
      }
    };

    void register();

    return () => {
      if (updateIntervalId !== undefined) window.clearInterval(updateIntervalId);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
