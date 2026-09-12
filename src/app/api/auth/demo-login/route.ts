/**
 * A3 — POST /api/auth/demo-login { phone }
 * دخول سريع لحسابات الـ Seed فقط (وضع التطوير الداخلي حصراً).
 * معطّل كلياً في الإنتاج (AUTH-006) إلا بتفعيل ALLOW_DEV_AUTH=1
 * الصريح لبيئة اختبار معزولة — قناة الدخول العامة هي OTP (A1/A2).
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { assertValidPhone } from "@/lib/server/domain";
import { isDevAuth } from "@/lib/server/runtime";
import { rateLimit, clientIp } from "@/lib/server/rate-limit";
import { createSession } from "@/lib/server/auth";
import { toPublicUser } from "@/lib/server/views";
import type { AuthResultView } from "@/lib/api-types";
import { db } from "@/lib/db";

export const POST = route(async (req) => {
  // بوابة الإنتاج: قناة الدخول التجريبي مغلقة خارج بيئات التطوير
  if (!isDevAuth()) {
    throw new RouteError("AUTH-006", 403);
  }

  // حد معدل لكل IP حتى داخل بيئة التطوير (20/ساعة)
  const ipCheck = rateLimit("auth-demo-ip", clientIp(req), 20, 60 * 60_000);
  if (!ipCheck.allowed) {
    throw new RouteError("SYS-002", 429, { secondsRemaining: ipCheck.retryAfterSec });
  }

  const body = await readJsonBody(req);
  const phone = assertValidPhone(reqStr(body, "phone"));

  const user = await db.user.findUnique({ where: { phone } });
  if (!user || user.role === "SYSTEM") {
    throw new RouteError("SYS-001", 404, { reason: "حساب تجريبي غير موجود" });
  }
  if (user.status === "CLOSED") {
    throw new RouteError("AUTH-005", 403, { reason: "CLOSED" });
  }

  const sessionToken = await createSession(user.id, "دخول تجريبي سريع — Alpha");

  const result: AuthResultView = {
    user: toPublicUser(user),
    needsPin: user.pinHash === null,
    notice: user.status === "FROZEN" ? "الحساب مجمّد — يمكنك الدخول للاطلاع فقط" : null,
    noticeCode: user.status === "FROZEN" ? "AUTH-005" : null,
    sessionToken,
  };
  return ok(result);
});
