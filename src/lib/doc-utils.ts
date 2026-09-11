/**
 * أدوات معالجة الوثائق — محفظة الجنوب
 * تُستخدم في الخادم (استخراج الفهرس) والعميل (مولّد معرفات العناوين)
 */

export interface TocItem {
  id: string;
  title: string;
  level: 1 | 2 | 3;
}

export interface DocStats {
  requirements: number;
  sections: number;
  words: number;
  functional: number;
  nonFunctional: number;
}

/** توليد معرّف آمن لعنوان عربي/إنجليزي */
export function headingId(text: string): string {
  return (
    "h-" +
    text
      .trim()
      .replace(/[\s\u200f\u200e]+/g, "-")
      .replace(/[^\p{L}\p{N}-]/gu, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
  );
}

/** استخراج نص من عناصر React (للمكونات المخصصة في react-markdown) */
export function extractText(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in (node as Record<string, unknown>)) {
    const props = (node as { props?: { children?: unknown } }).props;
    return extractText(props?.children);
  }
  return "";
}

/** استخراج فهرس المحتويات من نص Markdown */
export function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  const seen = new Set<string>();
  const lines = markdown.split("\n");
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (match) {
      const level = match[1].length as 1 | 2 | 3;
      const title = match[2].replace(/[*_`]/g, "").trim();
      let id = headingId(title);
      // إزالة التكرار
      let counter = 2;
      while (seen.has(id)) {
        id = `${headingId(title)}-${counter}`;
        counter++;
      }
      seen.add(id);
      items.push({ id, title, level });
    }
  }
  return items;
}

/** حساب إحصاءات الوثيقة */
export function computeStats(markdown: string): DocStats {
  const unique = new Set<string>();
  const re = /(?:FR|NFR)-[A-Z]+-\d+|(?:AC|RK)-\d+|(?<![A-Za-z-])[CAR]-\d+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    unique.add(m[0]);
  }

  const functional = [...unique].filter((x) => x.startsWith("FR-")).length;
  const nonFunctional = [...unique].filter((x) => x.startsWith("NFR-")).length;
  const words = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

  return {
    requirements: unique.size,
    sections: (markdown.match(/^#{1,3}\s+/gm) || []).length,
    words,
    functional,
    nonFunctional,
  };
}
