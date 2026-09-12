/**
 * M10 — PUT /api/admin/fees/:id { pctBps, fixedMinor, minFeeMinor, maxFeeMinor? }
 * تحرير الرسوم + Audit بالقيم القديمة/الجديدة — ADMIN.
 */
import { ok, route, readJsonBody, reqInt, optInt, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { toAdminFeeRow } from "@/lib/server/views";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route<Ctx>(async (req, ctx) => {
  const admin = await requireUser(["ADMIN"]);
  const { id } = await ctx.params;
  const body = await readJsonBody(req);
  const pctBps = reqInt(body, "pctBps");
  const fixedMinor = reqInt(body, "fixedMinor");
  const minFeeMinor = reqInt(body, "minFeeMinor");
  const maxFeeMinor = optInt(body, "maxFeeMinor");

  if (pctBps < 0 || pctBps > 10_000 || fixedMinor < 0 || minFeeMinor < 0) {
    throw new RouteError("SYS-001", 400, { reason: "قيم رسوم غير صالحة" });
  }
  if (maxFeeMinor !== null && maxFeeMinor < minFeeMinor) {
    throw new RouteError("SYS-001", 400, { reason: "الحد الأقصى للرسم أقل من الحد الأدنى" });
  }
  const existing = await db.feeRule.findUnique({ where: { id } });
  if (!existing) {
    throw new RouteError("SYS-001", 404, { reason: "قاعدة رسوم غير موجودة" });
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.feeRule.update({
      where: { id },
      data: { pctBps, fixedMinor, minFeeMinor, maxFeeMinor },
    });
    await writeAudit(
      tx,
      { id: admin.id, role: admin.role },
      "FEE_UPDATE",
      "FEE_RULE",
      id,
      null,
      {
        opType: existing.opType,
        currency: existing.currency,
        old: {
          pctBps: existing.pctBps,
          fixedMinor: existing.fixedMinor,
          minFeeMinor: existing.minFeeMinor,
          maxFeeMinor: existing.maxFeeMinor,
        },
        new: { pctBps, fixedMinor, minFeeMinor, maxFeeMinor },
      }
    );
    return row;
  });

  return ok(toAdminFeeRow(updated));
});
