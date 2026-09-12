/**
 * T4 — GET /api/transactions/:ref
 * TxView + قيود الدفتر المصغرة (ledger) — للعملية نفسها أو المرتبطة بها
 * (عمليات TRANSFER_IN تُظهر قيود العملية الأصلية عبر relatedRef).
 */
import { ok, route, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { runLazyExpiry } from "@/lib/server/cashflow";
import { toTxView, toLedgerLineView } from "@/lib/server/views";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ ref: string }> };

export const GET = route<Ctx>(async (_req, ctx) => {
  const user = await requireUser();
  await runLazyExpiry(user.id);
  const { ref } = await ctx.params;

  const tx = await db.transaction.findFirst({ where: { ref, userId: user.id } });
  if (!tx) {
    throw new RouteError("SYS-001", 404, { reason: "عملية غير موجودة" });
  }

  let entries = await db.ledgerEntry.findMany({
    where: { transactionRef: tx.ref },
    orderBy: { createdAt: "asc" },
    take: 4,
  });
  // عملية الطرف المستلم (TRANSFER_IN) لا قيود خاصة بها → أظهر قيود الأصل
  if (entries.length === 0 && tx.relatedRef) {
    entries = await db.ledgerEntry.findMany({
      where: { transactionRef: tx.relatedRef },
      orderBy: { createdAt: "asc" },
      take: 4,
    });
  }
  return ok({ ...toTxView(tx), ledger: entries.map(toLedgerLineView) });
});
