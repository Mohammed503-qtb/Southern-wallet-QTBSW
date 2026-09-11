import { Suspense, type ReactNode } from "react";
import { PortalHeader } from "@/components/portal-header";
import { PortalSidebar } from "@/components/portal-sidebar";
import { BackToTop, ReadingProgress } from "@/components/reading-widgets";
import { MarkdownContent } from "@/components/markdown-content";
import { OverviewView } from "@/components/overview-view";
import { loadActiveDoc, loadDocMetas, type DocMeta } from "@/lib/docs-manifest";

export const dynamic = "force-dynamic";

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/* ------------------------------------------------------------------ */
/*  هيكل تحميل المتن (خادم) — يُعرض أثناء بث الوثائق الكبيرة            */
/* ------------------------------------------------------------------ */

function ArticleSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="جارٍ تحميل متن الوثيقة">
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-stone-100" />
      <div className="h-4 w-full animate-pulse rounded bg-stone-50" />
      <div className="h-4 w-11/12 animate-pulse rounded bg-stone-50" />
      <div className="h-4 w-4/5 animate-pulse rounded bg-stone-50" />
      <div className="h-40 w-full animate-pulse rounded-xl border border-stone-100 bg-stone-50" />
      <div className="h-4 w-full animate-pulse rounded bg-stone-50" />
      <div className="h-4 w-3/4 animate-pulse rounded bg-stone-50" />
      <p className="sr-only">جارٍ تحميل محتوى الوثيقة…</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  غلاف الوثيقة (خادم)                                                */
/* ------------------------------------------------------------------ */

function DocCover({ doc }: { doc: DocMeta }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-[#C9A227]/10 blur-3xl"
      />
      <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <img
          src="/logo.jpg"
          alt="شعار محفظة الجنوب"
          className="h-16 w-16 shrink-0 rounded-2xl border border-stone-200 bg-white object-cover shadow-md sm:h-20 sm:w-20"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold tabular-nums text-stone-400">
            الخطوة {doc.step} من 7 — {doc.file}
          </p>
          <h1 className="mt-1 text-xl font-extrabold leading-snug text-[#0B0B0C] sm:text-3xl">
            {doc.title}
          </h1>
          <p className="mt-1.5 text-xs leading-6 text-stone-600 sm:text-sm">
            {doc.subtitle}
          </p>
        </div>
      </div>

      <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {doc.hero.map((h) => (
          <div
            key={h.key}
            className="rounded-xl border border-stone-200 bg-stone-50/60 px-3 py-2.5 text-center"
          >
            <div className="text-lg font-extrabold tabular-nums leading-7 text-[#0B0B0C] sm:text-xl">
              {doc.stats[h.key].toLocaleString("en-US")}
            </div>
            <div className="mt-0.5 text-[11px] leading-4 text-stone-500">
              {h.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  التنقل السابق/التالي (خادم)                                        */
/* ------------------------------------------------------------------ */

function DocNavFooter({ prev, next }: { prev: DocMeta | null; next: DocMeta | null }) {
  const card = (doc: DocMeta | null, dir: "prev" | "next") =>
    doc ? (
      <a
        href={`/?doc=${doc.id}`}
        className={
          dir === "prev"
            ? "group flex min-w-0 flex-1 flex-col rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition-colors hover:border-[#C9A227]/50"
            : "group flex min-w-0 flex-1 flex-col items-end rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-[#C9A227]/50"
        }
      >
        <span
          className={
            dir === "prev"
              ? "text-[11px] font-bold text-stone-400"
              : "self-end text-[11px] font-bold text-stone-400"
          }
        >
          {dir === "prev" ? "→ الوثيقة السابقة" : "الوثيقة التالية ←"}
        </span>
        <span className="mt-1 truncate text-sm font-bold text-[#8a6d1d] group-hover:text-[#C9A227]">
          {doc.title}
        </span>
      </a>
    ) : (
      <span className="hidden flex-1 sm:block" aria-hidden="true" />
    );

  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
      {card(next, "next")}
      {card(prev, "prev")}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  الصفحة — التركيب الخادمي مع جزر تفاعلية                             */
/* ------------------------------------------------------------------ */

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const rawDoc = params?.doc;
  const docId = typeof rawDoc === "string" ? rawDoc : "overview";

  const metas = loadDocMetas();
  const loaded = loadActiveDoc(docId);
  const active = loaded?.meta ?? null;
  const toc = loaded?.toc ?? [];

  let body: ReactNode;

  if (loaded) {
    const idx = metas.findIndex((m) => m.id === loaded.meta.id);
    const prev = idx > 0 ? metas[idx - 1] : null;
    const next = idx >= 0 && idx < metas.length - 1 ? metas[idx + 1] : null;

    body = (
      <>
        <DocCover doc={loaded.meta} />
        <article className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8 lg:p-10 print-full">
          <Suspense fallback={<ArticleSkeleton />}>
            <MarkdownContent content={loaded.content} />
          </Suspense>
        </article>
        <DocNavFooter prev={prev} next={next} />
      </>
    );
  } else {
    body = <OverviewView docs={metas} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF9F6] font-cairo">
      <ReadingProgress />

      <PortalHeader docs={metas} active={active} toc={toc} />

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4 py-8 sm:px-6 lg:py-10 print-full">
        <PortalSidebar docs={metas} active={active} toc={toc} />
        <div className="min-w-0 flex-1 print-full">{body}</div>
      </div>

      <BackToTop />

      {/* التذييل — لاصق بأسفل الصفحة */}
      <footer className="no-print mt-auto border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-center text-xs text-stone-500 sm:flex-row sm:px-6 sm:text-right">
          <p className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rotate-45 bg-[#C9A227]"
            />
            <span className="font-bold text-[#0B0B0C]">محفظة الجنوب</span>
            <span className="text-stone-400">|</span>
            بوابة وثائق المشروع — com.janoub.wallet
          </p>
          <p className="tabular-nums">
            التوثيق 1–7 ✔ — الخطوة 8: البناء والتنفيذ (MVP) بانتظار قراركم
          </p>
        </div>
      </footer>
    </div>
  );
}
