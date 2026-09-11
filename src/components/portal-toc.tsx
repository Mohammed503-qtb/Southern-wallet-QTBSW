"use client";

/**
 * فهرس محتويات الوثيقة + خطاف تتبع العنوان النشط — محفظة الجنوب
 * مشترك بين الفهرس الجانبي (سطح المكتب) وفهرس الجوال داخل الترويسة
 */

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/doc-utils";
import { cn } from "@/lib/utils";

/** تتبع العنوان المرئي داخل نطاق القراءة أثناء التمرير */
export function useActiveHeading(toc: TocItem[]): string {
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    if (toc.length === 0) return;
    const headings = document.querySelectorAll<HTMLElement>(
      "h1[id], h2[id], h3[id]"
    );
    if (headings.length === 0) return;
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
  }, [toc]);

  return activeId;
}

export function TocList({
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
