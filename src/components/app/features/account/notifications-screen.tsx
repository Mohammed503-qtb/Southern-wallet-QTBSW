/**
 * محفظة الجنوب — مركز الإشعارات (SC-37)
 * N1 → قائمة إشعارات بأيقونة فئة (TXN سهم/SECURITY قفل/KYC شارة/SYSTEM جرس/
 * SUPPORT سماعة) — غير المقروء بخلفية دافئة وحد ذهبي (يمين RTL) ونقطة ذهبية.
 * النقر يعلّم مقروءاً (N2) + زر «عرض العملية» إن كان txRef + «تعليم الكل»
 * في الترويسة — وشارة العد تتحدث عبر refreshMe().
 */
"use client";

import { useState } from "react";
import {
  ArrowLeftRight,
  BadgeCheck,
  Bell,
  CheckCheck,
  Headphones,
  Lock,
  ReceiptText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { api } from "@/lib/api";
import type { NotificationView } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui";
import { ErrorState } from "@/components/app/ui/error-state";
import { EmptyState } from "@/components/app/ui/empty-state";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { formatShortDateTime } from "@/components/app/ui/utils";
import { cn } from "@/lib/utils";

const CATEGORY_ICON: Record<NotificationView["category"], LucideIcon> = {
  TXN: ArrowLeftRight,
  SECURITY: Lock,
  KYC: BadgeCheck,
  SYSTEM: Bell,
  SUPPORT: Headphones,
};

const CATEGORY_LABEL: Record<NotificationView["category"], string> = {
  TXN: "عمليات",
  SECURITY: "أمان",
  KYC: "توثيق",
  SYSTEM: "النظام",
  SUPPORT: "دعم",
};

export function NotificationsScreen() {
  const navigate = useAppStore((s) => s.navigate);
  const refreshMe = useAppStore((s) => s.refreshMe);

  const { data, loading, error, retry } = useApiData<NotificationView[]>(
    "/api/notifications",
  );

  // تجاوزات محلية للتعليم المقروء تُطبّق فوق بيانات الخادم (بلا نسخ كامل)
  const [readOverrides, setReadOverrides] = useState<Record<string, boolean>>({});
  const items = (data ?? []).map((n) =>
    readOverrides[n.id] === true ? { ...n, read: true } : n,
  );
  const unreadCount = items.filter((n) => !n.read).length;

  /** تعليم إشعار واحد مقروءاً (N2) */
  const markOne = async (n: NotificationView) => {
    if (n.read) return;
    setReadOverrides((prev) => ({ ...prev, [n.id]: true }));
    try {
      await api.post("/api/notifications/read", { ids: [n.id] });
      void refreshMe();
    } catch {
      // نُبقي الحالة المحلية والشارة تعاود الضبط عند الجلب القادم
    }
  };

  /** تعليم الكل (N2) */
  const markAll = async () => {
    if (unreadCount === 0) return;
    const next: Record<string, boolean> = { ...readOverrides };
    for (const n of items) {
      if (!n.read) next[n.id] = true;
    }
    setReadOverrides(next);
    try {
      await api.post("/api/notifications/read", { all: true });
      void refreshMe();
    } catch {
      // تجاهل — الشارة تصحّح نفسها عند الجلب القادم
    }
  };

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader
        title="الإشعارات"
        subtitle={data ? `${unreadCount} غير مقروء من ${items.length}` : "آخر 50 إشعاراً"}
        action={
          items && items.length > 0 ? (
            <button
              type="button"
              onClick={() => void markAll()}
              disabled={unreadCount === 0}
              aria-label="تعليم كل الإشعارات كمقروءة"
              className={cn(
                "flex h-11 items-center gap-1.5 rounded-xl border px-3 text-[12.5px] font-bold transition-colors",
                unreadCount > 0
                  ? "border-[#C9A227]/40 bg-[#C9A227]/[0.08] text-[#8A6E14] hover:bg-[#C9A227]/[0.16]"
                  : "border-[#E8E6E1] bg-white text-[#A3A09B]",
              )}
            >
              <CheckCheck strokeWidth={1.5} className="h-4 w-4" />
              تعليم الكل
            </button>
          ) : undefined
        }
      />

      <div className="mt-3">
        {loading && data === null ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px] w-full rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <ErrorState compact message={error.message} code={error.code} onRetry={retry} />
        ) : items.length === 0 ? (
          <EmptyState
            compact
            title="لا إشعارات بعد"
            description="ستصلك هنا إشعارات العمليات والأمان والتوثيق والدعم"
          />
        ) : (
          <div className="space-y-2">
            {items.map((n) => {
              const Icon = CATEGORY_ICON[n.category] ?? Bell;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void markOne(n)}
                  aria-label={n.read ? "إشعار مقروء" : "إشعار غير مقروء — انقر لتعليمه"}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border p-3 text-right transition-colors",
                    n.read
                      ? "border-[#E8E6E1]/70 bg-white"
                      : "border-[#E8E6E1] border-r-[3px] border-r-[#C9A227] bg-[#FBF6E2] hover:bg-[#F7EFD3]",
                  )}
                >
                  {/* أيقونة الفئة بدائرة */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border",
                      n.read
                        ? "border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]"
                        : "border-[#C9A227]/40 bg-white text-[#8A6E14]",
                    )}
                  >
                    <Icon strokeWidth={1.5} className="h-5 w-5" />
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                    <span className="flex w-full items-center gap-1.5">
                      <span className="truncate text-[14px] font-bold leading-5 text-[#141416]">
                        {n.title}
                      </span>
                      {!n.read ? (
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-full bg-[#C9A227]"
                        />
                      ) : null}
                      <span className="mr-auto shrink-0 text-[10.5px] font-bold text-[#A3A09B]">
                        {CATEGORY_LABEL[n.category]}
                      </span>
                    </span>
                    <span className="w-full text-[12.5px] font-medium leading-5 text-[#5C5A56]">
                      {n.body}
                    </span>
                    <span className="text-[11px] font-medium text-[#A3A09B]">
                      {formatShortDateTime(n.createdAt)}
                    </span>

                    {/* عرض العملية المرتبطة إن وُجد txRef */}
                    {n.txRef ? (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          void markOne(n);
                          navigate("transaction-details", { ref: n.txRef ?? "" });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            void markOne(n);
                            navigate("transaction-details", { ref: n.txRef ?? "" });
                          }
                        }}
                        className="mt-1 flex min-h-9 items-center gap-1.5 rounded-full border border-[#E8E6E1] bg-white px-3 text-[12px] font-bold text-[#141416] transition-colors hover:border-[#C9A227]/50 hover:text-[#8A6E14]"
                      >
                        <ReceiptText strokeWidth={1.5} className="h-3.5 w-3.5 text-[#C9A227]" />
                        عرض العملية
                        <span dir="ltr" className="tabular-nums text-[10.5px] text-[#A3A09B]">
                          {n.txRef}
                        </span>
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
