/**
 * محفظة الجنوب — كتالوج التجار التجريبي (MERCHANT_PAY — 9-c)
 * ---------------------------------------------------------
 * سجل ثابت للبيانات الغنية (الفئة/المحافظة) لتجار الـSeed، ودالة بحث.
 * الدفع نفسه يعتمد كلياً على قاعدة البيانات (مستخدم role="MERCHANT"
 * بحالة ACTIVE ومحفظة MAIN) — الكتالوج للعرض الغني فقط:
 *   • shopName  → يُقرأ أساساً من user.fullName (اسم المتجر في الـSeed)
 *   • category/governorate → من الكتالوج، وإلا قيم افتراضية عامة
 * تُطابق هاتف التاجر مفتاح البحث (SWPAY:<phone>).
 */

export interface MerchantCatalogEntry {
  /** شيفرة داخلية للعرض الإداري */
  code: string;
  /** هاتف التاجر (9 أرقام) — مفتاح الربط مع DB */
  phone: string;
  /** اسم المتجر (مطابق لuser.fullName في seed-phase2-merchant.ts) */
  shopName: string;
  /** فئة النشاط التجاري */
  category: string;
  /** المحافظة */
  governorate: string;
}

/** سجل التجار التجريبي (يوسَّع لاحقاً — البحث دائماً من DB) */
export const MERCHANT_CATALOG: readonly MerchantCatalogEntry[] = [
  {
    code: "MR-ADN-001",
    phone: "770000020",
    shopName: "متجر الجنوب للأغذية",
    category: "بقالة ومواد غذائية",
    governorate: "عدن",
  },
  {
    code: "MR-LHJ-001",
    phone: "770000021",
    shopName: "صيدلية الشفاء",
    category: "أدوية",
    governorate: "لحج",
  },
];

/** البحث في الكتالوج بهاتف التاجر — أو null */
export function findMerchantByPhone(phone: string): MerchantCatalogEntry | null {
  const clean = phone.replace(/\D/g, "");
  return MERCHANT_CATALOG.find((m) => m.phone === clean) ?? null;
}

/** بناء عرض تاجر عام (MerchantPublicView) من مستخدم DB + الكتالوج fallback */
export function toMerchantPublicView(user: {
  phone: string;
  fullName: string | null;
  governorate: string | null;
}): {
  phone: string;
  shopName: string;
  category: string;
  governorate: string;
  qrPayload: string;
} {
  const entry = findMerchantByPhone(user.phone);
  return {
    phone: user.phone,
    shopName: user.fullName?.trim() || entry?.shopName || "متجر معتمد",
    category: entry?.category ?? "متجر ونقطة بيع",
    governorate: user.governorate?.trim() || entry?.governorate || "عدن",
    qrPayload: `SWPAY:${user.phone}`,
  };
}
