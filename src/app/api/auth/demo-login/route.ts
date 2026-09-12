/**
 * A3 — POST /api/auth/demo-login { phone }
 * دخول سريع لحسابات الـ Seed فقط (Alpha) — نفس مخرجات A2 بلا رمز.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { assertValidPhone } from "@/lib/server/domain";
import { createSession } from "@/lib/server/auth";
import { toPublicUser } from "@/lib/server/views";
import type { AuthResultView } from "@/lib/api-types";
import { db } from "@/lib/db";

export const POST = route(async (req) => {
  const body = await readJsonBody(req);
  const phone = assertValidPhone(reqStr(body, "phone"));

  const user = await db.user.findUnique({ where: { phone } });
  if (!user || user.role === "SYSTEM") {
    throw new RouteError("SYS-001", 404, { reason: "حساب تجريبي غير موجود" });
  }
  if (user.status === "CLOSED") {
    throw new RouteError("AUTH-005", 403, { reason: "CLOSED" });
  }

  const sessionToken = await createSession(user.id, "دخول تجريبي سريع — Alpha");

  const result: AuthResultView = {
    user: toPublicUser(user),
    needsPin: user.pinHash === null,
    notice: user.status === "FROZEN" ? "الحساب مجمّد — يمكنك الدخول للاطلاع فقط" : null,
    noticeCode: user.status === "FROZEN" ? "AUTH-005" : null,
    sessionToken,
  };
  return ok(result);
});
