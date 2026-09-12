/**
 * محفظة الجنوب — كتالوج خدمات الدفع (المرحلة 2 / 9-b)
 * ============================================================
 * ثوابت المزودين (فواتير) والمشغلين (شحن) وباقات كروت الشبكة
 * + دوال البحث والتحقق + المبلغ المستحق المحاكى الحتمي (نفس الرقم
 * يعطي نفس المستحق دائماً) + توليد رمز كرت 11 خانة.
 *
 * ملاحظات:
 *  • هذا الملف ملك الوكيل 9-b — لا يستورَد من "next" حتى يعمل من
 *    المسارات ومن prisma/seed-phase2-payments.ts على السواء.
 *  • الرسوم الحية تأتي من FeeRule (BILL_PAY/TOPUP/CARD_PURCHASE بYER)
 *    عبر getPaymentsFeeRule — نفس محرك computeFee في money.ts.
 *  • القيود المزدوجة: مبلغ الخدمة يذهب إلى SUSPENSE:YER بانتظار تسوية
 *    المزود (نظام نقدي مغلق تجريبي — D-01)، والرسوم إلى FEE:YER.
 */
import { createHash, randomBytes } from "node:crypto";
import type { BillerCategory, BillerView, CardProductView, CurrencyCode, TopupOperatorView } from "../api-types";
import { RouteError } from "./envelope";
import type { DbClient } from "./audit";
import { computeFee, type FeeRuleLike } from "./money";

// ============ أنواع داخلية (خاصة بهذا الملف) ============

export interface BillerDef {
  code: string;
  name: string;
  category: BillerCategory;
  /** طول رقم الحساب (أرقام فقط) */
  accountLength: number;
  /** تلميح صيغة رقم الحساب للعرض */
  accountHint: string;
  /** يسمح بمبلغ مخصص (أقل من المستحق) — الفواتير الحكومية تُسدد كاملة */
  openAmount: boolean;
}

export interface OperatorDef {
  code: string;
  name: string;
  /** بادئات أرقام المشغل (مع +967) */
  prefixes: string[];
  /** فئات الشحن المتاحة (وحدات فرعية YER) */
  packagesMinor: number[];
}

export interface CardDef {
  code: string;
  operatorCode: string;
  operatorName: string;
  name: string;
  /** حجم الباقة كما يظهر للعميل */
  size: string;
  priceMinor: number;
}

// ============ كتالوج مزودي الفواتير (يمني واقعي) ============

export const BILLERS: BillerDef[] = [
  // ===== الكهرباء =====
  {
    code: "ELEC-ADEN",
    name: "كهرباء عدن — المؤسسة العامة للكهرباء",
    category: "ELECTRIC",
    accountLength: 8,
    accountHint: "رقم العداد — 8 أرقام",
    openAmount: true,
  },
  {
    code: "ELEC-LAHJ",
    name: "كهرباء لحج — فرع الراهدة/الحوطة",
    category: "ELECTRIC",
    accountLength: 7,
    accountHint: "رقم العداد — 7 أرقام",
    openAmount: true,
  },
  {
    code: "ELEC-ADEN-KAHRAMA",
    name: "كهرماء عدن — عداد تجاري",
    category: "ELECTRIC",
    accountLength: 9,
    accountHint: "رقم العداد التجاري — 9 أرقام",
    openAmount: true,
  },
  // ===== المياه =====
  {
    code: "WATER-ADEN",
    name: "مياه عدن — المؤسسة المحلية للمياه",
    category: "WATER",
    accountLength: 6,
    accountHint: "رقم الاشتراك — 6 أرقام",
    openAmount: true,
  },
  {
    code: "WATER-LAHJ",
    name: "مياه لحج — المؤسسة المحلية",
    category: "WATER",
    accountLength: 6,
    accountHint: "رقم الاشتراك — 6 أرقام",
    openAmount: true,
  },
  // ===== الاتصالات =====
  {
    code: "TEL-YEMENMOBILE",
    name: "يمن موبايل — الفاتورة الشهرية",
    category: "TELECOM",
    accountLength: 9,
    accountHint: "رقم الخط المفوتر — 9 أرقام",
    openAmount: false,
  },
  {
    code: "TEL-PTC",
    name: "المؤسسة العامة للاتصالات (PTC) — الهاتف الثابت",
    category: "TELECOM",
    accountLength: 7,
    accountHint: "رقم الهاتف الثابت — 7 أرقام",
    openAmount: false,
  },
  // ===== الإنترنت =====
  {
    code: "NET-YEMENNET",
    name: "يمن نت — اشتراك الإنترنت المنزلي",
    category: "INTERNET",
    accountLength: 10,
    accountHint: "رقم الاشتراك — 10 أرقام",
    openAmount: false,
  },
  {
    code: "NET-ADENNET",
    name: "أدن نت — ألياف بصرية",
    category: "INTERNET",
    accountLength: 8,
    accountHint: "رقم الاشتراك — 8 أرقام",
    openAmount: false,
  },
  {
    code: "NET-ENGNET",
    name: "إ نت (Engnet) — إنترنت الشركات",
    category: "INTERNET",
    accountLength: 9,
    accountHint: "رقم العقد — 9 أرقام",
    openAmount: false,
  },
  // ===== خدمات حكومية =====
  {
    code: "GOV-TRAFFIC-ADEN",
    name: "مرور عدن — المخالفات المرورية",
    category: "GOV",
    accountLength: 10,
    accountHint: "رقم اللوحة/المخالفة — 10 أرقام",
    openAmount: false,
  },
  {
    code: "GOV-MUNICIPAL-ADEN",
    name: "بلدية عدن — الرسوم البلدية",
    category: "GOV",
    accountLength: 8,
    accountHint: "رقم السجل البلدي — 8 أرقام",
    openAmount: false,
  },
];

// ============ كتالوج مشغلي الشحن (اليمن) ============

export const OPERATORS: OperatorDef[] = [
  {
    code: "YOU",
    name: "يُو (You)",
    prefixes: ["73", "74"],
    packagesMinor: [250, 500, 1_000, 2_000, 5_000],
  },
  {
    code: "MTN",
    name: "MTN اليمن",
    prefixes: ["77", "78"],
    packagesMinor: [250, 500, 1_000, 2_000, 5_000],
  },
  {
    code: "SABAFON",
    name: "سبأفون",
    prefixes: ["71", "72"],
    packagesMinor: [250, 500, 1_000, 2_000, 5_000],
  },
  {
    code: "YTELECOM",
    name: "يمن موبايل (Y-Telecom)",
    prefixes: ["70", "76"],
    packagesMinor: [500, 1_000, 2_000, 5_000],
  },
];

// ============ كتالوج كروت الشبكة (باقات بيانات) ============

export const CARDS: CardDef[] = [
  // You
  { code: "YOU-D1", operatorCode: "YOU", operatorName: "يُو (You)", name: "باقة يومية", size: "1 GB / يوم واحد", priceMinor: 1_200 },
  { code: "YOU-M5", operatorCode: "YOU", operatorName: "يُو (You)", name: "باقة يو ميز", size: "5 GB / 30 يوم", priceMinor: 9_000 },
  { code: "YOU-M10", operatorCode: "YOU", operatorName: "يُو (You)", name: "باقة يو بلس", size: "10 GB / 30 يوم", priceMinor: 15_000 },
  { code: "YOU-M25", operatorCode: "YOU", operatorName: "يُو (You)", name: "باقة يو ماكس", size: "25 GB / 30 يوم", priceMinor: 32_000 },
  // MTN
  { code: "MTN-D1", operatorCode: "MTN", operatorName: "MTN اليمن", name: "باقة يومية", size: "1.5 GB / يوم واحد", priceMinor: 1_400 },
  { code: "MTN-M4", operatorCode: "MTN", operatorName: "MTN اليمن", name: "باقة MTN ميز", size: "4 GB / 30 يوم", priceMinor: 8_500 },
  { code: "MTN-M12", operatorCode: "MTN", operatorName: "MTN اليمن", name: "باقة MTN بلس", size: "12 GB / 30 يوم", priceMinor: 16_000 },
  { code: "MTN-M30", operatorCode: "MTN", operatorName: "MTN اليمن", name: "باقة MTN ماكس", size: "30 GB / 30 يوم", priceMinor: 34_000 },
  // Sabafon
  { code: "SABA-D1", operatorCode: "SABAFON", operatorName: "سبأفون", name: "باقة يومية", size: "1 GB / يوم واحد", priceMinor: 1_100 },
  { code: "SABA-M3", operatorCode: "SABAFON", operatorName: "سبأفون", name: "باقة سبأ ميز", size: "3 GB / 30 يوم", priceMinor: 7_500 },
  { code: "SABA-M10", operatorCode: "SABAFON", operatorName: "سبأفون", name: "باقة سبأ بلس", size: "10 GB / 30 يوم", priceMinor: 14_500 },
  { code: "SABA-M20", operatorCode: "SABAFON", operatorName: "سبأفون", name: "باقة سبأ ماكس", size: "20 GB / 30 يوم", priceMinor: 28_000 },
  // Y-Telecom
  { code: "YTEL-D1", operatorCode: "YTELECOM", operatorName: "يمن موبايل (Y-Telecom)", name: "باقة يومية", size: "1 GB / يوم واحد", priceMinor: 1_300 },
  { code: "YTEL-M6", operatorCode: "YTELECOM", operatorName: "يمن موبايل (Y-Telecom)", name: "باقة يمن موبايل ميز", size: "6 GB / 30 يوم", priceMinor: 10_000 },
  { code: "YTEL-M15", operatorCode: "YTELECOM", operatorName: "يمن موبايل (Y-Telecom)", name: "باقة يمن موبايل بلس", size: "15 GB / 30 يوم", priceMinor: 18_500 },
];

/** عملة خدمات الدفع كلها — YER فقط في Beta */
export const PAYMENTS_CURRENCY: CurrencyCode = "YER";

// ============ الرسوم الحية من FeeRule ============

export type PaymentsOpType = "BILL_PAY" | "TOPUP" | "CARD_PURCHASE";

/** جلب قاعدة رسوم خدمات الدفع (YER) — SRV-001 إن غابت */
export async function getPaymentsFeeRule(tx: DbClient, opType: PaymentsOpType): Promise<FeeRuleLike> {
  const rule = await tx.feeRule.findUnique({
    where: { opType_currency: { opType, currency: "YER" } },
  });
  if (!rule) {
    throw new RouteError("SRV-001", 503, { reason: `لا توجد قاعدة رسوم ${opType}/YER` });
  }
  return {
    pctBps: rule.pctBps,
    fixedMinor: rule.fixedMinor,
    minFeeMinor: rule.minFeeMinor,
    maxFeeMinor: rule.maxFeeMinor,
  };
}

/** رسوم خدمة دفع لحظية (بلا خطأ عند غياب القاعدة — للكتالوج فقط) */
export async function peekPaymentsFeeMinor(tx: DbClient, opType: PaymentsOpType): Promise<number> {
  const rule = await tx.feeRule.findUnique({
    where: { opType_currency: { opType, currency: "YER" } },
  });
  return rule ? computeFee(rule, 1_000) : 0; // مبلغ مرجعي 1,000 — القاعدة ثابتة
}

// ============ البحث والتحقق ============

export function billerByCode(code: string): BillerDef | null {
  return BILLERS.find((b) => b.code === code) ?? null;
}

/** تحقق صيغة رقم حساب المزود — SYS-001 مع تلميح الطول */
export function assertValidAccountNumber(biller: BillerDef, accountNumber: string): string {
  const clean = accountNumber.trim();
  if (!new RegExp(`^\\d{${biller.accountLength}}$`).test(clean)) {
    throw new RouteError("SYS-001", 400, {
      field: "accountNumber",
      reason: `رقم الحساب يجب أن يكون ${biller.accountLength} أرقام (${biller.accountHint})`,
    });
  }
  return clean;
}

export function operatorByCode(code: string): OperatorDef | null {
  return OPERATORS.find((o) => o.code === code) ?? null;
}

/** يتبع الرقم المشغل؟ (بادئة الرقم ضمن بادئات المشغل) */
export function phoneMatchesOperator(operator: OperatorDef, phone: string): boolean {
  return operator.prefixes.some((p) => phone.startsWith(p));
}

export function cardByCode(code: string): CardDef | null {
  return CARDS.find((c) => c.code === code) ?? null;
}

/** الفئة ضمن فئات المشغل؟ */
export function isPackageAllowed(operator: OperatorDef, amountMinor: number): boolean {
  return operator.packagesMinor.includes(amountMinor);
}

// ============ المبلغ المستحق المحاكى (حتمي) ============

/**
 * المبلغ المستحق للفاتورة — مشتق من hash(billerCode + accountNumber)
 * ليكون ثابتاً لنفس الرقم دائماً: 3,000..25,000 ر.ي مقربة لأقرب 25.
 */
export function simulatedDueAmountMinor(billerCode: string, accountNumber: string): number {
  const h = createHash("sha256").update(`${billerCode}:${accountNumber}`).digest();
  const n = h.readUInt32BE(0);
  const span = 25_000 - 3_000;
  const rounded = Math.round((3_000 + (n % span)) / 25) * 25;
  return Math.min(25_000, Math.max(3_000, rounded));
}

/**
 * تاريخ الاستحقاق المحاكى: خلال 1..12 يوماً من الآن (حتمي حسب الرقم).
 * يعاد نص عربي: "15 سبتمبر 2026".
 */
export function simulatedDueLabel(billerCode: string, accountNumber: string): string {
  const h = createHash("sha256").update(`due:${billerCode}:${accountNumber}`).digest();
  const days = 1 + (h.readUInt16BE(0) % 12);
  const due = new Date(Date.now() + days * 86_400_000);
  const months = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
  ];
  return `${due.getDate()} ${months[due.getMonth()]} ${due.getFullYear()}`;
}

// ============ توليد رمز الكرت (11 خانة) ============

/** نفس أبجدية المراجع بلا لبس (لا 0/O/1/I) — محلية لتجنب تعديل domain.ts */
const CARD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** رمز كرت شبكة: 11 خانة أرقام وحروف من أبجدية بلا لبس */
export function generateCardCode(): string {
  const bytes = randomBytes(11);
  let out = "";
  for (let i = 0; i < 11; i++) out += CARD_ALPHABET[bytes[i] % CARD_ALPHABET.length];
  return out;
}

// ============ نماذج العرض (Views) ============

export function toBillerView(b: BillerDef, feeMinor: number): BillerView {
  return {
    code: b.code,
    name: b.name,
    category: b.category,
    currency: PAYMENTS_CURRENCY,
    feeMinor,
    accountFormatHint: b.accountHint,
    openAmount: b.openAmount,
  };
}

export function toTopupOperatorView(o: OperatorDef, feeMinor: number): TopupOperatorView {
  return {
    code: o.code,
    name: o.name,
    prefix: o.prefixes.join("/"),
    packagesMinor: o.packagesMinor,
    feeMinor,
  };
}

export function toCardProductView(c: CardDef): CardProductView {
  return {
    code: c.code,
    operator: c.operatorName,
    name: c.name,
    size: c.size,
    priceMinor: c.priceMinor,
    currency: PAYMENTS_CURRENCY,
  };
}
