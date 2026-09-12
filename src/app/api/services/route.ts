/**
 * X5 — GET /api/services → ServiceStateView[] (أي جلسة)
 * حالة الخدمات للكتالوج: BILLS/TOPUP/NETWORK_CARDS/MERCHANT_PAY/REMITTANCE_IN/OFFLINE
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { toServiceStateView } from "@/lib/server/views";
import { db } from "@/lib/db";

export const GET = route(async () => {
  await requireUser();
  const rows = await db.serviceState.findMany({ orderBy: { key: "asc" } });
  return ok(rows.map(toServiceStateView));
});
