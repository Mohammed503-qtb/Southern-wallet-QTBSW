/**
 * A1 — POST /api/auth/login { phone }
 * بدء تسجيل الدخول: يفحص وجود الحساب وحالة تفعيل المصادقة (TOTP)
 * ويعيد الحالة للواجهة لتوجيه المستخدم (رمز 6 خانات / رمز تفعيل).
 * حدود: 30 طلب/ساعة لكل IP + حد لكل هاتف — SYS-002.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { assertValidPhone } from "@/lib/server/domain";
import { rateLimit, clientIp } from "@/lib/server/rate-limit";
import { db } from "@/lib/db";

export const POST = route(async (req) => {
  const body = await readJsonBody(req);
  const phone = assertValidPhone(reqStr(body, "phone"));

  // حد معدل لكل IP: 30 طلب بدء دخول/ساعة
  const ipCheck = rateLimit("login-init-ip", clientIp(req), 30, 60 * 60_000);
  if (!ipCheck.allowed) {
    throw new RouteError("SYS-002", 429, { secondsRemaining: ipCheck.retryAfterSec });
  }
  // حد لكل هاتف: 10 بدايات دخول/15 دقيقة (يمنع التنقيب الآلي)
  const phoneCheck = rateLimit("login-init-phone", phone, 10, 15 * 60_000);
  if (!phoneCheck.allowed) {
    throw new RouteError("SYS-002", 429, { secondsRemaining: phoneCheck.retryAfterSec });
  }

  if (phone === "000000000") {
    throw new RouteError("SYS-001", 400, { reason: "حساب النظام لا يسجل الدخول" });
  }

  const user = await db.user.findUnique({ where: { phone } });

  return ok({
    exists: Boolean(user),
    // هل فعّل المستخدم تطبيق المصادقة؟ (يحدد شكل شاشة الرمز)
    enrolled: Boolean(user?.totpConfirmedAt),
    // حساب مجمّد؟ الدخول اطلاعي فقط
    frozen: user?.status === "FROZEN",
  });
});
