/**
 * G2 — GET /api/agent/queue → AgentQueueItem[]
 * طلبات الإيداع/السحب المعلقة لدى وكيل هذا الحساب
 * (الحوالات المعلقة لا تُدرج — تُدفع بأي وكيل عبر البحث بالرمز G4).
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { runLazyExpiry } from "@/lib/server/cashflow";
import { db } from "@/lib/db";
import type { AgentQueueItem } from "@/lib/api-types";

export const GET = route(async () => {
  const user = await requireUser(["AGENT"]);
  await runLazyExpiry();

  const rows = await db.cashOperation.findMany({
    where: { agentId: user.id, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const users = await db.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: { id: true, fullName: true, phone: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  const items: AgentQueueItem[] = rows.map((r) => {
    const owner = userById.get(r.userId);
    return {
      id: r.id,
      kind: r.type === "DEPOSIT" ? "CASH_DEPOSIT" : "CASH_WITHDRAW",
      ref: r.ref,
      userName: owner?.fullName ?? "مستخدم",
      userPhone: owner?.phone ?? "—",
      amountMinor: r.amountMinor,
      currency: r.currency as AgentQueueItem["currency"],
      status: r.status as AgentQueueItem["status"],
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
    };
  });
  return ok(items);
});
