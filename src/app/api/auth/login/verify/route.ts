/**
 * A2 — POST /api/auth/login/verify { phone, code }
 * تحقق تسجيل الدخول — ثلاث صيغ رمز مقبولة:
 *  1) TOTP: 6 أرقام من تطبيق المصادقة (نافذة ±30 ث + منع إعادة الاستخدام).
 *  2) رمز استرداد: XXXX-XXXX (لمرة واحدة — لفقدان جهاز المصادقة).
 *  3) رمز تفعيل R+7 محارف (يصدره الدعم بعد التحقق) → إعادة إلحاق TOTP.
 * الحدود: 30 محاولة/ساعة لكل IP + قفل 5 محاولات فاشلة/15 دقيقة لكل هاتف
 * (AUTH-003) + تسجيل أحداث أمنية لكل فشل/قفل/نجاح.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { assertValidPhone } from "@/lib/server/domain";
import { rateLimit, clientIp, peekLimit, resetLimit } from "@/lib/server/rate-limit";
import { createSession } from "@/lib/server/auth";
import { logSecurityEvent } from "@/lib/server/security-events";
import { toPublicUser } from "@/lib/server/views";
import {
  verifyUserTotp,
  consumeRecoveryCode,
  recoveryCodesRemaining,
  issueEnrollment,
} from "@/lib/server/totp-service";
import type { AuthResultView } from "@/lib/api-types";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";

const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 15 * 60_000;

/** تسجيل محاولة فاشلة (عداد لكل هاتف) — يرمي دائماً AUTH-002/AUTH-003 */
async function registerFail(phone: string, ip: string): Promise<never> {
  const consumed = rateLimit("login-fail", phone, FAIL_LIMIT, FAIL_WINDOW_MS);
  await logSecurityEvent("LOGIN_FAIL", { phone, ip });
  if (!consumed.allowed) {
    await logSecurityEvent("LOGIN_LOCK", { phone, ip });
    throw new RouteError("AUTH-003", 429, { secondsRemaining: consumed.retryAfterSec });
  }
  if (consumed.remaining <= 0) {
    await logSecurityEvent("LOGIN_LOCK", { phone, ip });
    throw new RouteError("AUTH-003", 429);
  }
  throw new RouteError("AUTH-002", 400, { attemptsLeft: consumed.remaining });
}

/** إصدار نتيجة دخول ناجحة (جلسة + إشعار تجميد + رموز متبقية) */
async function succeedLogin(user: User, ip: string): Promise<AuthResultView> {
  const sessionToken = await createSession(user.id);
  const recoveryRemaining = await recoveryCodesRemaining(user.id);
  await logSecurityEvent("LOGIN_SUCCESS", { phone: user.phone, userId: user.id, ip });
  return {
    user: toPublicUser(user),
    needsPin: user.pinHash === null,
    notice:
      user.status === "FROZEN" ? "الحساب مجمّد — يمكنك الدخول للاطلاع فقط" : null,
    noticeCode: user.status === "FROZEN" ? "AUTH-005" : null,
    sessionToken,
    recoveryRemaining,
  };
}

export const POST = route(async (req) => {
  const body = await readJsonBody(req);
  const phone = assertValidPhone(reqStr(body, "phone"));
  const code = reqStr(body, "code").toUpperCase();

  const ip = clientIp(req);
  // حد IP: 30 محاولة/ساعة (فوق قفل الفشل لكل هاتف)
  const ipCheck = rateLimit("login-verify-ip", ip, 30, 60 * 60_000);
  if (!ipCheck.allowed) {
    throw new RouteError("SYS-002", 429, { secondsRemaining: ipCheck.retryAfterSec });
  }
  // قفل فشل سابق نشط؟ (فحص دون استهلاك — المحاولات تُحصى عند الفشل فقط)
  const lock = peekLimit("login-fail", phone, FAIL_LIMIT);
  if (lock.blocked) {
    throw new RouteError("AUTH-003", 429, { secondsRemaining: lock.retryAfterSec });
  }

  const user = await db.user.findUnique({ where: { phone } });
  if (!user || user.role === "SYSTEM") {
    // لا نكشف وجود الحساب — نفس مسار الفشل مع العداد والقفل
    await logSecurityEvent("LOGIN_FAIL", { phone, ip, meta: { reason: "UNKNOWN_PHONE" } });
    const consumed = rateLimit("login-fail", phone, FAIL_LIMIT, FAIL_WINDOW_MS);
    if (!consumed.allowed) {
      await logSecurityEvent("LOGIN_LOCK", { phone, ip });
      throw new RouteError("AUTH-003", 429, { secondsRemaining: consumed.retryAfterSec });
    }
    throw new RouteError("AUTH-002", 400, { attemptsLeft: consumed.remaining });
  }
  if (user.status === "CLOSED") {
    throw new RouteError("AUTH-005", 403, { reason: "CLOSED" });
  }

  // ===== 1) رمز تفعيل المصادقة (R+7) — إعادة إلحاق بعد إعادة تعيين إداري =====
  if (/^R[2-9A-Z]{7}$/.test(code)) {
    const token = await db.otpCode.findFirst({
      where: { phone, purpose: "REENROLL", consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!token || token.expiresAt < new Date() || token.code !== code) {
      await registerFail(phone, ip);
    }
    // الرمز صحيح: لا يُستهلك هنا — يُستهلك عند تأكيد الإلحاق (reenroll-confirm)
    const enrollment = await issueEnrollment(user);
    return ok({ reEnroll: { token: code, enrollment } });
  }

  // ===== 2) رمز استرداد (XXXX-XXXX) — لفقدان جهاز المصادقة =====
  if (/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code) || /^[A-Z2-9]{8}$/.test(code)) {
    if (!user.totpConfirmedAt) {
      throw new RouteError("AUTH-007", 403);
    }
    const used = await consumeRecoveryCode(user.id, code);
    if (!used) {
      await registerFail(phone, ip);
    }
    await logSecurityEvent("RECOVERY_USED", { phone, userId: user.id, ip });
    const result = await succeedLogin(user, ip);
    return ok(result);
  }

  // ===== 3) رمز TOTP (6 أرقام من تطبيق المصادقة) =====
  if (/^\d{6}$/.test(code)) {
    if (!user.totpConfirmedAt) {
      // حساب غير مفعّل المصادقة — يلزم رمز تفعيل من الدعم
      throw new RouteError("AUTH-007", 403);
    }
    const step = verifyUserTotp(user, code);
    if (step === null) {
      await registerFail(phone, ip);
    }
    // تسجيل الخطوة الناجحة (منع إعادة استخدام الرمز نفسه)
    await db.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
    resetLimit("login-fail", phone);
    const result = await succeedLogin(user, ip);
    return ok(result);
  }

  // صيغة غير معروفة — فشل عادي (registerFail يرمي دائماً)
  return registerFail(phone, ip);
});
