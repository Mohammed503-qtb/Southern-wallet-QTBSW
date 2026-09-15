/**
 * محفظة الجنوب — خريطة أقسام اللوحة حسب الدور (8-d)
 * الخادم يفرض الصلاحيات (RBAC-001) — هذه القائمة تخفي فقط ما لا يملكه الدور:
 * ADMIN الكل، COMPLIANCE (قراءة + KYC + التدقيق)، SUPPORT التذاكر فقط،
 * AGENT بوابة مستقلة (agent/*) بأقسامها الثلاثة.
 */
"use client";

import {
  Clock3,
  Coins,
  Gauge,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  ReceiptText,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@/lib/api-types";

/** مفاتيح أقسام لوحة الطاقم (غير AGENT) */
export type ConsoleSectionKey =
  | "overview"
  | "users"
  | "kyc"
  | "agents"
  | "transactions"
  | "rules"
  | "pending"
  | "remit-in"
  | "audit"
  | "security"
  | "tickets";

/** مفاتيح أقسام بوابة الوكيل */
export type AgentSectionKey = "overview" | "queue" | "commissions";

export interface NavSectionDef {
  key: ConsoleSectionKey;
  label: string;
  description: string;
  icon: LucideIcon;
}

const SECTIONS: Record<ConsoleSectionKey, NavSectionDef> = {
  overview: {
    key: "overview",
    label: "نظرة عامة",
    description: "مؤشرات المنصة وفحص توازن الدفاتر",
    icon: LayoutDashboard,
  },
  users: {
    key: "users",
    label: "المستخدمون",
    description: "البحث والفلاتر وتجميد الحسابات",
    icon: Users,
  },
  kyc: {
    key: "kyc",
    label: "طابور KYC",
    description: "طلبات التوثيق واعتمادها أو رفضها",
    icon: ShieldCheck,
  },
  agents: {
    key: "agents",
    label: "الوكلاء",
    description: "شبكة الوكلاء والعوم والتعليق",
    icon: Store,
  },
  transactions: {
    key: "transactions",
    label: "المعاملات",
    description: "كل معاملات المنصة بالبحث والفلاتر",
    icon: ReceiptText,
  },
  rules: {
    key: "rules",
    label: "قواعد التشغيل",
    description: "الحدود والرسوم وأسعار الصرف والخدمات",
    icon: SlidersHorizontal,
  },
  pending: {
    key: "pending",
    label: "المعلّق",
    description: "حوالات وعمليات نقدية بانتظار التسوية",
    icon: Clock3,
  },
  "remit-in": {
    key: "remit-in",
    label: "الحوالات الواردة",
    description: "إصدار حوالات شبكات الصرافة وتتبع استلامها (A-03)",
    icon: Landmark,
  },
  audit: {
    key: "audit",
    label: "التدقيق",
    description: "سجل الأفعال الإدارية الحساسة",
    icon: ScrollText,
  },
  security: {
    key: "security",
    label: "الأحداث الأمنية",
    description: "محاولات الدخول والقفل وإعادة التعيين",
    icon: ShieldAlert,
  },
  tickets: {
    key: "tickets",
    label: "التذاكر",
    description: "دعم العملاء والمحادثات",
    icon: LifeBuoy,
  },
};

const ROLE_SECTIONS: Record<"ADMIN" | "COMPLIANCE" | "SUPPORT", ConsoleSectionKey[]> = {
  ADMIN: [
    "overview",
    "users",
    "kyc",
    "agents",
    "transactions",
    "rules",
    "pending",
    "remit-in",
    "audit",
    "security",
    "tickets",
  ],
  COMPLIANCE: ["overview", "users", "kyc", "transactions", "remit-in", "audit", "security"],
  SUPPORT: ["tickets"],
};

export function sectionsForRole(role: UserRole): NavSectionDef[] {
  const keys = ROLE_SECTIONS[role as "ADMIN" | "COMPLIANCE" | "SUPPORT"];
  if (!keys) return [];
  return keys.map((k) => SECTIONS[k]);
}

/** تعريف أقسام بوابة الوكيل (تصميم دافئ مستقل) */
export const AGENT_SECTIONS: { key: AgentSectionKey; label: string; description: string; icon: LucideIcon }[] = [
  {
    key: "overview",
    label: "نظرة الوكيل",
    description: "العوم والعمولات والطلبات المعلقة",
    icon: Gauge,
  },
  {
    key: "queue",
    label: "طابور العمليات",
    description: "إتمام الإيداعات والسحوبات ودفع الحوالات",
    icon: ListChecks,
  },
  {
    key: "commissions",
    label: "العمولات",
    description: "سجل عمولاتي المستحقّة",
    icon: Coins,
  },
];
