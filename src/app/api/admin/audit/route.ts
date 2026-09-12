/**
 * M13 — GET /api/admin/audit ?cursor → PageView<AdminAuditRow> — ADMIN/COMPLIANCE
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { clampLimit, cursorFilter, encodeCursor } from "@/lib/server/pagination";
import { toAdminAuditRow } from "@/lib/server/views";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const GET = route(async (req) => {
  await requireUser(["ADMIN", "COMPLIANCE"]);
  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get("limit"), 20, 50);

  const cf = cursorFilter(url.searchParams.get("cursor"));
  const where: Prisma.AuditLogWhereInput = Object.keys(cf).length > 0 ? { AND: [cf] } : {};

  const rows = await db.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: { actor: { select: { id: true, fullName: true } } },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return ok({
    items: page.map((a) => toAdminAuditRow(a, a.actor?.fullName ?? null)),
    nextCursor: hasMore ? encodeCursor(rows[limit - 1]) : null,
  });
});
