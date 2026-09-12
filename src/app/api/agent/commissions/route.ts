/**
 * G5 — GET /api/agent/commissions → { items: CommissionEntryView[], totalMinor }
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { toCommissionEntryView } from "@/lib/server/views";
import { db } from "@/lib/db";

export const GET = route(async () => {
  const user = await requireUser(["AGENT"]);
  const rows = await db.commissionEntry.findMany({
    where: { agentId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const total = await db.commissionEntry.aggregate({
    where: { agentId: user.id },
    _sum: { amountMinor: true },
  });
  return ok({ items: rows.map(toCommissionEntryView), totalMinor: total._sum.amountMinor ?? 0 });
});
