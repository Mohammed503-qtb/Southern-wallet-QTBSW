"use client";

/**
 * نظرة عامة على مشروع محفظة الجنوب — لوحة حالة التوثيق
 * مكوّن عميل: بطاقات المراحل السبع + مؤشرات المشروع + القرارات المعلقة
 */

import {
  ArrowLeft,
  Boxes,
  Braces,
  CheckCircle2,
  ClipboardList,
  Database,
  FileText,
  Flag,
  Map as MapIcon,
  Smartphone,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { DocIconKey, DocMeta } from "@/lib/docs-manifest";

const ICONS: Record<DocIconKey, LucideIcon> = {
  FileText,
  Users,
  Boxes,
  Database,
  Braces,
  Smartphone,
  Map: MapIcon,
};

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function OverviewView({ docs }: { docs: DocMeta[] }) {
  const byId = (id: string) => docs.find((d) => d.id === id);
  const srs = byId("srs");
  const stories = byId("stories");
  const architecture = byId("architecture");
  const database = byId("database");
  const api = byId("api");
  const screens = byId("screens");
  const totalLines = docs.reduce((sum, d) => sum + d.stats.lines, 0);

  const kpis = [
    { value: srs?.stats.functional ?? 0, label: "متطلب وظيفي FR" },
    { value: srs?.stats.nonFunctional ?? 0, label: "متطلب غير وظيفي NFR" },
    { value: stories?.stats.stories ?? 0, label: "قصة مستخدم" },
    { value: architecture?.stats.adrs ?? 0, label: "قراراً معمارياً ADR" },
    { value: database?.stats.sqlTables ?? 0, label: "جدول قاعدة بيانات" },
    { value: api?.stats.endpoints ?? 0, label: "نقطة نهاية API" },
    { value: screens?.stats.screens ?? 0, label: "شاشة" },
    { value: totalLines, label: "سطر توثيق هندسي" },
  ];

  return (
    <div className="space-y-6">
      {/* الغلاف */}
      <section className="relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-[#C9A227]/10 blur-3xl"
        />
        <div className="relative flex flex-col items-center gap-4 text-center sm:gap-6">
          <img
            src="/logo.jpg"
            alt="شعار محفظة الجنوب — نجمة هندسية ثمانية"
            className="h-24 w-24 rounded-2xl border border-stone-200 bg-white object-cover shadow-md sm:h-28 sm:w-28"
          />
          <div>
            <h1 className="text-2xl font-extrabold leading-snug text-[#0B0B0C] sm:text-4xl">
              محفظة الجنوب — South Wallet
            </h1>
            <p className="mt-2 text-sm font-bold text-[#8a6d1d] sm:text-lg">
              بوابة وثائق المشروع — التوثيق الهندسي الكامل (الخطوات 1–7)
            </p>
            <p className="mt-1 text-xs leading-6 text-stone-500 sm:text-sm">
              منظومة مالية رقمية متكاملة لجنوب اليمن — Android + iOS (Flutter)
              + Backend (NestJS + PostgreSQL) + لوحة إدارة RTL
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {[
              "com.janoub.wallet",
              "8 محافظات جنوبية",
              "10 أدوار (3 موبايل + 7 إدارية)",
              "YER / SAR / USD",
              "RTL أولاً",
            ].map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-600"
              >
                {badge}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 rounded-full border border-[#C9A227]/30 bg-[#C9A227]/[0.08] px-4 py-1.5">
            <CheckCircle2 className="h-4 w-4 text-[#8a6d1d]" aria-hidden="true" />
            <span className="text-xs font-bold text-[#8a6d1d] sm:text-sm">
              اكتملت جميع المراحل التوثيقية — بانتظار الاعتماد للانتقال إلى التنفيذ
            </span>
          </div>
        </div>
      </section>

      {/* مؤشرات المشروع */}
      <section aria-label="مؤشرات التوثيق">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="min-w-0">
                <div className="text-lg font-extrabold tabular-nums leading-6 text-[#0B0B0C]">
                  {formatNumber(kpi.value)}
                </div>
                <div className="truncate text-[11px] text-stone-500">{kpi.label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* بطاقات المراحل */}
      <section aria-label="وثائق المشروع">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-[#8a6d1d]" aria-hidden="true" />
          <h2 className="text-lg font-extrabold text-[#0B0B0C] sm:text-xl">
            خطة التسليم — 7 خطوات مكتملة
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {docs.map((doc) => {
            const Icon = ICONS[doc.icon];
            return (
              <a
                key={doc.id}
                href={`/?doc=${doc.id}`}
                className="group flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#C9A227]/50 hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C9A227]/10 text-[#8a6d1d]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-stone-400">
                      الخطوة {doc.step} من 7
                    </p>
                    <h3 className="truncate text-base font-extrabold leading-6 text-[#0B0B0C]">
                      {doc.title}
                    </h3>
                  </div>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#C9A227] text-xs font-extrabold text-white tabular-nums">
                    {doc.step}
                  </span>
                </div>

                <p className="mt-3 flex-1 text-xs leading-6 text-stone-600">
                  {doc.subtitle}
                </p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {doc.hero.slice(0, 3).map((h) => (
                    <span
                      key={h.key}
                      className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-bold text-stone-600 tabular-nums"
                    >
                      {formatNumber(doc.stats[h.key])}
                      <span className="font-medium text-stone-400">{h.label}</span>
                    </span>
                  ))}
                </div>

                <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#8a6d1d] transition-colors group-hover:text-[#C9A227]">
                  فتح الوثيقة
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </a>
            );
          })}

          {/* الخطوة 8 — التنفيذ */}
          <div className="flex flex-col rounded-2xl border-2 border-dashed border-[#C9A227]/40 bg-[#C9A227]/[0.04] p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C9A227]/15 text-[#8a6d1d]">
                <Flag className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-[#a2842e]">
                  الخطوة 8 من 8
                </p>
                <h3 className="text-base font-extrabold leading-6 text-[#0B0B0C]">
                  البناء والتنفيذ (MVP)
                </h3>
              </div>
              <span className="flex h-7 shrink-0 items-center justify-center rounded-full border border-[#C9A227]/40 bg-white px-2 text-[10px] font-extrabold text-[#8a6d1d]">
                التالية
              </span>
            </div>
            <p className="mt-3 flex-1 text-xs leading-6 text-stone-600">
              تنفيذ Flutter + NestJS + PostgreSQL وفق المعمارية المعتمدة،
              وترتيب المراحل في خارطة الطريق (Internal Alpha ثم Closed Beta ثم
              الإطلاق التجاري).
            </p>
            <a
              href="/?doc=roadmap"
              className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#8a6d1d] hover:text-[#C9A227]"
            >
              مراجعة خارطة الطريق قبل البدء
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      {/* القرارات المعلقة */}
      <section
        aria-label="قرارات بانتظار صاحب المنتج"
        className="rounded-2xl border border-[#C9A227]/30 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#8a6d1d]" aria-hidden="true" />
          <h2 className="text-base font-extrabold text-[#0B0B0C] sm:text-lg">
            قرارات بانتظار اعتماد صاحب المنتج
          </h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            {
              title: "نمط التشغيل في Internal Alpha (D-01)",
              desc: "أموال حقيقية بمبالغ صغيرة مقابل نظام نقدي مغلق — موثقة بمزايا ومخاطر كل خيار",
              doc: "roadmap",
              docName: "خارطة الطريق",
            },
            {
              title: "أولوية الدفع للتاجر (Must / Beta)",
              desc: "القصص صنّفت الدفع Must مع مرحلة Beta وفق ملحق ج — يحتاج تأكيداً نهائياً",
              doc: "stories",
              docName: "قصص المستخدمين",
            },
            {
              title: "العملات الرقمية (FR-CRY)",
              desc: "قرار مستقل بعد الإطلاق، مشروط بطبقة Custody مستقلة ومراجعة أمنية خارجية",
              doc: "roadmap",
              docName: "خارطة الطريق",
            },
            {
              title: "جدول التوسع الجغرافي (D-05)",
              desc: "ترتيب فتح المحافظات الثماني مرهون بجاهزية الوكلاء ورصيد Float لكل خطوة",
              doc: "roadmap",
              docName: "خارطة الطريق",
            },
          ].map((item) => (
            <a
              key={item.title}
              href={`/?doc=${item.doc}`}
              className="group rounded-xl border border-stone-200 bg-stone-50/60 p-4 transition-colors hover:border-[#C9A227]/50 hover:bg-[#C9A227]/[0.05]"
            >
              <p className="text-sm font-bold text-[#0B0B0C]">{item.title}</p>
              <p className="mt-1 text-xs leading-6 text-stone-600">{item.desc}</p>
              <p className="mt-2 text-[11px] font-bold text-[#8a6d1d] group-hover:text-[#C9A227]">
                التفاصيل في: {item.docName}
              </p>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
