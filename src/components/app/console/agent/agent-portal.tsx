/**
 * محفظة الجنوب — بوابة الوكيل: القشرة الذهبية الداكنة (G-Portal) — 8-d
 * تصميم دافئ مميز: شريط جانبي يمين بخلفية ذهبية داكنة #191308 وشعار ومعلومات
 * الوكيل وقائمة الأقسام الثلاثة (نظرة/طابور/عمولات) وزر خروج أسفل —
 * ومنطقة محتوى يسار بخلفية دافئة #FBF8F0. الجوال: ترويسة + رقائق أفقية.
 */
"use client";

import { useState } from "react";
import { LogOut, type LucideIcon } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { initialOf, firstNameOf } from "@/components/app/ui";
import { cn } from "@/lib/utils";
import { AGENT_SECTIONS, type AgentSectionKey } from "../console-nav";

import { AgentOverview } from "./agent-overview";
import { AgentQueue } from "./agent-queue";
import { AgentCommissions } from "./agent-commissions";

function AgentSidebarButton({
  active,
  label,
  Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-bold transition-colors",
        active
          ? "border-l-[2.5px] border-[#C9A227] bg-[#C9A227]/[0.18] text-[#EBD89B]"
          : "border-l-[2.5px] border-transparent text-[#D8CBB0]/70 hover:bg-white/[0.05] hover:text-[#F3E9CF]",
      )}
    >
      <Icon strokeWidth={1.6} className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate text-right">{label}</span>
    </button>
  );
}

export function AgentPortal() {
  const me = useAppStore((s) => s.me);
  const logout = useAppStore((s) => s.logout);
  const [active, setActive] = useState<AgentSectionKey>("overview");
  const [busyLogout, setBusyLogout] = useState(false);

  if (!me) return null;

  const handleLogout = () => {
    setBusyLogout(true);
    void logout().finally(() => setBusyLogout(false));
  };

  const renderSection = () => {
    switch (active) {
      case "overview":
        return <AgentOverview onGoQueue={() => setActive("queue")} />;
      case "queue":
        return <AgentQueue />;
      case "commissions":
        return <AgentCommissions />;
      default:
        return null;
    }
  };

  const currentDef = AGENT_SECTIONS.find((s) => s.key === active);

  return (
    <div className="flex min-h-0 w-full flex-col lg:flex-row">
      {/* ============ الشريط الجانبي الذهبي الداكن (يمين) ============ */}
      <aside className="flex shrink-0 flex-col bg-[#191308] lg:h-full lg:w-[272px]">
        {/* الهوية — سطح المكتب */}
        <div className="hidden lg:flex lg:flex-col lg:gap-4 lg:p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#C9A227]/45 bg-[#241C0D]">
              <img src="/logo.svg" alt="" className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-extrabold text-[#F3E9CF]">محفظة الجنوب</p>
              <p className="text-[11.5px] font-semibold text-[#C9A227]">بوابة الوكيل</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-[#C9A227]/25 bg-[#C9A227]/[0.08] p-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#C9A227]/50 bg-[#241C0D] text-[15px] font-extrabold text-[#EBD89B]"
            >
              {initialOf(me.user.fullName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold leading-5 text-[#F3E9CF]">
                {me.user.fullName ?? "وكيل"}
              </p>
              <p className="truncate text-[11.5px] font-semibold text-[#D8CBB0]/60">وكيل معتمد</p>
            </div>
          </div>
        </div>

        {/* الأقسام — سطح المكتب */}
        <nav className="hidden min-h-0 flex-1 flex-col gap-1 overflow-y-auto gold-scroll px-3 py-2 lg:flex">
          {AGENT_SECTIONS.map((section) => (
            <AgentSidebarButton
              key={section.key}
              active={section.key === active}
              label={section.label}
              Icon={section.icon}
              onClick={() => setActive(section.key)}
            />
          ))}
        </nav>

        {/* الجوال: ترويسة + رقائق أفقية */}
        <div className="lg:hidden">
          <div className="flex items-center gap-3 border-b border-[#C9A227]/15 px-4 py-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#C9A227]/50 bg-[#241C0D] text-[13px] font-extrabold text-[#EBD89B]"
            >
              {initialOf(me.user.fullName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold leading-5 text-[#F3E9CF]">
                {firstNameOf(me.user.fullName, me.user.phone)}
              </p>
              <p className="truncate text-[11px] font-semibold text-[#C9A227]">بوابة الوكيل</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={busyLogout}
              title="تسجيل الخروج"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#C9A227]/25 text-[#D8CBB0]/70 transition-colors hover:border-[#C9A227]/60 hover:text-[#EBD89B] disabled:opacity-50"
            >
              <LogOut strokeWidth={1.6} className="h-4 w-4" />
            </button>
          </div>
          <nav className="gold-scroll flex items-center gap-1.5 overflow-x-auto px-3 py-2.5">
            {AGENT_SECTIONS.map((section) => {
              const isActive = section.key === active;
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActive(section.key)}
                  className={cn(
                    "flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-bold transition-colors",
                    isActive
                      ? "border-[#C9A227]/70 bg-[#C9A227]/25 text-[#EBD89B]"
                      : "border-[#C9A227]/20 text-[#D8CBB0]/60 hover:text-[#F3E9CF]",
                  )}
                >
                  <section.icon strokeWidth={1.6} className="h-3.5 w-3.5" />
                  {section.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* الخروج — أسفل الشريط (سطح المكتب) */}
        <div className="mt-auto hidden lg:block lg:border-t lg:border-[#C9A227]/15 lg:p-3">
          <button
            type="button"
            onClick={handleLogout}
            disabled={busyLogout}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#C9A227]/25 px-4 text-[13px] font-bold text-[#D8CBB0]/70 transition-colors hover:border-[#B91C1C]/50 hover:bg-[#B91C1C]/15 hover:text-[#F87171] disabled:opacity-50"
          >
            <LogOut strokeWidth={1.6} className="h-4 w-4" />
            {busyLogout ? "جارٍ الخروج…" : "تسجيل الخروج"}
          </button>
        </div>
      </aside>

      {/* ============ المحتوى الدافئ (يسار) ============ */}
      <main className="gold-scroll min-h-0 min-w-0 flex-1 overflow-y-auto bg-[#FBF8F0]">
        <div className="mx-auto w-full max-w-[1120px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-7">
          {currentDef ? (
            <p className="mb-4 text-[11.5px] font-semibold text-[#A89F8D]">{currentDef.description}</p>
          ) : null}
          {renderSection()}
        </div>
      </main>
    </div>
  );
}
