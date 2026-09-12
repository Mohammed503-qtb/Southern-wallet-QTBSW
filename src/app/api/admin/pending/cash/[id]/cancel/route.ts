/**
 * M15 — POST /api/admin/pending/cash/:id/cancel { reason }
 * إلغاء إداري لعملية نقدية معلقة مع استرجاع — ADMIN + Audit.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { runLazyExpiry, settleCashOp } from "@/lib/server/cashflow";
import { writeAudit } from "@/lib/server/audit";
import { formatMinor } from "@/lib/server/money";
import { toCashOpView } from "@/lib/server/views";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, ctx) => {
  const admin = await requireUser(["ADMIN"]);
  const { id } = await ctx.params;
  const body = await readJsonBody(req);
  const reason = reqStr(body, "reason");
  await runLazyExpiry();

  const op = await db.cashOperation.findUnique({ where: { id } });
  if (!op) {
    throw new RouteError("SYS-001", 404, { reason: "عملية غير موجودة" });
  }
  if (op.status !== "PENDING") {
    throw new RouteError("CWD-002", 409, { status: op.status });
  }

  await db.$transaction(async (tx) => {
    const fresh = await tx.cashOperation.findUnique({ where: { id } });
    if (!fresh || fresh.status !== "PENDING") {
      throw new RouteError("CWD-002", 409);
    }
    if (fresh.type === "DEPOSIT") {
      await settleCashOp(tx, fresh, "CANCELLED", {
        title: "إلغاء إداري لطلب الإيداع",
        body: `أُلغي طلب الإيداع ${fresh.ref} إدارياً: ${reason}`,
      });
    } else {
      await settleCashOp(tx, fresh, "CANCELLED", {
        title: "إلغاء إداري لطلب السحب",
        body: `أُلغي طلب السحب ${fresh.ref} إدارياً واستُرجع ${formatMinor(fresh.amountMinor, "YER")}: ${reason}`,
      });
    }
    await writeAudit(
      tx,
      { id: admin.id, role: admin.role },
      "ADMIN_CANCEL_CASH",
      "CASH_OPERATION",
      id,
      reason,
      { ref: fresh.ref, type: fresh.type, amountMinor: fresh.amountMinor }
    );
  });

  const updated = await db.cashOperation.findUnique({ where: { id } });
  const profile = await db.agentProfile.findUnique({ where: { userId: updated!.agentId } });
  const owner = await db.user.findUnique({ where: { id: updated!.agentId }, select: { fullName: true } });
  return ok(toCashOpView(updated!, profile, owner?.fullName ?? null));
});
