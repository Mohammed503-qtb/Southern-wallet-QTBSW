/**
 * بيان بوثائق مشروع محفظة الجنوب — الخادم فقط
 * يقرأ ملفات Markdown من مجلد docs ويجهّز البيانات الوصفية
 */

import fs from "node:fs";
import path from "node:path";
import { computeStats, extractToc, type DocStats, type TocItem } from "./doc-utils";

export type DocIconKey =
  | "FileText"
  | "Users"
  | "Boxes"
  | "Database"
  | "Braces"
  | "Smartphone"
  | "Map"
  | "Rocket"
  | "ShieldCheck";

export type StatKey = keyof DocStats;

export interface HeroStat {
  key: StatKey;
  label: string;
}

export interface DocMeta {
  id: string;
  step: number;
  file: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  icon: DocIconKey;
  stats: DocStats;
  tocCount: number;
  hero: HeroStat[];
}

/** الوثيقة النشطة: بيانات وصفية + محتوى + فهرس (المحتوى يُعرض خادمياً فقط) */
export interface LoadedDoc {
  meta: DocMeta;
  content: string;
  toc: TocItem[];
}

interface DocDefinition {
  id: string;
  step: number;
  file: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  icon: DocIconKey;
  hero: HeroStat[];
}

export const DOC_DEFINITIONS: DocDefinition[] = [
  {
    id: "srs",
    step: 1,
    file: "SRS.md",
    title: "وثيقة المتطلبات البرمجية (SRS)",
    shortTitle: "SRS",
    subtitle: "المرجع التعاقدي الحاكم — معيار IEEE 830 مكيّف",
    icon: "FileText",
    hero: [
      { key: "requirements", label: "متطلب موثّق بمعرّف" },
      { key: "functional", label: "متطلب وظيفي FR" },
      { key: "nonFunctional", label: "متطلب غير وظيفي NFR" },
      { key: "sections", label: "قسماً وعنواناً" },
    ],
  },
  {
    id: "stories",
    step: 2,
    file: "USER_STORIES.md",
    title: "قصص المستخدمين",
    shortTitle: "User Stories",
    subtitle: "قصص لعشرة أدوار بمعايير قبول قابلة للاختبار — منهجية INVEST",
    icon: "Users",
    hero: [
      { key: "stories", label: "قصة مستخدم" },
      { key: "sections", label: "قسماً" },
      { key: "words", label: "كلمة" },
      { key: "lines", label: "سطراً" },
    ],
  },
  {
    id: "architecture",
    step: 3,
    file: "ARCHITECTURE.md",
    title: "المعمارية التقنية الكاملة",
    shortTitle: "Architecture",
    subtitle: "NestJS Modular Monolith — Flutter Clean Architecture — 24 وحدة معمارية",
    icon: "Boxes",
    hero: [
      { key: "adrs", label: "قراراً معمارياً ADR" },
      { key: "sections", label: "قسماً" },
      { key: "words", label: "كلمة" },
      { key: "lines", label: "سطراً" },
    ],
  },
  {
    id: "database",
    step: 4,
    file: "DATABASE_ERD.md",
    title: "مخطط قاعدة البيانات وERD",
    shortTitle: "Database & ERD",
    subtitle: "PostgreSQL 15+ — Double-Entry Ledger — DDL كامل بقيود وفهارس",
    icon: "Database",
    hero: [
      { key: "sqlTables", label: "جدولاً (CREATE TABLE)" },
      { key: "enums", label: "نوع ENUM" },
      { key: "sections", label: "قسماً" },
      { key: "lines", label: "سطراً" },
    ],
  },
  {
    id: "api",
    step: 5,
    file: "API_ENDPOINTS.md",
    title: "نقاط النهاية (REST API)",
    shortTitle: "REST API",
    subtitle: "عقود REST كاملة — Quote→Confirm — Idempotency — غلاف استجابة موحد",
    icon: "Braces",
    hero: [
      { key: "endpoints", label: "نقطة نهاية" },
      { key: "sections", label: "قسماً" },
      { key: "words", label: "كلمة" },
      { key: "lines", label: "سطراً" },
    ],
  },
  {
    id: "screens",
    step: 6,
    file: "SCREENS_FLOWS.md",
    title: "الشاشات وتدفقات المستخدم",
    shortTitle: "Screens & Flows",
    subtitle: "RTL أولاً — حالات واجهة إلزامية — ربط عمودي FR/API/US لكل شاشة",
    icon: "Smartphone",
    hero: [
      { key: "screens", label: "شاشة" },
      { key: "flows", label: "تدفقاً رئيسياً" },
      { key: "sections", label: "قسماً" },
      { key: "lines", label: "سطراً" },
    ],
  },
  {
    id: "roadmap",
    step: 7,
    file: "ROADMAP.md",
    title: "خارطة الطريق المرحلية",
    shortTitle: "Roadmap",
    subtitle: "MVP ← Beta ← Launch — متوافقة مع Master PLAN §128 ومعايير DoD",
    icon: "Map",
    hero: [
      { key: "sections", label: "قسماً" },
      { key: "requirements", label: "مرجع AC/RK/A موثّق" },
      { key: "words", label: "كلمة" },
      { key: "lines", label: "سطراً" },
    ],
  },
  {
    id: "deployment",
    step: 8,
    file: "DEPLOYMENT.md",
    title: "دليل النشر الفعلي",
    shortTitle: "Deployment",
    subtitle: "Docker + Caddy HTTPS — النسخ الاحتياطي — التحديث والتراجع — قائمة M-7",
    icon: "Rocket",
    hero: [
      { key: "sections", label: "قسماً" },
      { key: "lines", label: "سطراً" },
      { key: "words", label: "كلمة" },
    ],
  },
  {
    id: "readiness",
    step: 9,
    file: "PRODUCTION_READINESS.md",
    title: "جهوزية الإنتاج والفجوات المفتوحة",
    shortTitle: "Readiness",
    subtitle: "موضعنا في الخارطة — الفجوات الحرجة — خطة الإغلاق حتى الإطلاق",
    icon: "ShieldCheck",
    hero: [
      { key: "sections", label: "قسماً" },
      { key: "lines", label: "سطراً" },
      { key: "words", label: "كلمة" },
    ],
  },
];

const DOCS_DIR = path.join(process.cwd(), "docs");

function readDoc(def: DocDefinition): DocMeta {
  const filePath = path.join(DOCS_DIR, def.file);
  const content = fs.readFileSync(filePath, "utf8");
  const stats = computeStats(content);
  const tocCount = extractToc(content).length;
  return {
    id: def.id,
    step: def.step,
    file: def.file,
    title: def.title,
    shortTitle: def.shortTitle,
    subtitle: def.subtitle,
    icon: def.icon,
    stats,
    tocCount,
    hero: def.hero,
  };
}

/** بيانات جميع الوثائق (دون المحتوى) — للتنقل والنظرة العامة */
export function loadDocMetas(): DocMeta[] {
  return DOC_DEFINITIONS.map(readDoc);
}

/** الوثيقة النشطة بمحتواها وفهرسها — أو null إن كانت نظرة عامة/معرّف غير معروف */
export function loadActiveDoc(docId: string): LoadedDoc | null {
  const def = DOC_DEFINITIONS.find((d) => d.id === docId);
  if (!def) return null;
  const content = fs.readFileSync(path.join(DOCS_DIR, def.file), "utf8");
  const meta = readDoc(def);
  return { meta, content, toc: extractToc(content) };
}
