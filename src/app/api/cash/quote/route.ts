/**
 * C3 — POST /api/cash/quote { type, amountMinor } → { feeMinor, totalMinor }
 * الإيداع مجاني في Alpha؛ السحب بقاعدة WITHDRAW:YER.
 */
import { ok, route, readJsonBody, reqStr, reqInt, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { computeFee, requireValidAmount } from "@/lib/server/money";
import { db } from "@/lib/db";

export const POST = route(async (req) => {
  await requireUser();
  const body = await readJsonBody(req);
  const type = reqStr(body, "type");
  const amountMinor = requireValidAmount("YER", reqInt(body, "amountMinor"));

  if (type !== "DEPOSIT" && type !== "WITHDRAW") {
    throw new RouteError("SYS-001", 400, { field: "type", reason: "نوع العملية غير صالح" });
  }
  if (type === "DEPOSIT") {
    return ok({ feeMinor: 0, totalMinor: amountMinor });
  }
  const feeRule = await db.feeRule.findUnique({
    where: { opType_currency: { opType: "WITHDRAW", currency: "YER" } },
  });
  const feeMinor = feeRule ? computeFee(feeRule, amountMinor) : 0;
  return ok({ feeMinor, totalMinor: amountMinor + feeMinor });
});
