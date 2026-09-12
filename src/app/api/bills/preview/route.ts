/**
 * BIL — POST /api/bills/preview { billerCode, accountNumber }
 * استعلام فاتورة محاكى: تحقق المزود (BIL-001) وصيغة الرقم ثم إرجاع
 * BillPreviewView بمبلغ مستحق **حتمي** مشتق من hash(المزود:الرقم)
 * (3,000..25,000 ر.ي) + تاريخ استحقاق محاكى — نفس الرقم نفس النتيجة.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import {
  assertValidAccountNumber,
  billerByCode,
  peekPaymentsFeeMinor,
  simulatedDueAmountMinor,
  simulatedDueLabel,
  toBillerView,
} from "@/lib/server/payments-catalog";
import { db } from "@/lib/db";

export const POST = route(async (req) => {
  await requireUser();

  const body = await readJsonBody(req);
  const billerCode = reqStr(body, "billerCode");
  const accountNumber = reqStr(body, "accountNumber");

  const biller = billerByCode(billerCode);
  if (!biller) {
    throw new RouteError("BIL-001", 404, { billerCode });
  }
  const account = assertValidAccountNumber(biller, accountNumber);

  const feeMinor = await peekPaymentsFeeMinor(db, "BILL_PAY");
  const dueAmountMinor = simulatedDueAmountMinor(biller.code, account);
  const dueLabel = simulatedDueLabel(biller.code, account);

  return ok({
    biller: toBillerView(biller, feeMinor),
    accountNumber: account,
    dueAmountMinor,
    dueLabel,
  });
});
