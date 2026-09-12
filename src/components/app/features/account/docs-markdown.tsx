/**
 * محفظة الجنوب — عارض Markdown بم-containers هوية الجنوب (لوثائق داخل التطبيق)
 * react-markdown + remark-gfm مع CSS محصور بالنطاق .sw-md:
 * عناوين بحد ذهبي سفلي، جداول بحدود #E8E6E1 وخلفية #F7F6F2، أكواد داكنة
 * #0B0B0C بنص فاتح (LTR)، قوائم RTL منسقة، اقتباس بحد ذهبي.
 */
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MD_CSS = `
.sw-md { color:#141416; font-size:13.5px; line-height:2; }
.sw-md > *:first-child { margin-top:0; }
.sw-md h1 {
  font-size:21px; font-weight:800; line-height:1.5; color:#0B0B0C;
  padding-bottom:8px; margin:26px 0 14px;
  border-bottom:2px solid #C9A227;
}
.sw-md h1:first-child { margin-top:0; }
.sw-md h2 {
  font-size:17.5px; font-weight:800; line-height:1.55; color:#0B0B0C;
  padding-bottom:6px; margin:24px 0 12px;
  border-bottom:1.5px solid rgba(201,162,39,0.7);
}
.sw-md h3 { font-size:15.5px; font-weight:700; margin:20px 0 8px; color:#141416; }
.sw-md h4 { font-size:14px; font-weight:700; margin:16px 0 6px; color:#141416; }
.sw-md h5, .sw-md h6 { font-size:13.5px; font-weight:700; margin:14px 0 6px; color:#5C5A56; }
.sw-md p { margin:10px 0; }
.sw-md strong { font-weight:800; color:#0B0B0C; }
.sw-md em { font-style:italic; }
.sw-md a { color:#8A6E14; text-decoration:underline; text-underline-offset:3px; }
.sw-md ul, .sw-md ol { margin:10px 0; padding-right:22px; padding-left:0; }
.sw-md ul { list-style:disc; }
.sw-md ol { list-style:decimal; }
.sw-md li { margin:4px 0; }
.sw-md li > ul, .sw-md li > ol { margin:4px 0; }
.sw-md blockquote {
  margin:12px 0; padding:8px 14px;
  border-right:3px solid #C9A227; border-left:none;
  background:#F7F6F2; color:#5C5A56; border-radius:8px 0 0 8px;
}
.sw-md hr { border:none; border-top:1px solid #E8E6E1; margin:22px 0; }
.sw-md code {
  direction:ltr; unicode-bidi:embed;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-size:12px; background:#0B0B0C; color:#F7F6F2;
  padding:2px 7px; border-radius:6px;
}
.sw-md pre {
  direction:ltr; text-align:left;
  background:#0B0B0C; color:#F7F6F2;
  padding:14px 16px; margin:12px 0; border-radius:12px;
  overflow-x:auto; line-height:1.7; font-size:12px;
}
.sw-md pre code { background:transparent; color:inherit; padding:0; border-radius:0; font-size:12px; }
.sw-md table {
  width:100%; margin:14px 0; border-collapse:collapse;
  background:#FFFFFF; border:1px solid #E8E6E1;
  border-radius:10px; overflow:hidden;
  display:block; overflow-x:auto;
}
.sw-md thead { background:#F7F6F2; }
.sw-md th {
  border:1px solid #E8E6E1; background:#F7F6F2;
  padding:8px 10px; font-weight:800; font-size:12px; color:#141416; text-align:right;
}
.sw-md td {
  border:1px solid #E8E6E1; padding:7px 10px;
  font-size:12px; color:#141416; text-align:right; vertical-align:top;
}
.sw-md tbody tr:nth-child(even) { background:#FAF9F6; }
.sw-md img { max-width:100%; border-radius:10px; }
`;

export interface DocsMarkdownProps {
  content: string;
  className?: string;
}

export function DocsMarkdown({ content, className }: DocsMarkdownProps) {
  return (
    <div className={className}>
      <style dangerouslySetInnerHTML={{ __html: MD_CSS }} />
      <div className="sw-md">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
