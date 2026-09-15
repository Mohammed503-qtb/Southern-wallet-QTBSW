/**
 * محفظة الجنوب — مولّد أيقونات PWA (v2 — الهوية الشفافة)
 * ------------------------------------------------------------
 * يقرأ الشعار الرسمي الشفاف `public/logo.svg` (علامة الجنوب الثلاثية
 * بتدرج ذهبي، بلا خلفية) ويولّد منه حزمة أيقونات شفافة بالكامل —
 * «فقط يظهر الشعار» كما في هوية المنتج:
 *
 *  - icon-192.png        (192×192, purpose "any")   شعار شفاف ~72% متوسط
 *  - icon-512.png        (512×512, purpose "any")   نفس الهوية بدقة أعلى
 *  - maskable-192.png    (192×192, purpose "maskable") شعار شفاف ~54% داخل المنطقة الآمنة
 *  - maskable-512.png    (512×512, purpose "maskable")
 *  - apple-touch-icon.png (180×180, شفاف — iOS يركّب خلفية داكنة تلقائياً فتتناسق مع هوية أسود الجنوب)
 *  - favicon.ico         (16+32+48 داخل حاوية ICO بصيغة PNG — توافق أوسع)
 *
 * التشغيل:  bun scripts/gen-icons.ts
 * المتطلب:  sharp (مثبت مسبقاً في node_modules)
 */

import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const SRC = path.join(ROOT, "public", "logo.svg");
const OUT_DIR = path.join(ROOT, "public", "icons");
const FAVICON_PATH = path.join(ROOT, "public", "favicon.ico");

/** قراءة SVG المصدر وتحجيمه إلى بلاطة شفافة بالمقاس المطلوب */
async function renderLogoTile(size: number, density = 2): Promise<Buffer> {
  const svg = await readFile(SRC, "utf-8");
  return sharp(Buffer.from(svg), { density })
    .resize(size, size, { fit: "contain", kernel: "lanczos3" })
    .png()
    .toBuffer();
}

interface IconOptions {
  size: number;
  /** نسبة أطول ضلع للمحتوى من حجم الأيقونة (0..1) */
  contentRatio: number;
}

/** تركيب أيقونة شفافة: الشعار فقط متوسطاً — لا خلفية إطلاقاً */
async function buildTransparentIcon(opts: IconOptions): Promise<Buffer> {
  const { size, contentRatio } = opts;
  const logoSide = Math.round(size * contentRatio);
  const logo = await renderLogoTile(logoSide, size >= 256 ? 4 : 3);

  // لوحة RGBA شفافة بالكامل ثم تركيب الشعار متوسطاً
  const base = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();

  return sharp(base)
    .composite([{ input: logo, left: Math.round((size - logoSide) / 2), top: Math.round((size - logoSide) / 2) }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

/** حاوية ICO تحتوي عدة صور PNG (16/32/48) — مدعومة في كل المتصفحات الحديثة */
function buildIco(entries: Array<{ size: number; data: Buffer }>): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + 16 * entries.length;
  const directories: Buffer[] = [];
  for (const { size, data } of entries) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8); // data size
    entry.writeUInt32LE(offset, 12); // data offset
    directories.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...directories, ...entries.map((e) => e.data)]);
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const outputs: Array<{ file: string; buffer: Buffer; label: string }> = [];

  // 1) أيقونات purpose=any: الشعار الشفاف وحده (~72% من الضلع)
  for (const size of [192, 512]) {
    outputs.push({
      file: `icon-${size}.png`,
      buffer: await buildTransparentIcon({ size, contentRatio: 0.72 }),
      label: `any ${size}×${size} (شفافة)`,
    });
  }

  // 2) أيقونات maskable: الشعار داخل المنطقة الآمنة (54% — القطر 0.54×√2 ≈ 0.76 < 0.80)
  for (const size of [192, 512]) {
    outputs.push({
      file: `maskable-${size}.png`,
      buffer: await buildTransparentIcon({ size, contentRatio: 0.54 }),
      label: `maskable ${size}×${size} (منطقة آمنة، شفافة)`,
    });
  }

  // 3) apple-touch-icon: 180×180 شفافة (iOS يركّب خلفية سوداء خلفها — الهوية الذهبية على أسود الجنوب)
  outputs.push({
    file: "apple-touch-icon.png",
    buffer: await buildTransparentIcon({ size: 180, contentRatio: 0.66 }),
    label: "apple-touch 180×180 (شفافة)",
  });

  // 4) favicon.ico: 16+32+48 (محتوى أكبر ليبقى مقروءاً في الأحجام الدقيقة)
  const icoEntries: Array<{ size: number; data: Buffer }> = [];
  for (const size of [16, 32, 48]) {
    icoEntries.push({
      size,
      data: await buildTransparentIcon({ size, contentRatio: 0.94 }),
    });
  }
  const ico = buildIco(icoEntries);

  // كتابة الملفات + تحقق صريح من الأبعاد والشفافية
  for (const { file, buffer, label } of outputs) {
    await writeFile(path.join(OUT_DIR, file), buffer);
    const meta = await sharp(buffer).metadata();
    const hasAlpha = meta.hasAlpha ?? false;
    console.log(`✓ public/icons/${file} — ${label} (${meta.width}×${meta.height}, alpha=${hasAlpha})`);
  }
  await writeFile(FAVICON_PATH, ico);
  console.log(`✓ public/favicon.ico — 16+32+48 (حاوية ICO شفافة) (${ico.length} bytes)`);

  console.log("\nتم توليد حزمة أيقونات PWA الشفافة بنجاح ✨");
}

main().catch((err) => {
  console.error("فشل توليد الأيقونات:", err);
  process.exit(1);
});
