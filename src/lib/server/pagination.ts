/**
 * محفظة الجنوب — ترقيم الصفحات بالمؤشر (createdAt|id)
 * ترتيب تنازلي ثابت: (createdAt DESC, id DESC)
 */
export interface CursorPoint {
  createdAt: Date;
  id: string;
}

/** تضمين مؤشر آخر عنصر */
export function encodeCursor(item: { createdAt: Date; id: string }): string {
  return `${item.createdAt.toISOString()}|${item.id}`;
}

/** فك المؤشر — null إن تالف */
export function decodeCursor(cursor: string | null | undefined): CursorPoint | null {
  if (!cursor) return null;
  const idx = cursor.lastIndexOf("|");
  if (idx <= 0) return null;
  const iso = cursor.slice(0, idx);
  const id = cursor.slice(idx + 1);
  const date = new Date(iso);
  if (isNaN(date.getTime()) || id.length === 0) return null;
  return { createdAt: date, id };
}

/** شرط التصفح «قبل المؤشر» — يُدمج في where بالانتشار */
export function cursorFilter(cursor: string | null | undefined): Record<string, unknown> {
  const point = decodeCursor(cursor);
  if (!point) return {};
  return {
    OR: [
      { createdAt: { lt: point.createdAt } },
      { AND: [{ createdAt: point.createdAt }, { id: { lt: point.id } }] },
    ],
  };
}

/** الحد الأقصى للصفحة (افتراضي/سقف) */
export function clampLimit(raw: string | null | undefined, def = 20, max = 20): number {
  const n = raw ? Number.parseInt(raw, 10) : def;
  if (!Number.isInteger(n) || n <= 0) return def;
  return Math.min(n, max);
}
