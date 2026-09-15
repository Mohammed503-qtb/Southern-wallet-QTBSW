/**
 * ============================================================
 * محفظة الجنوب — Seed المرحلة 1 (Internal Alpha)
 * تشغيل: bun prisma/seed.ts
 *
 * المبادئ:
 *  • كل حركة مالية تمر بمحرك الدفتر نفسه (postEntries) — Σ=0 مضمون
 *    لكل (transactionRef, currency) — تشمل بيانات السجل التاريخي.
 *  • أرصدة الافتتاح (رصيد ما قبل نافذة السجل) تُحسب آلياً =
 *    (الرصيد النهائي التعاقدي) − (مجموع دلتات السجل التاريخي)،
 *    فتنتهي الأرصدة عند الأرقام المطلوبة بالضبط.
 *  • قيود AGENT_FLOAT تُمرَّر بالاصطلاح المالي (CREDIT = زيادة عوم)
 *    ومحرك الدفتر يعكس مساهمتها في Σ (انظر رأس schema.prisma).
 *  • العملية idempotent-ish: تمسح كل الجداول بترتيب FK قبل الزرع.
 * ============================================================
 */
import { PrismaClient } from "@prisma/client";
import { createHmac, randomBytes } from "node:crypto";
import { hashPin } from "../src/lib/server/pin";
import { postEntries, ledgerCheck, type LedgerItem } from "../src/lib/server/ledger";
import { computeFee, convertMinor, formatMinor } from "../src/lib/server/money";
import { notify } from "../src/lib/server/notify";
import { encryptSecret } from "../src/lib/server/crypto-vault";
import { base32Encode } from "../src/lib/server/totp";
import type { DbClient } from "../src/lib/server/audit";

const db = new PrismaClient({ log: ["warn", "error"] });

// ============ أدوات مساعدة ============

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** مرجع بتاريخ العملية التاريخية: PREFIX-YYYYMMDD-XXXXXXXX */
function refAt(prefix: string, date: Date): string {
  const ymd = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
  const bytes = randomBytes(8);
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return `${prefix}-${ymd}-${suffix}`;
}

function randomDigits(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += String(bytes[i] % 10);
  return out;
}

/** تاريخ قبل n يوماً بساعة محددة (UTC) */
function daysAgo(n: number, hour = 10, minute = 0): Date {
  const d = new Date(Date.now() - n * 86_400_000);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 3_600_000);
}

// ============ قواعد التشغيل (تُزرع وتُستعمل للحساب معاً) ============

const LIMIT_RULES = [
  { kycLevel: "NONE", currency: "YER", dailyTxnCount: 2, dailyAmountMinor: 30_000, perTxnAmountMinor: 15_000 },
  { kycLevel: "NONE", currency: "SAR", dailyTxnCount: 2, dailyAmountMinor: 100_000, perTxnAmountMinor: 50_000 },
  { kycLevel: "NONE", currency: "USD", dailyTxnCount: 2, dailyAmountMinor: 30_000, perTxnAmountMinor: 15_000 },
  { kycLevel: "VERIFIED", currency: "YER", dailyTxnCount: 20, dailyAmountMinor: 500_000, perTxnAmountMinor: 200_000 },
  { kycLevel: "VERIFIED", currency: "SAR", dailyTxnCount: 20, dailyAmountMinor: 520_000, perTxnAmountMinor: 200_000 },
  { kycLevel: "VERIFIED", currency: "USD", dailyTxnCount: 20, dailyAmountMinor: 135_000, perTxnAmountMinor: 50_000 },
] as const;

const FEE_RULES = [
  { opType: "TRANSFER", currency: "YER", pctBps: 25, fixedMinor: 50, minFeeMinor: 50, maxFeeMinor: 1_000 },
  { opType: "TRANSFER", currency: "SAR", pctBps: 25, fixedMinor: 100, minFeeMinor: 100, maxFeeMinor: 1_000 },
  { opType: "TRANSFER", currency: "USD", pctBps: 25, fixedMinor: 100, minFeeMinor: 100, maxFeeMinor: 1_000 },
  { opType: "REMITTANCE", currency: "YER", pctBps: 100, fixedMinor: 0, minFeeMinor: 100, maxFeeMinor: 2_000 },
  { opType: "REMITTANCE", currency: "SAR", pctBps: 100, fixedMinor: 200, minFeeMinor: 200, maxFeeMinor: 1_500 },
  { opType: "REMITTANCE", currency: "USD", pctBps: 100, fixedMinor: 200, minFeeMinor: 200, maxFeeMinor: 1_500 },
  { opType: "WITHDRAW", currency: "YER", pctBps: 100, fixedMinor: 0, minFeeMinor: 100, maxFeeMinor: 2_000 },
  { opType: "FX", currency: "YER", pctBps: 25, fixedMinor: 0, minFeeMinor: 50, maxFeeMinor: null },
  { opType: "FX", currency: "SAR", pctBps: 25, fixedMinor: 0, minFeeMinor: 100, maxFeeMinor: null },
  { opType: "FX", currency: "USD", pctBps: 25, fixedMinor: 0, minFeeMinor: 100, maxFeeMinor: null },
] as const;

/** أسعار الصرف المخزنة (×1e6) */
const FX_RATES: Array<{ fromCurrency: string; toCurrency: string; rate: number }> = [
  { fromCurrency: "YER", toCurrency: "USD", rate: 512 },
  { fromCurrency: "USD", toCurrency: "YER", rate: 1_953_000_000 },
  { fromCurrency: "SAR", toCurrency: "YER", rate: 521_000_000 },
  { fromCurrency: "YER", toCurrency: "SAR", rate: 1_920 },
  { fromCurrency: "USD", toCurrency: "SAR", rate: 3_750_000 },
  { fromCurrency: "SAR", toCurrency: "USD", rate: 266_670 },
];

const YER_TO_USD = 512 / 1_000_000; // 0.000512

const feeTransferYER = (amount: number) =>
  computeFee(FEE_RULES[0] as unknown as { pctBps: number; fixedMinor: number; minFeeMinor: number; maxFeeMinor: number | null }, amount);
const feeTransferSAR = (amount: number) =>
  computeFee(FEE_RULES[1] as unknown as { pctBps: number; fixedMinor: number; minFeeMinor: number; maxFeeMinor: number | null }, amount);
const feeRemittanceYER = (amount: number) =>
  computeFee(FEE_RULES[3] as unknown as { pctBps: number; fixedMinor: number; minFeeMinor: number; maxFeeMinor: number | null }, amount);
const feeWithdrawYER = (amount: number) =>
  computeFee(FEE_RULES[6] as unknown as { pctBps: number; fixedMinor: number; minFeeMinor: number; maxFeeMinor: number | null }, amount);
const feeFxYER = (amount: number) =>
  computeFee(FEE_RULES[7] as unknown as { pctBps: number; fixedMinor: number; minFeeMinor: number; maxFeeMinor: number | null }, amount);

// ============ هيكل العمليات التاريخية ============

interface SeedEntry {
  key: string; // مفتاح المحفظة المنطقي
  direction: "DEBIT" | "CREDIT"; // الاتجاه المالي (CREDIT = زيادة الرصيد/العوم)
  amount: number;
}

interface PostingGroup {
  ref: string;
  currency: string;
  entries: SeedEntry[];
}

interface SeedOp {
  date: Date;
  groups: PostingGroup[];
  run: (tx: DbClient) => Promise<void>;
}

// keys المحافظ (تُبنى بعد إنشاء المستخدمين)
const K = {
  FEE_YER: "sys:FEE:YER",
  FEE_SAR: "sys:FEE:SAR",
  SUSPENSE_YER: "sys:SUSPENSE:YER",
  FX_YER: "sys:FX:YER",
  FX_SAR: "sys:FX:SAR",
  FX_USD: "sys:FX:USD",
  AHMAD_YER: "ahmad:MAIN:YER",
  AHMAD_SAR: "ahmad:MAIN:SAR",
  AHMAD_USD: "ahmad:MAIN:USD",
  AHMAD_SAV: "ahmad:SAVINGS:YER",
  NOURA_YER: "noura:MAIN:YER",
  NOURA_SAR: "noura:MAIN:SAR",
  NOURA_USD: "noura:MAIN:USD",
  MOH_YER: "mohammed:MAIN:YER",
  NUR_FLOAT: "agent-nur:FLOAT",
  AMANA_FLOAT: "agent-amana:FLOAT",
} as const;

// ============ التنفيذ ============

async function main(): Promise<void> {
  console.log("→ [1/8] مسح الجداول بترتيب FK…");
  await db.ticketMessage.deleteMany();
  await db.supportTicket.deleteMany();
  await db.notification.deleteMany();
  await db.beneficiary.deleteMany();
  await db.savingsJar.deleteMany();
  await db.commissionEntry.deleteMany();
  await db.cashOperation.deleteMany();
  await db.remittance.deleteMany();
  await db.ledgerEntry.deleteMany();
  await db.transaction.deleteMany();
  await db.wallet.deleteMany();
  await db.kycSubmission.deleteMany();
  await db.session.deleteMany();
  await db.otpCode.deleteMany();
  await db.auditLog.deleteMany();
  await db.agentProfile.deleteMany();
  await db.user.deleteMany();
  await db.limitRule.deleteMany();
  await db.feeRule.deleteMany();
  await db.fxRate.deleteMany();
  await db.serviceState.deleteMany();

  console.log("→ [2/8] قواعد التشغيل (حدود/رسوم/صرف/خدمات)…");
  await db.limitRule.createMany({ data: LIMIT_RULES.map((r) => ({ ...r })) });
  await db.feeRule.createMany({ data: FEE_RULES.map((r) => ({ ...r })) });
  await db.fxRate.createMany({ data: FX_RATES });
  await db.serviceState.createMany({
    data: [
      { key: "BILLS", state: "COMING_LATER", note: "قريباً في المرحلة 2 — Closed Beta" },
      { key: "TOPUP", state: "COMING_LATER", note: "قريباً في المرحلة 2 — Closed Beta" },
      { key: "NETWORK_CARDS", state: "COMING_LATER", note: "قريباً في المرحلة 2 — Closed Beta" },
      { key: "MERCHANT_PAY", state: "COMING_LATER", note: "قريباً في المرحلة 2 — Closed Beta" },
      { key: "REMITTANCE_IN", state: "COMING_LATER", note: "قريباً في المرحلة 2 — Closed Beta" },
      { key: "OFFLINE", state: "OFF", note: "لا عمليات مالية Offline في Alpha — قائمة انتظار فقط" },
    ],
  });

  console.log("→ [3/8] المستخدمون (النظام/العملاء/الوكلاء/الإداريون)…");
  const PIN = hashPin("123456");

  const systemUser = await db.user.create({
    data: { phone: "000000000", fullName: "حساب النظام — محفظة الجنوب", role: "SYSTEM", status: "ACTIVE", kycLevel: "NONE", governorate: "عدن", createdAt: daysAgo(90) },
  });

  const ahmad = await db.user.create({
    data: { phone: "770000001", fullName: "أحمد السُّقطري", role: "CUSTOMER", status: "ACTIVE", kycLevel: "VERIFIED", governorate: "عدن", pinHash: PIN, createdAt: daysAgo(60) },
  });
  const fatima = await db.user.create({
    data: { phone: "770000002", fullName: "فاطمة العريقي", role: "CUSTOMER", status: "ACTIVE", kycLevel: "NONE", governorate: "لحج", pinHash: PIN, createdAt: daysAgo(45) },
  });
  const sami = await db.user.create({
    data: { phone: "770000003", fullName: "سامي الحضرمي", role: "CUSTOMER", status: "ACTIVE", kycLevel: "NONE", governorate: "صنعاء", scopeRestricted: true, pinHash: PIN, createdAt: daysAgo(45) },
  });
  const mohammed = await db.user.create({
    data: { phone: "770000004", fullName: "محمد سعيد العمودي", role: "CUSTOMER", status: "ACTIVE", kycLevel: "NONE", governorate: "أبين", pinHash: PIN, createdAt: daysAgo(50) },
  });
  const noura = await db.user.create({
    data: { phone: "770000005", fullName: "نورة عبدالله الكثيري", role: "CUSTOMER", status: "ACTIVE", kycLevel: "VERIFIED", governorate: "حضرموت", pinHash: PIN, createdAt: daysAgo(55) },
  });

  // الوكيلان التعاقديان
  const nur = await db.user.create({
    data: { phone: "770000010", fullName: "صالح البعداني", role: "AGENT", status: "ACTIVE", kycLevel: "NONE", governorate: "عدن", pinHash: PIN, createdAt: daysAgo(80) },
  });
  const amana = await db.user.create({
    data: { phone: "770000011", fullName: "حسان العمري", role: "AGENT", status: "ACTIVE", kycLevel: "NONE", governorate: "عدن", pinHash: PIN, createdAt: daysAgo(78) },
  });
  const nurProfile = await db.agentProfile.create({
    data: { userId: nur.id, code: "AG-ADN-001", shopName: "وكيل النور", governorate: "عدن", district: "خور مكسر", address: "شارع المطار، جوار صيدلية النور", status: "ACTIVE", floatMinor: 2_000_000, commissionBps: 50, createdAt: daysAgo(80) },
  });
  const amanaProfile = await db.agentProfile.create({
    data: { userId: amana.id, code: "AG-ADN-002", shopName: "وكيل الأمانة", governorate: "عدن", district: "المنصورة", address: "شارع 14 جولي، أمام مدرسة الأمانة", status: "ACTIVE", floatMinor: 1_500_000, commissionBps: 50, createdAt: daysAgo(78) },
  });

  // 10 وكلاء إضافيون موزعون على المحافظات الثماني
  const extraAgents: Array<[string, string, string, string, string, string, number, number, string]> = [
    // [هاتف، اسم، محافظة، مديرية، اسم المتجر، الكود، عوم، bps، عنوان]
    ["770000012", "أحمد مبارك الحكيمي", "لحج", "الحوطة", "وكيل الصفا", "AG-LHJ-001", 1_200_000, 50, "سوق الحوطة الرئيسي"],
    ["770000013", "عبدالرحمن قاسم باعمر", "أبين", "زنجبار", "مكتب البركة", "AG-ABY-001", 900_000, 45, "شارع الستين، زنجبار"],
    ["770000014", "سالم عوض بن علي", "شبوة", "عتق", "وكيل الهناء", "AG-SHW-001", 850_000, 50, "السوق التجاري، عتق"],
    ["770000015", "فهد سالم بادويلان", "حضرموت", "المكلا", "صرافة الجنوب", "AG-HDR-001", 1_800_000, 50, "شارع الكورنيش، المكلا"],
    ["770000016", "عبدالله محمد اليهري", "المهرة", "الغيضة", "وكيل الميناء", "AG-MHR-001", 700_000, 50, "الغيضة، جوار الميناء"],
    ["770000017", "عيد أحمد العمري", "سقطرى", "حديبو", "وكيل سقطرى", "AG-SQT-001", 600_000, 60, "حديبو، السوق المركزي"],
    ["770000018", "منصر علي المروني", "الضالع", "الضالع", "وكيل الأمل", "AG-DAL-001", 750_000, 50, "شارع الاستقلال، الضالع"],
    ["770000019", "طارق عبده الصلاحي", "عدن", "دار سعد", "وكيل السلام", "AG-ADN-003", 1_100_000, 50, "دار سعد، جوار الجامع"],
    ["770000020", "نبيل حسن باعلوي", "حضرموت", "المكلا", "صرافة المكلا", "AG-HDR-002", 1_400_000, 40, "شارع الجمهورية، المكلا"],
    ["770000021", "ياسر قائد الرداعي", "لحج", "تبن", "وكيل الوفاق", "AG-LHJ-002", 950_000, 50, "تبن، الطريق العام"],
  ];
  const extraAgentIds: string[] = [];
  for (const [phone, name, gov, district, shop, code, float, bps, address] of extraAgents) {
    const u = await db.user.create({
      data: { phone, fullName: name, role: "AGENT", status: "ACTIVE", kycLevel: "NONE", governorate: gov, pinHash: PIN, createdAt: daysAgo(70) },
    });
    await db.agentProfile.create({
      data: { userId: u.id, code, shopName: shop, governorate: gov, district, address, status: "ACTIVE", floatMinor: float, commissionBps: bps, createdAt: daysAgo(70) },
    });
    extraAgentIds.push(u.id);
  }

  // الإداريون
  const admin = await db.user.create({
    data: { phone: "770100001", fullName: "خالد المرادي", role: "ADMIN", status: "ACTIVE", kycLevel: "VERIFIED", governorate: "عدن", pinHash: PIN, createdAt: daysAgo(85) },
  });
  const compliance = await db.user.create({
    data: { phone: "770100002", fullName: "أمل الشرعبي", role: "COMPLIANCE", status: "ACTIVE", kycLevel: "VERIFIED", governorate: "عدن", pinHash: PIN, createdAt: daysAgo(85) },
  });
  const support = await db.user.create({
    data: { phone: "770100003", fullName: "ياسر العزي", role: "SUPPORT", status: "ACTIVE", kycLevel: "VERIFIED", governorate: "عدن", pinHash: PIN, createdAt: daysAgo(85) },
  });
  void admin;

  console.log("→ [4/8] طلبات التوثيق KYC…");
  await db.kycSubmission.create({
    data: {
      userId: ahmad.id,
      fullName: "أحمد السُّقطري",
      idType: "NATIONAL_ID",
      idNumber: "0123456789",
      governorate: "عدن",
      address: "كريتر، شارع الميدان",
      occupation: "مهندس اتصالات",
      monthlyIncomeMinor: 850_000,
      incomeCurrency: "YER",
      status: "APPROVED",
      reviewerId: compliance.id,
      reviewNote: "مطابقة الوثائق والاسم",
      submittedAt: daysAgo(36),
      reviewedAt: daysAgo(35),
    },
  });
  await db.kycSubmission.create({
    data: {
      userId: noura.id,
      fullName: "نورة عبدالله الكثيري",
      idType: "NATIONAL_ID",
      idNumber: "0398765432",
      governorate: "حضرموت",
      address: "المكلا، حي الديس",
      occupation: "معلمة",
      monthlyIncomeMinor: 600_000,
      incomeCurrency: "YER",
      status: "APPROVED",
      reviewerId: compliance.id,
      reviewNote: "تم التحقق",
      submittedAt: daysAgo(41),
      reviewedAt: daysAgo(40),
    },
  });
  await db.kycSubmission.create({
    data: {
      userId: mohammed.id,
      fullName: "محمد سعيد العمودي",
      idType: "NATIONAL_ID",
      idNumber: "0112458871",
      governorate: "أبين",
      address: "زنجبار، حي الجامعة",
      occupation: "موظف",
      monthlyIncomeMinor: 350_000,
      incomeCurrency: "YER",
      status: "PENDING",
      submittedAt: daysAgo(3),
    },
  });

  console.log("→ [5/8] المحافظ والأرصدة الافتتاحية…");
  const jar = await db.savingsJar.create({
    data: { userId: ahmad.id, name: "حج 1448", targetMinor: 1_500_000, currency: "YER", status: "ACTIVE", createdAt: daysAgo(24) },
  });
  void mohammed;

  // محافظ النظام: FEE تبدأ صفراً، FX مخزن تمويل كبير
  const sysWallets: Record<string, string> = {};
  for (const [kind, currency, balance] of [
    ["FEE", "YER", 0],
    ["FEE", "SAR", 0],
    ["FEE", "USD", 0],
    ["SUSPENSE", "YER", 0],
    ["FX", "YER", 5_000_000],
    ["FX", "SAR", 500_000],
    ["FX", "USD", 500_000],
  ] as const) {
    const w = await db.wallet.create({
      data: { userId: systemUser.id, kind, currency, balanceMinor: balance },
    });
    sysWallets[`${kind}:${currency}`] = w.id;
  }

  // محافظ MAIN للعملاء (الأرصدة الافتتاحية محسوبة بحيث تنتهي عند الأهداف بعد السجل)
  // دلتا سجل أحمد YER: +150,000−40,150+30,000−50,500−25,112−200,000+195,300−220,000−60,600−300−40,400 = −261,762
  // (−300 = السحب الملغى: خصم 30,300 واسترجاع 30,000 — الرسوم تبقى)
  const customerOpenings: Array<[string, string, number]> = [
    [ahmad.id, "YER", 511_762],
    [ahmad.id, "SAR", 70_000],
    [ahmad.id, "USD", 40_100],
    [fatima.id, "YER", 2_000],
    [sami.id, "YER", 15_000],
    [sami.id, "SAR", 5_000],
    [sami.id, "USD", 2_000],
    [mohammed.id, "YER", 110_125],
    [noura.id, "YER", 54_738],
    [noura.id, "SAR", 45_137],
    [noura.id, "USD", 10_000],
  ];
  const W: Record<string, string> = {};
  for (const [userId, currency, opening] of customerOpenings) {
    const w = await db.wallet.create({
      data: { userId, kind: "MAIN", currency, balanceMinor: opening },
    });
    W[`${userId}:${currency}`] = w.id;
  }
  // محفظة الحصالة (تبدأ صفراً — تُغذى من السجل حتى 420,000)
  const jarWallet = await db.wallet.create({
    data: { userId: ahmad.id, kind: "SAVINGS", currency: "YER", jarId: jar.id, balanceMinor: 0 },
  });

  // محافظ عوم الوكلاء (رصيد افتتاحي مباشر = العوم التعاقدي)
  const AGENTS_FLOAT_INIT: Array<[string, number]> = [
    [nur.id, 2_000_000],
    [amana.id, 1_500_000],
    ...extraAgentIds.map((id) => [id, -1] as [string, number]),
  ];
  const F: Record<string, string> = {};
  for (const [agentId, maybeFloat] of AGENTS_FLOAT_INIT) {
    const profile = await db.agentProfile.findUnique({ where: { userId: agentId } });
    const float = maybeFloat >= 0 ? maybeFloat : (profile?.floatMinor ?? 0);
    const w = await db.wallet.create({
      data: { userId: agentId, kind: "AGENT_FLOAT", currency: "YER", balanceMinor: float },
    });
    F[agentId] = w.id;
  }

  // ============ عمال السجل التاريخي ============

  /** صف عملية + قيود دفترية متوازنة + إشعار — داخل معاملة واحدة */
  async function post(
    date: Date,
    txRef: string,
    currency: string,
    entries: Array<{ walletId: string; direction: "DEBIT" | "CREDIT"; amountMinor: number }>,
    txRow: object,
    notices: Array<{ userId: string; title: string; body: string; category?: "TXN" | "SECURITY" | "KYC" | "SYSTEM" | "SUPPORT" }>
  ): Promise<void> {
    await db.$transaction(async (tx) => {
      await tx.transaction.create({ data: { ref: txRef, ...txRow } as never });
      await postEntries(tx, entries, { transactionRef: txRef, currency });
      for (const n of notices) {
        await notify(tx, n.userId, n.title, n.body, n.category ?? "TXN", txRef, date);
      }
    });
  }

  console.log("→ [6/8] السجل التاريخي (11 عملية عبر 25 يوماً)…");
  const feeYER = FEE_RULES[0];
  const feeSAR = FEE_RULES[1];

  // 1) إيداع نقدي مكتمل لدى وكيل النور (25 يوماً): +150,000
  {
    const date = daysAgo(25, 11);
    const ref = refAt("CW", date);
    const amount = 150_000;
    await post(
      date,
      ref,
      "YER",
      [
        { walletId: W[`${ahmad.id}:YER`]!, direction: "CREDIT", amountMinor: amount },
        { walletId: F[nur.id]!, direction: "CREDIT", amountMinor: amount },
      ],
      {
        userId: ahmad.id,
        type: "CASH_IN",
        status: "COMPLETED",
        currency: "YER",
        amountMinor: amount,
        feeMinor: 0,
        direction: "CREDIT",
        counterpartyName: "وكيل النور",
        counterpartyPhone: null,
        description: "إيداع نقدي لدى وكيل النور",
        createdAt: date,
        completedAt: date,
      },
      [{ userId: ahmad.id, title: "تم إيداع النقدية", body: `أكمل وكيل النور إيداع ${formatMinor(amount, "YER")} إلى محفظتك.` }]
    );
    await db.cashOperation.create({
      data: {
        ref,
        userId: ahmad.id,
        agentId: nur.id,
        type: "DEPOSIT",
        currency: "YER",
        amountMinor: amount,
        feeMinor: 0,
        code: randomDigits(6),
        status: "COMPLETED",
        expiresAt: new Date(date.getTime() + 86_400_000),
        processedAt: date,
        createdAt: date,
      },
    });
    await db.commissionEntry.create({
      data: { agentId: nur.id, opType: "CASH_IN", sourceRef: ref, amountMinor: 750, createdAt: date },
    });
  }

  // عامل تحويل ثنائي الأطراف
  const transfer = (
    date: Date,
    sender: { id: string; name: string; phone: string },
    recipient: { id: string; name: string; phone: string },
    currency: "YER" | "SAR",
    amount: number
  ): Promise<void> => {
    const rule = currency === "YER" ? feeYER : feeSAR;
    const fee = computeFee(rule, amount);
    const ref = refAt("SW", date);
    const inRef = refAt("SW", date);
    return post(
      date,
      ref,
      currency,
      [
        { walletId: W[`${sender.id}:${currency}`]!, direction: "DEBIT", amountMinor: amount + fee },
        { walletId: sysWallets[`FEE:${currency}`]!, direction: "CREDIT", amountMinor: fee },
        { walletId: W[`${recipient.id}:${currency}`]!, direction: "CREDIT", amountMinor: amount },
      ],
      {
        userId: sender.id,
        type: "TRANSFER_OUT",
        status: "COMPLETED",
        currency,
        amountMinor: amount,
        feeMinor: fee,
        direction: "DEBIT",
        counterpartyName: recipient.name,
        counterpartyPhone: recipient.phone,
        createdAt: date,
        completedAt: date,
      },
      [
        { userId: sender.id, title: "تم التحويل", body: `حوّلت ${formatMinor(amount, currency)} إلى ${recipient.name}${fee > 0 ? ` (رسوم ${formatMinor(fee, currency)})` : ""}.` },
        { userId: recipient.id, title: "استلام تحويل", body: `استلمت ${formatMinor(amount, currency)} من ${sender.name}.` },
      ]
    ).then(async () => {
      await db.transaction.create({
        data: {
          ref: inRef,
          userId: recipient.id,
          type: "TRANSFER_IN",
          status: "COMPLETED",
          currency,
          amountMinor: amount,
          feeMinor: 0,
          direction: "CREDIT",
          counterpartyName: sender.name,
          counterpartyPhone: sender.phone,
          relatedRef: ref,
          createdAt: date,
          completedAt: date,
        },
      });
    });
  };

  // 2) تحويل أحمد → نورة (20 يوماً): 40,000
  await transfer(
    daysAgo(20, 12),
    { id: ahmad.id, name: "أحمد السُّقطري", phone: ahmad.phone },
    { id: noura.id, name: "نورة عبدالله الكثيري", phone: noura.phone },
    "YER",
    40_000
  );
  // 3) تحويل محمد → أحمد (18 يوماً): 30,000
  await transfer(
    daysAgo(18, 14),
    { id: mohammed.id, name: "محمد سعيد العمودي", phone: mohammed.phone },
    { id: ahmad.id, name: "أحمد السُّقطري", phone: ahmad.phone },
    "YER",
    30_000
  );

  // 4) حوالة مدفوعة (15 يوماً) عبر وكيل النور: 50,000 (fee 500)
  {
    const date = daysAgo(15, 10);
    const paidAt = daysAgo(14, 11);
    const ref = refAt("RM", date);
    const amount = 50_000;
    const fee = computeFee(FEE_RULES[3], amount); // 500
    const rem = await db.remittance.create({
      data: {
        ref,
        senderId: ahmad.id,
        receiverName: "سالم ناصر باعلوي",
        receiverPhone: "771234568",
        currency: "YER",
        amountMinor: amount,
        feeMinor: fee,
        deliveryCode: "771203",
        status: "PAID",
        payingAgentId: nur.id,
        paidAt,
        expiresAt: new Date(date.getTime() + 7 * 86_400_000),
        createdAt: date,
      },
    });
    // قيود الإنشاء + الدفع تحت نفس المرجع (كل مجموعة Σ=0)
    await db.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          ref,
          userId: ahmad.id,
          type: "REMITTANCE",
          status: "COMPLETED",
          currency: "YER",
          amountMinor: amount,
          feeMinor: fee,
          direction: "DEBIT",
          counterpartyName: rem.receiverName,
          counterpartyPhone: rem.receiverPhone,
          description: "حوالة إلى غير مشترك — سُلّمت نقداً لدى وكيل النور",
          createdAt: date,
          completedAt: paidAt,
        },
      });
      await postEntries(
        tx,
        [
          { walletId: W[`${ahmad.id}:YER`]!, direction: "DEBIT", amountMinor: amount + fee },
          { walletId: sysWallets["FEE:YER"]!, direction: "CREDIT", amountMinor: fee },
          { walletId: sysWallets["SUSPENSE:YER"]!, direction: "CREDIT", amountMinor: amount },
        ],
        { transactionRef: ref, currency: "YER" }
      );
      await postEntries(
        tx,
        [
          { walletId: sysWallets["SUSPENSE:YER"]!, direction: "DEBIT", amountMinor: amount },
          { walletId: F[nur.id]!, direction: "DEBIT", amountMinor: amount },
        ],
        { transactionRef: ref, currency: "YER" }
      );
      await tx.commissionEntry.create({
        data: { agentId: nur.id, opType: "REMITTANCE", sourceRef: ref, amountMinor: 250, createdAt: paidAt },
      });
      await notify(tx, ahmad.id, "تم تسليم الحوالة", `استلم ${rem.receiverName} الحوالة ${ref} (${formatMinor(amount, "YER")}) من وكيل النور.`, "TXN", ref, paidAt);
    });
  }

  // 5) تحويل أحمد → نورة (12 يوماً): 25,000
  await transfer(
    daysAgo(12, 9),
    { id: ahmad.id, name: "أحمد السُّقطري", phone: ahmad.phone },
    { id: noura.id, name: "نورة عبدالله الكثيري", phone: noura.phone },
    "YER",
    25_000
  );

  // 6) إيداع في الحصالة (10 أيام): 200,000
  {
    const date = daysAgo(10, 13);
    const ref = refAt("SW", date);
    const amount = 200_000;
    await post(
      date,
      ref,
      "YER",
      [
        { walletId: W[`${ahmad.id}:YER`]!, direction: "DEBIT", amountMinor: amount },
        { walletId: jarWallet.id, direction: "CREDIT", amountMinor: amount },
      ],
      {
        userId: ahmad.id,
        type: "SAVING_IN",
        status: "COMPLETED",
        currency: "YER",
        amountMinor: amount,
        feeMinor: 0,
        direction: "DEBIT",
        counterpartyName: "حصالة حج 1448",
        description: "إيداع في الحصالة",
        createdAt: date,
        completedAt: date,
      },
      [{ userId: ahmad.id, title: "إيداع في الحصالة", body: `أودعت ${formatMinor(amount, "YER")} في حصالة «حج 1448».` }]
    );
  }

  // 7) تحويل بين المحافظ (8 أيام): بيع 100.00$ → شراء 195,300 ر.ي (fee 1.00$)
  {
    const date = daysAgo(8, 15);
    const ref = refAt("SW", date);
    const sellUsd = 10_000; // 100.00 USD
    const fee = computeFee(FEE_RULES[9], sellUsd); // FX USD → 100 minor
    const receiveYer = 195_300;
    await post(
      date,
      ref,
      "USD",
      [
        { walletId: W[`${ahmad.id}:USD`]!, direction: "DEBIT", amountMinor: sellUsd + fee },
        { walletId: sysWallets["FX:USD"]!, direction: "CREDIT", amountMinor: sellUsd + fee },
      ],
      {
        userId: ahmad.id,
        type: "FX_EXCHANGE",
        status: "COMPLETED",
        currency: "USD",
        amountMinor: sellUsd,
        feeMinor: fee,
        direction: "DEBIT",
        counterpartyName: "تحويل بين المحافظ (USD → YER)",
        description: "بيع دولارات وشراء ريالات يمنية",
        metadataJson: JSON.stringify({ receiveCurrency: "YER", receiveMinor: receiveYer, rate: 1953 }),
        createdAt: date,
        completedAt: date,
      },
      [{ userId: ahmad.id, title: "تحويل بين المحافظ", body: `حوّلت ${formatMinor(sellUsd, "USD")} إلى ${formatMinor(receiveYer, "YER")}.` }]
    );
    // المجموعة الثانية (YER) بنفس المرجع
    await db.$transaction(async (tx) => {
      await postEntries(
        tx,
        [
          { walletId: sysWallets["FX:YER"]!, direction: "DEBIT", amountMinor: receiveYer },
          { walletId: W[`${ahmad.id}:YER`]!, direction: "CREDIT", amountMinor: receiveYer },
        ],
        { transactionRef: ref, currency: "YER" }
      );
    });
  }

  // 8) إيداع في الحصالة (6 أيام): 220,000
  {
    const date = daysAgo(6, 10);
    const ref = refAt("SW", date);
    const amount = 220_000;
    await post(
      date,
      ref,
      "YER",
      [
        { walletId: W[`${ahmad.id}:YER`]!, direction: "DEBIT", amountMinor: amount },
        { walletId: jarWallet.id, direction: "CREDIT", amountMinor: amount },
      ],
      {
        userId: ahmad.id,
        type: "SAVING_IN",
        status: "COMPLETED",
        currency: "YER",
        amountMinor: amount,
        feeMinor: 0,
        direction: "DEBIT",
        counterpartyName: "حصالة حج 1448",
        description: "إيداع في الحصالة",
        createdAt: date,
        completedAt: date,
      },
      [{ userId: ahmad.id, title: "إيداع في الحصالة", body: `أودعت ${formatMinor(amount, "YER")} في حصالة «حج 1448».` }]
    );
  }

  // 9) سحب نقدي مكتمل لدى وكيل الأمانة (5 أيام): 60,000 (fee 600)
  {
    const date = daysAgo(5, 12);
    const ref = refAt("CW", date);
    const amount = 60_000;
    const fee = computeFee(FEE_RULES[6], amount); // 600
    await db.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          ref,
          userId: ahmad.id,
          type: "CASH_OUT",
          status: "COMPLETED",
          currency: "YER",
          amountMinor: amount,
          feeMinor: fee,
          direction: "DEBIT",
          counterpartyName: "وكيل الأمانة",
          counterpartyPhone: null,
          description: "سحب نقدي لدى وكيل الأمانة",
          createdAt: date,
          completedAt: date,
        },
      });
      // حجز الإنشاء
      await postEntries(
        tx,
        [
          { walletId: W[`${ahmad.id}:YER`]!, direction: "DEBIT", amountMinor: amount + fee },
          { walletId: sysWallets["FEE:YER"]!, direction: "CREDIT", amountMinor: fee },
          { walletId: sysWallets["SUSPENSE:YER"]!, direction: "CREDIT", amountMinor: amount },
        ],
        { transactionRef: ref, currency: "YER" }
      );
      // الدفع لدى الوكيل
      await postEntries(
        tx,
        [
          { walletId: sysWallets["SUSPENSE:YER"]!, direction: "DEBIT", amountMinor: amount },
          { walletId: F[amana.id]!, direction: "DEBIT", amountMinor: amount },
        ],
        { transactionRef: ref, currency: "YER" }
      );
      await tx.cashOperation.create({
        data: {
          ref,
          userId: ahmad.id,
          agentId: amana.id,
          type: "WITHDRAW",
          currency: "YER",
          amountMinor: amount,
          feeMinor: fee,
          code: randomDigits(6),
          status: "COMPLETED",
          expiresAt: new Date(date.getTime() + 86_400_000),
          processedAt: date,
          createdAt: date,
        },
      });
      await tx.commissionEntry.create({
        data: { agentId: amana.id, opType: "WITHDRAW", sourceRef: ref, amountMinor: 300, createdAt: date },
      });
      await notify(tx, ahmad.id, "تم تسليم السحب", `استلمت ${formatMinor(amount, "YER")} من وكيل الأمانة.`, "TXN", ref, date);
    });
  }

  // 10) سحب ملغى (3 أيام): 30,000 (fee 300) + استرجاع
  {
    const date = daysAgo(3, 16);
    const cancelAt = daysAgo(3, 18);
    const ref = refAt("CW", date);
    const refundRef = refAt("CW", cancelAt);
    const amount = 30_000;
    const fee = computeFee(FEE_RULES[6], amount); // 300
    await db.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          ref,
          userId: ahmad.id,
          type: "CASH_OUT",
          status: "CANCELLED",
          currency: "YER",
          amountMinor: amount,
          feeMinor: fee,
          direction: "DEBIT",
          counterpartyName: "وكيل الأمانة",
          description: "طلب سحب أُلغي قبل الاستلام",
          createdAt: date,
          completedAt: null,
        },
      });
      await postEntries(
        tx,
        [
          { walletId: W[`${ahmad.id}:YER`]!, direction: "DEBIT", amountMinor: amount + fee },
          { walletId: sysWallets["FEE:YER"]!, direction: "CREDIT", amountMinor: fee },
          { walletId: sysWallets["SUSPENSE:YER"]!, direction: "CREDIT", amountMinor: amount },
        ],
        { transactionRef: ref, currency: "YER" }
      );
      await tx.cashOperation.create({
        data: {
          ref,
          userId: ahmad.id,
          agentId: amana.id,
          type: "WITHDRAW",
          currency: "YER",
          amountMinor: amount,
          feeMinor: fee,
          code: randomDigits(6),
          status: "CANCELLED",
          expiresAt: new Date(date.getTime() + 86_400_000),
          processedAt: cancelAt,
          createdAt: date,
        },
      });
      // الاسترجاع
      await tx.transaction.create({
        data: {
          ref: refundRef,
          userId: ahmad.id,
          type: "CASH_REFUND",
          status: "COMPLETED",
          currency: "YER",
          amountMinor: amount,
          feeMinor: 0,
          direction: "CREDIT",
          description: "إلغاء طلب سحب واسترجاع المبلغ",
          relatedRef: ref,
          createdAt: cancelAt,
          completedAt: cancelAt,
        },
      });
      await postEntries(
        tx,
        [
          { walletId: sysWallets["SUSPENSE:YER"]!, direction: "DEBIT", amountMinor: amount },
          { walletId: W[`${ahmad.id}:YER`]!, direction: "CREDIT", amountMinor: amount },
        ],
        { transactionRef: refundRef, currency: "YER" }
      );
      await notify(tx, ahmad.id, "استُرجع طلب سحب", `أُلغي طلب السحب ${ref} واستُرجع ${formatMinor(amount, "YER")} إلى محفظتك.`, "TXN", refundRef, cancelAt);
    });
  }

  // 11) تحويل نورة → أحمد (2 أيام) بالريال السعودي: 150.00 SAR
  await transfer(
    daysAgo(2, 11),
    { id: noura.id, name: "نورة عبدالله الكثيري", phone: noura.phone },
    { id: ahmad.id, name: "أحمد السُّقطري", phone: ahmad.phone },
    "SAR",
    15_000
  );

  console.log("→ [7/8] المعلّق الحالي + المفضلون + التذكرة + الإشعارات…");
  // حوالة معلقة حالياً (رمز التسليم 884290) — صلاحية 7 أيام
  {
    const date = hoursAgo(1);
    const ref = refAt("RM", date);
    const amount = 40_000;
    const fee = computeFee(FEE_RULES[3], amount); // 400
    await db.$transaction(async (tx) => {
      await tx.remittance.create({
        data: {
          ref,
          senderId: ahmad.id,
          receiverName: "علي صالح الجابري",
          receiverPhone: "771234567",
          currency: "YER",
          amountMinor: amount,
          feeMinor: fee,
          deliveryCode: "884290",
          status: "PENDING",
          expiresAt: new Date(date.getTime() + 7 * 86_400_000),
          createdAt: date,
        },
      });
      await tx.transaction.create({
        data: {
          ref,
          userId: ahmad.id,
          type: "REMITTANCE",
          status: "PENDING",
          currency: "YER",
          amountMinor: amount,
          feeMinor: fee,
          direction: "DEBIT",
          counterpartyName: "علي صالح الجابري",
          counterpartyPhone: "771234567",
          description: "حوالة إلى غير مشترك — بانتظار الاستلام لدى أي وكيل",
          createdAt: date,
        },
      });
      await postEntries(
        tx,
        [
          { walletId: W[`${ahmad.id}:YER`]!, direction: "DEBIT", amountMinor: amount + fee },
          { walletId: sysWallets["FEE:YER"]!, direction: "CREDIT", amountMinor: fee },
          { walletId: sysWallets["SUSPENSE:YER"]!, direction: "CREDIT", amountMinor: amount },
        ],
        { transactionRef: ref, currency: "YER" }
      );
      await notify(tx, ahmad.id, "حوالة قيد الاستلام", `حوالتك ${ref} إلى علي صالح الجابري (${formatMinor(amount, "YER")}) بانتظار الاستلام. رمز التسليم: 884290`, "TXN", ref);
    });
  }

  // طلب إيداع معلق لفاطمة لدى وكيل النور (رمز 556677 — لعرض طابور الوكيل)
  {
    const date = hoursAgo(2);
    const ref = refAt("CW", date);
    await db.$transaction(async (tx) => {
      await tx.cashOperation.create({
        data: {
          ref,
          userId: fatima.id,
          agentId: nur.id,
          type: "DEPOSIT",
          currency: "YER",
          amountMinor: 20_000,
          feeMinor: 0,
          code: "556677",
          status: "PENDING",
          expiresAt: new Date(date.getTime() + 86_400_000),
          createdAt: date,
        },
      });
      await tx.transaction.create({
        data: {
          ref,
          userId: fatima.id,
          type: "CASH_IN",
          status: "PENDING",
          currency: "YER",
          amountMinor: 20_000,
          feeMinor: 0,
          direction: "CREDIT",
          counterpartyName: "وكيل النور",
          counterpartyPhone: null,
          description: "طلب إيداع نقدي لدى وكيل النور",
          createdAt: date,
        },
      });
      await notify(tx, fatima.id, "طلب إيداع بانتظار الوكيل", `طلب إيداعك ${ref} (${formatMinor(20_000, "YER")}) بانتظار التأكيد لدى وكيل النور. الرمز: 556677`, "TXN", ref);
    });
  }

  // المفضلون لأحمد
  await db.beneficiary.createMany({
    data: [
      { userId: ahmad.id, name: "نورة عبدالله الكثيري", phone: noura.phone },
      { userId: ahmad.id, name: "محمد سعيد العمودي", phone: mohammed.phone },
    ],
  });

  // تذكرة دعم لفاطمة + رسالتان
  {
    const date = daysAgo(2, 9);
    const replyAt = daysAgo(1, 10);
    const ticket = await db.supportTicket.create({
      data: {
        ref: refAt("TK", date).replace("TK-", "TK-"),
        userId: fatima.id,
        subject: "لم يكتمل إيداعي لدى الوكيل",
        category: "TRANSFER",
        status: "OPEN",
        createdAt: date,
        updatedAt: replyAt,
      },
    });
    await db.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: fatima.id,
        authorRole: "CUSTOMER",
        body: "طلبت إيداع 20,000 ريال لدى وكيل النور منذ ساعتين ولم يظهر الرصيد بعد. ما الحل؟",
        createdAt: date,
      },
    });
    await db.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: support.id,
        authorRole: "SUPPORT",
        body: "وعليكم السلام، تابعنا طلبك مع الوكيل — يكتمل الإيداع فور تأكيد الرمز لدى الوكيل. نرجو إبقاء التذكرة مفتوحة حتى الاكتمال.",
        createdAt: replyAt,
      },
    });
    await notify(db, fatima.id, "رد على تذكرتك", "رد الدعم على تذكرتك «لم يكتمل إيداعي لدى الوكيل».", "SUPPORT", null);
  }

  // إشعارات إضافية (أمان/نظام/توثيق)
  await notify(db, ahmad.id, "تسجيل دخول جديد", "تم تسجيل دخول من متصفح ويب — Alpha. إن لم تكن أنت فأبلغ الدعم فوراً.", "SECURITY", null);
  await notify(db, fatima.id, "أكمل توثيق حسابك", "وثّق هويتك لرفع حدودك اليومية والاستفادة من كل الخدمات.", "KYC", null);
  await notify(db, sami.id, "خارج نطاق الخدمة", "أنت خارج نطاق الخدمة الجغرافي (المحافظات الجنوبية) — الدخول للاطلاع فقط ولا تُنفَّذ عمليات مالية.", "SYSTEM", null);
  for (const u of [ahmad, fatima, sami, mohammed, noura]) {
    await notify(db, u.id, "مرحباً بك في محفظة الجنوب", "محفظتك الرقمية اليمنية — حوّل وأرسل وادفع بأمان. Alpha الداخلي بأموال تجريبية.", "SYSTEM", null);
  }
  // القديم يُقرأ — الحديث يبقى غير مقروء (لشارة الإشعارات)
  await db.notification.updateMany({
    where: { createdAt: { lt: hoursAgo(20) } },
    data: { read: true },
  });

  // مزامنة عوم الوكيلين بعد السجل التاريخي
  for (const agentId of [nur.id, amana.id]) {
    const wallet = await db.wallet.findFirst({ where: { userId: agentId, kind: "AGENT_FLOAT" } });
    if (wallet) {
      await db.agentProfile.update({ where: { userId: agentId }, data: { floatMinor: wallet.balanceMinor } });
    }
  }

  console.log("→ [8/8] التحقق: توازن الدفاتر + الأرصدة النهائية…");
  const check = await ledgerCheck(db);
  if (!check.ledgerBalanced) {
    throw new Error(`دفاتر غير متوازنة: ${check.ledgerViolations.join(" | ")}`);
  }
  const finalAhmad = await db.wallet.findMany({
    where: { userId: ahmad.id, kind: "MAIN" },
  });
  const byCur = new Map(finalAhmad.map((w) => [w.currency, w.balanceMinor]));
  const expect: Record<string, number> = { YER: 250_000, SAR: 85_000, USD: 30_000 };
  for (const [cur, target] of Object.entries(expect)) {
    const actual = byCur.get(cur) ?? -1;
    if (actual !== target) {
      throw new Error(`رصيد أحمد ${cur} = ${actual} والمتوقع ${target}`);
    }
  }
  const jarFinal = await db.wallet.findFirst({ where: { id: jarWallet.id } });
  if (jarFinal?.balanceMinor !== 420_000) {
    throw new Error(`رصيد الحصالة = ${jarFinal?.balanceMinor} والمتوقع 420000`);
  }

  const counts = {
    users: await db.user.count(),
    agents: await db.agentProfile.count(),
    transactions: await db.transaction.count(),
    ledgerEntries: await db.ledgerEntry.count(),
    notifications: await db.notification.count(),
    unread: await db.notification.count({ where: { read: false } }),
    commissions: await db.commissionEntry.count(),
    remittances: await db.remittance.count(),
    cashOps: await db.cashOperation.count(),
    tickets: await db.supportTicket.count(),
  };

  // ============ تفعيل المصادقة (TOTP) لحسابات البيانات التجريبية ============
  // سر مشتق من APP_KEY لكل هاتف (حتمي) — رمز كل حساب يُطبع بأداة
  // scripts/totp-code.ts (بيئات التجربة فقط — لا تشغّل الـSeed في الإنتاج العام).
  const seedUsers = await db.user.findMany({ where: { role: { not: "SYSTEM" } } });
  for (const u of seedUsers) {
    const secretBuf = createHmac("sha256", process.env.APP_KEY ?? "dev-only-insecure-fallback-app-key!!")
      .update(`seed-totp:${u.phone}`)
      .digest()
      .slice(0, 20);
    await db.user.update({
      where: { id: u.id },
      data: {
        totpSecretEnc: encryptSecret(base32Encode(secretBuf)),
        totpConfirmedAt: new Date(),
        totpLastStep: 0,
      },
    });
  }
  console.log(`✔ فُعّلت المصادقة (TOTP) لـ ${seedUsers.length} حساباً تجريبياً`);

  console.log("✔ اكتمل الـSeed — التحقق ناجح:");
  console.table(check);
  console.table(counts);
  console.table(
    finalAhmad.map((w) => ({ العملة: w.currency, الرصيد: w.balanceMinor, النوع: w.kind }))
  );
}

main()
  .catch((err) => {
    console.error("فشل الـ Seed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
