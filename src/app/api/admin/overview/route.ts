/**
 * M1 — GET /api/admin/overview → AdminOverviewView
 * ADMIN/COMPLIANCE: مؤشرات عامة + فحص توازن الدفاتر Σ=0 + إنهاء كسول.
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { runLazyExpiry } from "@/lib/server/cashflow";
import { ledgerCheck } from "@/lib/server/ledger";
import { db } from "@/lib/db";

export const GET = route(async () => {
  await requireUser(["ADMIN", "COMPLIANCE"]);
  await runLazyExpiry();

  const since24h = new Date(Date.now() - 24 * 3600_000);
  const [
    usersCount,
    customersCount,
    agentsCount,
    frozenUsers,
    pendingKyc,
    pendingCashOps,
    pendingRemittances,
    openTickets,
    txnLast24h,
    volumeRows,
    check,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.agentProfile.count(),
    db.user.count({ where: { status: "FROZEN" } }),
    db.kycSubmission.count({ where: { status: "PENDING" } }),
    db.cashOperation.count({ where: { status: "PENDING" } }),
    db.remittance.count({ where: { status: "PENDING" } }),
    db.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    db.transaction.count({ where: { createdAt: { gte: since24h } } }),
    db.transaction.groupBy({
      by: ["currency"],
      where: { createdAt: { gte: since24h }, direction: "DEBIT", status: { in: ["PENDING", "COMPLETED"] } },
      _sum: { amountMinor: true, feeMinor: true },
    }),
    ledgerCheck(db),
  ]);

  const volume24hMinor: Record<string, number> = {};
  for (const row of volumeRows) {
    volume24hMinor[row.currency] = (row._sum.amountMinor ?? 0) + (row._sum.feeMinor ?? 0);
  }

  return ok({
    usersCount,
    customersCount,
    agentsCount,
    frozenUsers,
    pendingKyc,
    pendingCashOps,
    pendingRemittances,
    openTickets,
    txnLast24h,
    volume24hMinor,
    ledgerBalanced: check.ledgerBalanced,
    ledgerViolations: check.ledgerViolations,
  });
});
