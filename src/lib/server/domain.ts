/**
 * محفظة الجنوب — نطاق الخدمة (domain) والمولدات والتحقق الجغرافي
 * ملاحظة: بلا استيراد من "next" — يعمل من المسارات ومن prisma/seed.ts
 */
import { randomBytes } from "node:crypto";
import { CURRENCIES, maskPhone } from "../api-types";
import type { CurrencyCode } from "../api-types";
import type { User } from "@prisma/client";
import { RouteError } from "./envelope";
import { writeAudit, type DbClient } from "./audit";
import { notify } from "./notify";

/** أبجدية مراجع لا لبس فيها (بلا 0/O/1/I) */
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** توليد مرجع عملية: PREFIX-YYYYMMDD-XXXXXXXX */
export function generateRef(prefix: string): string {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
  const bytes = randomBytes(8);
  let suffix = "";
  for (let i = 0; i < 8; i++) {
    suffix += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  }
  return `${prefix}-${ymd}-${suffix}`;
}

/** رمز تحقق رقمي (افتراضياً 6 أرقام) */
export function randomCode(len = 6): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += String(bytes[i] % 10);
  }
  return out;
}

/** إخفاء رقم هوية: يُبقي أول خانتين وآخر خانتين */
export function maskIdNumber(idNumber: string): string {
  const clean = idNumber.trim();
  if (clean.length <= 4) return "•".repeat(clean.length);
  return `${clean.slice(0, 2)}${"•".repeat(Math.max(clean.length - 4, 2))}${clean.slice(-2)}`;
}

export { maskPhone };

/** هاتف يمني صالح: 9 أرقام يبدأ بـ7 (بلا +967) */
export function isValidSouthPhone(phone: string): boolean {
  return /^7\d{8}$/.test(phone);
}

export function assertValidPhone(phone: string): string {
  if (!isValidSouthPhone(phone)) {
    throw new RouteError("SYS-001", 400, {
      field: "phone",
      reason: "رقم الهاتف يجب أن يكون 9 أرقام يبدأ بالرقم 7",
    });
  }
  return phone;
}

export function isValidCurrency(c: string): c is CurrencyCode {
  return (CURRENCIES as readonly string[]).includes(c);
}

export function assertValidCurrency(c: string): CurrencyCode {
  if (typeof c !== "string" || !isValidCurrency(c)) {
    throw new RouteError("SYS-001", 400, { field: "currency", reason: "عملة غير مدعومة" });
  }
  return c;
}

/** الحساب غير مجمّد/مغلق — وإلا ACC-001 (الأرصدة تُعرض لكن العمليات معطلة) */
export function assertNotFrozen(user: Pick<User, "status">): void {
  if (user.status === "FROZEN" || user.status === "CLOSED") {
    throw new RouteError("ACC-001", 403);
  }
}

/**
 * AC-07: مستخدم خارج النطاق الجغرافي (scopeRestricted)
 * أي محاولة POST مالي → تسجيل تدقيق + إشعار ثم رمي GEO-001
 * (يُستدعى على عميل الجذر قبل بدء المعاملة حتى يبقى الأثر التدريبي محفوظاً)
 */
export async function assertInScope(client: DbClient, user: Pick<User, "id" | "role" | "scopeRestricted">): Promise<void> {
  if (!user.scopeRestricted) return;
  await writeAudit(
    client,
    { id: user.id, role: user.role },
    "SCOPE_BLOCKED",
    "USER",
    user.id,
    "محاولة عملية مالية من حساب خارج نطاق الخدمة (AC-07)"
  );
  await notify(
    client,
    user.id,
    "عملية مرفوضة",
    "حسابك خارج نطاق الخدمة الجغرافي — العمليات المالية معطلة، يمكنك الاطلاع فقط.",
    "SECURITY"
  );
  throw new RouteError("GEO-001", 403);
}
