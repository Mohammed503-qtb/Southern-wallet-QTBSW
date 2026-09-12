/**
 * P2 — DELETE /api/profile/sessions/:id
 * إنهاء جلسة أخرى (ليست الجارية) — SECURITY.
 */
import { ok, route, RouteError } from "@/lib/server/envelope";
import { requireUser, getCurrentSession } from "@/lib/server/auth";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route<Ctx>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const target = await db.session.findUnique({ where: { id } });
  if (!target || target.userId !== user.id) {
    throw new RouteError("SYS-001", 404, { reason: "جلسة غير موجودة" });
  }
  const current = await getCurrentSession();
  if (current && current.id === target.id) {
    throw new RouteError("SYS-001", 400, { reason: "استخدم تسجيل الخروج لإنهاء الجلسة الحالية" });
  }
  await db.session.update({ where: { id }, data: { active: false } });
  return ok({ terminated: id });
});
