/**
 * /api — جذر طبقة الخلفية (بطاقة تعريف سريعة)
 * محفظة الجنوب — Internal Alpha (8-a)
 */
import { ok, route } from "@/lib/server/envelope";

export const GET = route(async () => {
  return ok({
    name: "south-wallet-api",
    stage: "Internal Alpha",
    contract: "docs/MVP_CONTRACT.md",
    health: "/api/health",
  });
});
