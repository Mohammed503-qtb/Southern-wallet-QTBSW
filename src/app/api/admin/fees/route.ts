/**
 * M10 — GET /api/admin/fees → AdminFeeRow[] — ADMIN
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { toAdminFeeRow } from "@/lib/server/views";
import { db } from "@/lib/db";

export const GET = route(async () => {
  await requireUser(["ADMIN"]);
  const rows = await db.feeRule.findMany({ orderBy: [{ opType: "asc" }, { currency: "asc" }] });
  return ok(rows.map(toAdminFeeRow));
});
