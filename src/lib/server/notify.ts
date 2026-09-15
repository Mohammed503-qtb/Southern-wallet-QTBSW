/**
 * محفظة الجنوب — الإشعارات (Notification)
 * كل حدث يهم المستخدم (عملية/أمان/توثيق/دعم) يولّد إشعاراً من هنا
 * ملاحظة: بلا استيراد من "next" حتى يمكن استعماله من prisma/seed.ts
 */
import type { DbClient } from "./audit";

/** إشعار مستخدم — يعمل داخل معاملة (يرتبط بمصيرها) أو خارجها */
export async function notify(
  client: DbClient,
  userId: string,
  title: string,
  body: string,
  category: "TXN" | "SECURITY" | "KYC" | "SYSTEM" | "SUPPORT",
  txRef?: string | null,
  /** تاريخ الإنشاء (للسجل التاريخي في Seed) — افتراضياً الآن */
  at?: Date
): Promise<void> {
  await client.notification.create({
    data: {
      userId,
      title,
      body,
      category,
      txRef: txRef ?? null,
      ...(at ? { createdAt: at } : {}),
    },
  });
}
