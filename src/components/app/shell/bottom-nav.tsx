/**
 * محفظة الجنوب — شريط التنقل السفلي (BottomNav)
 * 5 تبويبات للعميل: الرئيسية/الخدمات/السجل/الإشعارات/حسابي —
 * يظهر فقط على الشاشات الجذرية وينتقل resetTo (تبديل تابات لا مكدس).
 * شارة ذهبية لعدّ الإشعارات غير المقروءة (من me).
 */
"use client";

import { Bell, Home, LayoutGrid, Receipt, User } from "lucide-react";
import type { ScreenKey } from "@/lib/app-store";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";

interface NavItem {
  key: ScreenKey;
  label: string;
  icon: typeof Home;
}

const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "الرئيسية", icon: Home },
  { key: "services", label: "الخدمات", icon: LayoutGrid },
  { key: "transactions", label: "السجل", icon: Receipt },
  { key: "notifications", label: "الإشعارات", icon: Bell },
  { key: "profile", label: "حسابي", icon: User },
];

export function BottomNav() {
  const screen = useAppStore((s) => s.screen);
  const resetTo = useAppStore((s) => s.resetTo);
  const unread = useAppStore((s) => s.me?.unreadNotifications ?? 0);

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="z-10 shrink-0 border-t border-[#E8E6E1] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="flex h-[64px] items-stretch">
        {NAV_ITEMS.map((item) => {
          const isActive = screen === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => resetTo(item.key)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex min-h-11 flex-1 flex-col items-center justify-center gap-1 transition-colors",
                isActive ? "text-[#141416]" : "text-[#5C5A56] hover:text-[#141416]",
              )}
            >
              {/* مؤشر ذهبي للتبويب النشط */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-0 h-[3px] w-7 rounded-full bg-[#C9A227] transition-opacity",
                  isActive ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="relative">
                <Icon strokeWidth={1.5} className="h-[22px] w-[22px]" />
                {item.key === "notifications" && unread > 0 ? (
                  <span
                    aria-label={`${unread} إشعارات غير مقروءة`}
                    className="absolute -left-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#C9A227] px-1 text-[10px] font-bold text-[#0B0B0C]"
                  >
                    <span className="tabular-nums">{unread > 99 ? "99+" : unread}</span>
                  </span>
                ) : null}
              </span>
              <span className="text-[11px] font-semibold leading-4">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
