/**
 * A2 — POST /api/auth/verify { phone, code, fullName?, governorate? }
 * تسجيل الدخول أو إنشاء حساب جديد → كوكي جلسة.
 * الحدود: 5 محاولات (AUTH-003)، CLOSED → AUTH-005 (رفض)،
 * FROZEN → دخول اطلاع فقط (AUTH-005 يُعاد كإشعار في data لا كفشل).
 */
import { ok, route, readJsonBody, reqStr, RouteError, optStr } from "@/lib/server/envelope";
import { assertValidPhone } from "@/lib/server/domain";
import { createSession } from "@/lib/server/auth";
import { notify } from "@/lib/server/notify";
import { toPublicUser } from "@/lib/server/views";
import { CURRENCIES, IN_SCOPE_GOVERNORATES } from "@/lib/api-types";
import type { AuthResultView } from "@/lib/api-types";
import { db } from "@/lib/db";

const MAX_OTP_ATTEMPTS = 5;

export const POST = route(async (req) => {
  const body = await readJsonBody(req);
  const phone = assertValidPhone(reqStr(body, "phone"));
  const code = reqStr(body, "code");

  const otp = await db.otpCode.findFirst({
    where: { phone, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.expiresAt < new Date()) {
    throw new RouteError("AUTH-002", 400);
  }
  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    throw new RouteError("AUTH-003", 429);
  }
  if (otp.code !== code.trim()) {
    await db.otpCode.update({
      where: { id: otp.id },
      data: { attempts: otp.attempts + 1 },
    });
    const attemptsLeft = MAX_OTP_ATTEMPTS - (otp.attempts + 1);
    if (attemptsLeft <= 0) {
      throw new RouteError("AUTH-003", 429);
    }
    throw new RouteError("AUTH-002", 400, { attemptsLeft });
  }
  // استهلاك الرمز
  await db.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

  let user = await db.user.findUnique({ where: { phone } });

  if (!user) {
    // REGISTER: إنشاء حساب ACTIVE + محافظ MAIN الثلاث + إشعار ترحيبي
    const fullName = optStr(body, "fullName");
    const governorate = optStr(body, "governorate");
    if (governorate && !(IN_SCOPE_GOVERNORATES as readonly string[]).includes(governorate)) {
      throw new RouteError("SYS-001", 400, {
        field: "governorate",
        reason: "المحافظة يجب أن تكون ضمن نطاق الخدمة الثماني",
      });
    }
    user = await db.user.create({
      data: {
        phone,
        fullName,
        governorate,
        role: "CUSTOMER",
        status: "ACTIVE",
        kycLevel: "NONE",
      },
    });
    await db.wallet.createMany({
      data: CURRENCIES.map((c) => ({
        userId: user!.id,
        kind: "MAIN",
        currency: c,
        balanceMinor: 0,
      })),
    });
    await notify(
      db,
      user.id,
      "مرحباً بك في محفظة الجنوب",
      "تم إنشاء حسابك بنجاح — يمكنك الآن استقبال التحويلات وإتمام العمليات النقدية عبر وكلائنا المعتمدين.",
      "SYSTEM"
    );
  }

  if (user.status === "CLOSED") {
    throw new RouteError("AUTH-005", 403, { reason: "CLOSED" });
  }

  const sessionToken = await createSession(user.id);

  const result: AuthResultView = {
    user: toPublicUser(user),
    needsPin: user.pinHash === null,
    notice:
      user.status === "FROZEN"
        ? "الحساب مجمّد — يمكنك الدخول للاطلاع فقط"
        : null,
    noticeCode: user.status === "FROZEN" ? "AUTH-005" : null,
    sessionToken,
  };
  return ok(result);
});
