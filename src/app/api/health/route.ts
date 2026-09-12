/**
 * H1 — GET /api/health (عام — بلا جلسة)
 * نقطة فحص الجاهزية للمراقبة الخارجية وDocker HEALTHCHECK وبوابة Caddy:
 *   200 { ok:true, data:{ status, db, version, uptimeSec } }
 *   503 { ok:false, error:{ code:"SYS-003" } } عند فشل قاعدة البيانات
 * خفيفة عمداً: لا تسجّل، لا تلمس الجلسات، وتجاوز الغلاف الموحد عند الفشل
 * لتعيد 503 صريحة (المراقبة يهمها رمز الحالة قبل الجسم).
 */
import { db } from "@/lib/db";

const APP_VERSION = "beta-1.0.0";
const startedAt = Date.now();

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = {
    status: "healthy",
    db: "up",
    version: APP_VERSION,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    checkedAt: new Date().toISOString(),
  };

  try {
    await db.$queryRaw`SELECT 1`;
    return new Response(JSON.stringify({ ok: true, data: payload }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "SYS-003", message: "قاعدة البيانات غير متاحة" },
        data: { status: "unhealthy", db: "down", version: APP_VERSION, checkedAt: new Date().toISOString() },
      }),
      { status: 503, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }
}
