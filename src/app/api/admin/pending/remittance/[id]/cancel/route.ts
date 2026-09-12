/**
 * M15 — POST /api/admin/pending/remittance/:id/cancel { reason }
 * إلغاء إداري لحوالة معلقة مع استرجاع — ADMIN + Audit.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { runLazyExpiry, settleRemittance } from "@/lib/server/cashflow";
import { writeAudit } from "@/lib/server/audit";
import { formatMinor } from "@/lib/server/money";
import { toRemittanceView } from "@/lib/server/views";
import { db } from "@/lib/db";
import type { CurrencyCode } from "@/lib/api-types";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, ctx) => {
  const admin = await requireUser(["ADMIN"]);
  const { id } = await ctx.params;
  const body = await readJsonBody(req);
  const reason = reqStr(body, "reason");
  await runLazyExpiry();

  const rem = await db.remittance.findUnique({ where: { id } });
  if (!rem) {
    throw new RouteError("SYS-001", 404, { reason: "حوالة غير موجودة" });
  }
  if (rem.status !== "PENDING") {
    throw new RouteError("REM-001", 409, { status: rem.status });
  }

  await db.$transaction(async (tx) => {
    const fresh = await tx.remittance.findUnique({ where: { id } });
    if (!fresh || fresh.status !== "PENDING") {
      throw new RouteError("REM-001", 409);
    }
    await settleRemittance(tx, fresh, "CANCELLED", {
      title: "إلغاء إداري للحوالة",
      body: `أُلغيت الحوالة ${fresh.ref} إدارياً واستُرجع ${formatMinor(
        fresh.amountMinor,
        fresh.currency as CurrencyCode
      )} إلى محفظة المرسل: ${reason}`,
    });
    await writeAudit(
      tx,
      { id: admin.id, role: admin.role },
      "ADMIN_CANCEL_REMITTANCE",
      "REMITTANCE",
      id,
      reason,
      { ref: fresh.ref, amountMinor: fresh.amountMinor }
    );
  });

  const updated = await db.remittance.findUnique({ where: { id } });
  return ok(toRemittanceView(updated!));
});
