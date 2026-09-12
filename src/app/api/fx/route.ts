/**
 * W2 — GET /api/fx  → FxRateView[] (السعر الحقيقي = المخزن ÷ 1e6)
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { toFxRateView } from "@/lib/server/views";
import { db } from "@/lib/db";

export const GET = route(async () => {
  await requireUser();
  const rates = await db.fxRate.findMany();
  return ok(rates.map(toFxRateView));
});
