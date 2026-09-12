/**
 * A9 — PUT /api/me/biometric { enabled }
 * تبديل البصمة (تجريبي في Alpha — يخزَّن على المستخدم فقط).
 */
import { ok, route, readJsonBody, reqBool } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/db";

export const PUT = route(async (req) => {
  const user = await requireUser();
  const body = await readJsonBody(req);
  const enabled = reqBool(body, "enabled");
  await db.user.update({ where: { id: user.id }, data: { biometricEnabled: enabled } });
  return ok({ enabled });
});
