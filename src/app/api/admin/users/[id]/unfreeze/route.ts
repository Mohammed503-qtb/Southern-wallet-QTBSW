/**
 * M3 — POST /api/admin/users/:id/unfreeze { reason }
 * فك التجميد + تدقيق + إشعار — ADMIN.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { toPublicUser } from "@/lib/server/views";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, ctx) => {
  const admin = await requireUser(["ADMIN"]);
  const { id } = await ctx.params;
  const body = await readJsonBody(req);
  const reason = reqStr(body, "reason");

  const target = await db.user.findUnique({ where: { id } });
  if (!target || target.role === "SYSTEM") {
    throw new RouteError("SYS-001", 404, { reason: "مستخدم غير موجود" });
  }
  if (target.status !== "FROZEN") {
    throw new RouteError("SYS-001", 400, { reason: "الحساب غير مجمّد" });
  }

  const updated = await db.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id }, data: { status: "ACTIVE" } });
    await writeAudit(
      tx,
      { id: admin.id, role: admin.role },
      "USER_UNFREEZE",
      "USER",
      id,
      reason,
      { phone: target.phone, from: "FROZEN", to: "ACTIVE" }
    );
    await notify(
      tx,
      id,
      "تم فك تجميد الحساب",
      "أُعيد تنشيط حسابك — يمكنك الآن إتمام العمليات المالية.",
      "SECURITY"
    );
    return u;
  });

  return ok(toPublicUser(updated));
});
