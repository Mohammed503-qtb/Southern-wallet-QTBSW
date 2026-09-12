/* ============================================================
 * محفظة الجنوب — Service Worker (Beta)
 * com.janoub.wallet — قناتان: app shell + أصول ثابتة
 * ------------------------------------------------------------
 * المبادئ المالية الحاكمة (R-02 — التنفيذ خادمي حصراً):
 *   • لا اعتراض إطلاقاً لطلبات غير GET.
 *   • لا اعتراض إطلاقاً لمسارات /api/ (البيانات المالية من الشبكة فقط).
 *   • لا تخزين مؤقت لأي HTML إنتاجي — الأوفلاين يعرض صفحة /offline.html
 *     (تفادياً لقشرة قديمة تشير إلى أجزاء JS محذوفة).
 *   • الأصول المُجزّأة بالمحتوى (/_next/static) cache-first آمنة.
 * التحديث: الإصدار الجديد ينتظر (waiting) حتى يوافق المستخدم عبر
 *   رسالة SKIP_WAITING من واجهة التطبيق (sw-register.tsx).
 * ============================================================ */

const VERSION = "sw-beta-1.0.0";
const STATIC_CACHE = `sw-static-${VERSION}`;
const RUNTIME_CACHE = `sw-runtime-${VERSION}`;
const OFFLINE_URL = "/offline.html";

/** مسبقات التثبيت: قشرة الأوفلاين + هوية PWA — كلها ملفات موجودة دائماً */
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.json",
  "/favicon.ico",
  "/robots.txt",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];

/** أصول غير قابلة للتغير عملياً (مُجزّأة بالمحتوى أو هوية ثابتة) */
const CACHE_FIRST_PATHS = [
  "/_next/static/",
  "/icons/",
  "/fonts/",
  "/logo.svg",
  "/logo.jpg",
  "/manifest.json",
  "/favicon.ico",
  "/robots.txt",
];

const RUNTIME_CACHE_MAX_ENTRIES = 60;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE_URLS);
    })()
  );
  // ملاحظة: لا skipWaiting هنا عمداً — التحديث بانتظار موافقة المستخدم
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // حذف أي ذاكرة من إصدارات سابقة
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))
      );
      // تسريع التنقلات (network-first) بطلب مسبق متوازٍ
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          /* بعض المتصفحات لا تدعمه — تجاهل */
        }
      }
      // أول تثبيت: السيطرة الفورية على الصفحة المفتوحة بلا إعادة تحميل
      await self.clients.claim();
      // تقليم ذاكرة التشغيل
      await trimCache(RUNTIME_CACHE, RUNTIME_CACHE_MAX_ENTRIES);
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // القاعدة الذهبية: العمليات المالية وكل POST/PUT/DELETE — شبكة فقط
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // خارج الأصل: لا لمس
  if (url.pathname.startsWith("/api/")) return; // بيانات مالية حساسة
  if (url.pathname === "/sw.js") return; // الملف نفسه يُدار من المتصفح

  // التنقلات (فتح الصفحة): شبكة أولاً ثم صفحة الأوفلاين
  if (req.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  // أصول ثابتة غير متغيرة: كاش أولاً
  if (CACHE_FIRST_PATHS.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // ما تبقى من أصول نفس الأصل: stale-while-revalidate بسقف
  event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
});

/* ============ الاستراتيجيات ============ */

/** تنقل: شبكة → (فشل) → صفحة الأوفلاين. لا تخزين HTML إنتاجي عمداً */
async function networkFirstNavigation(event) {
  try {
    const preload = await event.preloadResponse;
    if (preload) return preload;
    return await fetch(event.request);
  } catch (err) {
    const offline = await caches.match(OFFLINE_URL, {
      cacheName: STATIC_CACHE,
      ignoreSearch: true,
    });
    if (offline) return offline;
    return new Response(
      "<!doctype html><html lang=ar dir=rtl><meta charset=utf-8><title>غير متصل</title><body style=\"background:#0B0B0C;color:#F7E7B2;font-family:Tahoma,Arial;display:flex;align-items:center;justify-content:center;height:100vh;margin:0\"><p>لا يوجد اتصال بالإنترنت — أعد المحاولة لاحقاً</p></body></html>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
}

/** كاش أولاً (الأصول المُجزّأة/الثابتة) */
async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req, { cacheName });
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type === "basic") {
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    // أصل غير مخزّن وشبكة مفقودة — فشل صريح
    throw err;
  }
}

/** قديم من الكاش فوراً + تحديث الشبكة بالخلفية */
async function staleWhileRevalidate(req, cacheName) {
  const cached = await caches.match(req, { cacheName });
  const fetchPromise = fetch(req)
    .then(async (res) => {
      if (res && res.ok && res.type === "basic") {
        const cache = await caches.open(cacheName);
        cache.put(req, res.clone());
      }
      return res;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

/** تقليم عدد إدخالات ذاكرة التشغيل (FIFO بالترتيب) */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  for (let i = 0; i < keys.length - maxEntries; i++) {
    await cache.delete(keys[i]);
  }
}
