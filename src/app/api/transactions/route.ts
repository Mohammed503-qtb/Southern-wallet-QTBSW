/**
 * T3 — GET /api/transactions ?cursor&limit&types&status&currency
 * PageView<TxView> بترتيب تنازلي وحد 20 — مع إنهاء كسول للحالات.
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { runLazyExpiry } from "@/lib/server/cashflow";
import { clampLimit, cursorFilter, encodeCursor } from "@/lib/server/pagination";
import { toTxView } from "@/lib/server/views";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const VALID_STATUSES = ["PENDING", "COMPLETED", "FAILED", "CANCELLED", "EXPIRED"];
const VALID_TYPES = [
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
  // إضافة 9-b: أنواع خدمات الدفع (المرحلة 2) — لدعم فلتر types=BILL_PAY/…
  "BILL_PAY",
  "TOPUP",
  "CARD_PURCHASE",
];

export const GET = route(async (req) => {
  const user = await requireUser();
  await runLazyExpiry(user.id);

  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get("limit"), 20, 20);
  const cursor = url.searchParams.get("cursor");

  const where: Prisma.TransactionWhereInput = {
    userId: user.id,
    ...cursorFilter(cursor),
  };
  const types = (url.searchParams.get("types") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => (VALID_TYPES as string[]).includes(t));
  if (types.length > 0) where.type = { in: types };
  const status = url.searchParams.get("status") ?? "";
  if ((VALID_STATUSES as string[]).includes(status)) where.status = status;
  const currency = url.searchParams.get("currency") ?? "";
  if (["YER", "SAR", "USD"].includes(currency)) where.currency = currency;

  const rows = await db.transaction.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(toTxView);
  return ok({
    items,
    nextCursor: hasMore ? encodeCursor(rows[limit - 1]) : null,
  });
});
