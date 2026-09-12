/**
 * R4 — POST /api/remittances/:id/cancel { pin }
 * إلغاء واسترجاع (REM-001 إن لم تكن معلقة) — PIN قبل التنفيذ.
 * الاسترجاع: [SUSPENSE DEBIT a] + [MAIN CREDIT a] عبر محرك الدفتر.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { verifyPin } from "@/lib/server/pin";
import { runLazyExpiry, settleRemittance } from "@/lib/server/cashflow";
import { formatMinor } from "@/lib/server/money";
import { toRemittanceView } from "@/lib/server/views";
import type { CurrencyCode } from "@/lib/api-types";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await readJsonBody(req);
  const pin = reqStr(body, "pin");

  // إنهاء كسول أولاً (حتى تنعكس حالتها الصحيحة قبل القرار)
  await runLazyExpiry(user.id);

  const rem = await db.remittance.findFirst({ where: { id, senderId: user.id } });
  if (!rem) {
    throw new RouteError("REM-001", 404);
  }
  if (rem.status !== "PENDING") {
    throw new RouteError("REM-001", 409, { status: rem.status });
  }
  await verifyPin(db, user, pin);

  await db.$transaction(async (tx) => {
    const fresh = await tx.remittance.findUnique({ where: { id: rem.id } });
    if (!fresh || fresh.status !== "PENDING") {
      throw new RouteError("REM-001", 409);
    }
    await settleRemittance(tx, fresh, "CANCELLED", {
      title: "تم إلغاء الحوالة",
      body: `أُلغيت الحوالة ${fresh.ref} واستُرجع ${formatMinor(
        fresh.amountMinor,
        fresh.currency as CurrencyCode
      )} إلى محفظتك الرئيسية.`,
    });
  });

  const updated = await db.remittance.findUnique({ where: { id: rem.id } });
  return ok(toRemittanceView(updated!));
});
