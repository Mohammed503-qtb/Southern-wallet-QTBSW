import type { NextConfig } from "next";

/**
 * محفظة الجنوب — إعداد Next.js الإنتاجي
 * ------------------------------------------------------------
 * رؤوس أمنية تصاعدية: الأساسية تُطبَّق في كل البيئات، والصارمة
 * (HSTS + DENY framing + CSP) في الإنتاج فقط كي لا تعطّل لوحة
 * المعاينة داخل الـSandbox (تضمين عبر إطارات عبر النطاقات).
 * CSP توازن واقعي مع Next (سكربتات مدمجة للترطيب → 'unsafe-inline')
 * مع تضييق كل شيء آخر: لا أصل خارجي، لا object، لا frame-ancestors.
 */
const isProd = process.env.NODE_ENV === "production";

const baseHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // الكاميرا للـQR فقط من نطاقنا؛ البقية مغلقة
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=(), usb=()" },
];

const prodHeaders = [
  ...baseHeaders,
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false, // إخفاء X-Powered-By
  compress: true,
  // فحص TypeScript صارم مفروض في البناء (بلا تجاوز) — CI يفحص أيضاً
  reactStrictMode: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: isProd ? prodHeaders : baseHeaders,
      },
    ];
  },
};

export default nextConfig;
