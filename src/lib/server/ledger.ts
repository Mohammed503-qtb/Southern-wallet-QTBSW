/**
 * محفظة الجنوب — محرك الدفتر (قلب النظام)
 * ============================================================
 * القاعدة الحديدية: لكل عملية ولكل عملة Σ(القيود الموقعة) = 0
 * حيث القيد المخزَّن: DEBIT = -amount، CREDIT = +amount (بالاصطلاح العادي).
 *
 * حساب الوكيل (AGENT_FLOAT) — إشارة معكوسة (رأس schema.prisma):
 * • رصيد محفظة الوكيل = نقدية نظام بحوزته (التزام على النظام)
 * • المُنفِّذ (المسارات/الـ seed) يمرر direction = الاتجاه المالي المقصود:
 *   CREDIT = زيادة العوم، DEBIT = نقص العوم (كأي محفظة عادية)
 * • postEntries يعكس مساهمة العنصر في مجموع Σ (sign = -1 تلقائياً لمحافظ
 *   AGENT_FLOAT) ويخزّن القيد بالاتجاه المعكوس: لذلك يظهر في الدفتر
 *   DEBIT على AGENT_FLOAT بمعنى «زيادة التزام/عوم» — فيتحقق Σ=0 دائماً
 *   بالاصطلاح العادي في فحص M16 دون أي معاملة خاصة.
 * • balanceAfterMinor = العوم/الرصيد الجديد بعد الحركة.
 *
 * مثال (إتمام إيداع نقدي بمبلغ a لدى وكيل):
 *   [MAIN المستلم: CREDIT a]  → مساهمة +a (عادية)
 *   [AGENT_FLOAT: CREDIT a]   → مساهمة -a (معكوسة) — والرصيد يزيد a
 *   Σ = 0 ✓ والقيد المخزن للعوم: DEBIT a (زيادة عوم)
 * مثال (إتمام سحب نقدي a):
 *   [SUSPENSE: DEBIT a]       → مساهمة -a
 *   [AGENT_FLOAT: DEBIT a]    → مساهمة +a (معكوسة) — والرصيد ينقص a
 *   Σ = 0 ✓ والقيد المخزن للعوم: CREDIT a (نقص عوم)
 *
 * ملاحظة: بلا استيراد من "next" — يعمل من المسارات ومن prisma/seed.ts
 */
import type { Wallet } from "@prisma/client";
import { RouteError } from "./envelope";
import type { DbClient } from "./audit";

export type LedgerDirection = "DEBIT" | "CREDIT";

export interface LedgerItem {
  walletId: string;
  /** الاتجاه المالي المقصود: DEBIT ينقص رصيد المحفظة، CREDIT يزيده (حتى لعوم الوكيل) */
  direction: LedgerDirection;
  amountMinor: number;
  /** صريح لعكس مساهمة Σ (اختياري — يُفعَّل تلقائياً لمحافظ AGENT_FLOAT) */
  sign?: -1;
}

export interface LedgerPostingContext {
  transactionRef: string;
  currency: string;
}

/** المحافظ التي لا يجوز أن تسلب رصيداً سالباً */
const NON_NEGATIVE_KINDS = new Set(["MAIN", "SAVINGS", "AGENT_FLOAT"]);

/**
 * تسجيل قيود دفترية متوازنة + تحديث أرصدة المحافظ + كتابة LedgerEntry
 * مع balanceAfterMinor لكل قيد. يرمي SYS-001 إذا Σ ≠ 0 أو تعارض تزامني.
 */
export async function postEntries(
  tx: DbClient,
  items: LedgerItem[],
  ctx: LedgerPostingContext
): Promise<void> {
  const active = items.filter((it) => Number.isInteger(it.amountMinor) && it.amountMinor > 0);
  if (active.length === 0) return;

  const walletIds = [...new Set(active.map((it) => it.walletId))];
  const wallets = await tx.wallet.findMany({ where: { id: { in: walletIds } } });
  const walletById = new Map<string, Wallet>(wallets.map((w) => [w.id, w]));

  // 1) فحص التوازن Σ=0 (لكل عملة — الاستدعاء الواحد بعملة واحدة من ctx)
  let sum = 0;
  const deltas = new Map<string, number>();
  const prepared: Array<{ item: LedgerItem; wallet: Wallet; storedDirection: LedgerDirection }> = [];
  for (const item of active) {
    const wallet = walletById.get(item.walletId);
    if (!wallet) {
      throw new RouteError("SYS-001", 500, { reason: "محفظة غير موجودة في القيد" });
    }
    if (wallet.currency !== ctx.currency) {
      throw new RouteError("SYS-001", 500, { reason: "عملة المحفظة لا تطابق سياق القيد" });
    }
    const invert = item.sign === -1 || wallet.kind === "AGENT_FLOAT";
    const plain = item.direction === "DEBIT" ? -item.amountMinor : item.amountMinor;
    // مساهمة العنصر في مجموع Σ: معكوسة لمحافظ العوم
    sum += invert ? -plain : plain;
    // أثر الرصيد = الاتجاه المالي المقصود من المُنفِّذ
    deltas.set(wallet.id, (deltas.get(wallet.id) ?? 0) + plain);
    // القيد المخزن: معكوس الاتجاه لعناصر العوم (DEBIT على AGENT_FLOAT = زيادة عوم)
    const storedDirection: LedgerDirection = invert
      ? item.direction === "DEBIT"
        ? "CREDIT"
        : "DEBIT"
      : item.direction;
    prepared.push({ item, wallet, storedDirection });
  }
  if (sum !== 0) {
    throw new RouteError("SYS-001", 500, {
      reason: "قيود غير متوازنة — Σ≠0",
      sum,
      transactionRef: ctx.transactionRef,
    });
  }

  // 2) تحديث الأرصدة (تحديث متفائل يرفض التعارض التزامني)
  const newBalances = new Map<string, number>();
  for (const [walletId, delta] of deltas) {
    const wallet = walletById.get(walletId)!;
    const newBalance = wallet.balanceMinor + delta;
    if (newBalance < 0) {
      if (NON_NEGATIVE_KINDS.has(wallet.kind)) {
        throw new RouteError("TXN-001", 400, { reason: "رصيد غير كافٍ (دفتر)" });
      }
      throw new RouteError("SYS-001", 500, {
        reason: `رصيد نظامي سالب (${wallet.kind}:${wallet.currency})`,
      });
    }
    const updated = await tx.wallet.updateMany({
      where: { id: walletId, balanceMinor: wallet.balanceMinor },
      data: { balanceMinor: newBalance },
    });
    if (updated.count !== 1) {
      throw new RouteError("SYS-001", 500, { reason: "تعارض تزامني على المحفظة — أعد المحاولة" });
    }
    newBalances.set(walletId, newBalance);
  }

  // 3) كتابة القيود
  for (const p of prepared) {
    await tx.ledgerEntry.create({
      data: {
        transactionRef: ctx.transactionRef,
        walletId: p.item.walletId,
        direction: p.storedDirection,
        amountMinor: p.item.amountMinor,
        balanceAfterMinor: newBalances.get(p.item.walletId)!,
        currency: p.wallet.currency,
      },
    });
  }
}

// ============ وصول المحافظ ============

/** محفظة MAIN للمستخدم بالعملة (تُنشأ عند اللزوم) */
export async function getOrCreateMainWallet(tx: DbClient, userId: string, currency: string): Promise<Wallet> {
  const existing = await tx.wallet.findFirst({ where: { userId, kind: "MAIN", currency } });
  if (existing) return existing;
  return tx.wallet.create({ data: { userId, kind: "MAIN", currency, balanceMinor: 0 } });
}

/** محفظة نظام (FEE/SUSPENSE/FX) — موجودة من الـ Seed وإلا خطأ تهيئة */
export async function getSystemWallet(
  tx: DbClient,
  kind: "FEE" | "SUSPENSE" | "FX",
  currency: string
): Promise<Wallet> {
  const sys = await tx.user.findFirst({ where: { role: "SYSTEM" } });
  if (!sys) {
    throw new RouteError("SYS-001", 500, { reason: "حساب النظام غير موجود (Seed؟)" });
  }
  const wallet = await tx.wallet.findFirst({ where: { userId: sys.id, kind, currency } });
  if (!wallet) {
    throw new RouteError("SYS-001", 500, { reason: `محفظة النظام ${kind}:${currency} غير موجودة` });
  }
  return wallet;
}

/** محفظة عوم الوكيل (AGENT_FLOAT:YER) — تُنشأ عند اللزوم */
export async function getOrCreateAgentFloatWallet(tx: DbClient, agentUserId: string): Promise<Wallet> {
  const existing = await tx.wallet.findFirst({
    where: { userId: agentUserId, kind: "AGENT_FLOAT", currency: "YER" },
  });
  if (existing) return existing;
  return tx.wallet.create({
    data: { userId: agentUserId, kind: "AGENT_FLOAT", currency: "YER", balanceMinor: 0 },
  });
}

/** محفظة حصالة (SAVINGS مرتبطة بالحصالة) */
export async function getOrCreateSavingsWallet(tx: DbClient, userId: string, jarId: string, currency: string): Promise<Wallet> {
  const existing = await tx.wallet.findFirst({ where: { userId, kind: "SAVINGS", jarId, currency } });
  if (existing) return existing;
  return tx.wallet.create({ data: { userId, kind: "SAVINGS", jarId, currency, balanceMinor: 0 } });
}

// ============ فحص التوازن (M1/M16) ============

export interface LedgerCheckResult {
  ledgerBalanced: boolean;
  ledgerViolations: string[];
  totalEntries: number;
  groupsChecked: number;
}

/** فحص توازن الدفاتر: لكل (transactionRef, currency) يجب Σ الموقعة = 0 */
export async function ledgerCheck(client: DbClient): Promise<LedgerCheckResult> {
  const entries = await client.ledgerEntry.findMany({
    select: { transactionRef: true, currency: true, direction: true, amountMinor: true },
  });
  const sums = new Map<string, number>();
  for (const e of entries) {
    const key = `${e.transactionRef}|${e.currency}`;
    const signed = e.direction === "DEBIT" ? -e.amountMinor : e.amountMinor;
    sums.set(key, (sums.get(key) ?? 0) + signed);
  }
  const violations: string[] = [];
  for (const [key, sum] of sums) {
    if (sum !== 0) {
      violations.push(`${key.replace("|", " ")}: Σ=${sum}`);
    }
  }
  return {
    ledgerBalanced: violations.length === 0,
    ledgerViolations: violations.slice(0, 50),
    totalEntries: entries.length,
    groupsChecked: sums.size,
  };
}
