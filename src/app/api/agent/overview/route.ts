/**
 * G1 — GET /api/agent/overview → AgentOverviewView
 * (دور AGENT): العوم من محفظة AGENT_FLOAT:YER + العمولات + قوائم الانتظار.
 */
import { ok, route, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { runLazyExpiry } from "@/lib/server/cashflow";
import { toAgentView } from "@/lib/server/views";
import { db } from "@/lib/db";

export const GET = route(async () => {
  const user = await requireUser(["AGENT"]);
  await runLazyExpiry();

  const profile = await db.agentProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    throw new RouteError("SYS-001", 500, { reason: "ملف الوكيل غير موجود" });
  }
  const floatWallet = await db.wallet.findFirst({
    where: { userId: user.id, kind: "AGENT_FLOAT", currency: "YER" },
  });
  const [commissionAgg, pendingDeposits, pendingWithdrawals, pendingRemittances] = await Promise.all([
    db.commissionEntry.aggregate({
      where: { agentId: user.id },
      _count: true,
      _sum: { amountMinor: true },
    }),
    db.cashOperation.count({ where: { agentId: user.id, type: "DEPOSIT", status: "PENDING" } }),
    db.cashOperation.count({ where: { agentId: user.id, type: "WITHDRAW", status: "PENDING" } }),
    db.remittance.count({ where: { status: "PENDING" } }),
  ]);

  return ok({
    profile: toAgentView(profile),
    floatMinor: floatWallet?.balanceMinor ?? 0,
    commissionTotalMinor: commissionAgg._sum.amountMinor ?? 0,
    commissionCount: typeof commissionAgg._count === "number" ? commissionAgg._count : 0,
    pendingDeposits,
    pendingWithdrawals,
    pendingRemittancesGlobal: pendingRemittances,
  });
});
