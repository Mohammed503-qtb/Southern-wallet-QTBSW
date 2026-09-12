/**
 * M2 — GET /api/admin/users ?q&role&status&cursor → PageView<AdminUserRow>
 * ADMIN/COMPLIANCE (قراءة).
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { clampLimit, cursorFilter, encodeCursor } from "@/lib/server/pagination";
import { toAdminUserRow } from "@/lib/server/views";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const ROLES = ["CUSTOMER", "AGENT", "ADMIN", "COMPLIANCE", "SUPPORT"];
const STATUSES = ["PENDING", "ACTIVE", "FROZEN", "CLOSED"];

export const GET = route(async (req) => {
  await requireUser(["ADMIN", "COMPLIANCE"]);
  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get("limit"), 20, 50);
  const q = (url.searchParams.get("q") ?? "").trim();

  // المؤشر يُدمج بـ AND حتى لا يتعارض مع فلاتر OR للبحث
  const cf = cursorFilter(url.searchParams.get("cursor"));
  const where: Prisma.UserWhereInput = Object.keys(cf).length > 0 ? { AND: [cf] } : {};
  if (q.length > 0) {
    where.OR = [{ phone: { contains: q } }, { fullName: { contains: q } }];
  }
  const role = url.searchParams.get("role") ?? "";
  if ((ROLES as string[]).includes(role)) where.role = role;
  const status = url.searchParams.get("status") ?? "";
  if ((STATUSES as string[]).includes(status)) where.status = status;

  const rows = await db.user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const wallets = await db.wallet.findMany({
    where: { userId: { in: page.map((u) => u.id) }, kind: "MAIN", currency: "YER" },
    select: { userId: true, balanceMinor: true },
  });
  const yerByUser = new Map<string, number>();
  for (const w of wallets) {
    yerByUser.set(w.userId, (yerByUser.get(w.userId) ?? 0) + w.balanceMinor);
  }

  return ok({
    items: page.map((u) => toAdminUserRow(u, yerByUser.get(u.id) ?? 0)),
    nextCursor: hasMore ? encodeCursor(rows[limit - 1]) : null,
  });
});
