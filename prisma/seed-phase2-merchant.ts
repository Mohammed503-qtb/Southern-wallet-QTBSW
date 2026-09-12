/**
 * ============================================================
 * محفظة الجنوب — Seed المرحلة 2: التجار والحوالات الواردة (9-c)
 * تشغيل: bun prisma/seed-phase2-merchant.ts   (بعد prisma/seed.ts)
 *
 * المحتوى:
 *  • تاجران: 770000020 «متجر الجنوب للأغذية» (عدن — بقالة ومواد غذائية)
 *    و770000021 «صيدلية الشفاء» (لحج — أدوية) — role=MERCHANT، ACTIVE،
 *    VERIFIED، PIN=123456، محافظ MAIN الثلاث بأرصدة افتتاحية (نمط seed.ts).
 *  • FeeRule (MERCHANT_PAY, YER): 1% بحد أدنى 20 ر.ي — الرسوم على التاجر.
 *  • حوالتان واردتان PENDING لأحمد 770000001 (نمط التخزين في
 *    src/lib/server/remit-in-store.ts): «الفلوس للصرافة» برمز 552214
 *    (تنتهي بعد يومين) و«الخليج للصرافة» برمز 771903 (بعد 6 أيام)
 *    + معاملتان نائبتان REMIT_IN_CLAIM + إشعارا وصول بالرمز.
 *  • معاملة بيع تاريخية واحدة (أحمد → متجر الجنوب) بمحرك القيود Σ=0:
 *    [MAIN أحمد DEBIT a] + [FEE CREDIT fee] + [MAIN التاجر CREDIT net].
 *  • في النهاية: ServiceState MERCHANT_PAY وREMITTANCE_IN → ON.
 *
 * Idempotent: لا يمسح شيئاً — يتحقق من الوجود قبل كل إضافة، لذا يمكن
 * تشغيله عدة مرات بأمان (بعد seed.ts الأساسي الذي يعيد البناء كاملاً).
 * ============================================================
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { hashPin } from "../src/lib/server/pin";
import { postEntries, ledgerCheck } from "../src/lib/server/ledger";
import { computeFee } from "../src/lib/server/money";
import { notify } from "../src/lib/server/notify";
import { generateRef } from "../src/lib/server/domain";
import type { DbClient } from "../src/lib/server/audit";

const db = new PrismaClient({ log: ["warn", "error"] });

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** مرجع بتاريخ محدد: PREFIX-YYYYMMDD-XXXXXXXX (نمط seed.ts) */
function refAt(prefix: string, date: Date): string {
  const ymd = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
  const bytes = randomBytes(8);
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return `${prefix}-${ymd}-${suffix}`;
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 3_600_000);
}

// ============ بيانات التجار ============

const MERCHANTS = [
  {
    phone: "770000020",
    fullName: "متجر الجنوب للأغذية",
    governorate: "عدن",
    openings: { YER: 180_000, SAR: 2_000, USD: 300 } as Record<string, number>,
  },
  {
    phone: "770000021",
    fullName: "صيدلية الشفاء",
    governorate: "لحج",
    openings: { YER: 95_000, SAR: 1_200, USD: 150 } as Record<string, number>,
  },
] as const;

// ============ الحوالات الواردة التجريبية ============

const INBOUND_REMITTANCES = [
  {
    claimCode: "552214",
    networkName: "الفلوس للصرافة",
    senderName: "سالم ناصر باعلوي",
    amountMinor: 85_000,
    daysToExpiry: 2,
  },
  {
    claimCode: "771903",
    networkName: "الخليج للصرافة",
    senderName: "عبدالله محمد الحضرمي",
    amountMinor: 120_000,
    daysToExpiry: 6,
  },
] as const;

const MERCHANT_PAY_FEE = {
  pctBps: 100, // 1%
  fixedMinor: 0,
  minFeeMinor: 20, // حد أدنى 20 ر.ي
  maxFeeMinor: null,
} as const;

async function main(): Promise<void> {
  console.log("→ [1/6] التحقق من المتطلبات (seed.ts الأساسي)…");
  const ahmad = await db.user.findUnique({ where: { phone: "770000001" } });
  const admin = await db.user.findUnique({ where: { phone: "770100001" } });
  const feeYer = await db.wallet.findFirst({
    where: { kind: "FEE", currency: "YER" },
  });
  if (!ahmad || !admin || !feeYer) {
    throw new Error("شغّل prisma/seed.ts أولاً — أحمد/الأدمن/محفظة FEE غير موجودين");
  }
  const ahmadYer = await db.wallet.findFirst({
    where: { userId: ahmad.id, kind: "MAIN", currency: "YER" },
  });
  if (!ahmadYer) throw new Error("محفظة أحمد YER غير موجودة (seed.ts؟)");

  console.log("→ [2/6] التاجران (MERCHANT) + محافظ MAIN الثلاث…");
  // ملاحظة تعارض موثقة: الهاتفين 770000020/770000021 كانا وكيلين إضافيين في
  // seed.ts الأساسي (صرافة المكلا ووكيل الوفاق) — عقد المرحلة 2 يخصصهما
  // للتاجرين، لذا يحوّلهما هذا الـseed كاملاً إلى MERCHANT مع تنظيف ملف
  // الوكالة وعومه (عوم الوكيلين الإضافيين بلا قيود دفترية أصلاً — الحذف آمن
  // Σ=0؛ نتحقق تحوطاً قبل الحذف، ونُبقي المحفظة إن كان لها قيود).
  const PIN = hashPin("123456");
  const merchantIds: Record<string, string> = {};
  const merchantYerWallets: Record<string, string> = {};
  for (const m of MERCHANTS) {
    const existing = await db.user.findUnique({ where: { phone: m.phone } });
    const user = existing
      ? await db.user.update({
          where: { id: existing.id },
          data: {
            role: "MERCHANT",
            fullName: m.fullName,
            status: "ACTIVE",
            kycLevel: "VERIFIED",
            governorate: m.governorate,
            pinHash: PIN,
          },
        })
      : await db.user.create({
          data: {
            phone: m.phone,
            fullName: m.fullName,
            role: "MERCHANT",
            status: "ACTIVE",
            kycLevel: "VERIFIED",
            governorate: m.governorate,
            pinHash: PIN,
          },
        });
    merchantIds[m.phone] = user.id;

    // تنظيف هوية الوكالة القديمة إن وجدت (تحويل كامل للتاجر)
    await db.agentProfile.deleteMany({ where: { userId: user.id } });
    const oldFloats = await db.wallet.findMany({
      where: { userId: user.id, kind: "AGENT_FLOAT" },
    });
    for (const fw of oldFloats) {
      const entryCount = await db.ledgerEntry.count({ where: { walletId: fw.id } });
      if (entryCount === 0) {
        await db.wallet.delete({ where: { id: fw.id } });
      }
    }

    for (const [currency, opening] of Object.entries(m.openings)) {
      const w = await db.wallet.findFirst({
        where: { userId: user.id, kind: "MAIN", currency },
      });
      if (!w) {
        await db.wallet.create({
          data: { userId: user.id, kind: "MAIN", currency, balanceMinor: opening },
        });
      }
    }
    const yerWallet = await db.wallet.findFirst({
      where: { userId: user.id, kind: "MAIN", currency: "YER" },
    });
    if (yerWallet) merchantYerWallets[m.phone] = yerWallet.id;
  }

  console.log("→ [3/6] قاعدة رسوم MERCHANT_PAY (YER)…");
  await db.feeRule.upsert({
    where: { opType_currency: { opType: "MERCHANT_PAY", currency: "YER" } },
    create: { opType: "MERCHANT_PAY", currency: "YER", ...MERCHANT_PAY_FEE },
    update: { ...MERCHANT_PAY_FEE },
  });

  console.log("→ [4/6] حوالتان واردتان PENDING لأحمد (رمزا 552214 و771903)…");
  for (const rem of INBOUND_REMITTANCES) {
    // Idempotent: تخطَّ إن وُجد رمز المطالبة مسبقاً
    const existing = await db.remittance.findFirst({ where: { deliveryCode: rem.claimCode } });
    if (existing) {
      console.log(`   ↷ حوالة ${rem.claimCode} موجودة — تخطٍ`);
      continue;
    }
    const expiresAt = new Date(Date.now() + rem.daysToExpiry * 86_400_000);
    await db.$transaction(async (tx: DbClient) => {
      // معاملة نائبة REMIT_IN_CLAIM PENDING (نمط remit-in-store.ts)
      const ref = refAt("RI", hoursAgo(1));
      await tx.transaction.create({
        data: {
          ref,
          userId: ahmad.id,
          type: "REMIT_IN_CLAIM",
          status: "PENDING",
          currency: "YER",
          amountMinor: rem.amountMinor,
          feeMinor: 0, // Beta: لا رسوم على الإصدار الوارد
          direction: "CREDIT",
          counterpartyName: rem.networkName,
          counterpartyPhone: null,
          description: `حوالة واردة من ${rem.senderName} — شبكة ${rem.networkName}`,
          metadataJson: JSON.stringify({ networkName: rem.networkName, senderName: rem.senderName }),
          createdAt: hoursAgo(1),
        },
      });
      await tx.remittance.create({
        data: {
          ref,
          senderId: admin.id, // مُصدِر الإدارة (المندوب) — لا المرسل الحقيقي
          receiverName: ahmad.fullName ?? "أحمد",
          receiverPhone: ahmad.phone,
          currency: "YER",
          amountMinor: rem.amountMinor,
          feeMinor: 0,
          deliveryCode: rem.claimCode,
          status: "PENDING",
          expiresAt,
          createdAt: hoursAgo(1),
        },
      });
      // إشعار وصول بالرمز (قناة تسليم Alpha)
      await notify(
        tx,
        ahmad.id,
        "وصلك رمز مطالبة حوالة",
        `وصلتك حوالة واردة ${(rem.amountMinor).toLocaleString("en-US")} ر.ي من ${rem.senderName} عبر ${rem.networkName}. رمز المطالبة: ${rem.claimCode} — استلمها من شاشة «الحوالات الواردة».`,
        "TXN",
        ref
      );
    });
  }

  console.log("→ [5/6] معاملة بيع تاريخية واحدة (أحمد → متجر الجنوب) عبر محرك القيود…");
  const mainMerchantId = merchantIds["770000020"]!;
  const mainMerchantWalletId = merchantYerWallets["770000020"]!;
  const existingSale = await db.transaction.findFirst({
    where: { userId: mainMerchantId, type: "MERCHANT_SALE_IN" },
  });
  if (existingSale) {
    console.log("   ↷ معاملة البيع التاريخية موجودة — تخطٍ");
  } else {
    const date = hoursAgo(2);
    const amount = 12_500;
    const fee = computeFee(MERCHANT_PAY_FEE, amount); // 1% = 125
    const net = amount - fee; // 12,375
    const customerRef = refAt("SW", date);
    const saleRef = refAt("SW", date);
    await db.$transaction(async (tx: DbClient) => {
      // معاملة العميل: MERCHANT_PAY_OUT (يدفع المبلغ كاملاً)
      await tx.transaction.create({
        data: {
          ref: customerRef,
          userId: ahmad.id,
          type: "MERCHANT_PAY_OUT",
          status: "COMPLETED",
          currency: "YER",
          amountMinor: amount,
          feeMinor: 0,
          direction: "DEBIT",
          counterpartyName: "متجر الجنوب للأغذية",
          counterpartyPhone: "770000020",
          description: "مشتريات بقالة",
          createdAt: date,
          completedAt: date,
        },
      });
      // قيود Σ=0: [أحمد DEBIT a] + [FEE CREDIT fee] + [التاجر CREDIT net]
      await postEntries(
        tx,
        [
          { walletId: ahmadYer.id, direction: "DEBIT", amountMinor: amount },
          { walletId: feeYer.id, direction: "CREDIT", amountMinor: fee },
          { walletId: mainMerchantWalletId, direction: "CREDIT", amountMinor: net },
        ],
        { transactionRef: customerRef, currency: "YER" }
      );
      // معاملة التاجر: MERCHANT_SALE_IN (الصافي بعد رسوم التاجر)
      await tx.transaction.create({
        data: {
          ref: saleRef,
          userId: mainMerchantId,
          type: "MERCHANT_SALE_IN",
          status: "COMPLETED",
          currency: "YER",
          amountMinor: net,
          feeMinor: fee,
          direction: "CREDIT",
          counterpartyName: ahmad.fullName ?? "أحمد",
          counterpartyPhone: ahmad.phone,
          description: "مشتريات بقالة",
          relatedRef: customerRef,
          createdAt: date,
          completedAt: date,
        },
      });
    });
  }

  console.log("→ [6/6] تفعيل الخدمتين (MERCHANT_PAY وREMITTANCE_IN → ON)…");
  await db.serviceState.updateMany({
    where: { key: "MERCHANT_PAY" },
    data: { state: "ON", note: "دفع التاجر QR — المرحلة 2 متاحة (9-c)" },
  });
  await db.serviceState.updateMany({
    where: { key: "REMITTANCE_IN" },
    data: { state: "ON", note: "الحوالات الواردة من شبكات الصرافة A-03 — متاحة (9-c)" },
  });

  // ===== التحقق =====
  const check = await ledgerCheck(db);
  if (!check.ledgerBalanced) {
    throw new Error(`دفاتر غير متوازنة: ${check.ledgerViolations.join(" | ")}`);
  }
  const merchants = await db.user.findMany({ where: { role: "MERCHANT" } });
  const inbound = await db.remittance.findMany({
    where: { deliveryCode: { in: INBOUND_REMITTANCES.map((r) => r.claimCode) } },
  });
  const services = await db.serviceState.findMany({
    where: { key: { in: ["MERCHANT_PAY", "REMITTANCE_IN"] } },
  });
  console.log("✔ اكتمل seed المرحلة 2 (التجار + الحوالات الواردة) — الدفاتر متوازنة:");
  console.table({
    تجار: merchants.length,
    حوالات_واردة: inbound.length,
    MERCHANT_PAY: services.find((s) => s.key === "MERCHANT_PAY")?.state ?? "؟",
    REMITTANCE_IN: services.find((s) => s.key === "REMITTANCE_IN")?.state ?? "؟",
    قيود_الدفتر: check.totalEntries,
  });
  console.log("   رمزا المطالبة التجريبيان لأحمد: 552214 و771903");
}

main()
  .catch((err) => {
    console.error("فشل Seed المرحلة 2:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
