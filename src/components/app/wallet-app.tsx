/**
 * محفظة الجنوب — جذر التطبيق التفاعلي (SPA)
 * إطار سطح المكتب (AppFrame: هاتف + لوحة هوية) وقشرة التطبيق داخله
 * (AppShell: شريط حالة وهمي + محتوى قابل للتمرير + شريط تنقل سفلي)
 * والتوجيه عبر متجر zustand (ScreenRouter) — كل التجربة على المسار /.
 * عقد البناء: docs/MVP_CONTRACT.md §1 و§7.
 */
"use client";

import { AppFrame } from "./shell/app-frame";
import { AppShell } from "./shell/app-shell";

export function WalletApp() {
  return (
    <AppFrame>
      <AppShell />
    </AppFrame>
  );
}
