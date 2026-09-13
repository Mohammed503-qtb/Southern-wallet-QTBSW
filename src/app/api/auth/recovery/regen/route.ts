/**
 * A6 — POST /api/auth/recovery/regen { code }
 * إعادة توليد رموز الاسترداد (المستخدم المصادق عليه حالياً): يتطلب رمز
 * TOTP حالي صحيحاً (إثبات حيازة جهاز المصادقة) → حذف القديمة وإصدار
 * 8 رموز جديدة تُعرض مرة واحدة + حدث أمني RECOVERY_REGEN.
 * حد: 3 عمليات/ساعة لكل مستخدم.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { rateLimit, clientIp } from "@/lib/server/rate-limit";
import { logSecurityEvent } from "@/lib/server/security-events";
import { verifyUserTotp, regenerateRecoveryCodes } from "@/lib/server/totp-service";
import { db } from "@/lib/db";

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await readJsonBody(req);
  const code = reqStr(body, "code");

  const rl = rateLimit("recovery-regen", user.id, 3, 60 * 60_000);
  if (!rl.allowed) {
    throw new RouteError("SYS-002", 429, { secondsRemaining: rl.retryAfterSec });
  }

  if (!user.totpConfirmedAt) {
    throw new RouteError("AUTH-007", 403);
  }

  const step = verifyUserTotp(user, code);
  if (step === null) {
    throw new RouteError("AUTH-002", 400);
  }

  // تسجيل الخطوة الناجحة (منع إعادة استخدام الرمز) + إصدار الرموز الجديدة
  const recoveryCodes = await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
    return regenerateRecoveryCodes(tx, user.id);
  });
  await logSecurityEvent("RECOVERY_REGEN", { userId: user.id, phone: user.phone, ip: clientIp(req) });

  return ok({ recoveryCodes });
});
