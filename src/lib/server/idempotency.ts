/**
 * محفظة الجنوب — Idempotency (AC-03)
 * رأس Idempotency-Key: نفس المستخدم + نفس المفتاح + نفس الحمولة → إعادة نفس
 * النتيجة مع replayed=true؛ نفس المفتاح بحمولة مختلفة → TXN-003.
 * المفتاح + بصمة الحمولة يخزنان في Transaction.metadataJson (idmHash).
 */
import { createHash } from "node:crypto";
import type { Transaction } from "@prisma/client";
import type { DbClient } from "./audit";
import { RouteError } from "./envelope";

/** JSON معياري بمفاتيح مرتبة — بصمة مستقرة عن ترتيب الحقول */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

/** بصمة الحمولة (sha256 مقتطعة) */
export function payloadHash(body: unknown): string {
  return createHash("sha256").update(canonicalJson(body)).digest("hex").slice(0, 40);
}

/** قراءة مفتاح Idempotency من الرأس (طول معقول) */
export function readIdempotencyKey(req: Request): string | null {
  const key = req.headers.get("idempotency-key")?.trim();
  if (!key || key.length === 0 || key.length > 128) return null;
  return key;
}

/** العملية المخزنة بهذا المفتاح لهذا المستخدم — أو null */
export async function findIdempotentTx(client: DbClient, userId: string, key: string): Promise<Transaction | null> {
  return client.transaction.findFirst({ where: { userId, idempotencyKey: key } });
}

/** استخراج idmHash المخزن */
export function txIdmHash(tx: Transaction): string | null {
  if (!tx.metadataJson) return null;
  try {
    const meta = JSON.parse(tx.metadataJson) as { idmHash?: string };
    return meta.idmHash ?? null;
  } catch {
    return null;
  }
}

/** نفس المفتاح بحمولة مختلفة → TXN-003 */
export function assertSamePayload(tx: Transaction, body: unknown): void {
  const stored = txIdmHash(tx);
  if (stored && stored !== payloadHash(body)) {
    throw new RouteError("TXN-003", 409);
  }
}

/** بيانات metadata موحدة تحمل بصمة الحمولة */
export function idmMeta(body: unknown, extra?: Record<string, unknown>): Record<string, unknown> {
  return { ...extra, idmHash: payloadHash(body) };
}
