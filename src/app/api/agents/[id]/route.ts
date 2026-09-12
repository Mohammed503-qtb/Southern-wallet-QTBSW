/**
 * C2 — GET /api/agents/:id → AgentView
 */
import { ok, route, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { toAgentView } from "@/lib/server/views";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  const row = await db.agentProfile.findUnique({ where: { id } });
  if (!row) {
    throw new RouteError("SYS-001", 404, { reason: "وكيل غير موجود" });
  }
  return ok(toAgentView(row));
});
