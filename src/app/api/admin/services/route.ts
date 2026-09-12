/**
 * M12 — GET /api/admin/services → AdminServiceRow[] — ADMIN
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { toAdminServiceRow } from "@/lib/server/views";
import { db } from "@/lib/db";

export const GET = route(async () => {
  await requireUser(["ADMIN"]);
  const rows = await db.serviceState.findMany({ orderBy: { key: "asc" } });
  return ok(rows.map(toAdminServiceRow));
});
