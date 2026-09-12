/**
 * محفظة الجنوب — نقطة دخول لوحات الأدوار (8-d)
 * تُعرض ملء الشاشة على سطح المكتب خارج إطار الهاتف عبر React Portal إلى body
 * (الموجّه يلف الشاشة بأنيميشن يحمل transform فيجعل fixed محصوراً بالإطار —
 * البوابة عبر portal تملأ الصفحة كاملة z-40 وتعمل كذلك على الجوال).
 * تختار البوابة حسب الدور: AGENT → بوابة الوكيل الذهبية،
 * ADMIN/COMPLIANCE/SUPPORT → لوحة الإدارة الداكنة.
 * التوجيه إلى هذه الوحدة من المتجر (screen=console) لأي دور ≠ CUSTOMER.
 * ملاحظة SSR: الشاشة تُعرض فقط بعد bootstrap (تفاعل عميل) حيث document متاح.
 */
"use client";

import { createPortal } from "react-dom";
import { useAppStore } from "@/lib/app-store";
import { ConsoleShell } from "./console-shell";
import { AgentPortal } from "./agent/agent-portal";

export function ConsoleApp() {
  const me = useAppStore((s) => s.me);

  if (!me || me.user.role === "CUSTOMER") {
    // حالة انتقالية لا تحدث في التدفق الطبيعي (المتجر يوجه غير العملاء هنا)
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div dir="rtl" className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-[#FAF9F6] font-cairo lg:flex-row">
      {me.user.role === "AGENT" ? <AgentPortal /> : <ConsoleShell />}
    </div>,
    document.body,
  );
}
