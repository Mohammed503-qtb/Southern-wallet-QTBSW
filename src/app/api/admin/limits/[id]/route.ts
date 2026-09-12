/**
 * M9 — PUT /api/admin/limits/:id { dailyTxnCount, dailyAmountMinor, perTxnAmountMinor }
 * تحرير الحدود اليومية + Audit بالقيم القديمة/الجديدة — ADMIN.
 */
import { ok, route, readJsonBody, reqInt, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { toAdminLimitRow } from "@/lib/server/views";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route<Ctx>(async (req, ctx) => {
  const admin = await requireUser(["ADMIN"]);
  const { id } = await ctx.params;
  const body = await readJsonBody(req);
  const dailyTxnCount = reqInt(body, "dailyTxnCount");
  const dailyAmountMinor = reqInt(body, "dailyAmountMinor");
  const perTxnAmountMinor = reqInt(body, "perTxnAmountMinor");

  if (dailyTxnCount < 0 || dailyAmountMinor < 0 || perTxnAmountMinor < 0) {
    throw new RouteError("SYS-001", 400, { reason: "القيم يجب أن تكون غير سالبة" });
  }
  const existing = await db.limitRule.findUnique({ where: { id } });
  if (!existing) {
    throw new RouteError("SYS-001", 404, { reason: "قاعدة حدود غير موجودة" });
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.limitRule.update({
      where: { id },
      data: { dailyTxnCount, dailyAmountMinor, perTxnAmountMinor },
    });
    await writeAudit(
      tx,
      { id: admin.id, role: admin.role },
      "LIMIT_UPDATE",
      "LIMIT_RULE",
      id,
      null,
      {
        kycLevel: existing.kycLevel,
        currency: existing.currency,
        old: {
          dailyTxnCount: existing.dailyTxnCount,
          dailyAmountMinor: existing.dailyAmountMinor,
          perTxnAmountMinor: existing.perTxnAmountMinor,
        },
        new: { dailyTxnCount, dailyAmountMinor, perTxnAmountMinor },
      }
    );
    return row;
  });

  return ok(toAdminLimitRow(updated));
});
