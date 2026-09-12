/**
 * F1 — GET /api/beneficiaries  → BeneficiaryView[]
 * F2 — POST /api/beneficiaries { name, phone } — يجب أن يكون الهاتف مستخدماً
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { assertValidPhone } from "@/lib/server/domain";
import { toBeneficiaryView } from "@/lib/server/views";
import { db } from "@/lib/db";

export const GET = route(async () => {
  const user = await requireUser();
  const rows = await db.beneficiary.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return ok(rows.map(toBeneficiaryView));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await readJsonBody(req);
  const name = reqStr(body, "name");
  const phone = assertValidPhone(reqStr(body, "phone"));

  const target = await db.user.findUnique({ where: { phone } });
  if (!target || target.status === "CLOSED" || target.role === "SYSTEM") {
    throw new RouteError("TRF-001", 404);
  }
  if (target.id === user.id) {
    throw new RouteError("TRF-002", 400);
  }
  const existing = await db.beneficiary.findFirst({ where: { userId: user.id, phone } });
  if (existing) {
    return ok(toBeneficiaryView(existing));
  }
  const row = await db.beneficiary.create({ data: { userId: user.id, name, phone } });
  return ok(toBeneficiaryView(row));
});
