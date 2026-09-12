/**
 * A8 — POST /api/pin/verify { pin }
 * تحقق قبل عملية حساسة — يصفّر عداد المحاولات عند النجاح (PIN-001/002).
 */
import { ok, route, readJsonBody, reqStr } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { verifyPin } from "@/lib/server/pin";
import { db } from "@/lib/db";

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await readJsonBody(req);
  const pin = reqStr(body, "pin");
  await verifyPin(db, user, pin);
  return ok({ verified: true });
});
