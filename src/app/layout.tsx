import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "محفظة الجنوب — وثيقة المتطلبات البرمجية SRS",
  description:
    "وثيقة المتطلبات البرمجية الكاملة (SRS v1.0) لتطبيق محفظة الجنوب — South Wallet | com.janoub.wallet",
  keywords: [
    "محفظة الجنوب",
    "South Wallet",
    "SRS",
    "محفظة إلكترونية",
    "Yemen",
    "Digital Wallet",
  ],
  icons: {
    icon: "/logo.jpg",
  },
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
