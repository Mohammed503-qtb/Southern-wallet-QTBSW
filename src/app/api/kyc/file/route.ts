/**
 * K3 — GET /api/kyc/file?userId=...&kind=doc|selfie  (12-g)
 * تقديم مستندات KYC المخزَّنة بصلاحيات مشددة:
 *   • المستخدم يصل ملفاته فقط؛ ADMIN/COMPLIANCE يصلان ملفات أي مستخدم
 *     (فريق الامتثال يحتاج رؤية المستندات لاعتماد/رفض الطلبات — M5).
 *   • تحقق صارم من شكل userId (cuid) واسم الملف المخزَّن (kyc-{hex}.{ext})
 *     + resolve تحت جذر uploads/kyc مع فحص البادئة — منع أي Path Traversal.
 *   • الصلاحية تُؤخذ من KycSubmission نفسه (docName/selfieName) لا من مدخلات
 *     العميل — لا يمكن قراءة ملف خارج ما سجّله النظام.
 *   • Cache-Control: private, no-store — المستندات حساسة ولا تُخزَّن مؤقتاً.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { route, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/db";

/** شكل معرف المستخدم في النظام (cuid) */
const USER_ID_RE = /^c[a-z0-9]{10,40}$/;

/** شكل اسم الملف المخزَّن: يبدأ بحرف/رقم ثم حروف/أرقام/نقاط/شرطات فقط */
const STORED_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,80}$/;

/** نوع المحتوى حسب امتداد الملف المخزَّن */
const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function missingFile(): RouteError {
  // KYC-404 غير معرّف في ERROR_MESSAGES (ملف مملوك لوكيل آخر) —
  // نستعمل SYS-001 مع 404 وتفاصيل واضحة كما في بقية المسارات
  return new RouteError("SYS-001", 404, { reason: "ملف KYC غير موجود" });
}

export const GET = route(async (req) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const targetUserId = (url.searchParams.get("userId") ?? "").trim();
  const kind = (url.searchParams.get("kind") ?? "").trim();

  if (kind !== "doc" && kind !== "selfie") {
    throw new RouteError("SYS-001", 400, { reason: "kind يجب أن يكون doc أو selfie" });
  }
  if (!USER_ID_RE.test(targetUserId)) {
    throw new RouteError("SYS-001", 400, { reason: "معرّف مستخدم غير صالح" });
  }

  // التفويض: ملفاتك فقط — إلا لو كنت إدارة أو امتثال (M4/M5)
  if (user.id !== targetUserId && user.role !== "ADMIN" && user.role !== "COMPLIANCE") {
    throw new RouteError("RBAC-001", 403);
  }

  // اسم الملف يأتي من القاعدة حصراً — ليس من مدخلات العميل
  const kyc = await db.kycSubmission.findUnique({ where: { userId: targetUserId } });
  if (!kyc) throw missingFile();
  const storedName = kind === "doc" ? kyc.docName : kyc.selfieName;
  if (!storedName || !STORED_NAME_RE.test(storedName) || storedName.includes("..")) {
    throw missingFile();
  }

  // حل المسار بأمان تحت uploads/kyc (منع traversal عبر userId أو اسم الملف)
  const root = path.resolve(process.cwd(), "uploads", "kyc");
  const userDir = path.resolve(root, targetUserId);
  const filePath = path.resolve(userDir, storedName);
  if (!filePath.startsWith(root + path.sep) || path.dirname(filePath) !== userDir) {
    throw missingFile();
  }

  let data: Buffer;
  try {
    data = await readFile(filePath);
  } catch {
    throw missingFile();
  }

  const ext = storedName.split(".").pop()?.toLowerCase() ?? "";
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "content-type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      "content-length": String(data.byteLength),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});
