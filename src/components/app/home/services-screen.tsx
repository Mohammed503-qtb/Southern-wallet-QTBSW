/**
 * محفظة الجنوب — كتالوج الخدمات (SC-09 Services)
 * المجموعات الثلاث: المال (النواة) / الخدمات قريباً (بحالات ServiceState) /
 * الحساب. بطاقات بأيقونة دافئة + شارة الحالة — غير ON معطّلة بشرح (Sheet).
 * الحالات من GET /api/services فقط — مع loading وErrorState وإعادة محاولة.
 */
"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import type { ServiceStateView } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui/api-hooks";
import { ErrorState } from "@/components/app/ui/error-state";
import { Skeleton } from "@/components/app/ui/skeleton";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { SERVICE_CATALOG, resolveState, toStateMap } from "./service-catalog";
import { ServiceInfoSheet } from "./service-info-sheet";
import { cn } from "@/lib/utils";

const GROUP_TITLES: Record<string, string> = {
  money: "المال",
  later: "الخدمات قريباً",
  account: "الحساب",
};

export function ServicesScreen() {
  const navigate = useAppStore((s) => s.navigate);
  const resetTo = useAppStore((s) => s.resetTo);
  const services = useApiData<ServiceStateView[]>("/api/services");
  const [sheetKey, setSheetKey] = useState<string | null>(null);

  const stateMap = toStateMap(services.data);
  const groups = ["money", "later", "account"] as const;

  const openSheet = services.error ? null : sheetKey;

  const renderService = (key: string) => {
    const svc = SERVICE_CATALOG.find((s) => `${s.group}:${s.title}` === key);
    if (!svc) return null;
    const { state, note } = resolveState(svc, stateMap);
    const Icon = svc.icon;
    const isOn = state === "ON";

    return (
      <button
        key={key}
        type="button"
        onClick={() => {
          if (!isOn || svc.screen === null) {
            setSheetKey(key);
            return;
          }
          if (svc.screen === "services" || svc.screen === "transactions" || svc.screen === "notifications" || svc.screen === "profile" || svc.screen === "home") {
            resetTo(svc.screen);
            return;
          }
          navigate(svc.screen);
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border border-[#E8E6E1]/70 bg-white p-3.5 text-right transition-colors",
          isOn && svc.screen !== null
            ? "hover:border-[#C9A227]/50 hover:bg-[#FDFCFA] active:bg-[#F7F6F2]"
            : "opacity-90",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#E8E6E1] bg-[#F7F6F2]",
            isOn ? "text-[#5C5A56]" : "text-[#A3A09B]",
          )}
        >
          <Icon strokeWidth={1.5} className="h-5 w-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-bold text-[#141416]">{svc.title}</span>
          <span className="truncate text-[12px] font-medium text-[#5C5A56]">
            {svc.description}
          </span>
        </span>
        {isOn ? (
          <ChevronLeft strokeWidth={1.5} className="h-5 w-5 shrink-0 text-[#A3A09B]" />
        ) : (
          <span className="shrink-0 rounded-full border border-[#E8E6E1] bg-[#F7F6F2] px-2 py-0.5 text-[10.5px] font-bold text-[#A3A09B]">
            {state === "COMING_LATER" ? "قريباً" : state === "OFF" ? "معطلة" : "صيانة"}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader title="الخدمات" showBack={false} subtitle="كتالوج محفظة الجنوب بحالاتها الإدارية" />

      {services.loading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />
          ))}
        </div>
      ) : services.error ? (
        <div className="mt-6">
          <ErrorState
            message={services.error.message}
            code={services.error.code}
            onRetry={services.retry}
          />
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {groups.map((group) => {
            const items = SERVICE_CATALOG.filter((s) => s.group === group);
            return (
              <section key={group}>
                <h2 className="mb-2.5 text-[16px] font-semibold leading-6 text-[#141416]">
                  {GROUP_TITLES[group]}
                </h2>
                <div className="space-y-2">
                  {items.map((s) => renderService(`${s.group}:${s.title}`))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Sheet تفسير الخدمة */}
      {openSheet ? (
        (() => {
          const svc = SERVICE_CATALOG.find((s) => `${s.group}:${s.title}` === openSheet);
          if (!svc) return null;
          const { state, note } = resolveState(svc, stateMap);
          const Icon = svc.icon;
          return (
            <ServiceInfoSheet
              open
              onOpenChange={(o) => !o && setSheetKey(null)}
              title={svc.title}
              description={svc.description}
              icon={Icon}
              state={state}
              note={note}
            />
          );
        })()
      ) : null}
    </div>
  );
}
