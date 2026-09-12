/**
 * M5 — POST /api/admin/kyc/:id/decision { decision: "APPROVE"|"REJECT", note }
 * APPROVE → KycSubmission APPROVED + User.kycLevel=VERIFIED (إن كان NONE)
 *           + إشعار + Audit. REJECT → note إلزامي + إشعار + Audit.
 * ADMIN/COMPLIANCE.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { toKycView } from "@/lib/server/views";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, ctx) => {
  const admin = await requireUser(["ADMIN", "COMPLIANCE"]);
  const { id } = await ctx.params;
  const body = await readJsonBody(req);
  const decision = reqStr(body, "decision");
  const note = reqStr(body, "note");

  if (decision !== "APPROVE" && decision !== "REJECT") {
    throw new RouteError("SYS-001", 400, { field: "decision", reason: "قرار غير صالح" });
  }
  const submission = await db.kycSubmission.findUnique({ where: { id } });
  if (!submission || submission.status !== "PENDING") {
    throw new RouteError("SYS-001", 409, { reason: "الطلب ليس قيد المراجعة" });
  }
  if (decision === "REJECT" && note.trim().length === 0) {
    throw new RouteError("SYS-001", 400, { field: "note", reason: "سبب الرفض إلزامي" });
  }

  const updated = await db.$transaction(async (tx) => {
    const k = await tx.kycSubmission.update({
      where: { id },
      data: {
        status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
        reviewerId: admin.id,
        reviewNote: decision === "REJECT" ? note : note,
        reviewedAt: new Date(),
      },
    });
    if (decision === "APPROVE") {
      await tx.user.update({
        where: { id: submission.userId },
        data: { kycLevel: "VERIFIED" },
      });
    }
    await writeAudit(
      tx,
      { id: admin.id, role: admin.role },
      decision === "APPROVE" ? "KYC_APPROVE" : "KYC_REJECT",
      "KYC_SUBMISSION",
      id,
      note,
      { userId: submission.userId, fullName: submission.fullName }
    );
    await notify(
      tx,
      submission.userId,
      decision === "APPROVE" ? "تم توثيق حسابك" : "نتيجة طلب التوثيق",
      decision === "APPROVE"
        ? "تمت ترقية حسابك إلى «موثّق» — ارتفعت حدودك اليومية وأصبحت كل الخدمات متاحة."
        : `لم يُعتمد طلب توثيقك: ${note}`,
      "KYC"
    );
    return k;
  });

  return ok(toKycView(updated));
});
