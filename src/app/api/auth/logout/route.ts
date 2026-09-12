/**
 * A4 — POST /api/auth/logout
 * إبطال الجلسة الحالية وحذف الكوكي.
 */
import { ok, route } from "@/lib/server/envelope";
import { destroySession } from "@/lib/server/auth";

export const POST = route(async () => {
  await destroySession();
  return ok({ loggedOut: true });
});
