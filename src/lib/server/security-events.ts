/**
 * محفظة الجنوب — الأحداث الأمنية (SecurityEvent)
 * ------------------------------------------------------------
 * سجل خادمي دائم لمحاولات الدخول الفاشلة والقفل وإعادة تعيين المصادقة
 * واستخدام رموز الاسترداد — يغذي لوحة "الأحداث الأمنية" للإدارة
 * ويحقق FR-SEC (تتبع الأحداث الأمنية NFR-MNT).
 * الكتابة best-effort: فشل التسجيل لا يُفشل العملية الأمنية نفسها.
 * بلا استيراد من "next" — يعمل من المسارات ومن سكربتات bun.
 */
import { db } from "../db";

export type SecurityEventKind =
  | "LOGIN_FAIL" // محاولة تحقق دخول خاطئة
  | "LOGIN_LOCK" // تفعيل قفل الدخول المؤقت للهاتف
  | "LOGIN_SUCCESS" // دخول ناجح (TOTP أو رمز استرداد)
  | "REGISTER" // إنشاء حساب جديد
  | "TOTP_RESET" // إعادة تعيين المصادقة (إداري)
  | "RECOVERY_USED" // استخدام رمز استرداد للدخول
  | "RECOVERY_REGEN" // إعادة توليد رموز الاسترداد
  | "REENROLL_ISSUED" // إصدار رمز تفعيل المصادقة (دعم)
  | "REENROLL_USED" // استهلاك رمز تفعيل بنجاح
  | "ADMIN_IP_DENIED"; // رفض وصول إداري خارج القائمة المسموحة

export interface SecurityEventInput {
  phone?: string | null;
  userId?: string | null;
  ip?: string | null;
  meta?: Record<string, unknown>;
}

/** تسجيل حدث أمني — best-effort بلا رمي */
export async function logSecurityEvent(
  kind: SecurityEventKind,
  input: SecurityEventInput = {}
): Promise<void> {
  try {
    await db.securityEvent.create({
      data: {
        kind,
        phone: input.phone ?? null,
        userId: input.userId ?? null,
        ip: input.ip ?? null,
        metaJson: input.meta ? JSON.stringify(input.meta) : null,
      },
    });
  } catch (err) {
    // لا نُفشل العملية الأمنية بسبب فشل التسجيل
    console.error("[security-event] فشل تسجيل الحدث:", kind, err);
  }
}

/** تسميات عربية للعرض في لوحة الإدارة */
export const SECURITY_EVENT_LABELS: Record<string, string> = {
  LOGIN_FAIL: "محاولة دخول خاطئة",
  LOGIN_LOCK: "قفل دخول مؤقت",
  LOGIN_SUCCESS: "دخول ناجح",
  REGISTER: "تسجيل حساب جديد",
  TOTP_RESET: "إعادة تعيين المصادقة",
  RECOVERY_USED: "استخدام رمز استرداد",
  RECOVERY_REGEN: "إعادة توليد رموز الاسترداد",
  REENROLL_ISSUED: "إصدار رمز تفعيل المصادقة",
  REENROLL_USED: "تفعيل مصادقة برمز الدعم",
  ADMIN_IP_DENIED: "رفض وصول إداري (IP)",
};
