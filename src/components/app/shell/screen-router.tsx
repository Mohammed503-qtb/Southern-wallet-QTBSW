/**
 * محفظة الجنوب — موجّه الشاشات (ScreenRouter)
 * خريطة Record<ScreenKey, () => ReactNode> لكل شاشات التطبيق:
 * البداية/المصادقة + الرئيسية (8-b) + الميزات المالية (8-c-1) +
 * شاشات الحساب (8-c-2) + لوحات الأدوار (8-d).
 * الانتقال مع fade خفيف، وحدود أخطاء تحمي التطبيق من سقوط أي شاشة.
 */
"use client";

import type { ReactNode } from "react";
import type { ScreenKey } from "@/lib/app-store";
import { useAppStore } from "@/lib/app-store";
import { ScreenErrorBoundary } from "./screen-error-boundary";

import { SplashScreen } from "@/components/app/auth/splash-screen";
import { OnboardingScreen } from "@/components/app/auth/onboarding-screen";
import { LoginScreen } from "@/components/app/auth/login-screen";
import { RegisterScreen } from "@/components/app/auth/register-screen";
import { TotpVerifyScreen } from "@/components/app/auth/totp-verify-screen";
import { TotpEnrollScreen } from "@/components/app/auth/totp-enroll-screen";
import { RecoveryCodesScreen } from "@/components/app/auth/recovery-codes-screen";
import { PinCreateScreen } from "@/components/app/auth/pin-create-screen";

import { HomeScreen } from "@/components/app/home/home-screen";
import { ServicesScreen } from "@/components/app/home/services-screen";
import { WalletDetailsScreen } from "@/components/app/home/wallet-details-screen";

// شاشات الميزات — money (8-c-1)
import { TransferScreen } from "@/components/app/features/money/transfer-screen";
import { ScanQrScreen } from "@/components/app/features/money/scan-qr-screen";
import { WalletTransferScreen } from "@/components/app/features/money/wallet-transfer-screen";
import { RemittanceCreateScreen } from "@/components/app/features/money/remittance-create-screen";
import { RemittancesScreen } from "@/components/app/features/money/remittances-screen";
import { CashDepositScreen } from "@/components/app/features/money/cash-deposit-screen";
import { CashWithdrawScreen } from "@/components/app/features/money/cash-withdraw-screen";
import { WithdrawCodeScreen } from "@/components/app/features/money/withdraw-code-screen";
import { AgentsMapScreen } from "@/components/app/features/money/agents-map-screen";
import { SavingsScreen } from "@/components/app/features/money/savings-screen";
import { SavingsNewScreen } from "@/components/app/features/money/savings-new-screen";
import { SavingsGoalScreen } from "@/components/app/features/money/savings-goal-screen";

// خدمات المرحلة 2 — Closed Beta (9-b/9-c)
import { BillsScreen } from "@/components/app/features/money/bills-screen";
import { BillPayScreen } from "@/components/app/features/money/bill-pay-screen";
import { TopupScreen } from "@/components/app/features/money/topup-screen";
import { CardsScreen } from "@/components/app/features/money/cards-screen";
import { MyQrScreen } from "@/components/app/features/money/my-qr-screen";
import { PayMerchantScreen } from "@/components/app/features/money/pay-merchant-screen";
import { MerchantPosScreen } from "@/components/app/features/money/merchant-pos-screen";
import { RemitInScreen } from "@/components/app/features/money/remit-in-screen";

// شاشات الحساب — account (8-c-2)
import { TransactionsScreen } from "@/components/app/features/account/transactions-screen";
import { TransactionDetailsScreen } from "@/components/app/features/account/transaction-details-screen";
import { StatementScreen } from "@/components/app/features/account/statement-screen";
import { NotificationsScreen } from "@/components/app/features/account/notifications-screen";
import { ProfileScreen } from "@/components/app/features/account/profile-screen";
import { KycScreen } from "@/components/app/features/account/kyc-screen";
import { SecurityScreen } from "@/components/app/features/account/security-screen";
import { DevicesScreen } from "@/components/app/features/account/devices-screen";
import { SettingsScreen } from "@/components/app/features/account/settings-screen";
import { HelpScreen } from "@/components/app/features/account/help-screen";
import { TicketNewScreen } from "@/components/app/features/account/ticket-new-screen";
import { TicketChatScreen } from "@/components/app/features/account/ticket-chat-screen";

// لوحات الأدوار — console (8-d)
import { ConsoleApp } from "@/components/app/console/console-app";

/** عناوين عربية موحدة لكل مفاتيح الشاشات (تستعملها ComingSoon والتنقل) */
export const SCREEN_TITLES: Record<ScreenKey, string> = {
  splash: "البداية",
  onboarding: "التعريف",
  login: "تسجيل الدخول",
  register: "إنشاء حساب جديد",
  "totp-verify": "رمز المصادقة",
  "totp-enroll": "تفعيل المصادقة",
  "recovery-codes": "رموز الاسترداد",
  "pin-create": "إنشاء رمز PIN",
  home: "الرئيسية",
  services: "الخدمات",
  "wallet-details": "تفاصيل المحفظة",
  transfer: "التحويل",
  "scan-qr": "رمز QR",
  "wallet-transfer": "التحويل بين محافظي",
  "remittance-create": "إنشاء حوالة",
  remittances: "الحوالات",
  "cash-deposit": "إيداع نقدي",
  "cash-withdraw": "سحب نقدي",
  "withdraw-code": "رمز السحب",
  "agents-map": "الوكلاء",
  savings: "الحصالة",
  "savings-new": "حصالة جديدة",
  "savings-goal": "هدف الحصالة",
  bills: "الفواتير",
  "bill-pay": "سداد فاتورة",
  topup: "شحن رصيد",
  cards: "كروت الشبكة",
  "my-qr": "رمز الدفع الخاص بي",
  "pay-merchant": "الدفع للتاجر",
  "merchant-pos": "نقطة البيع",
  "remit-in": "الحوالات الواردة",
  transactions: "سجل العمليات",
  "transaction-details": "تفاصيل العملية",
  statement: "كشف الحساب",
  notifications: "الإشعارات",
  profile: "الملف الشخصي",
  kyc: "توثيق الحساب",
  security: "الأمان",
  devices: "أجهزتي",
  settings: "الإعدادات",
  help: "مركز المساعدة",
  "ticket-new": "تذكرة دعم جديدة",
  "ticket-chat": "محادثة التذكرة",
  console: "لوحة الإدارة",
};

/** أرقام الشاشات في SCREENS_FLOWS (لعرضها في ComingSoon — تسهيلاً لـ8-e) */
const SC_IDS: Partial<Record<ScreenKey, string>> = {
  transfer: "SC-11",
  "scan-qr": "SC-19",
  "wallet-transfer": "SC-15",
  "remittance-create": "SC-16",
  remittances: "SC-17/18",
  "cash-deposit": "SC-22",
  "cash-withdraw": "SC-23",
  "withdraw-code": "SC-24",
  "agents-map": "SC-25/26",
  savings: "SC-30",
  "savings-new": "SC-31",
  "savings-goal": "SC-32/33",
  transactions: "SC-34",
  "transaction-details": "SC-35",
  statement: "SC-36",
  notifications: "SC-37",
  profile: "SC-38",
  kyc: "SC-39",
  security: "SC-40",
  devices: "SC-41",
  settings: "SC-42",
  help: "SC-43",
  "ticket-new": "SC-44",
  "ticket-chat": "SC-45",
};

const screens: Record<ScreenKey, () => ReactNode> = {
  splash: () => <SplashScreen />,
  onboarding: () => <OnboardingScreen />,
  login: () => <LoginScreen />,
  register: () => <RegisterScreen />,
  "totp-verify": () => <TotpVerifyScreen />,
  "totp-enroll": () => <TotpEnrollScreen />,
  "recovery-codes": () => <RecoveryCodesScreen />,
  "pin-create": () => <PinCreateScreen />,
  home: () => <HomeScreen />,
  services: () => <ServicesScreen />,
  "wallet-details": () => <WalletDetailsScreen />,
  // money (8-c-1)
  transfer: () => <TransferScreen />,
  "scan-qr": () => <ScanQrScreen />,
  "wallet-transfer": () => <WalletTransferScreen />,
  "remittance-create": () => <RemittanceCreateScreen />,
  remittances: () => <RemittancesScreen />,
  "cash-deposit": () => <CashDepositScreen />,
  "cash-withdraw": () => <CashWithdrawScreen />,
  "withdraw-code": () => <WithdrawCodeScreen />,
  "agents-map": () => <AgentsMapScreen />,
  savings: () => <SavingsScreen />,
  "savings-new": () => <SavingsNewScreen />,
  "savings-goal": () => <SavingsGoalScreen />,
  // خدمات المرحلة 2 — Closed Beta (9-b/9-c)
  bills: () => <BillsScreen />,
  "bill-pay": () => <BillPayScreen />,
  topup: () => <TopupScreen />,
  cards: () => <CardsScreen />,
  "my-qr": () => <MyQrScreen />,
  "pay-merchant": () => <PayMerchantScreen />,
  "merchant-pos": () => <MerchantPosScreen />,
  "remit-in": () => <RemitInScreen />,
  // account (8-c-2)
  transactions: () => <TransactionsScreen />,
  "transaction-details": () => <TransactionDetailsScreen />,
  statement: () => <StatementScreen />,
  notifications: () => <NotificationsScreen />,
  profile: () => <ProfileScreen />,
  kyc: () => <KycScreen />,
  security: () => <SecurityScreen />,
  devices: () => <DevicesScreen />,
  settings: () => <SettingsScreen />,
  help: () => <HelpScreen />,
  "ticket-new": () => <TicketNewScreen />,
  "ticket-chat": () => <TicketChatScreen />,
  // console (8-d)
  console: () => <ConsoleApp />,
};

export function ScreenRouter() {
  const screen = useAppStore((s) => s.screen);
  const params = useAppStore((s) => s.params);
  // هوية المستخدم ضمن مفتاح التركيب: تبديل المستخدم (دخول سريع/خروج)
  // يعيد تركيب الشاشة كاملة فتُجلب كل بياناتها من جديد — لا بيانات عالقة عبر الجلسات
  const userId = useAppStore((s) => s.me?.user.id ?? "anon");

  const render = screens[screen];
  const content: ReactNode = render ? render() : null;

  return (
    <ScreenErrorBoundary>
      {/* عمود flex بارتفاع أدنى كامل: يسمح لشاشة البداية (flex-1)
          بمدّ خلفيتها لكامل منطقة العرض — لا مساحة بيضاء تحتها،
          ولا تأثير على الشاشات الطويلة (تكبر طبيعياً مع المحتوى) */}
      <div key={`${screen}:${JSON.stringify(params)}:${userId}`} className="sw-fade-in flex min-h-full flex-col">
        {content}
      </div>
    </ScreenErrorBoundary>
  );
}
