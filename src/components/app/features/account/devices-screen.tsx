/**
 * محفظة الجنوب — أجهزتي (SC-41)
 * P1 → GET /api/profile: قائمة جلساتك (الجهاز/آخر ظهور/نشطة الآن بعلامة خضراء)
 * + زر إنهاء لكل جلسة أخرى (P2 DELETE /api/profile/sessions/:id) + قسم
 * «أمان الحساب» تعريفي.
 */
"use client";

import { useState } from "react";
import { Globe, MonitorSmartphone, ShieldCheck, Smartphone, Tablet } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { ProfileView, SessionView } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui";
import { ErrorState } from "@/components/app/ui/error-state";
import { EmptyState } from "@/components/app/ui/empty-state";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { formatDateTime, formatShortDateTime } from "@/components/app/ui/utils";
import { SectionCard } from "./account-shared";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/** أيقونة تقريبية لنوع الجهاز من ملصق الجلسة */
function deviceIcon(label: string): typeof Smartphone {
  if (/mobile|android|iphone|هاتف/i.test(label)) return Smartphone;
  if (/tablet|ipad|جهاز لوحي/i.test(label)) return Tablet;
  return MonitorSmartphone;
}

export function DevicesScreen() {
  const { data, loading, error, retry } = useApiData<ProfileView>("/api/profile");
  const [terminating, setTerminating] = useState<string | null>(null);

  /** إنهاء جلسة أخرى (P2) */
  const terminate = async (session: SessionView) => {
    if (session.current || terminating) return;
    setTerminating(session.id);
    try {
      await api.del(`/api/profile/sessions/${encodeURIComponent(session.id)}`);
      toast({
        title: "تم إنهاء الجلسة",
        description: `${session.deviceLabel} — لن تعمل بعد الآن`,
      });
      retry();
    } catch (err) {
      toast({
        title: "تعذّر إنهاء الجلسة",
        description: err instanceof ApiError ? err.message : "حاول مجدداً",
        variant: "destructive",
      });
    } finally {
      setTerminating(null);
    }
  };

  const sessions = data?.sessions ?? [];

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader title="أجهزتي" subtitle="الجلسات النشطة على حسابك" />

      <div className="mt-4">
        {loading && !data ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[84px] w-full rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <ErrorState compact message={error.message} code={error.code} onRetry={retry} />
        ) : sessions.length === 0 ? (
          <EmptyState
            compact
            title="لا جلسات نشطة"
            description="سجّل الدخول لتنشئ جلسة على هذا الجهاز"
          />
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const Icon = deviceIcon(s.deviceLabel);
              const busy = terminating === s.id;
              return (
                <div
                  key={s.id}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border p-3",
                    s.current
                      ? "border-[#15803D]/30 bg-[#15803D]/[0.04]"
                      : "border-[#E8E6E1]/70 bg-white",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border",
                      s.current
                        ? "border-[#15803D]/20 bg-[#15803D]/[0.07] text-[#15803D]"
                        : "border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]",
                    )}
                  >
                    <Icon strokeWidth={1.5} className="h-5 w-5" />
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                    <span className="flex w-full items-center gap-1.5">
                      <span className="truncate text-[14px] font-bold text-[#141416]">
                        {s.deviceLabel}
                      </span>
                      {s.current ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full border border-[#15803D]/20 bg-[#15803D]/10 px-2 py-px text-[10.5px] font-bold text-[#15803D]">
                          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#15803D]" />
                          نشطة الآن
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[12px] font-medium text-[#5C5A56]">
                      آخر ظهور: {formatShortDateTime(s.lastSeenAt)}
                    </span>
                    <span className="text-[11px] font-medium text-[#A3A09B]">
                      بدأت: {formatDateTime(s.createdAt)}
                    </span>
                  </div>

                  {/* زر الإنهاء للجلسات الأخرى فقط */}
                  {!s.current ? (
                    <button
                      type="button"
                      onClick={() => void terminate(s)}
                      disabled={busy}
                      className="flex min-h-11 shrink-0 items-center rounded-xl border border-[#B91C1C]/25 bg-white px-3 text-[12.5px] font-bold text-[#B91C1C] transition-colors hover:bg-[#B91C1C]/[0.06] disabled:opacity-50"
                    >
                      {busy ? "…" : "إنهاء"}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== قسم أمان الحساب (تعريفي) ===== */}
      <div className="mt-5">
        <SectionCard title="أمان الحساب">
          <div className="space-y-2.5">
            {[
              {
                icon: Globe,
                text: "الجلسة النشطة الآن محمية بكوكي httpOnly لا يمكن قراءته من صفحات الويب.",
              },
              {
                icon: ShieldCheck,
                text: "إنهاء جلسة جهاز آخر يُسجّل خروجه فوراً — لن يعمل دون تسجيل دخول جديد برمز تحقق.",
              },
              {
                icon: Smartphone,
                text: "لم تتعرف على جهاز؟ أنهِ جلسته فوراً ثم غيّر رمز PIN من شاشة الأمان.",
              },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <item.icon strokeWidth={1.5} className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#C9A227]" />
                <p className="text-[12.5px] font-medium leading-6 text-[#5C5A56]">{item.text}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
