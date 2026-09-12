/**
 * W3 — POST /api/wallet/exchange-quote { fromCurrency, toCurrency, amountMinor }
 * عرض سعر التحويل بين المحافظ (ExchangeQuoteView) — بلا أي حركة مالية.
 */
import { ok, route, readJsonBody, reqStr, reqInt, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { assertNotFrozen, assertValidCurrency } from "@/lib/server/domain";
import { computeFee, convertMinor, findFxRate, requireValidAmount } from "@/lib/server/money";
import { db } from "@/lib/db";

export const POST = route(async (req) => {
  const user = await requireUser();
  assertNotFrozen(user);
  const body = await readJsonBody(req);
  const fromCurrency = assertValidCurrency(reqStr(body, "fromCurrency"));
  const toCurrency = assertValidCurrency(reqStr(body, "toCurrency"));
  const amountMinor = requireValidAmount(fromCurrency, reqInt(body, "amountMinor"));
  if (fromCurrency === toCurrency) {
    throw new RouteError("SYS-001", 400, { reason: "لا يمكن التحويل بين نفس العملة" });
  }

  const rate = await findFxRate(db, fromCurrency, toCurrency);
  if (rate === null) {
    throw new RouteError("SRV-001", 503, { reason: "لا يوجد سعر صرف لهذا الزوج" });
  }
  const feeRule = await db.feeRule.findUnique({
    where: { opType_currency: { opType: "FX", currency: fromCurrency } },
  });
  if (!feeRule) {
    throw new RouteError("SRV-001", 503, { reason: "لا توجد قاعدة رسوم FX" });
  }
  const feeMinor = computeFee(feeRule, amountMinor);
  const receiveMinor = convertMinor(amountMinor, rate, fromCurrency, toCurrency);
  if (receiveMinor <= 0) {
    throw new RouteError("SYS-001", 400, { reason: "المبلغ صغير جداً لهذا الزوج" });
  }

  return ok({
    fromCurrency,
    toCurrency,
    amountMinor,
    rate,
    feeMinor,
    receiveMinor,
    totalDebitMinor: amountMinor + feeMinor,
  });
});
