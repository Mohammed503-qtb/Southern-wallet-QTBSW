/**
 * ============================================================
 * محفظة الجنوب — Seed خدمات الدفع (المرحلة 2 / 9-b)
 * تشغيل: bun prisma/seed-phase2-payments.ts
 *
 * المبادئ:
 *  • idempotent (upsert-style بفحص الوجود أولاً): مسارات ثابتة
 *    deterministic refs (BP-/TU-…) — إعادة التشغيل لا تكرر شيئاً.
 *  • كل حركة مالية تمر بمحرك الدفتر نفسه (postEntries) — Σ=0 مضمون:
 *      [MAIN DEBIT a+f] + [FEE:YER CREDIT f] + [SUSPENSE:YER CREDIT a]
 *  • لا يمس أياً من بيانات Seed الأساسية (لا حذف/إعادة زرع) — إضافات فقط.
 *  • في النهاية: تفعيل ServiceState لمفاتيح BILLS/TOPUP/NETWORK_CARDS
 *    إلى ON مع ملاحظة «خدمة Beta مفعلة».
 * ============================================================
 */
import { PrismaClient } from "@prisma/client";
import { postEntries, ledgerCheck } from "../src/lib/server/ledger";
import { notify } from "../src/lib/server/notify";
import {
  simulatedDueAmountMinor,
  generateCardCode,
} from "../src/lib/server/payments-catalog";
import type { DbClient } from "../src/lib/server/audit";

const db = new PrismaClient({ log: ["warn", "error"] });

// ============ أدوات مساعدة ============

/** مرجع ثابت (deterministic) لضمان idempotency البذرة */
function fixedRef(prefix: string, ymd: string, suffix: string): string {
  return `${prefix}-${ymd}-${suffix}`;
}

function daysAgo(n: number, hour = 10, minute = 0): Date {
  const d = new Date(Date.now() - n * 86_400_000);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

function ymdOf(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** رسوم خدمات الدفع (تُقرأ من FeeRule بعد زرعها — أو الأصل الثابت) */
async function paymentsFee(dbx: DbClient, opType: string, fallback: number): Promise<number> {
  const rule = await dbx.feeRule.findUnique({
    where: { opType_currency: { opType, currency: "YER" } },
  });
  if (!rule) return fallback;
  const pct = Math.floor((1_000 * rule.pctBps) / 10_000);
  const fee = pct + rule.fixedMinor;
  return Math.max(rule.minFeeMinor, rule.maxFeeMinor != null ? Math.min(fee, rule.maxFeeMinor) : fee);
}

// ============ التنفيذ ============

async function main(): Promise<void> {
  console.log("→ [1/5] FeeRules خدمات الدفع (BILL_PAY/TOPUP/CARD_PURCHASE — YER)…");
  const feeRules: Array<{
    opType: string;
    currency: string;
    pctBps: number;
    fixedMinor: number;
    minFeeMinor: number;
    maxFeeMinor: number | null;
  }> = [
    // فاتورة: 50 ر.ي ثابتة
    { opType: "BILL_PAY", currency: "YER", pctBps: 0, fixedMinor: 50, minFeeMinor: 50, maxFeeMinor: null },
    // شحن رصيد: 15 ر.ي ثابتة
    { opType: "TOPUP", currency: "YER", pctBps: 0, fixedMinor: 15, minFeeMinor: 15, maxFeeMinor: null },
    // كرت شبكة: 10 ر.ي ثابتة
    { opType: "CARD_PURCHASE", currency: "YER", pctBps: 0, fixedMinor: 10, minFeeMinor: 10, maxFeeMinor: null },
  ];
  for (const rule of feeRules) {
    const existing = await db.feeRule.findUnique({
      where: { opType_currency: { opType: rule.opType, currency: rule.currency } },
    });
    if (existing) {
      console.log(`   · FeeRule ${rule.opType}/YER موجودة (id=${existing.id}) — تخطٍ`);
      continue;
    }
    await db.feeRule.create({ data: rule });
    console.log(`   ✔ FeeRule ${rule.opType}/YER: ثابتة ${rule.fixedMinor} ر.ي`);
  }

  console.log("→ [2/5] بيانات المستخدم ومحافظ النظام…");
  const ahmad = await db.user.findUnique({ where: { phone: "770000001" } });
  if (!ahmad) {
    throw new Error("مستخدم أحمد 770000001 غير موجود — شغّل prisma/seed.ts أولاً");
  }
  const system = await db.user.findFirst({ where: { role: "SYSTEM" } });
  if (!system) {
    throw new Error("حساب النظام غير موجود — شغّل prisma/seed.ts أولاً");
  }
  const mainYER = await db.wallet.findFirst({
    where: { userId: ahmad.id, kind: "MAIN", currency: "YER" },
  });
  const feeYER = await db.wallet.findFirst({
    where: { userId: system.id, kind: "FEE", currency: "YER" },
  });
  const suspenseYER = await db.wallet.findFirst({
    where: { userId: system.id, kind: "SUSPENSE", currency: "YER" },
  });
  if (!mainYER || !feeYER || !suspenseYER) {
    throw new Error("محافظ أحمد/النظام غير موجودة — شغّل prisma/seed.ts أولاً");
  }

  /** إدخال عملية تاريخية متوازنة إن لم توجد (بطابع metadata marker ثابت) */
  async function ensureHistoricalTx(params: {
    ref: string;
    date: Date;
    type: "BILL_PAY" | "TOPUP" | "CARD_PURCHASE";
    amountMinor: number;
    feeMinor: number;
    counterpartyName: string;
    description: string;
    metadata: Record<string, unknown>;
    notifyBody: string;
    notifyTitle: string;
  }): Promise<void> {
    const existing = await db.transaction.findUnique({ where: { ref: params.ref } });
    if (existing) {
      console.log(`   · ${params.type} ${params.ref} موجودة — تخطٍ`);
      return;
    }
    await db.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          ref: params.ref,
          userId: ahmad.id,
          type: params.type,
          status: "COMPLETED",
          currency: "YER",
          amountMinor: params.amountMinor,
          feeMinor: params.feeMinor,
          direction: "DEBIT",
          counterpartyName: params.counterpartyName,
          description: params.description,
          createdAt: params.date,
          completedAt: params.date,
          metadataJson: JSON.stringify({ ...params.metadata, seedMarker: "P2PAY" }),
        },
      });
      await postEntries(
        tx,
        [
          { walletId: mainYER.id, direction: "DEBIT", amountMinor: params.amountMinor + params.feeMinor },
          { walletId: feeYER.id, direction: "CREDIT", amountMinor: params.feeMinor },
          { walletId: suspenseYER.id, direction: "CREDIT", amountMinor: params.amountMinor },
        ],
        { transactionRef: params.ref, currency: "YER" }
      );
      await notify(tx, ahmad.id, params.notifyTitle, params.notifyBody, "TXN", params.ref, params.date);
    });
    console.log(`   ✔ ${params.type} ${params.ref} — ${params.amountMinor}+${params.feeMinor} ر.ي`);
  }

  console.log("→ [3/5] معاملات تاريخية لأحمد (فاتورة كهرباء + شحن رصيد + كرت شبكة)…");

  // (1) فاتورة كهرباء عدن سُدّدت قبل 4 أيام — حساب 23456789
  {
    const date = daysAgo(4, 12);
    const account = "23456789";
    const due = simulatedDueAmountMinor("ELEC-ADEN", account);
    const fee = await paymentsFee(db, "BILL_PAY", 50);
    await ensureHistoricalTx({
      ref: fixedRef("BP", ymdOf(date), "P2BILL01"),
      date,
      type: "BILL_PAY",
      amountMinor: due,
      feeMinor: fee,
      counterpartyName: "كهرباء عدن — المؤسسة العامة للكهرباء",
      description: `سداد فاتورة كهرباء عدن — المؤسسة العامة للكهرباء — ${account}`,
      metadata: {
        billerCode: "ELEC-ADEN",
        billerName: "كهرباء عدن — المؤسسة العامة للكهرباء",
        accountNumber: account,
        dueAmountMinor: due,
      },
      notifyTitle: "تم سداد الفاتورة",
      notifyBody: `سُدّدت فاتورة كهرباء عدن (${due.toLocaleString("en-US")} ر.ي) عن الحساب ${account}.`,
    });
  }

  // (2) شحن رصيد MTN لرقم أحمد نفسه قبل يومين — فئة 1,000
  {
    const date = daysAgo(2, 15);
    const amount = 1_000;
    const fee = await paymentsFee(db, "TOPUP", 15);
    await ensureHistoricalTx({
      ref: fixedRef("TU", ymdOf(date), "P2TOPU01"),
      date,
      type: "TOPUP",
      amountMinor: amount,
      feeMinor: fee,
      counterpartyName: "MTN اليمن",
      description: `شحن رصيد MTN اليمن — 770000001`,
      metadata: { phone: "770000001", operatorCode: "MTN", operatorName: "MTN اليمن" },
      notifyTitle: "تم شحن الرصيد",
      notifyBody: `شُحن رصيد 1,000 ر.ي على الرقم 770000001 (MTN اليمن).`,
    });
  }

  // (3) شراء كرت شبكة يُو قبل يوم واحد — باقة 5GB/30يوم
  {
    const date = daysAgo(1, 9);
    const amount = 9_000;
    const fee = await paymentsFee(db, "CARD_PURCHASE", 10);
    const cardCode = generateCardCode();
    await ensureHistoricalTx({
      ref: fixedRef("NC", ymdOf(date), "P2CARD01"),
      date,
      type: "CARD_PURCHASE",
      amountMinor: amount,
      feeMinor: fee,
      counterpartyName: "يُو (You)",
      description: `شراء كرت شبكة يُو (You) — باقة يو ميز (5 GB / 30 يوم)`,
      metadata: {
        productCode: "YOU-M5",
        productName: "باقة يو ميز",
        operatorName: "يُو (You)",
        cardCode,
      },
      notifyTitle: "تم شراء كرت الشبكة",
      notifyBody: `كرت باقة يو ميز من يُو (You) (9,000 ر.ي) — رمز الكرت: ${cardCode}. احفظ الرمز؛ تجده أيضاً في تفاصيل العملية.`,
    });
  }

  console.log("→ [4/5] تفعيل الخدمات (ServiceState → ON)…");
  for (const key of ["BILLS", "TOPUP", "NETWORK_CARDS"]) {
    const existing = await db.serviceState.findUnique({ where: { key } });
    if (existing) {
      await db.serviceState.update({
        where: { key },
        data: { state: "ON", note: "خدمة Beta مفعلة" },
      });
    } else {
      await db.serviceState.create({
        data: { key, state: "ON", note: "خدمة Beta مفعلة" },
      });
    }
    console.log(`   ✔ ${key} → ON (خدمة Beta مفعلة)`);
  }

  console.log("→ [5/5] التحقق: توازن الدفاتر + رصيد أحمد…");
  const check = await ledgerCheck(db);
  if (!check.ledgerBalanced) {
    throw new Error(`دفاتر غير متوازنة: ${check.ledgerViolations.join(" | ")}`);
  }
  const main = await db.wallet.findUnique({ where: { id: mainYER.id } });
  const counts = {
    feeRules: await db.feeRule.count(),
    billsTx: await db.transaction.count({ where: { userId: ahmad.id, type: "BILL_PAY" } }),
    topupTx: await db.transaction.count({ where: { userId: ahmad.id, type: "TOPUP" } }),
    cardTx: await db.transaction.count({ where: { userId: ahmad.id, type: "CARD_PURCHASE" } }),
    services: await db.serviceState.count({ where: { state: "ON" } }),
  };
  console.log("✔ اكتمل Seed خدمات الدفع — الدفاتر متوازنة (Σ=0):");
  console.table({ ...check, ahmadYER: main?.balanceMinor });
  console.table(counts);
}

main()
  .catch((err) => {
    console.error("فشل Seed خدمات الدفع:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
