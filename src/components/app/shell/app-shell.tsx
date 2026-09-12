/**
 * محفظة الجنوب — قشرة التطبيق داخل الهاتف (AppShell)
 * عمود: شريط حالة وهمي (سطح المكتب فقط) + منطقة محتوى قابلة للتمرير
 * بتمرير مخصص رفيع (gold-scroll) + شريط تنقل سفلي للعميل على الشاشات الجذرية.
 */
"use client";

import { useEffect, useState } from "react";
import { BatteryFull, Signal, Wifi } from "lucide-react";
import { ROOT_SCREENS, useAppStore } from "@/lib/app-store";
import { BottomNav } from "./bottom-nav";
import { ScreenRouter } from "./screen-router";

/** شريط حالة وهمي أسود رفيع (واقعية إطار الهاتف على سطح المكتب فقط) */
function FakeStatusBar() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const time = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;

  return (
    <div
      aria-hidden="true"
      className="hidden h-7 shrink-0 items-center justify-between bg-[#0B0B0C] px-5 text-white lg:flex"
    >
      <span dir="ltr" className="text-[11px] font-semibold tabular-nums">
        {time}
      </span>
      <span className="flex items-center gap-1.5 text-white/90">
        <Signal strokeWidth={1.5} className="h-3 w-3" />
        <Wifi strokeWidth={1.5} className="h-3 w-3" />
        <BatteryFull strokeWidth={1.5} className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

export function AppShell() {
  const screen = useAppStore((s) => s.screen);
  const role = useAppStore((s) => s.me?.user.role);

  const showNav = role === "CUSTOMER" && ROOT_SCREENS.includes(screen);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#FAF9F6]">
      <FakeStatusBar />
      <main className="gold-scroll relative min-h-0 flex-1 overflow-y-auto">
        <ScreenRouter />
      </main>
      {showNav ? <BottomNav /> : null}
    </div>
  );
}
