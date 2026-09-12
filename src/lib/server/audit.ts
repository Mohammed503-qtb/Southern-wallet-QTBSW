/**
 * محفظة الجنوب — التدقيق الإداري (AuditLog)
 * كل إجراء حساس (تجميد/قرار KYC/تحرير قواعد/إلغاء إداري) يمرّ من هنا
 * ملاحظة: الملف بلا استيراد من "next" حتى يمكن استعماله من prisma/seed.ts
 */
import type { Prisma } from "@prisma/client";

/** عميل Prisma (جذر أو معاملة) — يُمرَّر لدوال الخادم القابلة للتشغيل داخل $transaction */
export type DbClient = Prisma.TransactionClient;

/** تدقيق إداري — مع القيم القديمة/الجديدة في metaJson عند التحرير */
export async function writeAudit(
  client: DbClient,
  actor: { id: string; role: string },
  action: string,
  targetType: string,
  targetId: string,
  reason?: string | null,
  meta?: Record<string, unknown>
): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: actor.id,
      actorRole: actor.role,
      action,
      targetType,
      targetId,
      reason: reason ?? null,
      metaJson: meta ? JSON.stringify(meta) : null,
    },
  });
}
