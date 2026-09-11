import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "محفظة الجنوب — بوابة وثائق المشروع",
  description:
    "بوابة الوثائق الهندسية الكاملة لمشروع محفظة الجنوب — South Wallet | SRS، قصص المستخدمين، المعمارية، قاعدة البيانات، API، الشاشات، خارطة الطريق | com.janoub.wallet",
  keywords: [
    "محفظة الجنوب",
    "South Wallet",
    "SRS",
    "User Stories",
    "Architecture",
    "ERD",
    "REST API",
    "Roadmap",
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
