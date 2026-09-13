/**
 * محفظة الجنوب — أنواع عقد API المشتركة (الواجهة والخلفية معاً)
 * العقد المرجعي: docs/MVP_CONTRACT.md
 */

// ============ الثوابت ============

export const CURRENCIES = ["YER", "SAR", "USD"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export interface CurrencyMeta {
  code: CurrencyCode;
  symbolAr: string;
  decimals: number;
}

export const CURRENCY_META: Record<CurrencyCode, CurrencyMeta> = {
  YER: { code: "YER", symbolAr: "ر.ي", decimals: 0 },
  SAR: { code: "SAR", symbolAr: "ر.س", decimals: 2 },
  USD: { code: "USD", symbolAr: "$", decimals: 2 },
};

/** المحافظات الثماني داخل نطاق الخدمة (SRS — النطاق الجغرافي) */
export const IN_SCOPE_GOVERNORATES = [
  "عدن",
  "لحج",
  "أبين",
  "شبوة",
  "حضرموت",
  "المهرة",
  "سقطرى",
  "الضالع",
] as const;

/** محافظات خارج النطاق (أمثلة AC-07) */
export const OUT_OF_SCOPE_EXAMPLES = ["صنعاء", "تعز", "الحديدة", "إب", "حجة", "مأرب", "ذمار", "البيضاء", "الجوفة", "ريمة", "عمران", "المحويت"];

export const USER_ROLES = ["CUSTOMER", "MERCHANT", "AGENT", "ADMIN", "COMPLIANCE", "SUPPORT", "SYSTEM"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  CUSTOMER: "عميل",
  MERCHANT: "تاجر / نقطة بيع",
  AGENT: "وكيل معتمد",
  ADMIN: "مدير النظام",
  COMPLIANCE: "مراجع KYC/الامتثال",
  SUPPORT: "دعم العملاء",
  SYSTEM: "النظام",
};

// ============ الحالات والملصقات العربية ============

export type TxStatus = "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED" | "EXPIRED";
export const TX_STATUS_LABELS: Record<TxStatus, string> = {
  PENDING: "معلّق",
  COMPLETED: "مكتملة",
  FAILED: "فاشلة",
  CANCELLED: "ملغاة",
  EXPIRED: "منتهية",
};

export type TxType =
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "REMITTANCE"
  | "REMITTANCE_REFUND"
  | "CASH_IN"
  | "CASH_OUT"
  | "CASH_REFUND"
  | "SAVING_IN"
  | "SAVING_OUT"
  | "FX_EXCHANGE"
  | "SYSTEM_ADJUST"
  | "BILL_PAY"
  | "TOPUP"
  | "CARD_PURCHASE"
  | "MERCHANT_PAY_OUT"
  | "MERCHANT_SALE_IN"
  | "REMIT_IN_CLAIM";

export const TX_TYPE_LABELS: Record<TxType, string> = {
  TRANSFER_OUT: "تحويل صادر",
  TRANSFER_IN: "تحويل وارد",
  REMITTANCE: "حوالة إلى غير مشترك",
  REMITTANCE_REFUND: "استرجاع حوالة",
  CASH_IN: "إيداع نقدي",
  CASH_OUT: "سحب نقدي",
  CASH_REFUND: "استرجاع سحب",
  SAVING_IN: "إيداع في الحصالة",
  SAVING_OUT: "سحب من الحصالة",
  FX_EXCHANGE: "تحويل بين المحافظ",
  SYSTEM_ADJUST: "تسوية نظامية",
  BILL_PAY: "سداد فاتورة",
  TOPUP: "شحن رصيد",
  CARD_PURCHASE: "شراء كرت شبكة",
  MERCHANT_PAY_OUT: "دفع لتاجر (QR)",
  MERCHANT_SALE_IN: "مبيعات نقطة البيع",
  REMIT_IN_CLAIM: "استلام حوالة واردة",
};

export type KycStatus = "PENDING" | "APPROVED" | "REJECTED";
export const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  PENDING: "قيد المراجعة",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
};

export type RemittanceStatus = "PENDING" | "PAID" | "CANCELLED" | "EXPIRED";
export const REMITTANCE_STATUS_LABELS: Record<RemittanceStatus, string> = {
  PENDING: "بانتظار الاستلام",
  PAID: "تم التسليم",
  CANCELLED: "ملغاة",
  EXPIRED: "منتهية الصلاحية",
};

export type CashOpType = "DEPOSIT" | "WITHDRAW";
export const CASH_OP_TYPE_LABELS: Record<CashOpType, string> = {
  DEPOSIT: "إيداع نقدي",
  WITHDRAW: "سحب نقدي",
};

export type ServiceStateValue = "ON" | "OFF" | "COMING_LATER" | "MAINTENANCE";
export const SERVICE_STATE_LABELS: Record<ServiceStateValue, string> = {
  ON: "متاحة",
  OFF: "معطلة",
  COMING_LATER: "قريباً — المرحلة 2",
  MAINTENANCE: "صيانة",
};

// ============ الغلاف الموحد للأخطاء ============

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: Record<string, string | number>;
}

export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiErrorPayload };

export const ERROR_MESSAGES: Record<string, string> = {
  "AUTH-001": "انتهت الجلسة أو غير صالحة — يرجى تسجيل الدخول",
  "AUTH-002": "رمز التحقق غير صحيح أو منتهي الصلاحية",
  "AUTH-003": "تجاوزت محاولات إدخال رمز التحقق",
  "AUTH-005": "الحساب مجمّد — يمكنك الدخول للاطلاع فقط",
  "AUTH-007": "المصادقة غير مفعّلة لهذا الحساب — استخدم رمز التفعيل الصادر من الدعم",
  "AUTH-901": "هذا الرقم مسجّل مسبقاً — سجّل الدخول بدلاً من إنشاء حساب جديد",
  "AUTH-902": "الحساب مفعّل المصادقة بالفعل — سجّل الدخول برمز المصادقة",
  "PIN-001": "رمز PIN غير صحيح",
  "PIN-002": "تم قفل رمز PIN مؤقتاً بسبب المحاولات الخاطئة",
  "GEO-001": "أنت خارج نطاق الخدمة الجغرافي — العمليات المالية معطلة",
  "ACC-001": "الحساب مجمّد — العمليات المالية معطلة",
  "KYC-001": "هذه العملية تتطلب توثيقاً أعلى",
  "KYC-002": "طلب توثيق قائم بالفعل",
  "TRF-001": "رقم المستلم غير مسجل في المحفظة",
  "TRF-002": "لا يمكن التحويل إلى نفسك",
  "TXN-001": "الرصيد غير كافٍ لإتمام العملية",
  "TXN-002": "تجاوزت الحدود اليومية أو الحد الأقصى للعملية الواحدة",
  "TXN-003": "تعارض Idempotency — المفتاح مستعمل بحمولة مختلفة",
  "CWD-001": "رمز التحقق غير صحيح",
  "CWD-002": "انتهت صلاحية الطلب",
  "CWD-003": "عوم الوكيل غير كافٍ لإتمام العملية",
  "REM-001": "لا يمكن إلغاء هذه الحوالة",
  "SRV-001": "الخدمة غير متاحة حالياً",
  // المرحلة 2 — خدمات الدفع والحوالات الواردة
  "BIL-001": "مزوّد الفاتورة غير معروف أو معطّل",
  "TOP-001": "مشغّل أو فئة شحن غير مدعومة",
  "MRC-001": "التاجر غير مسجل في شبكة الدفع",
  "RIN-001": "رمز الحوالة الواردة غير صحيح أو منتهي الصلاحية",
  "SYS-001": "خطأ غير متوقع — حاول مجدداً",
  // إضافة 8-a: رمز RBAC للصلاحيات الإدارية
  "RBAC-001": "لا تملك صلاحية لهذا الإجراء",
  // إضافة الإنتاج (المهمة 12): حد المعدل + الصحة + تقييد IP الإداري
  "SYS-002": "طلبات كثيرة جداً — انتظر قليلاً ثم أعد المحاولة",
  "SYS-003": "قاعدة البيانات غير متاحة",
  "RBAC-002": "الوصول الإداري مقيّد بعناوين شبكة معتمدة",
};

// ============ نماذج العرض (الخادم يعيدها كما هي) ============

export interface PublicUser {
  id: string;
  phone: string;
  fullName: string | null;
  role: UserRole;
  status: "PENDING" | "ACTIVE" | "FROZEN" | "CLOSED";
  kycLevel: "NONE" | "VERIFIED";
  scopeRestricted: boolean;
  governorate: string | null;
  biometricEnabled: boolean;
  hasPin: boolean;
  createdAt: string;
}

export interface WalletView {
  currency: CurrencyCode;
  kind: "MAIN";
  balanceMinor: number;
}

export interface KycSubmissionView {
  id: string;
  fullName: string;
  idType: "NATIONAL_ID" | "PASSPORT";
  idNumberMasked: string;
  governorate: string;
  status: KycStatus;
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface LimitView {
  kycLevel: "NONE" | "VERIFIED";
  currency: CurrencyCode;
  dailyTxnCount: number;
  dailyAmountMinor: number;
  perTxnAmountMinor: number;
}

export interface MeView {
  user: PublicUser;
  wallets: WalletView[];
  kyc: KycSubmissionView | null;
  limits: LimitView[];
  unreadNotifications: number;
  scopeNotice: string | null;
}

export interface TxView {
  ref: string;
  type: TxType;
  status: TxStatus;
  currency: CurrencyCode;
  amountMinor: number;
  feeMinor: number;
  direction: "DEBIT" | "CREDIT";
  counterpartyName: string | null;
  counterpartyPhone: string | null;
  description: string | null;
  relatedRef: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface PageView<T> {
  items: T[];
  nextCursor: string | null;
}

export interface TransferQuoteView {
  recipientName: string;
  maskedPhone: string;
  currency: CurrencyCode;
  amountMinor: number;
  feeMinor: number;
  totalMinor: number;
}

export interface ExchangeQuoteView {
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  amountMinor: number;
  rate: number;
  feeMinor: number;
  receiveMinor: number;
  totalDebitMinor: number;
}

export interface RemittanceView {
  id: string;
  ref: string;
  receiverName: string;
  receiverPhone: string;
  currency: CurrencyCode;
  amountMinor: number;
  feeMinor: number;
  deliveryCode: string | null;
  status: RemittanceStatus;
  payingAgentName: string | null;
  paidAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface CashOperationView {
  id: string;
  ref: string;
  type: CashOpType;
  currency: CurrencyCode;
  amountMinor: number;
  feeMinor: number;
  code: string | null;
  status: TxStatus;
  agentName: string;
  agentShop: string;
  agentCode: string;
  expiresAt: string;
  processedAt: string | null;
  createdAt: string;
}

export interface AgentView {
  id: string;
  code: string;
  shopName: string;
  governorate: string;
  district: string | null;
  address: string | null;
  status: "ACTIVE" | "SUSPENDED";
}

export interface SavingsJarView {
  id: string;
  name: string;
  targetMinor: number | null;
  currency: CurrencyCode;
  savedMinor: number;
  progress: number | null;
  status: "ACTIVE" | "ACHIEVED" | "BROKEN";
  createdAt: string;
}

export interface NotificationView {
  id: string;
  title: string;
  body: string;
  category: "TXN" | "SECURITY" | "KYC" | "SYSTEM" | "SUPPORT";
  read: boolean;
  txRef: string | null;
  createdAt: string;
}

export interface BeneficiaryView {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
}

export interface TicketView {
  id: string;
  ref: string;
  subject: string;
  category: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  createdAt: string;
  updatedAt: string;
  lastMessage: string | null;
  messagesCount: number;
}

export interface TicketMessageView {
  id: string;
  authorName: string;
  authorRole: UserRole;
  body: string;
  createdAt: string;
}

export interface ServiceStateView {
  key: string;
  state: ServiceStateValue;
  note: string | null;
}

export interface FxRateView {
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  updatedAt: string;
}

// ============ لوحة الإدارة ============

export interface AdminOverviewView {
  usersCount: number;
  customersCount: number;
  agentsCount: number;
  frozenUsers: number;
  pendingKyc: number;
  pendingCashOps: number;
  pendingRemittances: number;
  openTickets: number;
  txnLast24h: number;
  volume24hMinor: Record<string, number>;
  ledgerBalanced: boolean;
  ledgerViolations: string[];
}

export interface AdminUserRow {
  id: string;
  phone: string;
  fullName: string | null;
  role: UserRole;
  status: "PENDING" | "ACTIVE" | "FROZEN" | "CLOSED";
  kycLevel: "NONE" | "VERIFIED";
  scopeRestricted: boolean;
  governorate: string | null;
  createdAt: string;
  balancesYER: number;
}

export interface AdminKycRow {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  idType: "NATIONAL_ID" | "PASSPORT";
  idNumberMasked: string;
  governorate: string;
  occupation: string | null;
  monthlyIncomeMinor: number;
  incomeCurrency: string;
  submittedAt: string;
}

export interface AdminAgentRow {
  id: string;
  userId: string;
  code: string;
  shopName: string;
  ownerName: string | null;
  phone: string;
  governorate: string;
  district: string | null;
  status: "ACTIVE" | "SUSPENDED";
  floatMinor: number;
  commissionBps: number;
  commissionTotalMinor: number;
  createdAt: string;
}

export interface AdminAuditRow {
  id: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  createdAt: string;
}

export interface AdminTicketRow extends TicketView {
  ownerName: string;
  ownerPhone: string;
}

// ============ بوابة الوكيل ============

export interface AgentOverviewView {
  profile: AgentView;
  floatMinor: number;
  commissionTotalMinor: number;
  commissionCount: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  pendingRemittancesGlobal: number;
}

export interface AgentQueueItem {
  id: string;
  kind: "CASH_DEPOSIT" | "CASH_WITHDRAW";
  ref: string;
  userName: string;
  userPhone: string;
  amountMinor: number;
  currency: CurrencyCode;
  status: TxStatus;
  createdAt: string;
  expiresAt: string;
}

export interface CommissionEntryView {
  id: string;
  opType: "CASH_IN" | "WITHDRAW" | "REMITTANCE";
  sourceRef: string;
  amountMinor: number;
  createdAt: string;
}

// ============ الوثائق ============

export interface DocMetaView {
  id: string;
  step: number;
  title: string;
  shortTitle: string;
  subtitle: string;
  lines: number;
}

// ============ أدوات مساعدة للواجهة ============

/** تنسيق مبلغ من الوحدات الفرعية إلى نص عربي */
export function formatMoney(minor: number, currency: CurrencyCode): string {
  const meta = CURRENCY_META[currency];
  const value = minor / Math.pow(10, meta.decimals);
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  });
  return `${formatted} ${meta.symbolAr}`;
}

/** إخفاء رقم هاتف: 770123••• */
export function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 6)}•••`;
}

// ============ إضافات 8-a (طبقة الخلفية) — إضافات فقط بلا تعديل ============

/** بيانات إلحاق المصادقة (TOTP) — تُعرض مرة واحدة للمستخدم */
export interface EnrollmentView {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

/** نتيجة تسجيل الدخول (A2/A3) — إشعار اطلاع للحساب المجمّد */
export interface AuthResultView {
  user: PublicUser;
  needsPin: boolean;
  notice: string | null;
  noticeCode: string | null;
  /**
   * رمز الجلسة (القناة الاحتياطية iframe-safe): يخزنه العميل في
   * localStorage ويرسله عبر ترويسة x-sw-session مع كل طلب — لأن كوكي
   * SameSite=Lax قد يُحجب في سياق إطار معاينة خارجي.
   */
  sessionToken?: string;
  /** رموز الاسترداد الجديدة (تُعاد مرة واحدة عند الإلحاق أو التجديد) */
  recoveryCodes?: string[];
  /** عدد رموز الاسترداد غير المستخدمة المتبقية (عند الدخول) */
  recoveryRemaining?: number;
}

/** نتيجة عملية مالية م keyed بIdempotency — replayed=true عند إعادة التشغيل */
export interface TxResultView extends TxView {
  replayed?: boolean;
  /** رصيد محفظة العملة بعد العملية */
  balanceMinor?: number;
}

export interface RemittanceResultView extends RemittanceView {
  replayed?: boolean;
}

export interface CashOpResultView extends CashOperationView {
  replayed?: boolean;
}

export interface SavingsOpResultView {
  jar: SavingsJarView;
  /** null عند تحطيم حصالة فارغة (لا حركة مالية) */
  tx: TxView | null;
  replayed?: boolean;
}

export interface FeeQuoteView {
  feeMinor: number;
  totalMinor: number;
}

export interface StatementView {
  summary: {
    count: number;
    totalInMinor: number;
    totalOutMinor: number;
    feesMinor: number;
  };
  items: TxView[];
}

export interface LedgerLineView {
  walletId: string;
  direction: "DEBIT" | "CREDIT";
  amountMinor: number;
  balanceAfterMinor: number;
  currency: CurrencyCode;
}

export interface TxDetailView extends TxView {
  ledger: LedgerLineView[];
}

export interface SessionView {
  id: string;
  deviceLabel: string;
  lastSeenAt: string;
  createdAt: string;
  current: boolean;
}

export interface ProfileView {
  user: PublicUser;
  sessions: SessionView[];
}

export interface TicketThreadView {
  ticket: TicketView;
  messages: TicketMessageView[];
}

export interface AdminTxRow extends TxView {
  userId: string;
  userPhone: string;
  userName: string | null;
}

export interface AdminLimitRow extends LimitView {
  id: string;
}

export interface AdminFeeRow {
  id: string;
  opType: string;
  currency: CurrencyCode;
  pctBps: number;
  fixedMinor: number;
  minFeeMinor: number;
  maxFeeMinor: number | null;
}

export interface AdminFxRow {
  id: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  updatedAt: string;
}

export interface AdminServiceRow {
  id: string;
  key: string;
  state: ServiceStateValue;
  note: string | null;
  updatedAt: string;
}

export interface AdminPendingView {
  remittances: RemittanceView[];
  cashOps: CashOperationView[];
}

export interface LedgerCheckView {
  ledgerBalanced: boolean;
  ledgerViolations: string[];
  totalEntries: number;
  groupsChecked: number;
}

export interface CommissionListView {
  items: CommissionEntryView[];
  totalMinor: number;
}

/** المرحلة الأولى من G4: تفاصيل المستلم قبل تأكيد الدفع */
export interface RemittancePayPreviewView {
  ref: string;
  receiverName: string;
  receiverPhone: string;
  amountMinor: number;
  currency: CurrencyCode;
  feeMinor: number;
  status: RemittanceStatus;
  senderName: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface RemittancePayResultView {
  remittance: RemittanceView;
}

// ============ إضافات المرحلة 2 (الخدمات — 9-b/9-c) ============

/** فئة فاتورة */
export type BillerCategory = "ELECTRIC" | "WATER" | "TELECOM" | "INTERNET" | "GOV";
export const BILLER_CATEGORY_LABELS: Record<BillerCategory, string> = {
  ELECTRIC: "الكهرباء",
  WATER: "المياه",
  TELECOM: "الاتصالات",
  INTERNET: "الإنترنت",
  GOV: "خدمات حكومية",
};

/** مزوّد فواتير (كتالوج خادمي ثابت) */
export interface BillerView {
  code: string;
  name: string;
  category: BillerCategory;
  /** طرق الدفع المتاحة للعملة */
  currency: CurrencyCode;
  /** رسوم ثابتة بالوحدات الفرعية */
  feeMinor: number;
  /** أقسام الرقم/الحساب (طول كل قسم) — للتحقق قبل الإرسال */
  accountFormatHint: string;
  /** يسمح بمبالغ مفتوحة إن true، أو حزمة ثابتة إن false */
  openAmount: boolean;
}

/** عرض فاتورة مقدّر (قبل الدفع): الرصيد المستحق إن توفر */
export interface BillPreviewView {
  biller: BillerView;
  accountNumber: string;
  /** null = المزوّد لا يدعم الاستعلام الفوري في Alpha (يُدخل المبلغ يدوياً) */
  dueAmountMinor: number | null;
  dueLabel: string | null;
}

/** نتيجة سداد فاتورة */
export interface BillPayResultView extends TxResultView {
  billerName: string;
  accountNumber: string;
}

/** مشغّل شحن رصيد */
export interface TopupOperatorView {
  code: string;
  name: string;
  prefix: string;
  /** فئات الشحن المتاحة بالوحدات الفرعية */
  packagesMinor: number[];
  feeMinor: number;
}

/** كرت بيانات/شبكة قابل للشراء */
export interface CardProductView {
  code: string;
  operator: string;
  name: string;
  /** حجم الباقة (مثال: "10 GB / 30 يوم") */
  size: string;
  priceMinor: number;
  currency: CurrencyCode;
}

/** تاجر عام (للبحث/الدفع عبر الرمز) */
export interface MerchantPublicView {
  phone: string;
  shopName: string;
  category: string;
  governorate: string;
  /** رمز الدفع SWPAY:<phone> */
  qrPayload: string;
}

/** نتيجة مسح/إدخال رمز الدفع — تفاصيل التاجر قبل تأكيد الدفع */
export interface QrPayPreviewView {
  merchant: MerchantPublicView;
}

/** نتيجة دفع لتاجر */
export interface QrPayResultView extends TxResultView {
  merchantName: string;
}

/** حوالة واردة بانتظار الاستلام (من شبكات الصرافة) */
export interface InboundRemittanceView {
  ref: string;
  networkName: string;
  senderName: string;
  amountMinor: number;
  currency: CurrencyCode;
  feeMinor: number;
  /** 6 أرقام للمطالبة */
  claimCode: string;
  status: "PENDING" | "CLAIMED" | "EXPIRED";
  createdAt: string;
  expiresAt: string;
}

/** نتيجة استلام حوالة واردة */
export interface RemitInClaimResultView extends TxResultView {
  networkName: string;
  senderName: string;
}
