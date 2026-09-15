/**
 * محفظة الجنوب — إنفاذ حالة الخدمات خادمياً (Master §139)
 * ------------------------------------------------------------
 * «مفتاح الإطفاء» الإداري يجب أن يُحترم من الـAPI لا من الواجهة فقط:
 * أي مسار مالي لخدمة خاضعة لـServiceState يفحص الحالة قبل التنفيذ،
 * ويرمي SRV-001 (503) إن لم تكن ON.
 * قاعدة أمان افتراضية: مفتاح غير موجود في الجدول = خدمة غير معرّفة
 * = معطّلة (لا يمكن أن يعمل مسارٌ خدمةً غير مفتوحة إدارياً).
 */
import { db } from "../db";
import { RouteError } from "./envelope";

export type ServiceKey =
  | "BILLS"
  | "TOPUP"
  | "NETWORK_CARDS"
  | "MERCHANT_PAY"
  | "REMITTANCE_IN"
  | "OFFLINE";

/**
 * تحقق أن الخدمة مفعلة إدارياً (state === "ON") قبل تنفيذ عملية مالية.
 * يُستدعى في بداية المسارات المكتوبة (POST) — قراءات الكتالوج (GET) معفاة.
 */
export async function assertServiceOn(key: ServiceKey): Promise<void> {
  const row = await db.serviceState.findUnique({ where: { key } });
  if (!row || row.state !== "ON") {
    throw new RouteError("SRV-001", 503, { service: key });
  }
}
