/**
 * X3 — GET /api/qr?text=...&size=  → SVG (image/svg+xml)
 * توليد رمز QR عبر مكتبة qrcode (مثبتة) — بياني SWPAY:<phone> في التطبيق.
 */
import { route, RouteError } from "@/lib/server/envelope";
import QRCode from "qrcode";

export const GET = route(async (req) => {
  const url = new URL(req.url);
  const text = (url.searchParams.get("text") ?? "").trim();
  const sizeRaw = url.searchParams.get("size");
  const size = sizeRaw ? Number.parseInt(sizeRaw, 10) : 220;

  if (text.length === 0 || text.length > 512) {
    throw new RouteError("SYS-001", 400, { field: "text", reason: "نص QR فارغ أو طويل جداً" });
  }
  if (!Number.isInteger(size) || size < 80 || size > 1000) {
    throw new RouteError("SYS-001", 400, { field: "size", reason: "حجم غير صالح (80-1000)" });
  }

  const svg = await QRCode.toString(text, { type: "svg", margin: 1, width: size });
  return new Response(svg, {
    status: 200,
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
});
