/**
 * A1 — POST /api/auth/otp { phone }
 * توليد رمز تحقق (5 دقائق صلاحية) — يعيد devCode دائماً (وضع Alpha)
 * منع إعادة الإرسال قبل 60 ثانية (AUTH-004)، وإبطال أي رمز سابق غير مستهلك.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { assertValidPhone, randomCode } from "@/lib/server/domain";
import { db } from "@/lib/db";

export const POST = route(async (req) => {
  const body = await readJsonBody(req);
  const phone = assertValidPhone(reqStr(body, "phone"));

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

  return ok({ mode, devCode: code, expiresInSeconds: 300 });
});
