/**
 * R1 — POST /api/remittances/quote { currency, amountMinor }
 * { feeMinor, totalMinor } — الحوالات في Alpha بعملة YER فقط
 * (الدفع النقدي لدى الوكيل وعومه بالريال اليمني).
 */
import { ok, route, readJsonBody, reqStr, reqInt, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { assertValidCurrency } from "@/lib/server/domain";
import { computeFee, requireValidAmount } from "@/lib/server/money";
import { db } from "@/lib/db";

export const POST = route(async (req) => {
  await requireUser();
  const body = await readJsonBody(req);
  const currency = assertValidCurrency(reqStr(body, "currency"));
  const amountMinor = requireValidAmount(currency, reqInt(body, "amountMinor"));

  if (currency !== "YER") {
    throw new RouteError("SYS-001", 400, {
      field: "currency",
      reason: "الحوالات حالياً بالريال اليمني فقط",
    });
  }
  const feeRule = await db.feeRule.findUnique({
    where: { opType_currency: { opType: "REMITTANCE", currency } },
  });
  const feeMinor = feeRule ? computeFee(feeRule, amountMinor) : 0;
  return ok({ feeMinor, totalMinor: amountMinor + feeMinor });
});
