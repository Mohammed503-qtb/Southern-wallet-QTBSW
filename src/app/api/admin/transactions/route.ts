/**
 * M8 — GET /api/admin/transactions ?q&status&type&cursor → PageView<AdminTxRow>
 * موسعة بuserId/phone/اسم المستخدم — ADMIN/COMPLIANCE.
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { runLazyExpiry } from "@/lib/server/cashflow";
import { clampLimit, cursorFilter, encodeCursor } from "@/lib/server/pagination";
import { toAdminTxRow } from "@/lib/server/views";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const TX_TYPES = [
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "REMITTANCE",
  "REMITTANCE_REFUND",
  "CASH_IN",
  "CASH_OUT",
  "CASH_REFUND",
  "SAVING_IN",
  "SAVING_OUT",
  "FX_EXCHANGE",
  "SYSTEM_ADJUST",
];
const TX_STATUSES = ["PENDING", "COMPLETED", "FAILED", "CANCELLED", "EXPIRED"];

export const GET = route(async (req) => {
  await requireUser(["ADMIN", "COMPLIANCE"]);
  await runLazyExpiry();

  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get("limit"), 20, 50);
  const q = (url.searchParams.get("q") ?? "").trim();

  // المؤشر يُدمج بـ AND حتى لا يتعارض مع فلاتر OR للبحث
  const cf = cursorFilter(url.searchParams.get("cursor"));
  const where: Prisma.TransactionWhereInput = Object.keys(cf).length > 0 ? { AND: [cf] } : {};
  if (q.length > 0) {
    where.OR = [
      { ref: { contains: q } },
      { counterpartyPhone: { contains: q } },
      { counterpartyName: { contains: q } },
      { user: { phone: { contains: q } } },
    ];
  }
  const status = url.searchParams.get("status") ?? "";
  if ((TX_STATUSES as string[]).includes(status)) where.status = status;
  const type = url.searchParams.get("type") ?? "";
  if ((TX_TYPES as string[]).includes(type)) where.type = type;

  const rows = await db.transaction.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: { user: { select: { id: true, phone: true, fullName: true } } },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return ok({
    items: page.map((t) => toAdminTxRow(t, t.user)),
    nextCursor: hasMore ? encodeCursor(rows[limit - 1]) : null,
  });
});
