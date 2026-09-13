/**
 * M10 — POST /api/admin/users/:id/reset-totp { reason }
 * إعادة تعيين المصادقة (إجرائية، بعد التحقق من هوية المستخدم عبر الدعم):
 *  • إبطال كل جلسات المستخدم + مسح سر TOTP + حذف رموز الاسترداد.
 *  • إصدار رمز تفعيل R+7 صالح 24 ساعة يُسلَّم للمستخدم عبر قناة موثوقة
 *    (هاتف الدعم) — يُدخله في شاشة الدخول لإعادة إلحاق جهاز مصادقة جديد.
 * تدقيق إداري + حدث أمني TOTP_RESET. ADMIN فقط.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { resetLimit } from "@/lib/server/rate-limit";
import { writeAudit } from "@/lib/server/audit";
import { logSecurityEvent } from "@/lib/server/security-events";
import { generateReEnrollToken } from "@/lib/server/totp";
import { notify } from "@/lib/server/notify";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const TOKEN_TTL_MS = 24 * 60 * 60_000; // 24 ساعة

export const POST = route<Ctx>(async (req, ctx) => {
  const admin = await requireUser(["ADMIN"]);
  const { id } = await ctx.params;
  const body = await readJsonBody(req);
  const reason = reqStr(body, "reason");

  const target = await db.user.findUnique({ where: { id } });
  if (!target || target.role === "SYSTEM") {
    throw new RouteError("SYS-001", 404, { reason: "مستخدم غير موجود" });
  }
  if (!target.totpConfirmedAt && !target.totpSecretEnc) {
    throw new RouteError("SYS-001", 400, { reason: "المصادقة غير مفعّلة لهذا الحساب أصلاً" });
  }

  const token = generateReEnrollToken();

  await db.$transaction(async (tx) => {
    // إبطال الجلسات + مسح المصادقة + رموز الاسترداد
    await tx.session.updateMany({
      where: { userId: id, active: true },
      data: { active: false },
    });
    await tx.user.update({
      where: { id },
      data: { totpSecretEnc: null, totpConfirmedAt: null, totpLastStep: null },
    });
    await tx.recoveryCode.deleteMany({ where: { userId: id } });
    // إبطال أي رمز تفعيل سابق غير مستهلك لنفس الهاتف
    await tx.otpCode.updateMany({
      where: { phone: target.phone, purpose: "REENROLL", consumedAt: null },
      data: { consumedAt: new Date() },
    });
    // رمز التفعيل الجديد
    await tx.otpCode.create({
      data: {
        phone: target.phone,
        code: token,
        purpose: "REENROLL",
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });
    await writeAudit(tx, { id: admin.id, role: admin.role }, "TOTP_RESET", "USER", id, reason, {
      phone: target.phone,
    });
    await notify(
      tx,
      id,
      "إعادة تعيين المصادقة",
      "بُطلت مصادقة حسابك بناءً على طلبك بعد التحقق. استخدم رمز التفعيل الصادر لك لإعادة تفعيل المصادقة عند الدخول.",
      "SECURITY"
    );
  });

  // رفع قفل الدخول المؤقت للهاتف (إن وجد) — المستخدم سيدخل برمز التفعيل
  // المُصدر بعد التحقق، وليس من مصدر الفشل المتكرر
  resetLimit("login-fail", target.phone);
  resetLimit("enroll-fail", target.phone);

  await logSecurityEvent("TOTP_RESET", {
    userId: id,
    phone: target.phone,
    meta: { adminId: admin.id, reason },
  });
  await logSecurityEvent("REENROLL_ISSUED", { userId: id, phone: target.phone });

  return ok({
    reEnrollToken: token,
    phone: target.phone,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    note: "سلّم الرمز للمستخدم عبر قناة موثوقة بعد التحقق من هويته — يُستخدم مرة واحدة خلال 24 ساعة",
  });
});
