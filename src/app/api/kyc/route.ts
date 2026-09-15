/**
 * K1 — GET /api/kyc   (آخر طلب توثيق أو null)
 * K2 — POST /api/kyc (multipart/form-data):
 *   { fullName, idType, idNumber, governorate, address?, occupation?,
 *     monthlyIncomeMinor? | monthlyIncome?, docFile (إلزامي), selfieFile? }
 * رفع فعلي لمستندات التوثيق (12-g): التحقق من البايتات السحرية
 * (JPEG/PNG/WEBP)، حد 5MB لكل ملف، تخزين باسم مولّد عشوائياً تحت
 * uploads/kyc/{userId}/ — الاسم المولّد يُخزَّن في docName/selfieName.
 * عند إعادة التقديم تُحذف ملفات المستخدم السابقة (best-effort) لتفادي الأيتام.
 * KYC-002 لو قائم PENDING + إشعار — كما في السابق دون تغيير سلوك.
 */
import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ok, route, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { notify } from "@/lib/server/notify";
import { toKycView } from "@/lib/server/views";
import { IN_SCOPE_GOVERNORATES } from "@/lib/api-types";
import { db } from "@/lib/db";

const ID_TYPES = ["NATIONAL_ID", "PASSPORT"] as const;

/** حد حجم الصورة الواحدة: 5MB */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** نمط اسم الملف المخزَّن (kyc-{12hex}.{ext}) — يُستعمل أيضاً عند الحذف/القراءة */
const STORED_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,80}$/;

type ImageKind = { ext: "jpg" | "png" | "webp" };

/** كشف نوع الصورة من البايتات السحرية (لا نثق بأي Content-Type من العميل) */
function detectImageMagic(buf: Uint8Array): ImageKind | null {
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: "jpg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: "png" };
  }
  // WEBP: "RIFF" + حجم 4 بايت + "WEBP"
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return { ext: "webp" };
  }
  return null;
}

function kycUserDir(userId: string): string {
  return path.join(process.cwd(), "uploads", "kyc", userId);
}

/** تخزين صورة KYC باسم مولّد — يعيد الاسم المخزَّن (docName/selfieName) */
async function storeKycImage(userId: string, file: File, field: string): Promise<string> {
  if (file.size === 0) {
    throw new RouteError("SYS-001", 400, { field, reason: "الملف فارغ" });
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new RouteError("SYS-001", 400, { field, reason: "حجم الصورة يتجاوز 5MB" });
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const detected = detectImageMagic(buf);
  if (!detected) {
    throw new RouteError("SYS-001", 400, { field, reason: "الصورة يجب أن تكون بصيغة JPEG أو PNG أو WEBP" });
  }
  const storedName = `kyc-${randomBytes(6).toString("hex")}.${detected.ext}`;
  await mkdir(kycUserDir(userId), { recursive: true, mode: 0o700 });
  await writeFile(path.join(kycUserDir(userId), storedName), buf, { mode: 0o600 });
  return storedName;
}

/** حذف ملف KYC مخزَّن سابقاً (best-effort — تجاهل ENOENT وأي فشل آخر) */
async function deleteStoredKycFile(userId: string, storedName: string | null | undefined): Promise<void> {
  if (!storedName || !STORED_NAME_RE.test(storedName)) return;
  try {
    await unlink(path.join(kycUserDir(userId), storedName));
  } catch {
    /* أفضل جهد — الملف قد يكون غير موجود أصلاً (أسماء Alpha القديمة) */
  }
}

// ============ قراءة حقول multipart ============

function formStr(form: FormData, field: string): string {
  const v = form.get(field);
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new RouteError("SYS-001", 400, { field, reason: "الحقل مفقود أو غير صالح" });
  }
  return v.trim();
}

function formOptStr(form: FormData, field: string): string | null {
  const v = form.get(field);
  if (v === null) return null;
  if (typeof v !== "string") {
    throw new RouteError("SYS-001", 400, { field, reason: "قيمة غير صالحة" });
  }
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function formOptInt(form: FormData, field: string): number | null {
  const v = form.get(field);
  if (v === null) return null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const t = v.trim();
  if (!/^-?\d+$/.test(t)) {
    throw new RouteError("SYS-001", 400, { field, reason: "قيمة غير صالحة" });
  }
  return Number(t);
}

/** قيمة حقل ملف: File فعلي أو null (النص لا يُقبل — منع أسماء ملفات وهمية) */
function formFile(form: FormData, field: string): File | null {
  const v = form.get(field);
  if (v === null || typeof v === "string") return null;
  return v as File;
}

export const GET = route(async () => {
  const user = await requireUser();
  const kyc = await db.kycSubmission.findUnique({ where: { userId: user.id } });
  return ok(kyc ? toKycView(kyc) : null);
});

export const POST = route(async (req) => {
  const user = await requireUser();

  // K2 الآن multipart/form-data (رفع فعلي للمستندات — 12-g)
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("multipart/form-data")) {
    throw new RouteError("SYS-001", 400, { reason: "Content-Type يجب أن يكون multipart/form-data" });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new RouteError("SYS-001", 400, { reason: "جسم الطلب غير صالح" });
  }

  const fullName = formStr(form, "fullName");
  const idType = formStr(form, "idType");
  const idNumber = formStr(form, "idNumber");
  const governorate = formStr(form, "governorate");
  const address = formOptStr(form, "address");
  const occupation = formOptStr(form, "occupation");
  // البوابة تقبل monthlyIncomeMinor (كما ترسلها الواجهة) أو monthlyIncome كتراجع
  const monthlyIncomeMinor = formOptInt(form, "monthlyIncomeMinor") ?? formOptInt(form, "monthlyIncome") ?? 0;

  const docFile = formFile(form, "docFile");
  const selfieFile = formFile(form, "selfieFile");
  if (!docFile) {
    throw new RouteError("SYS-001", 400, { field: "docFile", reason: "صورة بطاقة الهوية مطلوبة" });
  }

  if (!(ID_TYPES as readonly string[]).includes(idType)) {
    throw new RouteError("SYS-001", 400, { field: "idType", reason: "نوع الوثيقة غير مدعوم" });
  }
  if (!(IN_SCOPE_GOVERNORATES as readonly string[]).includes(governorate)) {
    throw new RouteError("SYS-001", 400, {
      field: "governorate",
      reason: "المحافظة يجب أن تكون ضمن نطاق الخدمة الثماني",
    });
  }
  if (monthlyIncomeMinor < 0) {
    throw new RouteError("SYS-001", 400, { field: "monthlyIncomeMinor", reason: "قيمة غير صالحة" });
  }

  const existing = await db.kycSubmission.findUnique({ where: { userId: user.id } });
  if (existing && existing.status === "PENDING") {
    throw new RouteError("KYC-002", 409);
  }

  // 1) تخزين الملفات الجديدة أولاً (لو فشل التخزين لا نمس الملفات القديمة)
  const docName = await storeKycImage(user.id, docFile, "docFile");
  const selfieName = selfieFile ? await storeKycImage(user.id, selfieFile, "selfieFile") : null;

  // 2) كتابة الطلب في القاعدة — الاسم المخزَّن المولّد في docName/selfieName
  const data = {
    fullName,
    idType,
    idNumber,
    governorate,
    address,
    occupation,
    monthlyIncomeMinor,
    incomeCurrency: "YER",
    docName,
    selfieName,
    status: "PENDING",
    reviewerId: null,
    reviewNote: null,
    reviewedAt: null,
    submittedAt: new Date(),
  };
  const kyc = existing
    ? await db.kycSubmission.update({ where: { id: existing.id }, data })
    : await db.kycSubmission.create({ data: { ...data, userId: user.id } });

  // 3) بعد نجاح الكتابة: حذف ملفات التقديم السابق (best-effort) لتفادي الأيتام
  if (existing) {
    await deleteStoredKycFile(user.id, existing.docName);
    await deleteStoredKycFile(user.id, existing.selfieName);
  }

  await notify(
    db,
    user.id,
    "تم استلام طلب التوثيق",
    "طلب توثيق الهوية قيد المراجعة الآن — سنشعرك بالنتيجة خلال 24 ساعة عمل.",
    "KYC"
  );
  return ok(toKycView(kyc));
});
