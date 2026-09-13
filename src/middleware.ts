/**
 * محفظة الجنوب — Middleware تقييد الوصول الإداري (NFR-SEC-009)
 * ------------------------------------------------------------
 * يفرض ADMIN_IP_ALLOWLIST (قائمة IP مفصولة بفواصل) على كل مسارات
 * /api/admin/* — بلا ضبط للمتغير: لا تقييد (السلوك الافتراضي المفتوح
 * مسؤولية الناشر، موثق في DEPLOYMENT.md §7). مع الضبط: أي IP خارج
 * القائمة يُرفض بـ RBAC-002 (403) + حدث أمني ADMIN_IP_DENIED.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function clientIp(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "";
}

export function middleware(req: NextRequest) {
  const allowlist = process.env.ADMIN_IP_ALLOWLIST;
  if (!allowlist) return NextResponse.next();

  const allowed = allowlist
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = clientIp(req);

  if (allowed.length > 0 && !allowed.includes(ip)) {
    // تسجيل في سجل الخادم (مراقبة السجلات الخارجية) — الوسيط يعمل في
    // Edge Runtime بلا وصول لقاعدة البيانات
    console.warn(
      `[security] رفض وصول إداري من IP غير معتمد: ${ip || "unknown"} → ${req.nextUrl.pathname}`
    );
    return NextResponse.json(
      {
        ok: false,
        error: { code: "RBAC-002", message: "الوصول الإداري مقيّد بعناوين شبكة معتمدة" },
      },
      { status: 403 }
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/admin/:path*"],
};
