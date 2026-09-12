/**
 * محفظة الجنوب — مولّد أيقونات PWA (Task 9-d)
 * ------------------------------------------------------------
 * يقرأ الشعار الأصلي `public/logo.jpg` (نجمة هندسية ثمانية سوداء/بيضاء
 * على خلفية بيضاء) ويولّد منه حزمة أيقونات جاهزة للإنتاج في `public/icons/`:
 *
 *  - icon-192.png        (192×192, purpose "any")   خلفية بيضاء + شعار متوسط + حواف دائرية لطيفة
 *  - icon-512.png        (512×512, purpose "any")   نفس الهوية بدقة أعلى
 *  - maskable-192.png    (192×192, purpose "maskable") خلفية كاملة (full-bleed) والمحتوى داخل
 *                        المنطقة الآمنة (قطر ≤ 80% من الضلع) ليصمد أي قص دائري من المشغّل
 *  - maskable-512.png    (512×512, purpose "maskable")
 *  - apple-touch-icon.png (180×180, مربع مصمت بلا شفافية — iOS يقص الحواف بنفسه)
 *  - favicon.ico         (16+32+48 داخل حاوية ICO بصيغة PNG — توافق أوسع)
 *
 * التشغيل:  bun scripts/gen-icons.ts
 * المتطلب:  sharp (مثبت مسبقاً في node_modules)
 */

import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const SRC = path.join(ROOT, "public", "logo.jpg");
const OUT_DIR = path.join(ROOT, "public", "icons");
const FAVICON_PATH = path.join(ROOT, "public", "favicon.ico");

const WHITE = { r: 255, g: 255, b: 255, alpha: 255 };

/** إزالة الهوامش البيضاء من الشعار المصدر للحصول على بلاطة الشعار النقية */
async function getLogoTile(): Promise<{ data: Buffer; width: number; height: number }> {
  const data = await sharp(SRC)
    .trim({ background: "#FFFFFF", threshold: 12 })
    .png()
    .toBuffer();
  const meta = await sharp(data).metadata();
  if (!meta.width || !meta.height) throw new Error("تعذر قراءة أبعاد الشعار");
  return { data, width: meta.width, height: meta.height };
}

interface IconOptions {
  size: number;
  /** نسبة أطول ضلع للمحتوى من حجم الأيقونة (0..1) */
  contentRatio: number;
  /** تدوير حواف الخلفية (يترك الزوايا شفافة) — للأيقونات purpose=any فقط */
  rounded: boolean;
  /** نصف قطر الزاوية كنسبة من الضلع (عند rounded) */
  cornerRatio?: number;
}

/** تركيب أيقونة: خلفية بيضاء + بلاطة الشعار متوسطة (+ حواف دائرية اختيارية) */
async function buildIcon(tile: { data: Buffer; width: number; height: number }, opts: IconOptions): Promise<Buffer> {
  const { size, contentRatio, rounded, cornerRatio = 0.225 } = opts;

  // تحجيم الشعار مع الحفاظ على النسبة (Lanczos لجودة عالية عند التصغير)
  const maxSide = Math.round(size * contentRatio);
  const scale = Math.min(maxSide / tile.width, maxSide / tile.height);
  const w = Math.max(1, Math.round(tile.width * scale));
  const h = Math.max(1, Math.round(tile.height * scale));
  const resized = await sharp(tile.data)
    .resize(w, h, { fit: "inside", kernel: "lanczos3" })
    .png()
    .toBuffer();

  const left = Math.round((size - w) / 2);
  const top = Math.round((size - h) / 2);

  let pipeline = sharp({
    create: { width: size, height: size, channels: 4, background: WHITE },
  }).composite([{ input: resized, left, top }]);

  if (rounded) {
    const r = Math.round(size * cornerRatio);
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#FFFFFF"/></svg>`,
    );
    pipeline = pipeline.composite([{ input: mask, blend: "dest-in" }]);
  }

  return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
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
  const tile = await getLogoTile();
  console.log(`• بلاطة الشعار بعد إزالة الهوامش: ${tile.width}×${tile.height}px`);

  const outputs: Array<{ file: string; buffer: Buffer; label: string }> = [];

  // 1) أيقونات purpose=any: شعار متوسط (~72%) على خلفية بيضاء بحواف دائرية (~22.5%)
  for (const size of [192, 512]) {
    outputs.push({
      file: `icon-${size}.png`,
      buffer: await buildIcon(tile, { size, contentRatio: 0.72, rounded: true }),
      label: `any ${size}×${size} (حواف دائرية)`,
    });
  }

  // 2) أيقونات maskable: خلفية full-bleed والمحتوى ≤56% (القطر 0.56×√2 ≈ 0.79 < 0.80 المنطقة الآمنة)
  for (const size of [192, 512]) {
    outputs.push({
      file: `maskable-${size}.png`,
      buffer: await buildIcon(tile, { size, contentRatio: 0.56, rounded: false }),
      label: `maskable ${size}×${size} (منطقة آمنة)`,
    });
  }

  // 3) apple-touch-icon: 180×180 مصمتة بلا شفافية (iOS يقص الزوايا بنفسه)
  outputs.push({
    file: "apple-touch-icon.png",
    buffer: await buildIcon(tile, { size: 180, contentRatio: 0.66, rounded: false }),
    label: "apple-touch 180×180",
  });

  // 4) favicon.ico: 16+32+48 (محتوى أكبر ليبقى مقروءاً في الأحجام الدقيقة)
  const icoEntries: Array<{ size: number; data: Buffer }> = [];
  for (const size of [16, 32, 48]) {
    icoEntries.push({
      size,
      data: await buildIcon(tile, { size, contentRatio: 0.94, rounded: false }),
    });
  }
  const ico = buildIco(icoEntries);

  // كتابة الملفات + تحقق صريح من الأبعاد
  for (const { file, buffer, label } of outputs) {
    await writeFile(path.join(OUT_DIR, file), buffer);
    const meta = await sharp(buffer).metadata();
    const hasAlpha = meta.hasAlpha ?? false;
    console.log(`✓ public/icons/${file} — ${label} (${meta.width}×${meta.height}, alpha=${hasAlpha})`);
  }
  await writeFile(FAVICON_PATH, ico);
  console.log(`✓ public/favicon.ico — 16+32+48 (حاوية ICO) (${ico.length} bytes)`);

  console.log("\nتم توليد حزمة أيقونات PWA بنجاح ✨");
}

main().catch((err) => {
  console.error("فشل توليد الأيقونات:", err);
  process.exit(1);
});
