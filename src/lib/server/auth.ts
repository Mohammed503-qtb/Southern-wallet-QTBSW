/**
 * محفظة الجنوب — الجلسات (قناتان: كوكي + ترويسة رمز)
 * ---------------------------------------------------------
 * الكوكي httpOnly sameSite=lax صالح 7 أيام، القيمة token عشوائي 48 hex
 * يخزَّن في جدول Session.
 *
 * قناة احتياطية إنتاجية (iframe-safe): يُعاد الرمز في استجابة الدخول
 * (data.sessionToken) ويخزنه العميل في localStorage ثم يرسله مع كل طلب
 * عبر ترويسة x-sw-session — لأن الكوكيز SameSite=Lax قد تُحجب عند
 * تشغيل التطبيق داخل إطار معاينة خارجي (سياق طرف ثالث).
 * التحقق: الكوكي أولاً ثم الترويسة — كلاهما يشير لنفس جدول Session.
 */
import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import type { Session, User } from "@prisma/client";
import { db } from "../db";
import { RouteError } from "./envelope";

const COOKIE_NAME = "sw_session";
const TOKEN_HEADER = "x-sw-session";
const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60; // 7 أيام

/** إنشاء جلسة + ضبط الكوكي — يعيد الرمز ليرسل في استجابة الدخول (القناة الاحتياطية) */
export async function createSession(
  userId: string,
  deviceLabel = "متصفح الويب — Alpha"
): Promise<string> {
  const token = randomBytes(24).toString("hex"); // 48 hex
  await db.session.create({ data: { token, userId, deviceLabel } });
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SEC,
    path: "/",
  });
  return token;
}

/** قراءة رمز الجلسة: الكوكي أولاً ثم ترويسة x-sw-session (سياق iframe) */
async function readSessionToken(): Promise<string | null> {
  const jar = await cookies();
  const cookieToken = jar.get(COOKIE_NAME)?.value;
  if (cookieToken) return cookieToken;
  const hdrs = await headers();
  return hdrs.get(TOKEN_HEADER);
}

/** الجلسة الحالية (حسب الكوكي أو الترويسة) — أو null */
export async function getCurrentSession(): Promise<Session | null> {
  const token = await readSessionToken();
  if (!token) return null;
  return db.session.findUnique({ where: { token } });
}

/** مستخدم الجلسة الحالية أو null (الحسابات المغلقة لا جلسة لها) */
export async function getSessionUser(): Promise<User | null> {
  const session = await getCurrentSession();
  if (!session || !session.active) return null;
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status === "CLOSED" || user.role === "SYSTEM") return null;
  return user;
}

/**
 * طلب جلسة صالحة — 401 AUTH-001 إن لم توجد، و403 RBAC-001 إن كان الدور غير مسموح
 */
export async function requireUser(roles?: readonly string[]): Promise<User> {
  const token = await readSessionToken();
  const user = await getSessionUser();
  if (!user || !token) throw new RouteError("AUTH-001", 401);
  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    throw new RouteError("RBAC-001", 403);
  }
  // تحديث آخر ظهور للجلسة الحالية فقط (best-effort)
  await db.session.updateMany({ where: { token }, data: { lastSeenAt: new Date() } });
  return user;
}

/** إبطال الجلسة الحالية وحذف الكوكي (A4) — يعيد true إن أُبطلت جلسة فعلية */
export async function destroySession(): Promise<boolean> {
  const token = await readSessionToken();
  let had = false;
  if (token) {
    const res = await db.session.updateMany({
      where: { token, active: true },
      data: { active: false },
    });
    had = res.count > 0;
  }
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
  return had;
}
