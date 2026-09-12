/**
 * محفظة الجنوب — رمز PIN (scrypt + salt + قفل تصاعدي)
 * الصيغة المخزنة: s2$<saltHex>$<hashHex>
 * قاعدة القفل: 3 محاولات خاطئة → 5 دقائق؛ 6 → 30 دقيقة (PIN-002)
 * التصفير عند النجاح. العداد يُثبَّت في معاملة مستقلة حتى لا يُتراجع عنه
 * إذا فشلت المعاملة المالية اللاحقة (الترتيب: تحقق PIN ثم $transaction المالية).
 * ملاحظة: بلا استيراد من "next" — يعمل من المسارات ومن prisma/seed.ts
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { User } from "@prisma/client";
import type { DbClient } from "./audit";
import { RouteError } from "./envelope";

const PIN_PATTERN = /^\d{6}$/;

export function isValidPinFormat(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

/** توليد بصمة PIN بصيغة s2$salt$hash */
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `s2$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** مقارنة ثابتة زمنياً */
export function verifyPinHash(pin: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "s2") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = scryptSync(pin, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

/** ثواني القفل المتبقية (0 إن غير مقفل) */
export function pinLockSeconds(user: Pick<User, "pinLockedUntil">): number {
  if (!user.pinLockedUntil) return 0;
  const ms = user.pinLockedUntil.getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

/** تسجيل محاولة خاطئة وتحديث القفل — يرمي PIN-002 عند تفعيل القفل */
async function registerWrongPin(client: DbClient, user: User): Promise<void> {
  const attempts = user.pinAttempts + 1;
  let lockedUntil: Date | null = user.pinLockedUntil ?? null;
  if (attempts >= 6) {
    lockedUntil = new Date(Date.now() + 30 * 60_000);
  } else if (attempts >= 3) {
    lockedUntil = new Date(Date.now() + 5 * 60_000);
  }
  await client.user.update({
    where: { id: user.id },
    data: { pinAttempts: attempts, pinLockedUntil: lockedUntil },
  });
  if (lockedUntil) {
    const seconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
    throw new RouteError("PIN-002", 423, { secondsRemaining: seconds });
  }
}

/**
 * التحقق من PIN قبل عملية حساسة (A8) أو مالية (T2/W4/R2/C4/S3-S5)
 * يُستدعى على عميل الجذر (خارج $transaction) ليضمن ثبات عداد المحاولات
 * حتى لو فشلت المعاملة المالية بعده لأي سبب.
 */
export async function verifyPin(client: DbClient, user: User, pin: string): Promise<void> {
  const lock = pinLockSeconds(user);
  if (lock > 0) {
    throw new RouteError("PIN-002", 423, { secondsRemaining: lock });
  }
  if (!user.pinHash) {
    throw new RouteError("PIN-001", 400, { reason: "لم يتم تعيين رمز PIN بعد" });
  }
  if (verifyPinHash(pin, user.pinHash)) {
    // النجاح يصفّر العداد (A8)
    await client.user.update({
      where: { id: user.id },
      data: { pinAttempts: 0, pinLockedUntil: null },
    });
    return;
  }
  await registerWrongPin(client, user);
  throw new RouteError("PIN-001", 400);
}
