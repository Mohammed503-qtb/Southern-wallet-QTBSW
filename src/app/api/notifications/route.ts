/**
 * N1 — GET /api/notifications ?unread=1  (أحدث 50)
 * (N2 — تعليم المقروء في POST /api/notifications/read)
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { toNotificationView } from "@/lib/server/views";
import { db } from "@/lib/db";

export const GET = route(async (req) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const rows = await db.notification.findMany({
    where: { userId: user.id, ...(unreadOnly ? { read: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return ok(rows.map(toNotificationView));
});
