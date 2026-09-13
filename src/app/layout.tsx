import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SwRegister } from "@/components/app/shell/sw-register";

export const metadata: Metadata = {
  title: "محفظة الجنوب — محفظة إلكترونية لجنوب اليمن",
  description:
    "محفظة الجنوب — محفظة إلكترونية لجنوب اليمن: تحويلات لحظية وحوالات نقدية عبر وكلاء معتمدين، فواتير وشحن ودفع للتاجر، بعملات الريال والريال السعودي والدولار.",
  applicationName: "محفظة الجنوب",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "محفظة الجنوب",
  },
  formatDetection: {
    telephone: false,
  },
  keywords: [
    "محفظة الجنوب",
    "South Wallet",
    "محفظة إلكترونية",
    "تحويل أموال",
    "حوالات",
    "اليمن",
    "Digital Wallet",
  ],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F6F3" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0C" },
  ],
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
        <SwRegister />
        <Toaster />
      </body>
    </html>
  );
}
