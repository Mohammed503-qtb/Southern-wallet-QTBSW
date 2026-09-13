/**
 * /api — جذر طبقة الخلفية (بطاقة تعريف سريعة)
 * محفظة الجنوب — جذر API (v1.0.0)
 */
import { ok, route } from "@/lib/server/envelope";

export const GET = route(async () => {
  return ok({
    name: "south-wallet-api",
    stage: "production", version: "1.0.0",
    contract: "docs/MVP_CONTRACT.md",
    health: "/api/health",
  });
});
