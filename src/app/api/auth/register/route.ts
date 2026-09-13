/**
 * A3 — POST /api/auth/register { phone, fullName, governorate }
 * إنشاء حساب جديد + إصدار إلحاق المصادقة (TOTP) مرة واحدة:
 * يُنشأ الحساب ACTIVE بلا أموال + المحافظ الثلاث + إشعار ترحيب،
 * ويبقى غير قابل للاستخدام حتى تأكيد رمز المصادقة (register/confirm).
 * إعادة المحاولة على حساب غير مؤكد (تسجيل مهجور) تجدّد بياناته وإلحاقه.
 * المحافظة خارج النطاق الثماني → scopeRestricted (اطلاع فقط — AC-07).
 * حدود: 10 تسجيلات/ساعة لكل IP + 1 لكل هاتف/دقيقة — SYS-002.
 */
import { ok, route, readJsonBody, reqStr, optStr, RouteError } from "@/lib/server/envelope";
import { assertValidPhone } from "@/lib/server/domain";
import { rateLimit, clientIp } from "@/lib/server/rate-limit";
import { logSecurityEvent } from "@/lib/server/security-events";
import { issueEnrollment } from "@/lib/server/totp-service";
import { notify } from "@/lib/server/notify";
import { CURRENCIES, IN_SCOPE_GOVERNORATES } from "@/lib/api-types";
import { db } from "@/lib/db";

const NAME_PATTERN = /^[\u0600-\u06FF\u0750-\u077FA-Za-z\s]{2,60}$/;

export const POST = route(async (req) => {
  const body = await readJsonBody(req);
  const phone = assertValidPhone(reqStr(body, "phone"));
  const fullName = reqStr(body, "fullName").replace(/\s+/g, " ").trim();
  const governorate = reqStr(body, "governorate").trim();

  // حد IP: 10 تسجيلات/ساعة (يمنع حجز أرقام بالجملة)
  const ipCheck = rateLimit("register-ip", clientIp(req), 10, 60 * 60_000);
  if (!ipCheck.allowed) {
    throw new RouteError("SYS-002", 429, { secondsRemaining: ipCheck.retryAfterSec });
  }
  // حد لكل هاتف: محاولة واحدة/دقيقة
  const phoneCheck = rateLimit("register-phone", phone, 1, 60_000);
  if (!phoneCheck.allowed) {
    throw new RouteError("SYS-002", 429, { secondsRemaining: phoneCheck.retryAfterSec });
  }

  if (phone === "000000000") {
    throw new RouteError("SYS-001", 400, { reason: "رقم غير صالح" });
  }
  if (!NAME_PATTERN.test(fullName)) {
    throw new RouteError("SYS-001", 400, {
      field: "fullName",
      reason: "الاسم يجب أن يكون 2-60 حرفاً (أحرف عربية/لاتينية فقط)",
    });
  }
  if (governorate.length < 2 || governorate.length > 40) {
    throw new RouteError("SYS-001", 400, { field: "governorate", reason: "المحافظة غير صالحة" });
  }
  const inScope = (IN_SCOPE_GOVERNORATES as readonly string[]).includes(governorate);
  const scopeRestricted = !inScope;

  const existing = await db.user.findUnique({ where: { phone } });

  let user;
  if (existing) {
    // حساب مؤكد المصادقة → عادي: استخدم تسجيل الدخول
    if (existing.totpConfirmedAt || existing.role !== "CUSTOMER" || existing.status !== "ACTIVE") {
      throw new RouteError("AUTH-901", 409);
    }
    // تسجيل مهجور (لم يُأكد): تجديد البيانات وإصدار إلحاق جديد — الحساب بلا أموال
    user = await db.user.update({
      where: { id: existing.id },
      data: { fullName, governorate, scopeRestricted, pinHash: null },
    });
  } else {
    user = await db.user.create({
      data: {
        phone,
        fullName,
        governorate,
        scopeRestricted,
        role: "CUSTOMER",
        status: "ACTIVE",
        kycLevel: "NONE",
      },
    });
    await db.wallet.createMany({
      data: CURRENCIES.map((c) => ({
        userId: user.id,
        kind: "MAIN",
        currency: c,
        balanceMinor: 0,
      })),
    });
    await notify(
      db,
      user.id,
      "مرحباً بك في محفظة الجنوب",
      "تم إنشاء حسابك بنجاح — فعّل المصادقة الثنائية لإكمال التسجيل، ثم يمكنك استقبال التحويلات وإتمام العمليات النقدية عبر وكلائنا المعتمدين.",
      "SYSTEM"
    );
  }

  await logSecurityEvent("REGISTER", { phone, userId: user.id, ip: clientIp(req) });

  // إلحاق المصادقة — يُعرض مرة واحدة (سر + QR)
  const enrollment = await issueEnrollment(user);
  return ok({ enrollment });
});
