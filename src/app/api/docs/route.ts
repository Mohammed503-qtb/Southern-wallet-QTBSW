/**
 * X1 — GET /api/docs → DocMetaView[] (بيان 7 وثائق المشروع)
 * يقرأ بيان DOC_DEFINITIONS (docs-manifest — بلا تعديل) ويضيف عدد الأسطر.
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { DOC_DEFINITIONS } from "@/lib/docs-manifest";
import type { DocMetaView } from "@/lib/api-types";
import fs from "node:fs";
import path from "node:path";

const DOCS_DIR = path.join(process.cwd(), "docs");

function lineCount(file: string): number {
  try {
    return fs.readFileSync(path.join(DOCS_DIR, file), "utf8").split("\n").length;
  } catch {
    return 0;
  }
}

export const GET = route(async () => {
  await requireUser();
  const metas: DocMetaView[] = DOC_DEFINITIONS.map((d) => ({
    id: d.id,
    step: d.step,
    title: d.title,
    shortTitle: d.shortTitle,
    subtitle: d.subtitle,
    lines: lineCount(d.file),
  }));
  return ok(metas);
});
