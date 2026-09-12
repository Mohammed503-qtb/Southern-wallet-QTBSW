/**
 * F3 — DELETE /api/beneficiaries/:id
 */
import { ok, route, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route<Ctx>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const row = await db.beneficiary.findFirst({ where: { id, userId: user.id } });
  if (!row) {
    throw new RouteError("SYS-001", 404, { reason: "مفضل غير موجود" });
  }
  await db.beneficiary.delete({ where: { id } });
  return ok({ deleted: id });
});
