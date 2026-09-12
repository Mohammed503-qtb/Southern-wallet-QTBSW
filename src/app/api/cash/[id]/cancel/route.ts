/**
 * C6 — POST /api/cash/:id/cancel
 * إلغاء طلب معلق: WITHDRAW → استرجاع من SUSPENSE (CASH_REFUND)؛
 * DEPOSIT → إلغاء الطلب فقط (لم تتحرك أموال).
 */
import { ok, route, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { runLazyExpiry, settleCashOp } from "@/lib/server/cashflow";
import { formatMinor } from "@/lib/server/money";
import { toCashOpView } from "@/lib/server/views";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await runLazyExpiry(user.id);

  const op = await db.cashOperation.findFirst({ where: { id, userId: user.id } });
  if (!op) {
    throw new RouteError("SYS-001", 404, { reason: "عملية غير موجودة" });
  }
  if (op.status !== "PENDING") {
    throw new RouteError("CWD-002", 409, { status: op.status });
  }

  await db.$transaction(async (tx) => {
    const fresh = await tx.cashOperation.findUnique({ where: { id: op.id } });
    if (!fresh || fresh.status !== "PENDING") {
      throw new RouteError("CWD-002", 409);
    }
    if (fresh.type === "DEPOSIT") {
      await settleCashOp(tx, fresh, "CANCELLED", {
        title: "تم إلغاء طلب الإيداع",
        body: `أُلغي طلب الإيداع ${fresh.ref} لدى الوكيل.`,
      });
    } else {
      await settleCashOp(tx, fresh, "CANCELLED", {
        title: "تم إلغاء طلب السحب",
        body: `أُلغي طلب السحب ${fresh.ref} واستُرجع ${formatMinor(fresh.amountMinor, "YER")} إلى محفظتك.`,
      });
    }
  });

  const updated = await db.cashOperation.findUnique({ where: { id: op.id } });
  const profile = await db.agentProfile.findUnique({ where: { userId: updated!.agentId } });
  const owner = await db.user.findUnique({ where: { id: updated!.agentId }, select: { fullName: true } });
  return ok(toCashOpView(updated!, profile, owner?.fullName ?? null));
});
