/**
 * محفظة الجنوب — خدمة المصادقة الثنائية (TOTP) عالية المستوى
 * ------------------------------------------------------------
 * تجمّع: توليد السر وتشفيره (vault) + بناء رابط otpauth + توليد QR
 * + التحقق مع منع إعادة الاستخدام + إدارة رموز الاسترداد (scrypt).
 * تُستخدم من مسارات الدخول/التسجيل ومن إجراء الدعم الإداري ومن seed.
 */
import QRCode from "qrcode";
import type { User } from "@prisma/client";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "../db";
import { encryptSecret, decryptSecret } from "./crypto-vault";
import {
  generateTotpSecret,
  buildOtpauthUrl,
  verifyTotp,
  base32Decode,
  generateRecoveryCode,
} from "./totp";
import type { DbClient } from "./audit";

/** بيانات الإلحاق التي تُعرض للمستخدم مرة واحدة */
export interface EnrollmentView {
  secret: string; // Base32 — للإدخال اليدوي
  otpauthUrl: string;
  qrDataUrl: string; // PNG data URL للمسح
}

/** إصدار/تجديد سر TOTP لحساب (غير مؤكد بعد) — يُعرض مرة واحدة فقط */
export async function issueEnrollment(user: User): Promise<EnrollmentView> {
  const { secretBuf, secretB32 } = generateTotpSecret();
  await db.user.update({
    where: { id: user.id },
    data: {
      totpSecretEnc: encryptSecret(secretB32),
      totpConfirmedAt: null,
      totpLastStep: 0,
    },
  });
  const otpauthUrl = buildOtpauthUrl(secretB32, user.phone);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
    margin: 1,
    width: 232,
    color: { dark: "#141416", light: "#FFFFFF" },
  });
  return { secret: secretB32, otpauthUrl, qrDataUrl };
}

/** فك سر TOTP الخاص بالمستخدم (Buffer للمصادقة) */
export function userTotpSecret(user: User): Buffer | null {
  if (!user.totpSecretEnc) return null;
  try {
    return base32Decode(decryptSecret(user.totpSecretEnc));
  } catch (err) {
    // سر تالف أو مفتاح خاطئ — نعامله كحساب غير مفعّل مع تسجيل صريح
    console.error("[totp] فشل فك السر:", (err as Error).message);
    return null;
  }
}

/**
 * التحقق من رمز TOTP لحساب مؤكد — يعيد رقم الخطوة الناجحة أو null.
 * يفرض منع إعادة الاستخدام عبر totpLastStep.
 */
export function verifyUserTotp(user: User, code: string): number | null {
  const secret = userTotpSecret(user);
  if (!secret || !user.totpConfirmedAt) return null;
  return verifyTotp(secret, code, user.totpLastStep ?? 0);
}

/** تأكيد إلحاق جديد: الرمز صحيح + الخطوة أعلى من آخر استخدام */
export function verifyEnrollmentCode(
  user: User,
  code: string
): number | null {
  const secret = userTotpSecret(user);
  if (!secret || user.totpConfirmedAt) return null;
  return verifyTotp(secret, code, 0);
}

// ============ رموز الاسترداد ============

/** بصمة رمز استرداد بنفس صيغة PIN (s2$salt$hash) */
function hashRecoveryCode(code: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(code, salt, 32);
  return `s2$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function matchesRecoveryHash(code: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "s2") return false;
  const salt = Buffer.from(parts[1]!, "hex");
  const expected = Buffer.from(parts[2]!, "hex");
  const actual = scryptSync(code, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

/** توليد 8 رموز استرداد جديدة (تحذف القديمة) — تُعرض مرة واحدة فقط */
export async function regenerateRecoveryCodes(
  client: DbClient,
  userId: string
): Promise<string[]> {
  await client.recoveryCode.deleteMany({ where: { userId } });
  const codes = Array.from({ length: 8 }, () => generateRecoveryCode());
  await client.recoveryCode.createMany({
    data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })),
  });
  return codes;
}

/** التحقق من رمز استرداد واستهلاكه (لمرة واحدة) — يعيد true عند النجاح */
export async function consumeRecoveryCode(
  userId: string,
  rawInput: string
): Promise<boolean> {
  const normalized = rawInput
    .replace(/[\s-]/g, "")
    .toUpperCase();
  if (!/^[A-Z2-9]{8}$/.test(normalized)) return false;
  const formatted = `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
  const rows = await db.recoveryCode.findMany({
    where: { userId, usedAt: null },
  });
  for (const row of rows) {
    if (matchesRecoveryHash(formatted, row.codeHash)) {
      await db.recoveryCode.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      return true;
    }
  }
  return false;
}

/** عدد رموز الاسترداد غير المستخدمة المتبقية */
export async function recoveryCodesRemaining(userId: string): Promise<number> {
  return db.recoveryCode.count({ where: { userId, usedAt: null } });
}
