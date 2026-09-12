/**
 * M9 — GET /api/admin/limits → AdminLimitRow[] — ADMIN
 * PUT  /api/admin/limits/:id { dailyTxnCount, dailyAmountMinor, perTxnAmountMinor }
 * تحرير حدود + Audit بالقيم القديمة/الجديدة.
 */
import { ok, route, readJsonBody, reqInt, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { toAdminLimitRow } from "@/lib/server/views";
import { db } from "@/lib/db";

export const GET = route(async () => {
  await requireUser(["ADMIN"]);
  const rows = await db.limitRule.findMany({ orderBy: [{ kycLevel: "asc" }, { currency: "asc" }] });
  return ok(rows.map(toAdminLimitRow));
});
