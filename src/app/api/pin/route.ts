/**
 * A6 — POST /api/pin { pin }   (تعيين PIN لأول مرة)
 * A7 — PUT /api/pin { currentPin, newPin }   (تغيير PIN)
 * يتطلب جلسة. A6 يرفض الطلب إذا كان هناك PIN قائم.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { hashPin, isValidPinFormat, verifyPin } from "@/lib/server/pin";
import { notify } from "@/lib/server/notify";
import { db } from "@/lib/db";

function assertPinFormat(pin: string): void {
  if (!isValidPinFormat(pin)) {
    throw new RouteError("SYS-001", 400, { field: "pin", reason: "رمز PIN يجب أن يكون 6 أرقام" });
  }
}

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await readJsonBody(req);
  const pin = reqStr(body, "pin");
  assertPinFormat(pin);

  if (user.pinHash) {
    throw new RouteError("SYS-001", 400, {
      reason: "رمز PIN معرّف مسبقاً — استخدم تغيير الرمز",
    });
  }
  await db.user.update({ where: { id: user.id }, data: { pinHash: hashPin(pin), pinAttempts: 0, pinLockedUntil: null } });
  await notify(
    db,
    user.id,
    "تم تعيين رمز PIN",
    "تم تعيين رمزك السري بنجاح — سيُطلب عند كل عملية مالية حساسة.",
    "SECURITY"
  );
  return ok({ pinSet: true });
});

export const PUT = route(async (req) => {
  const user = await requireUser();
  const body = await readJsonBody(req);
  const currentPin = reqStr(body, "currentPin");
  const newPin = reqStr(body, "newPin");
  assertPinFormat(newPin);

  if (!user.pinHash) {
    throw new RouteError("SYS-001", 400, { reason: "لا يوجد رمز PIN حالي — استخدم التعيين أولاً" });
  }
  await verifyPin(db, user, currentPin);
  await db.user.update({ where: { id: user.id }, data: { pinHash: hashPin(newPin), pinAttempts: 0, pinLockedUntil: null } });
  await notify(
    db,
    user.id,
    "تم تغيير رمز PIN",
    "تم تغيير رمزك السري بنجاح. إن لم تكن أنت من قام بالتغيير تواصل مع الدعم فوراً.",
    "SECURITY"
  );
  return ok({ pinChanged: true });
});
