import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "محفظة الجنوب — Alpha الداخلي",
  description:
    "محفظة الجنوب | South Wallet — محفظة إلكترونية يمنية متعددة العملات (YER/SAR/USD): تحويلات، حوالات، وكلاء معتمدون، حصالة ذكية — النسخة التجريبية الداخلية (Alpha) | com.janoub.wallet",
  keywords: [
    "محفظة الجنوب",
    "South Wallet",
    "محفظة إلكترونية",
    "تحويل أموال",
    "حوالات",
    "اليمن",
    "Digital Wallet",
    "Alpha",
  ],
  icons: {
    icon: "/logo.jpg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0C",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="font-cairo antialiased bg-[#FAF9F6] text-[#0B0B0C]">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
