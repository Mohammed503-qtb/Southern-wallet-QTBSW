/**
 * محفظة الجنوب — كتالوج الخدمات (مشترك بين الرئيسية وشاشة الخدمات)
 * بنية الكتالوج ثابتة في الواجهة (أيقونة/عنوان/وجهة) — أما حالة كل خدمة
 * (ON/COMING_LATER/OFF/MAINTENANCE) فتأتي من الخادم GET /api/services
 * (ServiceStateView[]) ولا تُفترض محلياً إلا للخدمات المالية الأساسية التي
 * لا تدخل في محرك ServiceState (النواة المالية في Alpha دائماً متاحة).
 */
"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Banknote,
  Bell,
  BookOpen,
  FileText,
  LifeBuoy,
  MapPin,
  PiggyBank,
  Receipt,
  Send,
  Smartphone,
} from "lucide-react";
import type { ScreenKey } from "@/lib/app-store";
import type { ServiceStateValue, ServiceStateView } from "@/lib/api-types";

export type ServiceGroup = "money" | "later" | "account";

export interface CatalogService {
  /** مفتاح الحالة لدى الخادم — null = خدمة نواة مالية (ON افتراضياً) */
  stateKey: string | null;
  title: string;
  description: string;
  icon: LucideIcon;
  /** وجهة التنقل — null = لا تنقل (تفسير فقط عبر Sheet) */
  screen: ScreenKey | null;
  group: ServiceGroup;
}

export const SERVICE_CATALOG: CatalogService[] = [
  // ===== المال (النواة المالية — Alpha) =====
  {
    stateKey: null,
    title: "التحويل",
    description: "تحويل فوري بين مشتركي المحفظة",
    icon: Send,
    screen: "transfer",
    group: "money",
  },
  {
    stateKey: null,
    title: "بين محافظي",
    description: "تحويل بين عملاتك بأسعار صرف لحظية",
    icon: ArrowLeftRight,
    screen: "wallet-transfer",
    group: "money",
  },
  {
    stateKey: null,
    title: "الحوالات",
    description: "إرسال نقدي لغير المشتركين برمز تسليم",
    icon: Banknote,
    screen: "remittances",
    group: "money",
  },
  {
    stateKey: null,
    title: "إيداع نقدي",
    description: "طلب إيداع لدى وكيل معتمد",
    icon: ArrowDownToLine,
    screen: "cash-deposit",
    group: "money",
  },
  {
    stateKey: null,
    title: "سحب نقدي",
    description: "سحب نقدي من وكيل برمز تحقق",
    icon: ArrowUpFromLine,
    screen: "cash-withdraw",
    group: "money",
  },
  {
    stateKey: null,
    title: "الحصالة",
    description: "أهداف ادخارية بعملات متعددة",
    icon: PiggyBank,
    screen: "savings",
    group: "money",
  },
  {
    stateKey: null,
    title: "الوكلاء",
    description: "أقرب وكيل معتمد في محافظتك",
    icon: MapPin,
    screen: "agents-map",
    group: "money",
  },

  // ===== خدمات المرحلة 2 (حالاتها من الخادم — COMING_LATER في Alpha) =====
  {
    stateKey: "BILLS",
    title: "الفواتير",
    description: "سداد فواتير الكهرباء والمياه والاتصالات",
    icon: FileText,
    screen: "bills",
    group: "money",
  },
  {
    stateKey: "TOPUP",
    title: "شحن رصيد",
    description: "شحن رصيد الهاتف وبطاقات الإنترنت",
    icon: Smartphone,
    screen: "topup",
    group: "money",
  },
  {
    stateKey: "NETWORK_CARDS",
    title: "كروت الشبكة",
    description: "شراء كروت بيانات المشغلين",
    icon: Smartphone,
    screen: "cards",
    group: "money",
  },
  {
    stateKey: "MERCHANT_PAY",
    title: "دفع التاجر",
    description: "الدفع بمسح QR لدى التجار ونقاط البيع",
    icon: Receipt,
    screen: "my-qr",
    group: "money",
  },
  {
    stateKey: "REMITTANCE_IN",
    title: "حوالة واردة",
    description: "استلام حوالات من شبكات الصرافة (A-03)",
    icon: Banknote,
    screen: "remit-in",
    group: "money",
  },

  // ===== الحساب (متاحة دائماً) =====
  {
    stateKey: null,
    title: "سجل العمليات",
    description: "كل عملياتك بفلاتر وبحث",
    icon: Receipt,
    screen: "transactions",
    group: "account",
  },
  {
    stateKey: null,
    title: "كشف الحساب",
    description: "ملخص فترة وتنزيل CSV",
    icon: FileText,
    screen: "statement",
    group: "account",
  },
  {
    stateKey: null,
    title: "الإشعارات",
    description: "مركز إشعارات العمليات والأمان",
    icon: Bell,
    screen: "notifications",
    group: "account",
  },
  {
    stateKey: null,
    title: "مركز المساعدة",
    description: "الأسئلة الشائعة وتذاكر الدعم",
    icon: LifeBuoy,
    screen: "help",
    group: "account",
  },
  {
    stateKey: null,
    title: "الوثائق الهندسية",
    description: "عقود المشروع السبعة كاملة",
    icon: BookOpen,
    screen: "docs",
    group: "account",
  },
];

/** تحويل استجابة /api/services إلى خريطة مفتاح → حالة */
export function toStateMap(
  list: ServiceStateView[] | null | undefined,
): Map<string, { state: ServiceStateValue; note: string | null }> {
  const map = new Map<string, { state: ServiceStateValue; note: string | null }>();
  for (const item of list ?? []) {
    map.set(item.key, { state: item.state, note: item.note });
  }
  return map;
}

/** حالة فعّالة لخدمة: من الخادم، أو ON لنواة الحساب/المال بلا مفتاح */
export function resolveState(
  service: CatalogService,
  stateMap: Map<string, { state: ServiceStateValue; note: string | null }>,
): { state: ServiceStateValue; note: string | null } {
  if (service.stateKey) {
    return stateMap.get(service.stateKey) ?? { state: "COMING_LATER", note: null };
  }
  // الخدمات الأساسية (account) متاحة دائماً في Alpha
  if (service.group === "account") return { state: "ON", note: null };
  return { state: "ON", note: null };
}
