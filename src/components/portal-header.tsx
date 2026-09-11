"use client";

/**
 * ترويسة بوابة الوثائق — محفظة الجنوب
 * العلامة + عنوان الوثيقة + شريط تنقّل الوثائق للجوال + فهرس جوال قابل للطي
 */

import { useState } from "react";
import { LayoutDashboard, List, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TocList, useActiveHeading } from "@/components/portal-toc";
import type { DocMeta } from "@/lib/docs-manifest";
import type { TocItem } from "@/lib/doc-utils";
import { cn } from "@/lib/utils";

export function PortalHeader({
  docs,
  active,
  toc,
}: {
  docs: DocMeta[];
  active: DocMeta | null;
  toc: TocItem[];
}) {
  const [tocOpen, setTocOpen] = useState(false);
  const activeHeading = useActiveHeading(toc);

  return (
    <header className="no-print sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <a href="/?doc=overview" className="flex min-w-0 items-center gap-3">
          <img
            src="/logo.jpg"
            alt="شعار محفظة الجنوب"
            className="h-10 w-10 rounded-lg border border-stone-200 bg-white object-cover shadow-sm"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-extrabold leading-tight text-[#0B0B0C] sm:text-lg">
              محفظة الجنوب
            </span>
            <span className="block truncate text-[11px] text-stone-500 sm:text-xs">
              {active
                ? `الخطوة ${active.step} من 7 — ${active.title}`
                : "بوابة وثائق المشروع — نظرة عامة"}
            </span>
          </span>
        </a>

        <span className="ms-auto flex items-center gap-2">
          {toc.length > 0 && (
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
          )}
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            طباعة
          </Button>
        </span>
      </div>

      {/* شريط تنقّل الوثائق — الجوال */}
      <nav
        aria-label="التنقل بين وثائق المشروع"
        className="gold-scroll flex items-center gap-2 overflow-x-auto border-t border-stone-100 px-4 py-2 lg:hidden"
      >
        <a
          href="/?doc=overview"
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
            !active
              ? "border-[#C9A227] bg-[#C9A227] text-white"
              : "border-stone-200 bg-white text-stone-600 hover:border-[#C9A227]/50 hover:text-[#8a6d1d]"
          )}
        >
          <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
          نظرة عامة
        </a>
        {docs.map((doc) => (
          <a
            key={doc.id}
            href={`/?doc=${doc.id}`}
            aria-current={active?.id === doc.id ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
              active?.id === doc.id
                ? "border-[#C9A227] bg-[#C9A227] text-white"
                : "border-stone-200 bg-white text-stone-600 hover:border-[#C9A227]/50 hover:text-[#8a6d1d]"
            )}
          >
            <span className="tabular-nums">{doc.step}</span>
            {doc.shortTitle}
          </a>
        ))}
      </nav>

      {/* فهرس الجوال */}
      {tocOpen && toc.length > 0 && (
        <div
          id="mobile-toc"
          className="gold-scroll max-h-[60vh] overflow-y-auto border-t border-stone-200 bg-white px-4 py-3 lg:hidden"
        >
          <p className="mb-2 text-xs font-bold text-stone-500">
            محتويات {active?.title} ({toc.length} قسماً)
          </p>
          <TocList
            items={toc}
            activeId={activeHeading}
            onNavigate={() => setTocOpen(false)}
          />
        </div>
      )}
    </header>
  );
}
