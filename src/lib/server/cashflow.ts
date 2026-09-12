/**
 * محفظة الجنوب — التسوية والإنهاء الكسول
 * منطق مشترك لإلغاء/انتهاء الحوالات والعمليات النقدية مع الاسترجاع
 * (R4/C6 + الإنهاء الكسول R3/C5/القراءات الإدارية + M15)
 * كل الاسترجاعات تمر بمحرك الدفتر (Σ=0 مضمون).
 */
import type { CashOperation, Remittance } from "@prisma/client";
import { db } from "../db";
import type { CurrencyCode } from "../api-types";
import type { DbClient } from "./audit";
import { RouteError } from "./envelope";
import { generateRef } from "./domain";
import { getOrCreateMainWallet, getSystemWallet, postEntries } from "./ledger";
import { formatMinor } from "./money";
import { notify } from "./notify";

interface SettleNotice {
  title: string;
  body: string;
}

/**
 * إنهاء حوالة PENDING (إلغاء/انتهاء) + استرجاع المبلغ من SUSPENSE إلى MAIN
 * يرمي REM-001 إذا سبق إنهاؤها (تعارض تزامني).
 */
export async function settleRemittance(
  tx: DbClient,
  rem: Remittance,
  newStatus: "CANCELLED" | "EXPIRED",
  notice: SettleNotice
): Promise<void> {
  const flipped = await tx.remittance.updateMany({
    where: { id: rem.id, status: "PENDING" },
    data: { status: newStatus, cancelledAt: new Date() },
  });
  if (flipped.count === 0) {
    throw new RouteError("REM-001", 409, { reason: "الحوالة لم تعد معلقة" });
  }
  await tx.transaction.updateMany({
    where: { ref: rem.ref },
    data: { status: newStatus },
  });
  const main = await getOrCreateMainWallet(tx, rem.senderId, rem.currency);
  const suspense = await getSystemWallet(tx, "SUSPENSE", rem.currency);
  const refundRef = generateRef("RM");
  await tx.transaction.create({
    data: {
      ref: refundRef,
      userId: rem.senderId,
      type: "REMITTANCE_REFUND",
      status: "COMPLETED",
      currency: rem.currency,
      amountMinor: rem.amountMinor,
      feeMinor: 0,
      direction: "CREDIT",
      counterpartyName: rem.receiverName,
      counterpartyPhone: rem.receiverPhone,
      description:
        newStatus === "CANCELLED" ? "إلغاء حوالة واسترجاع المبلغ" : "انتهاء صلاحية حوالة واسترجاع المبلغ",
      relatedRef: rem.ref,
      completedAt: new Date(),
      metadataJson: JSON.stringify({ remittanceId: rem.id }),
    },
  });
  await postEntries(
    tx,
    [
      { walletId: suspense.id, direction: "DEBIT", amountMinor: rem.amountMinor },
      { walletId: main.id, direction: "CREDIT", amountMinor: rem.amountMinor },
    ],
    { transactionRef: refundRef, currency: rem.currency }
  );
  await notify(tx, rem.senderId, notice.title, notice.body, "TXN", rem.ref);
}

/**
 * إنهاء عملية نقدية PENDING (إلغاء/انتهاء):
 * WITHDRAW → استرجاع من SUSPENSE إلى MAIN (CASH_REFUND)؛ DEPOSIT → إلغاء الطلب فقط.
 * يرمي CWD-002 إذا سبق إنهاؤها.
 */
export async function settleCashOp(
  tx: DbClient,
  op: CashOperation,
  newStatus: "CANCELLED" | "EXPIRED",
  notice: SettleNotice
): Promise<void> {
  const flipped = await tx.cashOperation.updateMany({
    where: { id: op.id, status: "PENDING" },
    data: { status: newStatus, processedAt: new Date() },
  });
  if (flipped.count === 0) {
    throw new RouteError("CWD-002", 409, { reason: "العملية لم تعد معلقة" });
  }
  await tx.transaction.updateMany({
    where: { ref: op.ref },
    data: { status: newStatus },
  });
  if (op.type === "DEPOSIT") {
    await notify(tx, op.userId, notice.title, notice.body, "TXN", op.ref);
    return;
  }
  const main = await getOrCreateMainWallet(tx, op.userId, op.currency);
  const suspense = await getSystemWallet(tx, "SUSPENSE", op.currency);
  const refundRef = generateRef("CW");
  await tx.transaction.create({
    data: {
      ref: refundRef,
      userId: op.userId,
      type: "CASH_REFUND",
      status: "COMPLETED",
      currency: op.currency,
      amountMinor: op.amountMinor,
      feeMinor: 0,
      direction: "CREDIT",
      description:
        newStatus === "CANCELLED" ? "إلغاء طلب سحب واسترجاع المبلغ" : "انتهاء طلب سحب واسترجاع المبلغ",
      relatedRef: op.ref,
      completedAt: new Date(),
      metadataJson: JSON.stringify({ cashOpId: op.id }),
    },
  });
  await postEntries(
    tx,
    [
      { walletId: suspense.id, direction: "DEBIT", amountMinor: op.amountMinor },
      { walletId: main.id, direction: "CREDIT", amountMinor: op.amountMinor },
    ],
    { transactionRef: refundRef, currency: op.currency }
  );
  await notify(tx, op.userId, notice.title, notice.body, "TXN", op.ref);
}

// ============ الإنهاء الكسول ============

/** إنهاء الحوالات المعلقة المنتهية (المستخدم أو الجميع) */
export async function expireDueRemittances(userId?: string): Promise<void> {
  const now = new Date();
  const due = await db.remittance.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now },
      ...(userId ? { senderId: userId } : {}),
    },
    take: 50,
  });
  for (const rem of due) {
    try {
      await db.$transaction(async (tx) => {
        const fresh = await tx.remittance.findUnique({ where: { id: rem.id } });
        if (!fresh || fresh.status !== "PENDING" || fresh.expiresAt >= now) return;
        await settleRemittance(tx, fresh, "EXPIRED", {
          title: "انتهت صلاحية حوالة",
          body: `انتهت صلاحية الحوالة ${fresh.ref} وتم استرجاع ${formatMinor(
            fresh.amountMinor,
            fresh.currency as CurrencyCode
          )} إلى محفظتك الرئيسية.`,
        });
      });
    } catch (err) {
      if (err instanceof RouteError) continue; // سبق إنهاؤها بطلب موازٍ
      throw err;
    }
  }
}

/** إنهاء العمليات النقدية المعلقة المنتهية (المستخدم أو الجميع) */
export async function expireDueCashOps(userId?: string): Promise<void> {
  const now = new Date();
  const due = await db.cashOperation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now },
      ...(userId ? { userId } : {}),
    },
    take: 50,
  });
  for (const op of due) {
    try {
      await db.$transaction(async (tx) => {
        const fresh = await tx.cashOperation.findUnique({ where: { id: op.id } });
        if (!fresh || fresh.status !== "PENDING" || fresh.expiresAt >= now) return;
        if (fresh.type === "DEPOSIT") {
          await settleCashOp(tx, fresh, "EXPIRED", {
            title: "انتهى طلب الإيداع",
            body: `انتهت صلاحية طلب الإيداع ${fresh.ref} دون إتمامه لدى الوكيل.`,
          });
        } else {
          await settleCashOp(tx, fresh, "EXPIRED", {
            title: "انتهى طلب السحب",
            body: `انتهت صلاحية طلب السحب ${fresh.ref} وتم استرجاع ${formatMinor(
              fresh.amountMinor,
              fresh.currency as CurrencyCode
            )} إلى محفظتك.`,
          });
        }
      });
    } catch (err) {
      if (err instanceof RouteError) continue;
      throw err;
    }
  }
}

/** الإنهاء الكسول الكامل — يُستدعى من أي قراءة للحوالات/النقدي/القراءات الإدارية */
export async function runLazyExpiry(userId?: string): Promise<void> {
  await expireDueRemittances(userId);
  await expireDueCashOps(userId);
}
