/**
 * M6 — GET /api/admin/agents → AdminAgentRow[] — ADMIN
 * (العوم من محفظة AGENT_FLOAT + إجمالي العمولات من CommissionEntry)
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { toAdminAgentRow } from "@/lib/server/views";
import { db } from "@/lib/db";

export const GET = route(async () => {
  await requireUser(["ADMIN"]);
  const profiles = await db.agentProfile.findMany({ orderBy: { code: "asc" }, take: 100 });
  const userIds = profiles.map((p) => p.userId);
  const [users, floatWallets, commissionAggs] = await Promise.all([
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, phone: true, fullName: true } }),
    db.wallet.findMany({
      where: { userId: { in: userIds }, kind: "AGENT_FLOAT", currency: "YER" },
      select: { userId: true, balanceMinor: true },
    }),
    db.commissionEntry.groupBy({
      by: ["agentId"],
      _sum: { amountMinor: true },
    }),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const floatByUser = new Map(floatWallets.map((w) => [w.userId, w.balanceMinor]));
  const commissionByAgent = new Map(commissionAggs.map((c) => [c.agentId, c._sum.amountMinor ?? 0]));

  return ok(
    profiles.map((p) => {
      const owner = userById.get(p.userId);
      return toAdminAgentRow(
        p,
        owner?.phone ?? "—",
        owner?.fullName ?? null,
        floatByUser.get(p.userId) ?? p.floatMinor,
        commissionByAgent.get(p.userId) ?? 0
      );
    })
  );
});
