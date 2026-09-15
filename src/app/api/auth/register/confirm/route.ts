/**
 * A4 — POST /api/auth/register/confirm { phone, code }
 * تأكيد إلحاق المصادقة لإتمام التسجيل: رمز 6 خانات من تطبيق المصادقة
 * يُطابق السر الصادر من register → تفعيل TOTP + إصدار 8 رموز استرداد
 * (تُعرض مرة واحدة) + جلسة دخول.
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

export const POST = route(async (req) => {
  const body = await readJsonBody(req);
  const phone = assertValidPhone(reqStr(body, "phone"));
  const code = reqStr(body, "code");

  const ip = clientIp(req);
  const ipCheck = rateLimit("register-confirm-ip", ip, 30, 60 * 60_000);
  if (!ipCheck.allowed) {
    throw new RouteError("SYS-002", 429, { secondsRemaining: ipCheck.retryAfterSec });
  }
  const lock = peekLimit("enroll-fail", phone, FAIL_LIMIT);
  if (lock.blocked) {
    throw new RouteError("AUTH-003", 429, { secondsRemaining: lock.retryAfterSec });
  }

  const user = await db.user.findUnique({ where: { phone } });
  if (!user || user.role === "SYSTEM") {
    throw new RouteError("AUTH-002", 400);
  }
  if (user.totpConfirmedAt) {
    // مؤكد بالفعل — سجّل الدخول بالرمز
    throw new RouteError("AUTH-902", 409);
  }
  if (!user.totpSecretEnc) {
    // لا إلحاق صادر — ابدأ التسجيل من جديد
    throw new RouteError("AUTH-007", 403);
  }

  const step = verifyEnrollmentCode(user, code);
  if (step === null) {
    const consumed = rateLimit("enroll-fail", phone, FAIL_LIMIT, FAIL_WINDOW_MS);
    await logSecurityEvent("LOGIN_FAIL", { phone, ip, meta: { stage: "REGISTER_CONFIRM" } });
    if (!consumed.allowed || consumed.remaining <= 0) {
      await logSecurityEvent("LOGIN_LOCK", { phone, ip });
      throw new RouteError("AUTH-003", 429);
    }
    throw new RouteError("AUTH-002", 400, { attemptsLeft: consumed.remaining });
  }

  // تأكيد الإلحاق + رموز الاسترداد + الجلسة في معاملة واحدة
  const sessionToken = await createSession(user.id);
  const recoveryCodes = await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { totpConfirmedAt: new Date(), totpLastStep: step },
    });
    return regenerateRecoveryCodes(tx, user.id);
  });
  resetLimit("enroll-fail", phone);
  await logSecurityEvent("LOGIN_SUCCESS", { phone, userId: user.id, ip, meta: { stage: "REGISTER" } });

  const result: AuthResultView = {
    user: toPublicUser(user),
    needsPin: user.pinHash === null,
    notice: null,
    noticeCode: null,
    sessionToken,
    recoveryCodes,
  };
  return ok(result);
});
