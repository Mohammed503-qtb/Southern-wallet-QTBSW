/**
 * محفظة الجنوب — خزنة التشفير (AES-256-GCM بمفتاح APP_KEY)
 * ------------------------------------------------------------
 * تُستخدم لتشفير أسرار TOTP في قاعدة البيانات: سرقة ملف SQLite
 * وحده لا تكفي لاستنساخ رموز المصادقة (خلافاً لتخزينها نصاً صريحاً).
 * المفتاح يأتي من متغير البيئة APP_KEY (≥ 32 محرفاً) — يُشتق منه
 * مفتاح 32 بايت عبر scrypt. في الإنتاج: غيابه = فشل صريح (fail-closed)،
 * وفي التطوير: مفتاح احتياطي ثابت مع تحذير في السجل.
 * بلا استيراد من "next" — يعمل من المسارات ومن سكربتات bun على السواء.
 */
import {
  createCipheriv,
  createDecipheriv,
  scryptSync,
  randomBytes,
} from "node:crypto";

const SCRYPT_SALT = "sw-vault-v1";
const DEV_FALLBACK_KEY = "dev-only-insecure-fallback-app-key!!";

let cachedKey: Buffer | null = null;

/** مفتاح التطبيق من البيئة — فشل صريح في الإنتاج عند غيابه */
function appKey(): string {
  const raw = process.env.APP_KEY;
  if (raw && raw.trim().length >= 32) return raw.trim();
  if (process.env.NODE_ENV === "production") {
    // fail-closed: لا نسمح بتشفير ضعيف في الإنتاج أبداً
    throw new Error(
      "APP_KEY مفقود أو قصير (المطلوب ≥ 32 محرفاً) — عيّن قيمة عشوائية قوية في .env"
    );
  }
  if (process.env.NODE_ENV !== "test" && !raw) {
    console.warn(
      "[vault] APP_KEY غير معيّن — استخدام مفتاح تطوير احتياطي (غير آمن للإنتاج)"
    );
  }
  return DEV_FALLBACK_KEY;
}

function vaultKey(): Buffer {
  if (!cachedKey) {
    cachedKey = scryptSync(appKey(), SCRYPT_SALT, 32);
  }
  return cachedKey;
}

/** إبطال المفتاح المخزّن مؤقتاً (اختباري/سكربتات) */
export function resetVaultKeyCache(): void {
  cachedKey = null;
}

/** تشفير نص → "v1:{iv_b64}:{tag_b64}:{ct_b64}" */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** فك تشفير نص مشفر من encryptSecret — يرمي عند عبث بالقيمة (GCM) */
export function decryptSecret(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("قيمة مشفرة غير صالحة");
  }
  const iv = Buffer.from(parts[1]!, "base64");
  const tag = Buffer.from(parts[2]!, "base64");
  const ct = Buffer.from(parts[3]!, "base64");
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** توليد قيمة APP_KEY عشوائية قوية (للإعداد الأولي والسكربتات) */
export function generateAppKey(): string {
  return randomBytes(32).toString("base64url");
}
