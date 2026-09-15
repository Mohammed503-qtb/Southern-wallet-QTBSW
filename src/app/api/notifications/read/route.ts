/**
 * N2 — POST /api/notifications/read { ids?: string[], all?: boolean }
 * (منفصل عن GET لمسار نظيف)
 */
import { ok, route, readJsonBody } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/db";

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await readJsonBody(req);
  const ids = Array.isArray(body["ids"])
    ? (body["ids"] as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const all = body["all"] === true;

  if (all) {
    const res = await db.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
    return ok({ marked: res.count });
  }
  if (ids.length > 0) {
    const res = await db.notification.updateMany({
      where: { userId: user.id, id: { in: ids }, read: false },
      data: { read: true },
    });
    return ok({ marked: res.count });
  }
  return ok({ marked: 0 });
});
