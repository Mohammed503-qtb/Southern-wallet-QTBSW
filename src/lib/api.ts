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

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
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

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: "GET", signal }),
  post: <T>(path: string, body?: unknown, opts?: { idempotencyKey?: string; signal?: AbortSignal }) =>
    request<T>(path, { method: "POST", body, idempotencyKey: opts?.idempotencyKey, signal: opts?.signal }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: "DELETE", body }),
};

/** مفتاح Idempotency جديد (UUID) */
export const newIdempotencyKey = genIdempotencyKey;
