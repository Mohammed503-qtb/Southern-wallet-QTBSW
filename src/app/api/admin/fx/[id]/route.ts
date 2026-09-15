/**
 * M11 — PUT /api/admin/fx/:id { rate } — ADMIN + Audit
 * rate: السعر الحقيقي (يخزَّن ×1e6 مقيساً).
 */
import { ok, route, readJsonBody, optStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { toAdminFxRow } from "@/lib/server/views";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route<Ctx>(async (req, ctx) => {
  const admin = await requireUser(["ADMIN"]);
  const { id } = await ctx.params;
  const body = await readJsonBody(req);
  // السعر الحقيقي قد يكون كسرياً — نقبل رقماً موجباً
  const rawRate = body["rate"];
  if (typeof rawRate !== "number" || !Number.isFinite(rawRate) || rawRate <= 0) {
    throw new RouteError("SYS-001", 400, { field: "rate", reason: "سعر غير صالح" });
  }
  const storedRate = Math.round(rawRate * 1_000_000);
  if (storedRate <= 0 || !Number.isSafeInteger(storedRate)) {
    throw new RouteError("SYS-001", 400, { field: "rate", reason: "سعر خارج النطاق" });
  }
  // المهمة 14: حفظ سبب التعديل الإداري في سجل التدقيق (كان يُرسل ويُهمَل)
  const reason = optStr(body, "reason");

  const existing = await db.fxRate.findUnique({ where: { id } });
  if (!existing) {
    throw new RouteError("SYS-001", 404, { reason: "سعر صرف غير موجود" });
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.fxRate.update({ where: { id }, data: { rate: storedRate } });
    await writeAudit(
      tx,
      { id: admin.id, role: admin.role },
      "FX_UPDATE",
      "FX_RATE",
      id,
      reason,
      {
        pair: `${existing.fromCurrency}/${existing.toCurrency}`,
        oldRate: existing.rate / 1_000_000,
        newRate: rawRate,
      }
    );
    return row;
  });

  return ok(toAdminFxRow(updated));
});
