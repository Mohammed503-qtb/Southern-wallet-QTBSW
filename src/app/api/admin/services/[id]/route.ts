/**
 * M12 — PUT /api/admin/services/:id { state, note? } — ADMIN + Audit
 * حالة الخدمة: ON | OFF | COMING_LATER | MAINTENANCE
 */
import { ok, route, readJsonBody, reqStr, optStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { toAdminServiceRow } from "@/lib/server/views";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const STATES = ["ON", "OFF", "COMING_LATER", "MAINTENANCE"];

export const PUT = route<Ctx>(async (req, ctx) => {
  const admin = await requireUser(["ADMIN"]);
  const { id } = await ctx.params;
  const body = await readJsonBody(req);
  const state = reqStr(body, "state");
  const note = optStr(body, "note");
  // المهمة 14: حفظ سبب التعديل الإداري في سجل التدقيق (كان يُرسل ويُهمَل)
  const reason = optStr(body, "reason");

  if (!(STATES as string[]).includes(state)) {
    throw new RouteError("SYS-001", 400, { field: "state", reason: "حالة غير صالحة" });
  }
  const existing = await db.serviceState.findUnique({ where: { id } });
  if (!existing) {
    throw new RouteError("SYS-001", 404, { reason: "خدمة غير موجودة" });
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.serviceState.update({ where: { id }, data: { state, note } });
    await writeAudit(
      tx,
      { id: admin.id, role: admin.role },
      "SERVICE_UPDATE",
      "SERVICE_STATE",
      id,
      reason,
      { key: existing.key, old: { state: existing.state, note: existing.note }, new: { state, note } }
    );
    return row;
  });

  return ok(toAdminServiceRow(updated));
});
