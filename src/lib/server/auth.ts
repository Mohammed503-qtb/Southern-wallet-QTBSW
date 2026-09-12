/**
 * محفظة الجنوب — الجلسات وكوكي sw_session
 * كوكي httpOnly sameSite=lax صالح 7 أيام، القيمة token عشوائي 48 hex
 * يخزَّن في جدول Session. في Next 16: (await cookies())
 */
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import type { Session, User } from "@prisma/client";
import { db } from "../db";
import { RouteError } from "./envelope";

const COOKIE_NAME = "sw_session";
const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60; // 7 أيام

/** إنشاء جلسة + ضبط الكوكي (تُستدعى بعد نجاح الدخول/التسجيل) */
export async function createSession(userId: string, deviceLabel = "متصفح الويب — Alpha"): Promise<void> {
  const token = randomBytes(24).toString("hex"); // 48 hex
  await db.session.create({ data: { token, userId, deviceLabel } });
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SEC,
    path: "/",
  });
}

/** الجلسة الحالية (حسب الكوكي) — أو null */
export async function getCurrentSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
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
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const user = await getSessionUser();
  if (!user || !token) throw new RouteError("AUTH-001", 401);
  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    throw new RouteError("RBAC-001", 403);
  }
  // تحديث آخر ظهور للجلسة الحالية فقط (best-effort)
  await db.session.updateMany({ where: { token }, data: { lastSeenAt: new Date() } });
  return user;
}

/** إبطال الجلسة الحالية وحذف الكوكي (A4) */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    await db.session.updateMany({ where: { token }, data: { active: false } });
  }
  jar.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
}
