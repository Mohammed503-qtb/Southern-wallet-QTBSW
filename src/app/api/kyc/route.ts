/**
 * K1 — GET /api/kyc   (آخر طلب توثيق أو null)
 * K2 — POST /api/kyc { fullName, idType, idNumber, governorate, address?, occupation?, monthlyIncomeMinor?, docName?, selfieName? }
 * إرسال طلب توثيق (KYC-002 لو قائم PENDING) + إشعار.
 */
import { ok, route, readJsonBody, reqStr, optStr, optInt, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { notify } from "@/lib/server/notify";
import { toKycView } from "@/lib/server/views";
import { IN_SCOPE_GOVERNORATES } from "@/lib/api-types";
import { db } from "@/lib/db";

const ID_TYPES = ["NATIONAL_ID", "PASSPORT"] as const;

export const GET = route(async () => {
  const user = await requireUser();
  const kyc = await db.kycSubmission.findUnique({ where: { userId: user.id } });
  return ok(kyc ? toKycView(kyc) : null);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await readJsonBody(req);

  const fullName = reqStr(body, "fullName");
  const idType = reqStr(body, "idType");
  const idNumber = reqStr(body, "idNumber");
  const governorate = reqStr(body, "governorate");
  const address = optStr(body, "address");
  const occupation = optStr(body, "occupation");
  const monthlyIncomeMinor = optInt(body, "monthlyIncomeMinor") ?? 0;
  const docName = optStr(body, "docName");
  const selfieName = optStr(body, "selfieName");

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

  await notify(
    db,
    user.id,
    "تم استلام طلب التوثيق",
    "طلب توثيق الهوية قيد المراجعة الآن — سنشعرك بالنتيجة خلال 24 ساعة عمل.",
    "KYC"
  );
  return ok(toKycView(kyc));
});
