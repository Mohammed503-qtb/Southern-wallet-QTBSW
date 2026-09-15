/**
 * G3 — POST /api/agent/cash/complete { cashOpId, code }
 * إتمام إيداع/سحب نقدي لدى الوكيل:
 *   DEPOSIT:  [AGENT_FLOAT CREDIT a] + [MAIN CREDIT a]  Σ=0 (العوم يزيد)
 *             + CommissionEntry CASH_IN
 *   WITHDRAW: [SUSPENSE DEBIT a] + [AGENT_FLOAT DEBIT a]  Σ=0 (العوم ينقص)
 *             + فحص العوم (CWD-003) + CommissionEntry WITHDRAW
 * CWD-001 (رمز)، CWD-002 (منتهي)، سلوك idempotent عند إعادة الإتمام.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { runLazyExpiry } from "@/lib/server/cashflow";
import { getOrCreateAgentFloatWallet, getOrCreateMainWallet, getSystemWallet, postEntries } from "@/lib/server/ledger";
import { notify } from "@/lib/server/notify";
import { formatMinor } from "@/lib/server/money";
import { toCashOpView } from "@/lib/server/views";
import { db } from "@/lib/db";

async function buildView(opId: string, agentUserId: string) {
  const op = await db.cashOperation.findUnique({ where: { id: opId } });
  if (!op) return null;
  const profile = await db.agentProfile.findUnique({ where: { userId: op.agentId } });
  const owner = await db.user.findUnique({ where: { id: op.agentId }, select: { fullName: true } });
  void agentUserId;
  return toCashOpView(op, profile, owner?.fullName ?? null);
}

export const POST = route(async (req) => {
  const user = await requireUser(["AGENT"]);
  await runLazyExpiry();

  const body = await readJsonBody(req);
  const cashOpId = reqStr(body, "cashOpId");
  const code = reqStr(body, "code");

  const profile = await db.agentProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    throw new RouteError("SYS-001", 500, { reason: "ملف الوكيل غير موجود" });
  }
  if (profile.status !== "ACTIVE") {
    throw new RouteError("SRV-001", 403, { reason: "حساب الوكيل غير مفعّل" });
  }

  const op = await db.cashOperation.findUnique({ where: { id: cashOpId } });
  if (!op || op.agentId !== user.id) {
    throw new RouteError("RBAC-001", 403, { reason: "العملية ليست ضمن طابورك" });
  }
  if (op.status === "COMPLETED") {
    // idempotent — أعد نتيجة الإتمام نفسها
    const view = await buildView(op.id, user.id);
    return ok({ ...view, replayed: true });
  }
  if (op.status !== "PENDING") {
    throw new RouteError("CWD-002", 409, { status: op.status });
  }
  if (op.code !== code.trim()) {
    throw new RouteError("CWD-001", 400);
  }
  if (op.expiresAt < new Date()) {
    throw new RouteError("CWD-002", 409, { status: "EXPIRED" });
  }

  await db.$transaction(async (tx) => {
    const fresh = await tx.cashOperation.findUnique({ where: { id: op.id } });
    if (!fresh || fresh.status !== "PENDING") {
      throw new RouteError("CWD-002", 409, { status: fresh?.status ?? "PENDING" });
    }
    const float = await getOrCreateAgentFloatWallet(tx, user.id);

    if (fresh.type === "DEPOSIT") {
      // المستلم سلّم نقداً للوكيل → العوم يزيد + رصيد المستخدم يزيد
      const main = await getOrCreateMainWallet(tx, fresh.userId, "YER");
      await postEntries(
        tx,
        [
          { walletId: main.id, direction: "CREDIT", amountMinor: fresh.amountMinor },
          { walletId: float.id, direction: "CREDIT", amountMinor: fresh.amountMinor },
        ],
        { transactionRef: fresh.ref, currency: "YER" }
      );
      await tx.commissionEntry.create({
        data: {
          agentId: user.id,
          opType: "CASH_IN",
          sourceRef: fresh.ref,
          amountMinor: Math.floor((fresh.amountMinor * profile.commissionBps) / 10_000),
        },
      });
      await tx.cashOperation.update({
        where: { id: fresh.id },
        data: { status: "COMPLETED", processedAt: new Date() },
      });
      await tx.transaction.updateMany({
        where: { ref: fresh.ref },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      // مزامنة الرصيد التشغيلي في ملف الوكيل
      await tx.agentProfile.update({
        where: { userId: user.id },
        data: { floatMinor: float.balanceMinor + fresh.amountMinor },
      });
      await notify(
        tx,
        fresh.userId,
        "تم إيداع النقدية",
        `أكمل ${profile.shopName} إيداع ${formatMinor(fresh.amountMinor, "YER")} إلى محفظتك.`,
        "TXN",
        fresh.ref
      );
    } else {
      // WITHDRAW: الوكيل يدفع نقداً → العوم ينقص + تحرير الحجز من SUSPENSE
      if (float.balanceMinor < fresh.amountMinor) {
        throw new RouteError("CWD-003", 403, { float: float.balanceMinor, needed: fresh.amountMinor });
      }
      const suspense = await getSystemWallet(tx, "SUSPENSE", "YER");
      await postEntries(
        tx,
        [
          { walletId: suspense.id, direction: "DEBIT", amountMinor: fresh.amountMinor },
          { walletId: float.id, direction: "DEBIT", amountMinor: fresh.amountMinor },
        ],
        { transactionRef: fresh.ref, currency: "YER" }
      );
      await tx.commissionEntry.create({
        data: {
          agentId: user.id,
          opType: "WITHDRAW",
          sourceRef: fresh.ref,
          amountMinor: Math.floor((fresh.amountMinor * profile.commissionBps) / 10_000),
        },
      });
      await tx.cashOperation.update({
        where: { id: fresh.id },
        data: { status: "COMPLETED", processedAt: new Date() },
      });
      await tx.transaction.updateMany({
        where: { ref: fresh.ref },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      await tx.agentProfile.update({
        where: { userId: user.id },
        data: { floatMinor: float.balanceMinor - fresh.amountMinor },
      });
      await notify(
        tx,
        fresh.userId,
        "تم تسليم السحب",
        `استلمت ${formatMinor(fresh.amountMinor, "YER")} من ${profile.shopName}.`,
        "TXN",
        fresh.ref
      );
    }
  });

  const view = await buildView(op.id, user.id);
  return ok(view);
});
