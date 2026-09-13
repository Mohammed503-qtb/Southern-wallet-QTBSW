/**
 * محفظة الجنوب — TOTP (RFC 6238 / RFC 4226) بدون تبعيات خارجية
 * ------------------------------------------------------------
 * المصادقة الثنائية عبر تطبيق مصادقة (Google Authenticator أو أي
 * تطبيق متوافق): سر 20 بايتاً لكل مستخدم، رمز 6 خانات، نافذة 30 ثانية.
 * الحماية المفروضة:
 *  • نافذة تسامح ±1 خطوة (±30 ثانية) لانحراف ساعة الجهاز فقط.
 *  • منع إعادة الاستخدام: الخطوة الزمنية الناجحة تُخزَّن على المستخدم
 *    (totpLastStep) وأي خطوة ≤ محفوظة تُرفض لاحقاً.
 * بلا استيراد من "next" — يعمل من المسارات ومن سكربتات bun.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** أبجدية Base32 (RFC 4648) — يفهمها كل تطبيق مصادقة */
const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const STEP_SECONDS = 30;
const DIGITS = 6;
/** نافذة التسامح: 1 يعني ±خطوة واحدة (±30 ثانية حول الوقت الحالي) */
const SKEW_STEPS = 1;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += B32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = B32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("محارف Base32 غير صالحة");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** الخطوة الزمنية الحالية (عدد نوافذ 30 ثانية منذ الحقبة) */
export function currentStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

/** رمز HOTP لخطوة محددة (RFC 4226 dynamic truncation) */
function hotpAt(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** مقارنة زمنية ثابتة بين رمزين نصيين */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** توليد سر TOTP جديد: 20 بايتاً عشوائياً (160 بت) بصيغة Base32 */
export function generateTotpSecret(): { secretBuf: Buffer; secretB32: string } {
  const secretBuf = randomBytes(20);
  return { secretBuf, secretB32: base32Encode(secretBuf) };
}

/**
 * التحقق من رمز TOTP — يعيد رقم الخطوة المطابقة أو null.
 * minStep: رفض أي خطوة ≤ قيمته (منع إعادة استخدام رمز مقبول سابقاً).
 */
export function verifyTotp(
  secretBuf: Buffer,
  code: string,
  minStep = 0,
  nowMs = Date.now()
): number | null {
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) return null;
  const center = currentStep(nowMs);
  for (let drift = -SKEW_STEPS; drift <= SKEW_STEPS; drift++) {
    const step = center + drift;
    if (step <= minStep) continue;
    if (safeEqual(hotpAt(secretBuf, step), normalized)) return step;
  }
  return null;
}

/** الرمز الحالي (لأدوات التطوير والفحص فقط — لا يُستخدم في مسارات الدخول) */
export function currentTotpCode(secretBuf: Buffer, nowMs = Date.now()): string {
  return hotpAt(secretBuf, currentStep(nowMs));
}

/** رابط otpauth:// لمسح QR من تطبيق المصادقة */
export function buildOtpauthUrl(secretB32: string, phone: string): string {
  const issuer = "Janoub Wallet";
  const label = encodeURIComponent(`${issuer}:+967${phone}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// ============ رموز الاسترداد (فقدان جهاز المصادقة) ============

/** أبجدية رموز الاسترداد بلا محارف ملتبسة (0/O/1/I) */
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** توليد رمز استرداد بصيغة XXXX-XXXX (يظهر للمستخدم مرة واحدة) */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(8);
  let raw = "";
  for (let i = 0; i < 8; i++) {
    raw += RECOVERY_ALPHABET[bytes[i]! % RECOVERY_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** تطبيع إدخال المستخدم لرمز استرداد: ABCD-1234 (تجاهل الحالة والمسافات) */
export function normalizeRecoveryCode(input: string): string {
  const clean = input.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z2-9]{8}$/.test(clean)) return "";
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

// ============ رموز تفعيل إعادة الإلحاق (تصدر من الدعم) ============

/** رمز تفعيل بصيغة R + 7 محارف من أبجدية بلا لبس */
export function generateReEnrollToken(): string {
  const bytes = randomBytes(7);
  let out = "R";
  for (let i = 0; i < 7; i++) {
    out += RECOVERY_ALPHABET[bytes[i]! % RECOVERY_ALPHABET.length];
  }
  return out;
}
