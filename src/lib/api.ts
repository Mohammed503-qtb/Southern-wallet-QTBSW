/**
 * محفظة الجنوب — عميل API للواجهة (client-side)
 * يتعامل مع الغلاف الموحد { ok, data | error } ويرمي ApiError عند الفشل
 */
"use client";

import type { ApiEnvelope } from "./api-types";

export class ApiError extends Error {
  code: string;
  details?: Record<string, string | number>;
  status: number;

  constructor(code: string, message: string, status: number, details?: Record<string, string | number>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** مفتاح Idempotency للعمليات المالية — يُرسل كرأس */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

// ============ رمز الجلسة (القناة الاحتياطية iframe-safe) ============
// يخزَّن بعد الدخول ويُرسل مع كل طلب عبر ترويسة x-sw-session —
// الكوكي يبقى القناة الأساسية (httpOnly) وهذا احتياط لسياق إطار المعاينة.
const SESSION_TOKEN_KEY = "sw_token";

export function saveSessionToken(token: string): void {
  try {
    window.localStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    /* التخزين غير متاح — الكوكي يكفي */
  }
}

export function clearSessionToken(): void {
  try {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    /* تجاهل */
  }
}

function readSessionToken(): string | null {
  try {
    return window.localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function genIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `idm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** يستخدم نفس مفتاح Idempotency لأول محاولة إعادة بعد انقطاع (AC-04) */
let lastMoneyAttempt: { key: string; url: string; body: unknown } | null = null;

export function beginMoneyAttempt(url: string, body: unknown): string {
  const key = genIdempotencyKey();
  lastMoneyAttempt = { key, url, body };
  return key;
}

export function clearMoneyAttempt() {
  lastMoneyAttempt = null;
}

/** إن كان الطلب الأخير نفسه (انقطاع شبكة) → أعد استخدامه لضمان AC-04 */
export function reuseMoneyKey(url: string, body: unknown): string | null {
  if (
    lastMoneyAttempt &&
    lastMoneyAttempt.url === url &&
    JSON.stringify(lastMoneyAttempt.body) === JSON.stringify(body)
  ) {
    return lastMoneyAttempt.key;
  }
  return null;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, idempotencyKey, signal } = options;

  // FormData (رفع ملفات KYC — 12-g): لا نضبط Content-Type إطلاقاً
  // كي يضبطه المتصفح مع حد boundary الصحيح
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const headers: Record<string, string> = {};
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  // القناة الاحتياطية للجلسة (iframe-safe) — يعرفها الخادم بجانب الكوكي
  const sessionToken = readSessionToken();
  if (sessionToken) headers["x-sw-session"] = sessionToken;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: isForm ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
      signal,
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    // انقطاع الشبكة — خطأ خاص تلتقطه الشاشات المالية (AC-04)
    throw new ApiError("NET-000", "تعذر الاتصال بالخادم — تحقق من اتصالك", 0);
  }

  let json: ApiEnvelope<T> | null = null;
  try {
    json = (await res.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError("SYS-001", "استجابة غير صالحة من الخادم", res.status);
  }

  if (!json) {
    throw new ApiError("SYS-001", "استجابة غير صالحة من الخادم", res.status);
  }

  if (json.ok) {
    return json.data;
  }

  throw new ApiError(json.error.code, json.error.message, res.status, json.error.details);
}

/** يرمي ApiError من غلاف استجابة فاشلة {ok:false,error} إن وُجد — أو SYS-001 */
async function throwEnvelopeError(res: Response): Promise<never> {
  let json: ApiEnvelope<unknown> | null = null;
  try {
    json = (await res.json()) as ApiEnvelope<unknown>;
  } catch {
    json = null;
  }
  if (json && !json.ok) {
    throw new ApiError(json.error.code, json.error.message, res.status, json.error.details);
  }
  throw new ApiError("SYS-001", "استجابة غير صالحة من الخادم", res.status);
}

/** جلب ملف/صورة عبر ترويسة الجلسة نفسها — يعيد Blob (معاينات مستندات KYC 12-g) */
async function requestBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const headers: Record<string, string> = {};
  const sessionToken = readSessionToken();
  if (sessionToken) headers["x-sw-session"] = sessionToken;

  let res: Response;
  try {
    res = await fetch(path, { method: "GET", headers, signal, cache: "no-store", credentials: "same-origin" });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError("NET-000", "تعذر الاتصال بالخادم — تحقق من اتصالك", 0);
  }

  if (!res.ok) {
    await throwEnvelopeError(res);
  }
  return await res.blob();
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: "GET", signal }),
  post: <T>(path: string, body?: unknown, opts?: { idempotencyKey?: string; signal?: AbortSignal }) =>
    request<T>(path, { method: "POST", body, idempotencyKey: opts?.idempotencyKey, signal: opts?.signal }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: "DELETE", body }),
  /** إرسال multipart/form-data (رفع ملفات) — المتصفح يضبط الـboundary بنفسه */
  postForm: <T>(path: string, form: FormData, opts?: { signal?: AbortSignal }) =>
    request<T>(path, { method: "POST", body: form, signal: opts?.signal }),
  /** جلب محتوى ثنائي (صور/ملفات) عبر قناة الجلسة نفسها */
  getBlob: (path: string, signal?: AbortSignal) => requestBlob(path, signal),
};

/** مفتاح Idempotency جديد (UUID) */
export const newIdempotencyKey = genIdempotencyKey;
