/**
 * M11 — GET /api/admin/fx → AdminFxRow[] — ADMIN
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { toAdminFxRow } from "@/lib/server/views";
import { db } from "@/lib/db";

export const GET = route(async () => {
  await requireUser(["ADMIN"]);
  const rows = await db.fxRate.findMany({ orderBy: [{ fromCurrency: "asc" }, { toCurrency: "asc" }] });
  return ok(rows.map(toAdminFxRow));
});
