/**
 * محفظة الجنوب — الرسوم والحدود اليومية وأسعار الصرف
 * (FeeRule/LimitRule/FxRate) — حسابات نقية + استعلامات على عميل قابل للتمرير
 * ملاحظة: بلا استيراد من "next" — يعمل من المسارات ومن prisma/seed.ts
 */
import { CURRENCY_META, formatMoney } from "../api-types";
import type { CurrencyCode } from "../api-types";
import { RouteError } from "./envelope";
import type { DbClient } from "./audit";

export type FeeOpType = "TRANSFER" | "REMITTANCE" | "WITHDRAW" | "FX";

export interface FeeRuleLike {
  pctBps: number;
  fixedMinor: number;
  minFeeMinor: number;
  maxFeeMinor: number | null;
}

/** تنسيق مبلغ للعرض (يفوّق إلى api-types.formatMoney) */
export function formatMinor(minor: number, currency: CurrencyCode): string {
  return formatMoney(minor, currency);
}

/** فحص صلاحية مبلغ: عدد صحيح موجب ضمن حدود الأمان */
export function requireValidAmount(currency: string, amountMinor: number): number {
  if (typeof amountMinor !== "number" || !Number.isInteger(amountMinor)) {
    throw new RouteError("SYS-001", 400, { field: "amountMinor", reason: "المبلغ يجب أن يكون عدداً صحيحاً" });
  }
  if (amountMinor <= 0) {
    throw new RouteError("SYS-001", 400, { field: "amountMinor", reason: "المبلغ يجب أن يكون أكبر من صفر" });
  }
  if (amountMinor > 2_000_000_000) {
    throw new RouteError("SYS-001", 400, { field: "amountMinor", reason: "المبلغ يتجاوز الحد الأقصى" });
  }
  if (typeof currency !== "string" || !(currency in CURRENCY_META)) {
    throw new RouteError("SYS-001", 400, { field: "currency", reason: "عملة غير مدعومة" });
  }
  return amountMinor;
}

/** حساب الرسوم: pctBps + ثابتة مع حدود min/max */
export function computeFee(rule: FeeRuleLike, amountMinor: number): number {
  const pct = Math.floor((amountMinor * rule.pctBps) / 10_000);
  let fee = pct + rule.fixedMinor;
  if (fee < rule.minFeeMinor) fee = rule.minFeeMinor;
  if (rule.maxFeeMinor != null && fee > rule.maxFeeMinor) fee = rule.maxFeeMinor;
  return Math.max(0, fee);
}

/** جلب قاعدة الرسوم — لا توجد = إعدادات ناقصة (SRV-001) */
export async function getFeeRule(tx: DbClient, opType: FeeOpType, currency: string) {
  const rule = await tx.feeRule.findUnique({
    where: { opType_currency: { opType, currency } },
  });
  if (!rule) {
    throw new RouteError("SRV-001", 503, {
      reason: `لا توجد قاعدة رسوم ${opType}/${currency}`,
    });
  }
  return rule;
}

// ============ الحدود اليومية ============

/** أنواع العمليات الصادرة التي تستهلك الحدود اليومية (حركات مالية للغير/خارج المحفظة) */
const LIMIT_COUNTED_TYPES = ["TRANSFER_OUT", "REMITTANCE", "CASH_OUT", "FX_EXCHANGE"];

/** بداية اليوم بتوقيت عدن (UTC+3) */
export function dayStartAden(): Date {
  const shifted = new Date(Date.now() + 3 * 3600_000);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 3 * 3600_000
  );
}

/**
 * فحص الحدود اليومية (TXN-002): عدد وقيمة عمليات اليوم (PENDING+COMPLETED)
 * للعملة + فحص حد العملية الواحدة — يُستدعى داخل $transaction قبل التنفيذ.
 * extraAmountMinor = المبلغ الخارج الجديد (مع رسومه)
 */
export async function assertDailyLimit(
  tx: DbClient,
  user: { id: string; kycLevel: string },
  currency: string,
  extraAmountMinor: number
): Promise<void> {
  const rule = await tx.limitRule.findUnique({
    where: { kycLevel_currency: { kycLevel: user.kycLevel, currency } },
  });
  if (!rule) return; // بلا قاعدة = بلا حد (Alpha)

  const agg = await tx.transaction.aggregate({
    where: {
      userId: user.id,
      currency,
      direction: "DEBIT",
      status: { in: ["PENDING", "COMPLETED"] },
      type: { in: LIMIT_COUNTED_TYPES },
      createdAt: { gte: dayStartAden() },
    },
    _count: true,
    _sum: { amountMinor: true, feeMinor: true },
  });
  const count = typeof agg._count === "number" ? agg._count : 0;
  const totalOut = (agg._sum.amountMinor ?? 0) + (agg._sum.feeMinor ?? 0);

  if (count + 1 > rule.dailyTxnCount) {
    throw new RouteError("TXN-002", 403, { limit: rule.dailyTxnCount, reason: "حد عدد العمليات اليومي" });
  }
  if (extraAmountMinor > rule.perTxnAmountMinor) {
    throw new RouteError("TXN-002", 403, { limit: rule.perTxnAmountMinor, reason: "الحد الأقصى للعملية الواحدة" });
  }
  if (totalOut + extraAmountMinor > rule.dailyAmountMinor) {
    throw new RouteError("TXN-002", 403, { limit: rule.dailyAmountMinor, reason: "حد المبلغ اليومي" });
  }
}

// ============ أسعار الصرف ============

/** سعر الصرف الحقيقي (المخزن ÷1e6) — يبحث الاتجاه أو المعكوس — أو null */
export async function findFxRate(tx: DbClient, from: string, to: string): Promise<number | null> {
  const direct = await tx.fxRate.findUnique({
    where: { fromCurrency_toCurrency: { fromCurrency: from, toCurrency: to } },
  });
  if (direct) return direct.rate / 1_000_000;
  const inverse = await tx.fxRate.findUnique({
    where: { fromCurrency_toCurrency: { fromCurrency: to, toCurrency: from } },
  });
  if (inverse && inverse.rate > 0) return 1_000_000 / inverse.rate;
  return null;
}

/** تحويل وحدات فرعية بين عملتين بدقة BigInt (تقريب أرضي) */
export function convertMinor(amountMinor: number, rate: number, from: CurrencyCode, to: CurrencyCode): number {
  const dFrom = CURRENCY_META[from].decimals;
  const dTo = CURRENCY_META[to].decimals;
  const rateScaled = BigInt(Math.round(rate * 1_000_000_000)); // rate ×1e9
  const numerator = BigInt(amountMinor) * rateScaled * BigInt(10 ** dTo);
  const denominator = BigInt(10 ** dFrom) * BigInt(1_000_000_000);
  return Number(numerator / denominator);
}
