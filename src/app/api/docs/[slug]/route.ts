/**
 * X2 — GET /api/docs/:slug → { meta, content } (markdown خام)
 * slug: srs | stories | architecture | database | api | screens | roadmap
 */
import { ok, route, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { DOC_DEFINITIONS } from "@/lib/docs-manifest";
import type { DocMetaView } from "@/lib/api-types";
import fs from "node:fs";
import path from "node:path";

type Ctx = { params: Promise<{ slug: string }> };

const DOCS_DIR = path.join(process.cwd(), "docs");

export const GET = route<Ctx>(async (_req, ctx) => {
  await requireUser();
  const { slug } = await ctx.params;
  const def = DOC_DEFINITIONS.find((d) => d.id === slug);
  if (!def) {
    throw new RouteError("SYS-001", 404, { reason: "وثيقة غير موجودة" });
  }
  const filePath = path.join(DOCS_DIR, def.file);
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    throw new RouteError("SYS-001", 500, { reason: "تعذر قراءة الوثيقة" });
  }
  const meta: DocMetaView = {
    id: def.id,
    step: def.step,
    title: def.title,
    shortTitle: def.shortTitle,
    subtitle: def.subtitle,
    lines: content.split("\n").length,
  };
  return ok({ meta, content });
});
