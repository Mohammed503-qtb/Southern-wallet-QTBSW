/**
 * M4 — GET /api/admin/kyc ?status → AdminKycRow[]
 * ADMIN/COMPLIANCE — الافتراضي: الطابور PENDING.
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { toAdminKycRow } from "@/lib/server/views";
import { db } from "@/lib/db";

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "ALL"];

export const GET = route(async (req) => {
  await requireUser(["ADMIN", "COMPLIANCE"]);
  const url = new URL(req.url);
  const status = (url.searchParams.get("status") ?? "PENDING").toUpperCase();
  const where = !(STATUSES as string[]).includes(status) || status === "ALL" ? {} : { status };

  const rows = await db.kycSubmission.findMany({
    where,
    orderBy: { submittedAt: "desc" },
    take: 100,
  });
  const users = await db.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: { id: true, phone: true },
  });
  const phoneById = new Map(users.map((u) => [u.id, u.phone]));
  return ok(rows.map((r) => toAdminKycRow(r, phoneById.get(r.userId) ?? "—")));
});
