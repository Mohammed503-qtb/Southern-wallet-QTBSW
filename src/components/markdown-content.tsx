/**
 * عارض Markdown — محفظة الجنوب
 * مكون خادم (RSC) يعرض متن الوثائق بتنسيق الهوية: أسود الجنوب + ذهبي #C9A227
 */

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { extractText, headingId } from "@/lib/doc-utils";

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

export function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  );
}
