/**
 * محفظة الجنوب — الغلاف الموحد لاستجابات API وأخطاء المسارات
 * (docs/MVP_CONTRACT.md §2.1/§2.2): {ok:true,data} / {ok:false,error:{code,message,details}}
 * بلا أي استيراد من next — قابل للاستعمال من المسارات ومن seed على السواء.
 */
import { ERROR_MESSAGES } from "../api-types";
import { Prisma } from "@prisma/client";

/** خطأ مسار قابل للرمي من أي عمق — يُترجم إلى غلاف موحد */
export class RouteError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, string | number>;

  constructor(code: string, status: number, details?: Record<string, string | number>) {
    super(ERROR_MESSAGES[code] ?? "خطأ غير متوقع");
    this.name = "RouteError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function jsonBody(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** استجابة نجاح موحدة */
export function ok<T>(data: T, status = 200): Response {
  return jsonBody({ ok: true, data }, status);
}

/** استجابة فشل موحدة — الرسالة من ERROR_MESSAGES */
export function fail(
  code: string,
  status: number,
  details?: Record<string, string | number>
): Response {
  const error: { code: string; message: string; details?: Record<string, string | number> } = {
    code,
    message: ERROR_MESSAGES[code] ?? "خطأ غير متوقع",
  };
  if (details) error.details = details;
  return jsonBody({ ok: false, error }, status);
}

/**
 * خطأ P2002 (تعارض قيد فريد) على فهرس Idempotency: طلبان متزامنان بنفس
 * المفتاح — الأول فاز والثاني اصطدم. نحوّله إلى TXN-004 (409) يطلب إعادة
 * المحاولة بدل SYS-001 (500): إعادة المحاولة تمر بالفحص المسبق فتعيد
 * نتيجة العملية الأصلية (replayed) بدل إنشاء معاملة ثانية (المهمة 14).
 */
function isIdempotencyUniqueConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return false;
  }
  const target = err.meta?.target;
  if (Array.isArray(target)) {
    return target.some(
      (t) => typeof t === "string" && t.toLowerCase().includes("idempotency")
    );
  }
  return typeof target === "string" && target.toLowerCase().includes("idempotency");
}

/** ترجمة أي خطأ مرمي إلى استجابة — لا يكشف stack trace أبداً */
export function errorResponse(err: unknown): Response {
  if (err instanceof RouteError) {
    return fail(err.code, err.status, err.details);
  }
  if (isIdempotencyUniqueConflict(err)) {
    return fail("TXN-004", 409, { retryAfterSec: 1, hint: "أعد إرسال الطلب نفسه للحصول على نتيجة العملية الأصلية" });
  }
  console.error("[api] خطأ غير متوقع:", err);
  return fail("SYS-001", 500);
}

/** غلاف لمُعالجات المسارات يلتقط الأخطاء ويحوّلها للغلاف الموحد */
export function route<C = unknown>(
  fn: (req: Request, ctx: C) => Promise<Response>
): (req: Request, ctx: C) => Promise<Response> {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

// ============ قراءة جسم الطلبات والتحقق من الحقول ============

/** قراءة جسم JSON مع فحص Content-Type (كل POST يجب أن يكون JSON) */
export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    throw new RouteError("SYS-001", 400, { reason: "Content-Type يجب أن يكون application/json" });
  }
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    throw new RouteError("SYS-001", 400, { reason: "جسم الطلب غير صالح" });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RouteError("SYS-001", 400, { reason: "جسم الطلب غير صالح" });
  }
  return parsed as Record<string, unknown>;
}

function fieldError(field: string): RouteError {
  return new RouteError("SYS-001", 400, { field, reason: "الحقل مفقود أو غير صالح" });
}

/** نص إلزامي غير فارغ */
export function reqStr(body: Record<string, unknown>, field: string): string {
  const v = body[field];
  if (typeof v !== "string" || v.trim().length === 0) throw fieldError(field);
  return v.trim();
}

/** عدد صحيح إلزامي */
export function reqInt(body: Record<string, unknown>, field: string): number {
  const v = body[field];
  if (typeof v !== "number" || !Number.isInteger(v)) throw fieldError(field);
  return v;
}

/** منطقي إلزامي */
export function reqBool(body: Record<string, unknown>, field: string): boolean {
  const v = body[field];
  if (typeof v !== "boolean") throw fieldError(field);
  return v;
}

/** نص اختياري (أو null) */
export function optStr(body: Record<string, unknown>, field: string): string | null {
  const v = body[field];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw fieldError(field);
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/** عدد صحيح اختياري (أو null) */
export function optInt(body: Record<string, unknown>, field: string): number | null {
  const v = body[field];
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v)) throw fieldError(field);
  return v;
}
