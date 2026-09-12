/**
 * X4 — GET /api/health → { db, time } في غلاف موحد — فحص SELECT 1.
 */
import { ok, route } from "@/lib/server/envelope";
import { db } from "@/lib/db";

export const GET = route(async () => {
  try {
    await db.$queryRaw`SELECT 1`;
    return ok({ db: true, time: new Date().toISOString() });
  } catch {
    return ok({ db: false, time: new Date().toISOString() }, 503);
  }
});
