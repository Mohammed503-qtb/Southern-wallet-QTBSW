/**
 * C1 — GET /api/agents ?governorate&q → AgentView[] (النشطون فقط)
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { toAgentView } from "@/lib/server/views";
import { IN_SCOPE_GOVERNORATES } from "@/lib/api-types";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const GET = route(async (req) => {
  await requireUser();
  const url = new URL(req.url);

  const where: Prisma.AgentProfileWhereInput = { status: "ACTIVE" };
  const governorate = url.searchParams.get("governorate") ?? "";
  if ((IN_SCOPE_GOVERNORATES as readonly string[]).includes(governorate)) {
    where.governorate = governorate;
  }
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length > 0) {
    where.OR = [
      { shopName: { contains: q } },
      { code: { contains: q } },
      { district: { contains: q } },
    ];
  }

  const rows = await db.agentProfile.findMany({ where, orderBy: { code: "asc" }, take: 50 });
  return ok(rows.map(toAgentView));
});
