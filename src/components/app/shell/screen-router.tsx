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
import { OtpScreen } from "@/components/app/auth/otp-screen";
import { RegisterScreen } from "@/components/app/auth/register-screen";
import { PinCreateScreen } from "@/components/app/auth/pin-create-screen";
import { BiometricScreen } from "@/components/app/auth/biometric-screen";

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
import { DocsScreen } from "@/components/app/features/account/docs-screen";

// لوحات الأدوار — console (8-d)
import { ConsoleApp } from "@/components/app/console/console-app";

/** عناوين عربية موحدة لكل مفاتيح الشاشات (تستعملها ComingSoon والتنقل) */
export const SCREEN_TITLES: Record<ScreenKey, string> = {
  splash: "البداية",
  onboarding: "التعريف",
  login: "تسجيل الدخول",
  otp: "رمز التحقق",
  register: "إنشاء حساب جديد",
  "pin-create": "إنشاء رمز PIN",
  biometric: "تفعيل البصمة",
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
  docs: "الوثائق الهندسية",
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
  docs: "X1/X2",
};

const screens: Record<ScreenKey, () => ReactNode> = {
  splash: () => <SplashScreen />,
  onboarding: () => <OnboardingScreen />,
  login: () => <LoginScreen />,
  otp: () => <OtpScreen />,
  register: () => <RegisterScreen />,
  "pin-create": () => <PinCreateScreen />,
  biometric: () => <BiometricScreen />,
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
  docs: () => <DocsScreen />,
  // console (8-d)
  console: () => <ConsoleApp />,
};

export function ScreenRouter() {
  const screen = useAppStore((s) => s.screen);
  const params = useAppStore((s) => s.params);

  const render = screens[screen];
  const content: ReactNode = render ? render() : null;

  return (
    <ScreenErrorBoundary>
      <div key={`${screen}:${JSON.stringify(params)}`} className="sw-fade-in min-h-full">
        {content}
      </div>
    </ScreenErrorBoundary>
  );
}
