import fs from "node:fs";
import path from "node:path";
import { SrsViewer } from "@/components/srs-viewer";
import { computeStats, extractToc } from "@/lib/doc-utils";

export const dynamic = "force-dynamic";

export default function Home() {
  const docPath = path.join(process.cwd(), "docs", "SRS.md");
  const content = fs.readFileSync(docPath, "utf8");
  const toc = extractToc(content);
  const stats = computeStats(content);

  return <SrsViewer content={content} toc={toc} stats={stats} />;
}
