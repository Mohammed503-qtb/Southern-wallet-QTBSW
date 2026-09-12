/**
 * محفظة الجنوب — الصفحة الجذرية
 * مستضيف خادمي رفيع: يحمّل تطبيق المحفظة الكامل (SPA تفاعلي)
 * عقد البناء: docs/MVP_CONTRACT.md
 */
import { WalletApp } from "@/components/app/wallet-app";

export const dynamic = "force-dynamic";

export default function Home() {
  return <WalletApp />;
}
