"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Building2,
  FileText,
  Hash,
  Layers,
  List,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractText, headingId, type DocStats, type TocItem } from "@/lib/doc-utils";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  قائمة الفهرس                                                       */
/* ------------------------------------------------------------------ */

function TocList({
  items,
  activeId,
  onNavigate,
}: {
  items: TocItem[];
  activeId: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="فهرس محتويات الوثيقة">
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={onNavigate}
              aria-current={activeId === item.id ? "true" : undefined}
              className={cn(
                "block truncate rounded-md border-r-2 py-1.5 pr-3 text-sm leading-6 transition-colors",
                "border-transparent text-stone-600 hover:bg-stone-100 hover:text-[#8a6d1d]",
                item.level === 1 && "pr-3 font-bold text-[#0B0B0C]",
                item.level === 2 && "pr-7 font-medium",
                item.level === 3 && "pr-11 text-xs text-stone-500",
                activeId === item.id &&
                  "border-[#C9A227] bg-[#C9A227]/10 font-semibold text-[#8a6d1d]"
              )}
              title={item.title}
            >
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/*  مكوّنات تنسيق Markdown                                              */
/* ------------------------------------------------------------------ */

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1
      id={headingId(extractText(children))}
      className="scroll-mt-24 border-b-2 border-[#C9A227]/40 pb-3 pt-10 text-2xl font-extrabold leading-snug text-[#0B0B0C] first:pt-0 sm:text-3xl"
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      id={headingId(extractText(children))}
      className="scroll-mt-24 mt-10 border-r-4 border-[#C9A227] pr-3 text-xl font-bold leading-relaxed text-[#0B0B0C] sm:text-2xl"
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      id={headingId(extractText(children))}
      className="scroll-mt-24 mt-8 text-lg font-bold text-[#1C1917] sm:text-xl"
    >
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4
      id={headingId(extractText(children))}
      className="scroll-mt-24 mt-6 text-base font-bold text-[#292524]"
    >
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="mt-4 leading-8 text-[#292524] sm:leading-9">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-bold text-[#0B0B0C]">{children}</strong>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      className="font-medium text-[#8a6d1d] underline decoration-[#C9A227]/50 underline-offset-4 hover:text-[#C9A227]"
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="mt-4 list-disc space-y-2 pr-6 pl-2 leading-8 marker:text-[#C9A227]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-4 list-decimal space-y-2 pr-6 pl-2 leading-8 marker:font-semibold marker:text-[#8a6d1d]">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pr-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mt-6 rounded-l-xl border-r-4 border-[#C9A227] bg-[#C9A227]/[0.07] py-2 pr-4 pl-4 text-[#44403C]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-8 border-t border-stone-200" />,
  table: ({ children }) => (
    <div className="gold-scroll mt-6 overflow-x-auto rounded-xl border border-stone-200 shadow-sm">
      <table className="w-full min-w-[520px] border-collapse text-right text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[#F7F4E9] text-right">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="border-b border-stone-200 px-3 py-2.5 text-right font-bold text-[#0B0B0C]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-stone-100 px-3 py-2.5 align-top leading-7 text-[#292524]">
      {children}
    </td>
  ),
  code: ({ children }) => {
    const text = extractText(children);
    if (text.includes("\n")) {
      return (
        <code dir="ltr" className="block whitespace-pre text-left font-mono text-xs leading-6 text-[#F5F5F4] sm:text-sm">
          {children}
        </code>
      );
    }
    return (
      <code
        dir="ltr"
        className="mx-0.5 inline-block rounded-md border border-[#C9A227]/25 bg-[#C9A227]/[0.08] px-1.5 py-0.5 font-mono text-[0.85em] font-semibold text-[#6b5416]"
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre dir="ltr" className="gold-scroll mt-6 overflow-x-auto rounded-xl bg-[#1C1917] p-4 text-left shadow-inner">
      {children}
    </pre>
  ),
};

/* ------------------------------------------------------------------ */
/*  بطاقة إحصائية                                                      */
/* ------------------------------------------------------------------ */

function StatCard({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Hash;
  value: number | string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#C9A227]/10 text-[#8a6d1d]">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="text-lg font-extrabold tabular-nums leading-6 text-[#0B0B0C]">
          {value}
        </div>
        <div className="truncate text-[11px] text-stone-500">{label}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  العارض الرئيسي                                                     */
/* ------------------------------------------------------------------ */

export function SrsViewer({
  content,
  toc,
  stats,
}: {
  content: string;
  toc: TocItem[];
  stats: DocStats;
}) {
  const [activeId, setActiveId] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  /* شريط تقدم القراءة + زر العودة للأعلى */
  useEffect(() => {
    const onScroll = () => {
      const total =
        document.documentElement.scrollHeight - window.innerHeight;
      setProgress(total > 0 ? Math.min(100, (window.scrollY / total) * 100) : 0);
      setShowTop(window.scrollY > 600);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* تتبع القسم النشط أثناء التمرير */
  useEffect(() => {
    const headings =
      contentRef.current?.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id]") ?? [];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = new Map<string, number>();
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.set(entry.target.id, entry.boundingClientRect.top);
          }
        }
        if (visible.size > 0) {
          const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0][0];
          setActiveId(top);
        }
      },
      { rootMargin: "-12% 0px -72% 0px", threshold: 0 }
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [content]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const mainToc = useMemo(() => toc, [toc]);

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF9F6]">
      {/* شريط تقدم القراءة */}
      <div className="no-print fixed inset-x-0 top-0 z-50 h-1">
        <div
          className="h-full bg-gradient-to-l from-[#C9A227] via-[#d4b64a] to-[#8a6d1d] transition-[width] duration-150"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-label="تقدم قراءة الوثيقة"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* الترويسة */}
      <header className="no-print sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <img
            src="/logo.jpg"
            alt="شعار محفظة الجنوب"
            className="h-10 w-10 rounded-lg border border-stone-200 bg-white object-cover shadow-sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold leading-tight text-[#0B0B0C] sm:text-lg">
              محفظة الجنوب
            </p>
            <p className="truncate text-[11px] text-stone-500 sm:text-xs">
              وثيقة المتطلبات البرمجية SRS — الإصدار 1.0
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() => setTocOpen((v) => !v)}
            aria-expanded={tocOpen}
            aria-controls="mobile-toc"
          >
            <List className="h-4 w-4" aria-hidden="true" />
            الفهرس
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            طباعة
          </Button>
        </div>

        {/* فهرس الجوال */}
        {tocOpen && (
          <div
            id="mobile-toc"
            className="gold-scroll max-h-[60vh] overflow-y-auto border-t border-stone-200 bg-white px-4 py-3 lg:hidden"
          >
            <p className="mb-2 text-xs font-bold text-stone-500">
              محتويات الوثيقة ({mainToc.length} قسماً)
            </p>
            <TocList
              items={mainToc}
              activeId={activeId}
              onNavigate={() => setTocOpen(false)}
            />
          </div>
        )}
      </header>

      {/* المحتوى */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4 py-8 sm:px-6 lg:py-10 print-full">
        {/* الفهرس الجانبي — سطح المكتب */}
        <aside className="no-print hidden w-72 shrink-0 lg:block">
          <div className="sticky top-24 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 border-b border-stone-100 pb-2">
              <Layers className="h-4 w-4 text-[#8a6d1d]" aria-hidden="true" />
              <span className="text-sm font-bold text-[#0B0B0C]">
                محتويات الوثيقة
              </span>
              <span className="ms-auto rounded-full bg-[#C9A227]/10 px-2 py-0.5 text-[11px] font-bold text-[#8a6d1d] tabular-nums">
                {mainToc.length}
              </span>
            </div>
            <div className="gold-scroll max-h-[calc(100vh-220px)] overflow-y-auto pl-1">
              <TocList items={mainToc} activeId={activeId} />
            </div>
          </div>
        </aside>

        {/* الوثيقة */}
        <main className="min-w-0 flex-1">
          {/* غلاف الوثيقة */}
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
                <h2 className="text-2xl font-extrabold leading-snug text-[#0B0B0C] sm:text-4xl">
                  وثيقة المتطلبات البرمجية
                </h2>
                <p className="mt-2 text-base font-bold text-[#8a6d1d] sm:text-xl">
                  محفظة الجنوب — South Wallet
                </p>
                <p className="mt-1 text-xs text-stone-500 sm:text-sm">
                  منظومة مالية رقمية متكاملة لجنوب اليمن — Android + iOS
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C9A227]/30 bg-[#C9A227]/10 px-3 py-1 text-xs font-bold text-[#8a6d1d]">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  SRS — معيار IEEE 830
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-600">
                  <Hash className="h-3.5 w-3.5" aria-hidden="true" />
                  com.janoub.wallet
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-600">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  مسودة v1.0 — بانتظار الاعتماد
                </span>
              </div>

              <div className="mt-2 grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  icon={Hash}
                  value={stats.requirements}
                  label="متطلب موثّق بمعرّف"
                />
                <StatCard
                  icon={Building2}
                  value={stats.functional}
                  label="متطلب وظيفي FR"
                />
                <StatCard
                  icon={ShieldCheck}
                  value={stats.nonFunctional}
                  label="متطلب غير وظيفي NFR"
                />
                <StatCard
                  icon={Layers}
                  value={stats.sections}
                  label="قسم وعنوان"
                />
              </div>
            </div>
          </section>

          {/* متن الوثيقة */}
          <article
            ref={contentRef}
            className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8 lg:p-10 print-full"
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {content}
            </ReactMarkdown>
          </article>

          {/* خاتمة الخطوة */}
          <div className="mt-6 rounded-2xl border border-[#C9A227]/30 bg-[#C9A227]/[0.06] p-5 text-center sm:p-6">
            <p className="text-sm font-bold text-[#0B0B0C] sm:text-base">
              اكتملت الخطوة 1 من 8 — وثيقة المتطلبات البرمجية SRS
            </p>
            <p className="mt-1 text-xs leading-6 text-stone-600 sm:text-sm">
              بانتظار تأكيدكم لبدء الخطوة 2: كتابة User Stories لكل دور (عميل،
              وكيل، تاجر، مشرف نظام، موظف دعم، مدقق KYC ومكافحة احتيال).
            </p>
          </div>
        </main>
      </div>

      {/* زر العودة للأعلى */}
      {showTop && (
        <button
          type="button"
          onClick={scrollToTop}
          aria-label="العودة إلى أعلى الوثيقة"
          className="no-print fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-[#C9A227]/30 bg-white text-[#8a6d1d] shadow-lg transition-transform hover:scale-105 hover:bg-[#C9A227]/10"
        >
          <ArrowUp className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      {/* التذييل */}
      <footer className="no-print mt-auto border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-center text-xs text-stone-500 sm:flex-row sm:px-6 sm:text-right">
          <p className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rotate-45 bg-[#C9A227]"
            />
            <span className="font-bold text-[#0B0B0C]">محفظة الجنوب</span>
            <span className="text-stone-400">|</span>
            وثيقة SRS v1.0 — مرجع مشروع محفظة مالية رقمية
          </p>
          <p className="tabular-nums">
            الخطوة 1 من 8: SRS ✔ — التالية: User Stories بعد التأكيد
          </p>
        </div>
      </footer>
    </div>
  );
}
