/**
 * T5 — GET /api/statement ?from&to&currency
 * كشف الحساب: summary {count,totalInMinor,totalOutMinor,feesMinor} + items
 */
import { ok, route, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { runLazyExpiry } from "@/lib/server/cashflow";
import { toTxView } from "@/lib/server/views";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const MAX_ITEMS = 200;

export const GET = route(async (req) => {
  const user = await requireUser();
  await runLazyExpiry(user.id);

  const url = new URL(req.url);
  let from: Date;
  let to: Date;
  try {
    from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : new Date(Date.now() - 30 * 86_400_000);
    to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : new Date();
  } catch {
    throw new RouteError("SYS-001", 400, { reason: "نطاق تاريخ غير صالح" });
  }
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new RouteError("SYS-001", 400, { reason: "نطاق تاريخ غير صالح" });
  }

  const where: Prisma.TransactionWhereInput = {
    userId: user.id,
    createdAt: { gte: from, lte: to },
  };
  const currency = url.searchParams.get("currency") ?? "";
  if (["YER", "SAR", "USD"].includes(currency)) where.currency = currency;

  const rows = await db.transaction.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_ITEMS,
  });
  const agg = await db.transaction.aggregate({
    where,
    _count: true,
    _sum: { amountMinor: true, feeMinor: true },
  });
  const inAgg = await db.transaction.aggregate({
    where: { ...where, direction: "CREDIT" },
    _sum: { amountMinor: true },
  });
  const outAgg = await db.transaction.aggregate({
    where: { ...where, direction: "DEBIT" },
    _sum: { amountMinor: true },
  });

  return ok({
    summary: {
      count: typeof agg._count === "number" ? agg._count : 0,
      totalInMinor: inAgg._sum.amountMinor ?? 0,
      totalOutMinor: outAgg._sum.amountMinor ?? 0,
      feesMinor: agg._sum.feeMinor ?? 0,
    },
    items: rows.map(toTxView),
  });
});
