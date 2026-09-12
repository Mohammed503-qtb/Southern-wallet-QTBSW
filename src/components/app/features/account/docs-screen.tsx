/**
 * محفظة الجنوب — عارض الوثائق الهندسية داخل التطبيق (X1/X2)
 * شريط علوي (رجوع + عنوان + شارة عدد) → قائمة الوثائق السبع (X1: بطاقة
 * لكل وثيقة: الرقم/العنوان/الوصف/عدد الأسطر) → نقر وثيقة → GET /api/docs/:slug
 * (X2) ثم عرض markdown عبر DocsMarkdown + زر «تنزيل .md» (blob).
 * يفتح وثيقة مباشرة إن مُرِّر params.slug، مع تمرير داخلي سلس وزر عودة للقائمة.
 */
"use client";

import { useState } from "react";
import {
  BookOpen,
  Boxes,
  Braces,
  ChevronRight,
  Database,
  Download,
  FileText,
  Map as MapIcon,
  Rocket,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import type { DocMetaView } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui";
import { ErrorState } from "@/components/app/ui/error-state";
import { Skeleton } from "@/components/app/ui/skeleton";
import { DocsMarkdown } from "./docs-markdown";
import { downloadTextFile } from "./account-shared";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/** استجابة X2 */
interface DocPayload {
  meta: DocMetaView;
  content: string;
}

/** أيقونة كل وثيقة حسب المعرّف (نفس دلالات بيان الوثائق) */
const DOC_ICONS: Record<string, LucideIcon> = {
  srs: FileText,
  stories: Users,
  architecture: Boxes,
  database: Database,
  api: Braces,
  screens: Smartphone,
  roadmap: MapIcon,
  deployment: Rocket,
  readiness: ShieldCheck,
};

export function DocsScreen() {
  const params = useAppStore((s) => s.params);
  const back = useAppStore((s) => s.back);

  // الوثيقة المفتوحة (تُهيَّأ من params.slug إن مُرِّر)
  const [slug, setSlug] = useState<string | null>(params.slug ?? null);

  const list = useApiData<DocMetaView[]>("/api/docs");

  // الوثيقة الفعالة: تُفتح فقط إذا كان slug ضمن بيان X1 (مشتق — بلا تأثير جانبي)
  const activeSlug =
    slug !== null && list.data !== null && !list.data.some((d) => d.id === slug)
      ? null
      : slug;
  const doc = useApiData<DocPayload>(
    activeSlug ? `/api/docs/${encodeURIComponent(activeSlug)}` : null,
  );

  /** تنزيل الوثيقة الحالية بصيغة .md */
  const downloadMd = () => {
    if (!doc.data) return;
    const { meta, content } = doc.data;
    downloadTextFile(
      `${meta.id}-${meta.shortTitle}.md`,
      `\uFEFF${content}`,
      "text/markdown;charset=utf-8",
    );
    toast({
      title: "تم تنزيل الوثيقة",
      description: `${meta.title} · ${meta.lines.toLocaleString("en-US")} سطراً`,
    });
  };

  const inDoc = activeSlug !== null;

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-8">
      {/* ===== الشريط العلوي ===== */}
      <header className="flex items-center gap-2 pb-1 pt-2">
        <button
          type="button"
          onClick={() => {
            if (inDoc) setSlug(null);
            else back();
          }}
          aria-label={inDoc ? "العودة لقائمة الوثائق" : "رجوع"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#E8E6E1] bg-white text-[#141416] transition-colors hover:bg-[#F7F6F2]"
        >
          <ChevronRight strokeWidth={1.5} className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-bold leading-[30px] text-[#141416]">
            {inDoc ? (doc.data?.meta.shortTitle ?? "وثيقة") : "الوثائق الهندسية"}
          </h1>
          <p className="truncate text-[13px] font-medium text-[#5C5A56]">
            {inDoc
              ? (doc.data?.meta.title ?? "جارٍ التحميل…")
              : "توثيق مشروع محفظة الجنوب كاملاً — داخل التطبيق"}
          </p>
        </div>
        {inDoc ? (
          <button
            type="button"
            onClick={downloadMd}
            disabled={!doc.data}
            aria-label="تنزيل الوثيقة بصيغة markdown"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#C9A227]/40 bg-[#C9A227]/[0.08] text-[#8A6E14] transition-colors hover:bg-[#C9A227]/[0.16] disabled:opacity-50"
          >
            <Download strokeWidth={1.5} className="h-5 w-5" />
          </button>
        ) : (
          <span className="flex h-11 shrink-0 items-center rounded-xl border border-[#E8E6E1] bg-white px-3 text-[13px] font-bold tabular-nums text-[#5C5A56]">
            {list.data?.length ?? "…"} وثائق
          </span>
        )}
      </header>

      {/* ===== المحتوى ===== */}
      {inDoc ? (
        <div className="gold-scroll mt-3">
          {doc.loading && !doc.data ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full rounded-2xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : doc.error ? (
            <div className="mt-3">
              <ErrorState
                compact
                message={doc.error.message}
                code={doc.error.code}
                onRetry={doc.retry}
                onSupport={() => setSlug(null)}
              />
            </div>
          ) : doc.data ? (
            <>
              {/* غلاف الوثيقة */}
              <div className="rounded-2xl border border-[#E8E6E1] bg-white p-4 shadow-[0_2px_8px_rgba(11,11,12,0.03)]">
                <div aria-hidden="true" className="h-[3px] w-full rounded-full bg-[#C9A227]" />
                <div className="mt-3 flex items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0B0B0C] text-[18px] font-extrabold tabular-nums text-[#C9A227]">
                    {doc.data.meta.step}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[16px] font-bold leading-6 text-[#141416]">
                      {doc.data.meta.title}
                    </h2>
                    <p className="mt-0.5 text-[12.5px] font-medium leading-5 text-[#5C5A56]">
                      {doc.data.meta.subtitle}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold tabular-nums text-[#A3A09B]">
                      {doc.data.meta.lines.toLocaleString("en-US")} سطراً · markdown
                    </p>
                  </div>
                </div>
              </div>

              {/* متن الوثيقة (markdown بهوية الجنوب) */}
              <article className="mt-3 rounded-2xl border border-[#E8E6E1] bg-white p-4 shadow-[0_2px_8px_rgba(11,11,12,0.03)] sm:p-5">
                <DocsMarkdown content={doc.data.content} />
              </article>

              {/* زر العودة للقائمة */}
              <button
                type="button"
                onClick={() => setSlug(null)}
                className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-[#E8E6E1] bg-white text-[15px] font-bold text-[#141416] transition-colors hover:border-[#C9A227]/50 hover:bg-[#FDFCFA]"
              >
                <BookOpen strokeWidth={1.5} className="h-5 w-5 text-[#C9A227]" />
                العودة لقائمة الوثائق
              </button>
            </>
          ) : null}
        </div>
      ) : list.loading && !list.data ? (
        <div className="mt-3 space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px] w-full rounded-2xl" />
          ))}
        </div>
      ) : list.error ? (
        <div className="mt-3">
          <ErrorState
            compact
            message={list.error.message}
            code={list.error.code}
            onRetry={list.retry}
          />
        </div>
      ) : (
        <>
          <p className="mt-3 text-[12.5px] font-medium leading-6 text-[#5C5A56]">
            سبع وثائق هندسية أنتجتها خطوات التوثيق (1–7): المتطلبات، القصص،
            المعمارية، قاعدة البيانات، نقاط النهاية، الشاشات والتدفقات، وخارطة الطريق.
          </p>
          <div className="mt-3 space-y-2.5">
            {(list.data ?? []).map((d) => {
              const Icon = DOC_ICONS[d.id] ?? FileText;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSlug(d.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border border-[#E8E6E1]/70 bg-white p-3.5 text-right transition-colors",
                    "hover:border-[#C9A227]/50 hover:bg-[#FDFCFA] active:bg-[#F7F6F2]",
                  )}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]">
                    <Icon strokeWidth={1.5} className="h-6 w-6" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                    <span className="flex w-full items-center gap-2">
                      <span className="rounded-full bg-[#0B0B0C] px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-[#C9A227]">
                        {d.step}
                      </span>
                      <span className="truncate text-[15px] font-bold text-[#141416]">
                        {d.shortTitle}
                      </span>
                    </span>
                    <span className="w-full truncate text-[12.5px] font-medium text-[#5C5A56]">
                      {d.title}
                    </span>
                    <span className="w-full truncate text-[11.5px] font-medium text-[#A3A09B]">
                      {d.subtitle}
                    </span>
                    <span className="text-[10.5px] font-semibold tabular-nums text-[#A3A09B]">
                      {d.lines.toLocaleString("en-US")} سطراً
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
