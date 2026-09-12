/**
 * محفظة الجنوب — خطاف جلب بيانات موحد للشاشات
 * useApiData<T>(path): جلب واحد مع loading / error / retry (بدون بيانات وهمية).
 * حالة التحميل مشتقة من مقارنة مفتاح الطلب الحالي بآخر نتيجة مستقرة —
 * لا استدعاء setState تزامني داخل التأثير (قواعد react-hooks الحديثة).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface FetchState<T> {
  /** مفتاح آخر طلب تمت تسوية نتيجته */
  key: string;
  data: T | null;
  error: ApiError | null;
}

export interface ApiDataResult<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  /** إعادة الجلب يدوياً */
  retry: () => void;
}

const UNKNOWN_ERROR = new ApiError("SYS-001", "خطأ غير متوقع أثناء جلب البيانات", 0);

export function useApiData<T>(path: string | null): ApiDataResult<T> {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<FetchState<T>>({
    key: "",
    data: null,
    error: null,
  });

  const key = path === null ? "" : `${path}#${nonce}`;
  // الطلب جارٍ إذا وُجد مسار ولم تُسوَّ نتيجته بعد (مشتق — لا setState في التأثير)
  const settled = key !== "" && state.key === key;
  const loading = key !== "" && !settled;

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    api
      .get<T>(path)
      .then((data) => {
        if (!cancelled) setState({ key, data, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const error = err instanceof ApiError ? err : UNKNOWN_ERROR;
        setState({ key, data: null, error });
      });
    return () => {
      cancelled = true;
    };
    // key مشتق مباشرة من path وnonce
  }, [path, nonce, key]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  // بين تغيّر المسار وتسوية النتيجة الجديدة نُبقي آخر لقطة للعرض مع وسم تحميل
  return {
    data: state.data,
    loading,
    error: settled ? state.error : null,
    retry,
  };
}
