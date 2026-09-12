/**
 * P1 — GET /api/profile  { user, sessions[] } (أجهزتي/جلساتي)
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser, getCurrentSession } from "@/lib/server/auth";
import { toPublicUser, toSessionView } from "@/lib/server/views";
import { db } from "@/lib/db";

export const GET = route(async () => {
  const user = await requireUser();
  const current = await getCurrentSession();
  const sessions = await db.session.findMany({
    where: { userId: user.id, active: true },
    orderBy: { lastSeenAt: "desc" },
    take: 20,
  });
  return ok({
    user: toPublicUser(user),
    sessions: sessions.map((s) => toSessionView(s, current ? s.id === current.id : false)),
  });
});
