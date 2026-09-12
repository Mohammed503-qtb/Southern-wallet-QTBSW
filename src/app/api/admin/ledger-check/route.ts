/**
 * M16 — GET /api/admin/ledger-check → LedgerCheckView — ADMIN
 * فحص توازن الدفاتر: لكل (transactionRef, currency) Σ القيود الموقعة = 0
 * (تشمل بيانات الـ Seed — DEBIT سالب/CREDIT موجب بالاصطلاح العادي).
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { ledgerCheck } from "@/lib/server/ledger";
import { db } from "@/lib/db";

export const GET = route(async () => {
  await requireUser(["ADMIN"]);
  const result = await ledgerCheck(db);
  return ok(result);
});
