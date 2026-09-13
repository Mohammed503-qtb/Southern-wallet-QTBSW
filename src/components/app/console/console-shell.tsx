/**
 * محفظة الجنوب — قشرة لوحة الإدارة (8-d)
 * RTL: شريط جانبي داكن #0B0B0C يمين (شعار + المستخدم + دوره + الأقسام + خروج
 * أسفل) ومنطقة محتوى يسار بخلفية #FAF9F6 وتمرير داخلي رفيع.
 * الجوال (<lg): الشريط يتحول ترويسة داكنة + شريط رقائق أفقي قابل للتمرير.
 * الأقسام تُشتق من دور المستخدم (console-nav) — لا زر "عرض التطبيق" للأدوار.
 */
"use client";

import { useState } from "react";
import { LogOut, type LucideIcon } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { USER_ROLE_LABELS } from "@/lib/api-types";
import { initialOf, firstNameOf } from "@/components/app/ui";
import { cn } from "@/lib/utils";
import { sectionsForRole, type ConsoleSectionKey } from "./console-nav";

import { OverviewSection } from "./sections/overview-section";
import { UsersSection } from "./sections/users-section";
import { KycSection } from "./sections/kyc-section";
import { AgentsSection } from "./sections/agents-section";
import { TransactionsSection } from "./sections/transactions-section";
import { RulesSection } from "./sections/rules-section";
import { PendingSection } from "./sections/pending-section";
import { RemitInSection } from "./sections/remit-in-section";
import { AuditSection } from "./sections/audit-section";
import { SecurityEventsSection } from "./sections/security-events-section";
import { TicketsSection } from "./sections/tickets-section";

/** صورة المستخدم الدائرية (الحرف الأول على أسود بحد ذهبي) */
function ConsoleAvatar({ name, size = 40 }: { name: string | null; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-[#C9A227]/40 bg-[#1A1A1C] font-extrabold text-[#EAD27A]",
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initialOf(name)}
    </span>
  );
}

function SidebarNavButton({
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
          ? "border-l-[2.5px] border-[#C9A227] bg-[#C9A227]/[0.14] text-[#E8D089]"
          : "border-l-[2.5px] border-transparent text-white/60 hover:bg-white/[0.06] hover:text-white",
      )}
    >
      <Icon strokeWidth={1.6} className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate text-right">{label}</span>
    </button>
  );
}

export function ConsoleShell() {
  const me = useAppStore((s) => s.me);
  const logout = useAppStore((s) => s.logout);
  const [active, setActive] = useState<ConsoleSectionKey>("overview");
  const [busyLogout, setBusyLogout] = useState(false);

  if (!me) return null;
  const role = me.user.role;
  const sections = sectionsForRole(role);
  // إن لم يكن القسم الحالي ضمن صلاحيات الدور (تبديل حساب داخل نفس الجلسة) → الأول
  const current = sections.some((s) => s.key === active) ? active : (sections[0]?.key ?? "tickets");
  const CurrentDef = sections.find((s) => s.key === current);

  const handleLogout = () => {
    setBusyLogout(true);
    void logout().finally(() => setBusyLogout(false));
  };

  const renderSection = () => {
    switch (current) {
      case "overview":
        return <OverviewSection role={role} />;
      case "users":
        return <UsersSection role={role} />;
      case "kyc":
        return <KycSection role={role} />;
      case "agents":
        return <AgentsSection />;
      case "transactions":
        return <TransactionsSection />;
      case "rules":
        return <RulesSection />;
      case "pending":
        return <PendingSection />;
      case "remit-in":
        return <RemitInSection />;
      case "audit":
        return <AuditSection />;
      case "security":
        return <SecurityEventsSection />;
      case "tickets":
        return <TicketsSection />;
      default:
        return null;
    }
  };

  return (
    <>
      {/* ============ الشريط الجانبي (يمين — سطح المكتب) ============ */}
      <aside className="flex shrink-0 flex-col bg-[#0B0B0C] lg:h-full lg:w-[272px]">
        {/* الهوية */}
        <div className="hidden lg:flex lg:flex-col lg:gap-4 lg:p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#C9A227]/35 bg-[#141416]">
              <img src="/logo.svg" alt="" className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-extrabold text-white">محفظة الجنوب</p>
              <p className="text-[11.5px] font-semibold text-[#C9A227]">لوحة الإدارة</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <ConsoleAvatar name={me.user.fullName} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold leading-5 text-white">
                {me.user.fullName ?? "مستخدم"}
              </p>
              <p className="truncate text-[11.5px] font-semibold text-white/50">
                {USER_ROLE_LABELS[me.user.role]}
              </p>
            </div>
          </div>
        </div>

        {/* الأقسام — سطح المكتب */}
        <nav className="hidden min-h-0 flex-1 flex-col gap-1 overflow-y-auto gold-scroll px-3 py-2 lg:flex">
          {sections.map((section) => (
            <SidebarNavButton
              key={section.key}
              active={section.key === current}
              label={section.label}
              Icon={section.icon}
              onClick={() => setActive(section.key)}
            />
          ))}
        </nav>

        {/* الجوال: ترويسة داكنة + شريط رقائق أفقي قابل للتمرير */}
        <div className="lg:hidden">
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            <ConsoleAvatar name={me.user.fullName} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold leading-5 text-white">
                {firstNameOf(me.user.fullName, me.user.phone)}
              </p>
              <p className="truncate text-[11px] font-semibold text-[#C9A227]">
                {USER_ROLE_LABELS[me.user.role]}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={busyLogout}
              title="تسجيل الخروج"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 text-white/70 transition-colors hover:border-[#C9A227]/60 hover:text-[#EAD27A] disabled:opacity-50"
            >
              <LogOut strokeWidth={1.6} className="h-4 w-4" />
            </button>
          </div>
          <nav className="gold-scroll flex items-center gap-1.5 overflow-x-auto px-3 py-2.5">
            {sections.map((section) => {
              const active = section.key === current;
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActive(section.key)}
                  className={cn(
                    "flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-bold transition-colors",
                    active
                      ? "border-[#C9A227]/70 bg-[#C9A227]/20 text-[#EAD27A]"
                      : "border-white/12 text-white/55 hover:text-white",
                  )}
                >
                  <section.icon strokeWidth={1.6} className="h-3.5 w-3.5" />
                  {section.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* الخروج — أسفل الشريط الجانبي (سطح المكتب) */}
        <div className="mt-auto hidden lg:block lg:border-t lg:border-white/10 lg:p-3">
          <button
            type="button"
            onClick={handleLogout}
            disabled={busyLogout}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/12 px-4 text-[13px] font-bold text-white/70 transition-colors hover:border-[#B91C1C]/60 hover:bg-[#B91C1C]/15 hover:text-[#F87171] disabled:opacity-50"
          >
            <LogOut strokeWidth={1.6} className="h-4 w-4" />
            {busyLogout ? "جارٍ الخروج…" : "تسجيل الخروج"}
          </button>
        </div>
      </aside>

      {/* ============ المحتوى (يسار) ============ */}
      <main className="gold-scroll min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1120px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-7">
          {CurrentDef ? (
            <p className="mb-4 text-[11.5px] font-semibold text-[#A3A09B]">
              {USER_ROLE_LABELS[me.user.role]} · {CurrentDef.description}
            </p>
          ) : null}
          {renderSection()}
        </div>
      </main>
    </>
  );
}
