/**
 * A1 — POST /api/auth/otp { phone }
 * توليد رمز تحقق (5 دقائق صلاحية) — في وضع التطوير يعيد devCode مباشرة،
 * وفي الإنتاج لا يعاد الرمز إطلاقاً (بانتظار قناة SMS — فجوة موثقة).
 * منع إعادة الإرسال قبل 60 ثانية (AUTH-004) + حد معدل لكل IP (SYS-002).
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { assertValidPhone, randomCode } from "@/lib/server/domain";
import { isDevAuth } from "@/lib/server/runtime";
import { rateLimit, clientIp } from "@/lib/server/rate-limit";
import { db } from "@/lib/db";

export const POST = route(async (req) => {
  const body = await readJsonBody(req);
  const phone = assertValidPhone(reqStr(body, "phone"));

  // حد معدل لكل IP: 12 طلب OTP/ساعة (يمنع تعداد الأرقام عبر الشبكة)
  const ipCheck = rateLimit("auth-otp-ip", clientIp(req), 12, 60 * 60_000);
  if (!ipCheck.allowed) {
    throw new RouteError("SYS-002", 429, { secondsRemaining: ipCheck.retryAfterSec });
  }

  if (phone === "000000000") {
    throw new RouteError("SYS-001", 400, { reason: "حساب النظام لا يسجل الدخول" });
  }

  // منع إعادة الإرسال قبل 60 ثانية من آخر رمز لنفس الهاتف
  const latest = await db.otpCode.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
  });
  if (latest) {
    const elapsed = Date.now() - latest.createdAt.getTime();
    if (elapsed < 60_000) {
      throw new RouteError("AUTH-004", 429, {
        secondsRemaining: Math.ceil((60_000 - elapsed) / 1000),
      });
    }
  }

  const user = await db.user.findUnique({ where: { phone } });
  const mode = user ? "LOGIN" : "REGISTER";

  // إبطال أي رمز غير مستهلك سابق
  await db.otpCode.updateMany({
    where: { phone, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = randomCode(6);
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  await db.otpCode.create({
    data: { phone, code, purpose: mode, expiresAt },
  });

  return ok({
    mode,
    // في الإنتاج: الرمز لا يُعاد في الاستجابة أبداً (قناة SMS عند توفرها)
    devCode: isDevAuth() ? code : null,
    expiresInSeconds: 300,
  });
});
