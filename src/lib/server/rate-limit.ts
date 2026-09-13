/**
 * محفظة الجنوب — محدّد المعدل داخل الذاكرة (Alpha — عقدة واحدة)
 * ------------------------------------------------------------
 * نافذة ثابتة لكل (bucket, key) مع تنظيف كسول. يغطي حالات:
 * إرسال OTP، التحقق من الرمز، الدخول التجريبي — قبل الوصول إلى المنطق.
 * حد موثق للإنتاج الجماهيري: النقل إلى Redis/DB عند تعدد العقد
 * (وثّق في docs/PRODUCTION_READINESS.md).
 */
type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** ثواني حتى فتح نافذة جديدة (0 إن مسموح) */
  retryAfterSec: number;
}

/** فحص واستهلاك محاولة واحدة — يعيد القرار */
export function rateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const mapKey = `${bucket}::${key}`;

  // تنظيف كسلي عند امتلاء الخريطة (حماية الذاكرة)
  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [k, w] of buckets) {
      if (w.resetAt <= now) buckets.delete(k);
    }
    // لم يكفِ؟ الأقدم حذفاً (خريطة JS تحفظ ترتيب الإدراج)
    while (buckets.size > MAX_TRACKED_KEYS) {
      const first = buckets.keys().next().value;
      if (first === undefined) break;
      buckets.delete(first);
    }
  }

  const existing = buckets.get(mapKey);
  if (!existing || existing.resetAt <= now) {
    buckets.set(mapKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSec: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

/** عنوان العميل من وراء البروكسي (Caddy يضبط X-Forwarded-For) */
export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** فحص حالة النافذة دون استهلاك محاولة (لأقفال الفشل التراكمي) */
export function peekLimit(
  bucket: string,
  key: string,
  limit: number
): { blocked: boolean; count: number; retryAfterSec: number } {
  const now = Date.now();
  const mapKey = `${bucket}::${key}`;
  const existing = buckets.get(mapKey);
  if (!existing || existing.resetAt <= now) {
    return { blocked: false, count: 0, retryAfterSec: 0 };
  }
  const blocked = existing.count >= limit;
  return {
    blocked,
    count: existing.count,
    retryAfterSec: blocked ? Math.ceil((existing.resetAt - now) / 1000) : 0,
  };
}

/** تفريغ نافذة حد معيّنة (عند النجاح — إلغاء عدّاد الفشل) */
export function resetLimit(bucket: string, key: string): void {
  buckets.delete(`${bucket}::${key}`);
}
