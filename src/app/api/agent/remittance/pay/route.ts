/**
 * G4 — POST /api/agent/remittance/pay { deliveryCode, confirm? }
 * دفع حوالة بالرمز (البحث بالرمز فقط) بمرحلتين في نقطة واحدة:
 *   confirm ≠ true → إعادة تفاصيل المستلم للتحقق قبل الدفع
 *   confirm = true  → التنفيذ: [SUSPENSE DEBIT a] + [AGENT_FLOAT DEBIT a] Σ=0
 *                     + PAID + payingAgentId + CommissionEntry + إشعار المرسل
 * CWD-001 (رمز غير موجود)، CWD-002 (منتهية)، CWD-003 (عوم غير كافٍ).
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { runLazyExpiry } from "@/lib/server/cashflow";
import { getOrCreateAgentFloatWallet, getSystemWallet, postEntries } from "@/lib/server/ledger";
import { notify } from "@/lib/server/notify";
import { formatMinor } from "@/lib/server/money";
import { toRemittanceView } from "@/lib/server/views";
import { db } from "@/lib/db";

export const POST = route(async (req) => {
  const user = await requireUser(["AGENT"]);
  await runLazyExpiry();

  const body = await readJsonBody(req);
  const deliveryCode = reqStr(body, "deliveryCode");
  const confirm = body["confirm"] === true;

  const profile = await db.agentProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    throw new RouteError("SYS-001", 500, { reason: "ملف الوكيل غير موجود" });
  }

  // البحث بالرمز فقط (وليس بالقائمة)
  const rem = await db.remittance.findFirst({
    where: { deliveryCode: deliveryCode.trim() },
    orderBy: { createdAt: "desc" },
  });
  if (!rem) {
    throw new RouteError("CWD-001", 404);
  }
  if (rem.status === "EXPIRED" || (rem.status === "PENDING" && rem.expiresAt < new Date())) {
    throw new RouteError("CWD-002", 409, { status: rem.status });
  }
  if (rem.status !== "PENDING") {
    if (rem.status === "PAID" && confirm) {
      // idempotent — أعد الحالة الحالية
      return ok({ remittance: toRemittanceView(rem, profile.shopName) });
    }
    throw new RouteError("CWD-002", 409, { status: rem.status });
  }

  const sender = await db.user.findUnique({ where: { id: rem.senderId } });

  // المرحلة 1: عرض تفاصيل المستلم للتحقق قبل الدفع
  if (!confirm) {
    return ok({
      ref: rem.ref,
      receiverName: rem.receiverName,
      receiverPhone: rem.receiverPhone,
      amountMinor: rem.amountMinor,
      currency: rem.currency as "YER" | "SAR" | "USD",
      feeMinor: rem.feeMinor,
      status: rem.status as "PENDING" | "PAID" | "CANCELLED" | "EXPIRED",
      senderName: sender?.fullName ?? null,
      createdAt: rem.createdAt.toISOString(),
      expiresAt: rem.expiresAt.toISOString(),
    });
  }

  // المرحلة 2: التنفيذ
  if (profile.status !== "ACTIVE") {
    throw new RouteError("SRV-001", 403, { reason: "حساب الوكيل غير مفعّل" });
  }

  const paid = await db.$transaction(async (tx) => {
    const fresh = await tx.remittance.findUnique({ where: { id: rem.id } });
    if (!fresh || fresh.status !== "PENDING") {
      throw new RouteError("CWD-002", 409, { status: fresh?.status ?? "UNKNOWN" });
    }
    const float = await getOrCreateAgentFloatWallet(tx, user.id);
    if (float.balanceMinor < fresh.amountMinor) {
      throw new RouteError("CWD-003", 403, { float: float.balanceMinor, needed: fresh.amountMinor });
    }
    const suspense = await getSystemWallet(tx, "SUSPENSE", "YER");

    const flipped = await tx.remittance.updateMany({
      where: { id: fresh.id, status: "PENDING" },
      data: { status: "PAID", payingAgentId: user.id, paidAt: new Date() },
    });
    if (flipped.count === 0) {
      throw new RouteError("CWD-002", 409);
    }
    // تحرير الحجز + نقص العوم (الوكيل دفع نقداً للمستلم)
    await postEntries(
      tx,
      [
        { walletId: suspense.id, direction: "DEBIT", amountMinor: fresh.amountMinor },
        { walletId: float.id, direction: "DEBIT", amountMinor: fresh.amountMinor },
      ],
      { transactionRef: fresh.ref, currency: "YER" }
    );
    await tx.transaction.updateMany({
      where: { ref: fresh.ref },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await tx.commissionEntry.create({
      data: {
        agentId: user.id,
        opType: "REMITTANCE",
        sourceRef: fresh.ref,
        amountMinor: Math.floor((fresh.amountMinor * profile.commissionBps) / 10_000),
      },
    });
    await tx.agentProfile.update({
      where: { userId: user.id },
      data: { floatMinor: float.balanceMinor - fresh.amountMinor },
    });
    await notify(
      tx,
      fresh.senderId,
      "تم تسليم حوالتك",
      `سُلّمت حوالة ${formatMinor(fresh.amountMinor, "YER")} إلى ${fresh.receiverName} عبر ${profile.shopName}.`,
      "TXN",
      fresh.ref
    );
    return tx.remittance.findUnique({ where: { id: fresh.id } });
  });

  return ok({ remittance: toRemittanceView(paid!, profile.shopName) });
});
