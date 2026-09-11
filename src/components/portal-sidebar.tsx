"use client";

/**
 * الشريط الجانبي لبوابة الوثائق — محفظة الجنوب
 * قائمة الوثائق السبع + فهرس الوثيقة النشطة مع تتبع القسم المرئي
 */

import { LayoutDashboard, List } from "lucide-react";
import { TocList, useActiveHeading } from "@/components/portal-toc";
import type { DocIconKey, DocMeta } from "@/lib/docs-manifest";
import type { TocItem } from "@/lib/doc-utils";
import {
  Boxes,
  Braces,
  Database,
  FileText,
  Map as MapIcon,
  Smartphone,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<DocIconKey, LucideIcon> = {
  FileText,
  Users,
  Boxes,
  Database,
  Braces,
  Smartphone,
  Map: MapIcon,
};

function DocNavItem({
  doc,
  isActive,
}: {
  doc: DocMeta;
  isActive: boolean;
}) {
  const Icon = ICONS[doc.icon];
  return (
    <a
      href={`/?doc=${doc.id}`}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors",
        isActive
          ? "border border-[#C9A227]/40 bg-[#C9A227]/10"
          : "border border-transparent hover:bg-stone-100"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold tabular-nums",
          isActive
            ? "bg-[#C9A227] text-white shadow-sm"
            : "bg-stone-100 text-stone-500 group-hover:bg-[#C9A227]/20 group-hover:text-[#8a6d1d]"
        )}
      >
        {doc.step}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm font-bold leading-5",
            isActive ? "text-[#0B0B0C]" : "text-stone-700 group-hover:text-[#0B0B0C]"
          )}
        >
          {doc.title}
        </span>
        <span className="block truncate text-[11px] text-stone-500">
          {doc.file} · {doc.tocCount} قسماً
        </span>
      </span>
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          isActive ? "text-[#8a6d1d]" : "text-stone-400 group-hover:text-[#C9A227]"
        )}
        aria-hidden="true"
      />
    </a>
  );
}

export function PortalSidebar({
  docs,
  active,
  toc,
}: {
  docs: DocMeta[];
  active: DocMeta | null;
  toc: TocItem[];
}) {
  const activeHeading = useActiveHeading(toc);

  return (
    <aside className="no-print hidden w-80 shrink-0 lg:block">
      <div className="sticky top-24 flex max-h-[calc(100vh-120px)] flex-col gap-4">
        {/* قائمة الوثائق */}
        <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2 border-b border-stone-100 px-2 pb-2 pt-1">
            <LayoutDashboard className="h-4 w-4 text-[#8a6d1d]" aria-hidden="true" />
            <span className="text-sm font-bold text-[#0B0B0C]">
              وثائق المشروع
            </span>
            <span className="ms-auto rounded-full bg-[#C9A227]/10 px-2 py-0.5 text-[11px] font-bold text-[#8a6d1d] tabular-nums">
              7 من 7 ✔
            </span>
          </div>
          <div className="space-y-1">
            <a
              href="/?doc=overview"
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors",
                !active
                  ? "border border-[#C9A227]/40 bg-[#C9A227]/10"
                  : "border border-transparent hover:bg-stone-100"
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500">
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold leading-5 text-[#0B0B0C]">
                  نظرة عامة
                </span>
                <span className="block truncate text-[11px] text-stone-500">
                  حالة المشروع والخطة الكاملة
                </span>
              </span>
            </a>
            {docs.map((doc) => (
              <DocNavItem key={doc.id} doc={doc} isActive={active?.id === doc.id} />
            ))}
          </div>
        </div>

        {/* فهرس الوثيقة النشطة */}
        {toc.length > 0 && (
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 border-b border-stone-100 pb-2">
              <List className="h-4 w-4 text-[#8a6d1d]" aria-hidden="true" />
              <span className="text-sm font-bold text-[#0B0B0C]">
                محتويات الوثيقة
              </span>
              <span className="ms-auto rounded-full bg-[#C9A227]/10 px-2 py-0.5 text-[11px] font-bold text-[#8a6d1d] tabular-nums">
                {toc.length}
              </span>
            </div>
            <div className="gold-scroll min-h-0 flex-1 overflow-y-auto pl-1">
              <TocList items={toc} activeId={activeHeading} />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
