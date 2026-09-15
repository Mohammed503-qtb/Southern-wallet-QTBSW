/**
 * M7 — POST /api/admin/agents/:id/status { status: "ACTIVE"|"SUSPENDED", reason }
 * تعليق/تفعيل وكيل + تدقيق + إشعار — ADMIN.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { toAgentView } from "@/lib/server/views";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, ctx) => {
  const admin = await requireUser(["ADMIN"]);
  const { id } = await ctx.params;
  const body = await readJsonBody(req);
  const status = reqStr(body, "status");
  const reason = reqStr(body, "reason");

  if (status !== "ACTIVE" && status !== "SUSPENDED") {
    throw new RouteError("SYS-001", 400, { field: "status", reason: "حالة غير صالحة" });
  }
  const profile = await db.agentProfile.findUnique({ where: { id } });
  if (!profile) {
    throw new RouteError("SYS-001", 404, { reason: "وكيل غير موجود" });
  }

  const updated = await db.$transaction(async (tx) => {
    const p = await tx.agentProfile.update({ where: { id }, data: { status } });
    await writeAudit(
      tx,
      { id: admin.id, role: admin.role },
      "AGENT_STATUS",
      "AGENT",
      id,
      reason,
      { code: profile.code, from: profile.status, to: status }
    );
    await notify(
      tx,
      profile.userId,
      status === "ACTIVE" ? "تم تفعيل وكالتك" : "تم تعليق وكالتك",
      status === "ACTIVE"
        ? "أُعيد تفعيل حساب وكالتك — يمكنك استقبال الطلبات."
        : `عُلّقت وكالتك: ${reason}`,
      "SYSTEM"
    );
    return p;
  });

  return ok(toAgentView(updated));
});
