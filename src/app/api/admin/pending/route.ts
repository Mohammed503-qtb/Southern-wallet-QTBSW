/**
 * M14 — GET /api/admin/pending → AdminPendingView — ADMIN
 * الحوالات/العمليات النقدية المعلقة (مع إنهاء كسول أولاً).
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { runLazyExpiry } from "@/lib/server/cashflow";
import { toRemittanceView, toCashOpView } from "@/lib/server/views";
import { db } from "@/lib/db";

export const GET = route(async () => {
  await requireUser(["ADMIN"]);
  await runLazyExpiry();

  const [remittances, cashOps] = await Promise.all([
    db.remittance.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 100 }),
    db.cashOperation.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 100 }),
  ]);

  const remAgentIds = [...new Set(remittances.map((r) => r.payingAgentId).filter((x): x is string => x !== null))];
  const cashAgentIds = [...new Set(cashOps.map((c) => c.agentId))];
  const agentIds = [...new Set([...remAgentIds, ...cashAgentIds])];
  const [profiles, owners] = await Promise.all([
    agentIds.length ? db.agentProfile.findMany({ where: { userId: { in: agentIds } } }) : [],
    agentIds.length ? db.user.findMany({ where: { id: { in: agentIds } }, select: { id: true, fullName: true } }) : [],
  ]);
  const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
  const nameByUser = new Map(owners.map((o) => [o.id, o.fullName]));

  return ok({
    remittances: remittances.map((r) =>
      toRemittanceView(r, r.payingAgentId ? profileByUser.get(r.payingAgentId)?.shopName ?? null : null)
    ),
    cashOps: cashOps.map((c) =>
      toCashOpView(c, profileByUser.get(c.agentId) ?? null, nameByUser.get(c.agentId) ?? null)
    ),
  });
});
