/**
 * ============================================================
 * محفظة الجنوب — أداة تعيين دور إداري (Bootstrap)
 * ------------------------------------------------------------
 * الغرض: في نشر إنتاج نظيف (بلا بذور) لا توجد أي أدوار إدارية.
 * المسار المعتمد لإنشاء أول مدير:
 *   1) يسجّل الشخص المسؤول حساباً طبيعياً من التطبيق (هاتف + TOTP
 *      على جهازه الخاص + PIN) — دوره الابتدائي CUSTOMER.
 *   2) يشغّل مشغّل الخادم هذه الأداة مرة واحدة لترقيته:
 *        bun scripts/promote-role.ts 770123456 ADMIN
 *      (أو داخل الحاوية: docker compose exec app bun scripts/promote-role.ts ...)
 *
 * القيود:
 *   • الأدوار المسموح تعيينها: ADMIN | COMPLIANCE | SUPPORT
 *     (أدوار الوكلاء/التجارة تُمنح عبر لوحة الإدارة بعد وجود مدير).
 *   • لا يمكن تعيين SYSTEM ولا CUSTOMER عبر الأداة.
 *   • كل استدعاء يُسجَّل في AuditLog (actor = صاحب العملية الحالي
 *     إن وُجد، وإلا BOOTSTRAP).
 *
 * الاستخدام:
 *   bun scripts/promote-role.ts <phone 9digits> <ADMIN|COMPLIANCE|SUPPORT>
 * ============================================================
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ log: ["warn", "error"] });

const ASSIGNABLE = ["ADMIN", "COMPLIANCE", "SUPPORT"] as const;
type Assignable = (typeof ASSIGNABLE)[number];

async function main() {
  const phone = process.argv[2];
  const role = process.argv[3]?.toUpperCase() as Assignable;

  if (!phone || !/^7\d{8}$/.test(phone)) {
    console.error("الاستخدام: bun scripts/promote-role.ts <الهاتف 9 أرقام> <ADMIN|COMPLIANCE|SUPPORT>");
    process.exit(1);
  }
  if (!ASSIGNABLE.includes(role)) {
    console.error(`الدور غير مسموح — الأدوار القابلة للتعيين: ${ASSIGNABLE.join(" | ")}`);
    process.exit(1);
  }

  const user = await db.user.findUnique({ where: { phone } });
  if (!user) {
    console.error(`لا يوجد مستخدم بالهاتف ${phone} — يجب أن يسجّل حسابه من التطبيق أولاً (TOTP خاص به) ثم تُرقّى أدواره هنا.`);
    process.exit(1);
  }
  if (user.status !== "ACTIVE") {
    console.error(`حالة الحساب ${user.status} — يجب أن يكون ACTIVE قبل الترقية.`);
    process.exit(1);
  }
  if (user.role === role) {
    console.log(`الحساب ${phone} يحمل الدور ${role} أصلاً — لا تغيير.`);
    return;
  }

  await db.user.update({ where: { phone }, data: { role } });

  // سجل تدقيق لعملية الترقية (actorId مرجعي لنفس المستخدم — لا يوجد
  // مدير بعد في بيئة الـ Bootstrap؛ التمييز عبر action وmeta)
  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorRole: user.role,
      action: "ROLE_PROMOTE_BOOTSTRAP",
      targetType: "USER",
      targetId: user.id,
      reason: `تعيين دور إداري أول عبر سكربت التهيئة (bootstrap) — الدور الجديد: ${role}`,
      metaJson: JSON.stringify({ phone, previousRole: user.role, newRole: role, via: "scripts/promote-role.ts" }),
    },
  });

  console.log(`تمت الترقية: ${phone} (${user.fullName}) → ${role}`);
  console.log("يطبّق الدور من دخوله القادم. إذا كانت جلسات قائمة فستحتاج خروجاً ودخولاً.");
}

main()
  .catch((e) => {
    console.error("فشل:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
