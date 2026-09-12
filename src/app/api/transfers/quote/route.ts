/**
 * T1 — POST /api/transfers/quote { phone, currency, amountMinor }
 * عرض تحويل: TRF-001 إن لم يكن الرقم مسجلاً، TRF-002 لنفس المستخدم.
 */
import { ok, route, readJsonBody, reqStr, reqInt, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { assertValidPhone, assertValidCurrency, maskPhone } from "@/lib/server/domain";
import { computeFee, requireValidAmount } from "@/lib/server/money";
import { db } from "@/lib/db";

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await readJsonBody(req);
  const phone = assertValidPhone(reqStr(body, "phone"));
  const currency = assertValidCurrency(reqStr(body, "currency"));
  const amountMinor = requireValidAmount(currency, reqInt(body, "amountMinor"));

  const recipient = await db.user.findUnique({ where: { phone } });
  if (!recipient || recipient.status === "CLOSED" || recipient.role === "SYSTEM") {
    throw new RouteError("TRF-001", 404, { phone: maskPhone(phone) });
  }
  if (recipient.id === user.id) {
    throw new RouteError("TRF-002", 400);
  }

  const feeRule = await db.feeRule.findUnique({
    where: { opType_currency: { opType: "TRANSFER", currency } },
  });
  const feeMinor = feeRule ? computeFee(feeRule, amountMinor) : 0;

  return ok({
    recipientName: recipient.fullName ?? "مستخدم محفظة الجنوب",
    maskedPhone: maskPhone(recipient.phone),
    currency,
    amountMinor,
    feeMinor,
    totalMinor: amountMinor + feeMinor,
  });
});
