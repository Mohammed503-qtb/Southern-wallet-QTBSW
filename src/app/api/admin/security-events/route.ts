/**
 * M9 — GET /api/admin/security-events ?cursor&kind → PageView — ADMIN/COMPLIANCE
 * سجل الأحداث الأمنية (محاولات دخول فاشلة/قفل/إعادة تعيين/استرداد)
 * أحدثها أولاً مع ترقيم cursor وفلتر اختياري بالنوع.
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { clampLimit, cursorFilter, encodeCursor } from "@/lib/server/pagination";
import { SECURITY_EVENT_LABELS } from "@/lib/server/security-events";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const VALID_KINDS = new Set(Object.keys(SECURITY_EVENT_LABELS));

export const GET = route(async (req) => {
  await requireUser(["ADMIN", "COMPLIANCE"]);
  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get("limit"), 20, 100);

  const cf = cursorFilter(url.searchParams.get("cursor"));
  const kind = url.searchParams.get("kind");
  const and: Prisma.SecurityEventWhereInput[] = [];
  if (Object.keys(cf).length > 0) and.push(cf);
  if (kind && VALID_KINDS.has(kind)) and.push({ kind });
  const where: Prisma.SecurityEventWhereInput = and.length > 0 ? { AND: and } : {};

  const rows = await db.securityEvent.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return ok({
    items: page.map((e) => ({
      id: e.id,
      kind: e.kind,
      kindLabel: SECURITY_EVENT_LABELS[e.kind] ?? e.kind,
      phone: e.phone,
      userId: e.userId,
      ip: e.ip,
      meta: (() => {
        try {
          return e.metaJson ? (JSON.parse(e.metaJson) as Record<string, unknown>) : null;
        } catch {
          return null;
        }
      })(),
      createdAt: e.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? encodeCursor(rows[limit - 1]) : null,
  });
});
