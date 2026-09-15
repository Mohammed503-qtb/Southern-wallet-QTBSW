/**
 * A5 — POST /api/auth/login/reenroll-confirm { phone, token, code }
 * إتمام إعادة إلحاق المصادقة بعد إعادة تعيين إدارية: التحقق من رمز
 * التفعيل (R+7 الصادر من الدعم — يُستهلك هنا) + رمز TOTP الصحيح للسر
 * الجديد → تفعيل + جلسة + رموز استرداد جديدة.
 * حدود: 30 محاولة/ساعة لكل IP + 5 محاولات فاشلة/15 دقيقة لكل هاتف.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { assertValidPhone } from "@/lib/server/domain";
import { rateLimit, clientIp, peekLimit, resetLimit } from "@/lib/server/rate-limit";
import { createSession } from "@/lib/server/auth";
import { logSecurityEvent } from "@/lib/server/security-events";
import { toPublicUser } from "@/lib/server/views";
import { verifyEnrollmentCode, regenerateRecoveryCodes } from "@/lib/server/totp-service";
import type { AuthResultView } from "@/lib/api-types";
import { db } from "@/lib/db";

const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 15 * 60_000;

async function fail(phone: string, ip: string): Promise<never> {
  const consumed = rateLimit("enroll-fail", phone, FAIL_LIMIT, FAIL_WINDOW_MS);
  await logSecurityEvent("LOGIN_FAIL", { phone, ip, meta: { stage: "REENROLL_CONFIRM" } });
  if (!consumed.allowed || consumed.remaining <= 0) {
    await logSecurityEvent("LOGIN_LOCK", { phone, ip });
    throw new RouteError("AUTH-003", 429);
  }
  throw new RouteError("AUTH-002", 400, { attemptsLeft: consumed.remaining });
}

export const POST = route(async (req) => {
  const body = await readJsonBody(req);
  const phone = assertValidPhone(reqStr(body, "phone"));
  const token = reqStr(body, "token").toUpperCase();
  const code = reqStr(body, "code");

  const ip = clientIp(req);
  const ipCheck = rateLimit("reenroll-confirm-ip", ip, 30, 60 * 60_000);
  if (!ipCheck.allowed) {
    throw new RouteError("SYS-002", 429, { secondsRemaining: ipCheck.retryAfterSec });
  }
  const lock = peekLimit("enroll-fail", phone, FAIL_LIMIT);
  if (lock.blocked) {
    throw new RouteError("AUTH-003", 429, { secondsRemaining: lock.retryAfterSec });
  }

  const user = await db.user.findUnique({ where: { phone } });
  if (!user || user.role === "SYSTEM" || user.status === "CLOSED") {
    throw new RouteError("AUTH-002", 400);
  }

  // رمز التفعيل: صادر، غير مستهلك، غير منتهي، مطابق
  const issued = await db.otpCode.findFirst({
    where: { phone, purpose: "REENROLL", consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!issued) {
    await fail(phone, ip);
    throw new RouteError("AUTH-002", 400); // غير قابل للوصول — fail يرمي دائماً
  }
  if (issued.expiresAt < new Date() || issued.code !== token) {
    await fail(phone, ip);
    throw new RouteError("AUTH-002", 400); // غير قابل للوصول — fail يرمي دائماً
  }

  const step = verifyEnrollmentCode(user, code);
  if (step === null) {
    // محاولة رمز TOTP خاطئة — نزيد محاولات رمز التفعيل نفسه (حماية من التخمين)
    await db.otpCode.update({
      where: { id: issued.id },
      data: { attempts: issued.attempts + 1 },
    });
    await fail(phone, ip);
  }

  const sessionToken = await createSession(user.id);
  const recoveryCodes = await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { totpConfirmedAt: new Date(), totpLastStep: step },
    });
    // استهلاك رمز التفعيل (لمرة واحدة)
    await tx.otpCode.update({ where: { id: issued.id }, data: { consumedAt: new Date() } });
    return regenerateRecoveryCodes(tx, user.id);
  });
  resetLimit("enroll-fail", phone);
  await logSecurityEvent("REENROLL_USED", { phone, userId: user.id, ip });
  await logSecurityEvent("LOGIN_SUCCESS", { phone, userId: user.id, ip, meta: { stage: "REENROLL" } });

  const result: AuthResultView = {
    user: toPublicUser(user),
    needsPin: user.pinHash === null,
    notice:
      user.status === "FROZEN" ? "الحساب مجمّد — يمكنك الدخول للاطلاع فقط" : null,
    noticeCode: user.status === "FROZEN" ? "AUTH-005" : null,
    sessionToken,
    recoveryCodes,
  };
  return ok(result);
});
