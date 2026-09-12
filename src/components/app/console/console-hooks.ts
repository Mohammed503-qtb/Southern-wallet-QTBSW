/**
 * محفظة الجنوب — خطافات بيانات وأفعال اللوحة (8-d)
 * - usePagedData: جلب صفحات cursor مع تراكم الصفوف (تحميل المزيد) وإعادة جلب.
 * - useDebounced: تأخير مدخل البحث قبل ضرب الخادم.
 * - useActionRunner: تشغيل الأفعال الحساسة (toast نجاح/فشل + حالة انشغال).
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { PageView } from "@/lib/api-types";
import { toast } from "@/hooks/use-toast";

const UNKNOWN_ERROR = new ApiError("SYS-001", "خطأ غير متوقع", 0);

export interface PagedData<T> {
  items: T[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: ApiError | null;
  loadMore: () => void;
  refresh: () => void;
}

/**
 * جلب قائمة مرقّمة بمؤشر: يتغير المسار (بحث/فلاتر) → صفحة أولى جديدة؛
 * loadMore يجلب الصفحة التالية ويُلحقها؛ refresh يعيد الصفحة الأولى.
 */
export function usePagedData<T>(path: string | null): PagedData<T> {
  const [nonce, setNonce] = useState(0);
  const [snap, setSnap] = useState<{
    key: string;
    items: T[];
    nextCursor: string | null;
    error: ApiError | null;
  }>({ key: "", items: [], nextCursor: null, error: null });
  const [loadingMore, setLoadingMore] = useState(false);

  const key = path === null ? "" : `${path}#${nonce}`;
  const settled = key !== "" && snap.key === key;
  const loading = key !== "" && !settled;
  // بين تغيّر المسار وتسوية النتيجة نعرض آخر لقطة مع وسم تحميل
  const items = settled || snap.key === "" ? snap.items : [];
  const error = settled ? snap.error : null;
  const nextCursor = settled ? snap.nextCursor : null;

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    api
      .get<PageView<T>>(path)
      .then((data) => {
        if (!cancelled) setSnap({ key, items: data.items, nextCursor: data.nextCursor, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const e = err instanceof ApiError ? err : UNKNOWN_ERROR;
        setSnap({ key, items: [], nextCursor: null, error: e });
      });
    return () => {
      cancelled = true;
    };
  }, [path, nonce, key]);

  const loadMore = useCallback(() => {
    const cursor = snap.nextCursor;
    if (path === null || loadingMore || !cursor || snap.key !== key) return;
    setLoadingMore(true);
    const sep = path.includes("?") ? "&" : "?";
    api
      .get<PageView<T>>(`${path}${sep}cursor=${encodeURIComponent(cursor)}`)
      .then((data) => {
        setSnap((s) => ({
          ...s,
          items: [...s.items, ...data.items],
          nextCursor: data.nextCursor,
        }));
      })
      .catch((err: unknown) => {
        const e = err instanceof ApiError ? err : UNKNOWN_ERROR;
        toast({ title: "تعذر تحميل المزيد", description: e.message, variant: "destructive" });
      })
      .finally(() => setLoadingMore(false));
  }, [path, loadingMore, snap.nextCursor, snap.key, key]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { items, nextCursor, loading, loadingMore, error, loadMore, refresh };
}

/** تأخير قيمة المدخلات (بحث) قبل إرسالها للخادم */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export interface ActionRunner {
  busy: boolean;
  /** آخر خطأ (يُعرض في الحوارات عبر إعادة الرسم) */
  error: ApiError | null;
  run: <T>(fn: () => Promise<T>) => Promise<ActionResult<T>>;
  setError: (e: ApiError | null) => void;
}

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };

/** تشغيل فعل حساس: حالة انشغال + التقاط ApiError بلا رمي + نتيجة مميّزة */
export function useActionRunner(): ActionRunner {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<ActionResult<T>> => {
    setBusy(true);
    setError(null);
    try {
      const value = await fn();
      return { ok: true, value };
    } catch (err) {
      const e = err instanceof ApiError ? err : UNKNOWN_ERROR;
      if (mounted.current) setError(e);
      return { ok: false, error: e };
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  return { busy, error, run, setError };
}

/** إشعار نجاح موحد */
export function toastSuccess(title: string, description?: string) {
  toast({ title, description });
}

/** إشعار فشل موحد (رسالة الخادم + الكود) */
export function toastError(message: string, code?: string) {
  toast({
    title: "تعذر تنفيذ الإجراء",
    description: code ? `${message} (${code})` : message,
    variant: "destructive",
  });
}
