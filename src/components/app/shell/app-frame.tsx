/**
 * محفظة الجنوب — إطار سطح المكتب (AppFrame)
 * صف RTL: [يمين] هاتف بإطار أنيق (حواف داكنة 8px + ثقب كاميرا علوية،
 * 390×844 بتمرير داخلي) يعرض التطبيق — [يسار] لوحة هوية المنتج
 * (الشعار + الوصف + شارات الأمان + الإصدار) + تذييل رقيق لاصق أسفل.
 * على الجوال (<lg): التطبيق ملء الشاشة بلا إطار.
 */
"use client";

import type { ReactNode } from "react";
import { KeyRound, Landmark, ShieldCheck, Smartphone } from "lucide-react";
import { AppStyles } from "./app-styles";

const SECURITY_FEATURES = [
  {
    icon: KeyRound,
    title: "مصادقة ثنائية (TOTP)",
    desc: "رمز دخول يتجدد كل 30 ثانية من تطبيق المصادقة + رموز استرداد للطوارئ",
  },
  {
    icon: ShieldCheck,
    title: "أسرار مشفّرة",
    desc: "أسرار المصادقة مشفّرة AES-256-GCM ورموز PIN مُلبّدة — بلا نص صريح",
  },
  {
    icon: Smartphone,
    title: "تأكيد PIN لكل عملية",
    desc: "تحويلات وحوالات وسحب تتطلب رمز PIN مع قفل تصاعدي عند الخطأ",
  },
  {
    icon: Landmark,
    title: "دفاتر مزدوجة",
    desc: "كل حركة بقيود متوازنة Σ=0 ومحرك تحقق مستمر لسلامة الأرصدة",
  },
];

function IdentityPanel() {
  return (
    <aside className="hidden lg:flex lg:max-h-[844px] lg:w-[430px] lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:rounded-3xl lg:border lg:border-[#E8E6E1] lg:bg-white lg:p-7 gold-scroll">
      {/* الشعار والاسم */}
      <div className="flex items-center gap-4">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-[#E8E6E1] bg-[#F7F6F2]">
          <img src="/logo.svg" alt="شعار محفظة الجنوب" className="h-14 w-14" />
        </span>
        <div>
          <h1 className="text-[28px] font-extrabold leading-9 text-[#0B0B0C]">
            محفظة الجنوب
          </h1>
          <p dir="ltr" className="text-right text-[13px] font-semibold tracking-wide text-[#A3A09B]">
            South Wallet · YER / SAR / USD
          </p>
        </div>
      </div>

      <p className="mt-4 text-[14px] font-medium leading-7 text-[#5C5A56]">
        محفظة إلكترونية يمنية متعددة العملات: تحويلات لحظية بين المشتركين،
        حوالات نقدية برمز تسليم يعمل مرة واحدة عبر وكلاء معتمدين، إيداع وسحب
        نقدي، وحصالة أهداف ذكية — بقيود حدود ورسوم خادمية ودفاتر مزدوجة.
      </p>

      {/* شارة الإصدار */}
      <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-[#C9A227]/35 bg-[#C9A227]/[0.08] px-3.5 py-1.5 text-[12px] font-bold text-[#8A6E14]">
        <span aria-hidden="true" className="h-2 w-2 rotate-45 rounded-[2px] bg-[#C9A227]" />
        الإصدار 1.0.0 — جاهز للإنتاج
      </span>

      {/* ميزات الأمان */}
      <h2 className="mt-7 text-[13px] font-bold text-[#141416]">حماية حسابك</h2>
      <div className="mt-2.5 space-y-2.5">
        {SECURITY_FEATURES.map((f) => (
          <div
            key={f.title}
            className="flex items-start gap-3 rounded-xl border border-[#E8E6E1] bg-[#FAF9F6] p-3"
          >
            <f.icon strokeWidth={1.5} className="mt-0.5 h-5 w-5 shrink-0 text-[#C9A227]" />
            <div>
              <p className="text-[13px] font-bold text-[#141416]">{f.title}</p>
              <p className="mt-0.5 text-[12px] font-medium leading-5 text-[#5C5A56]">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* تذييل رقيق لاصق أسفل */}
      <footer className="mt-auto pt-6 text-[12px] font-medium text-[#A3A09B]">
        محفظة الجنوب © 2025 — مدفوعات رقمية بمعايير مصرفية
      </footer>
    </aside>
  );
}

export interface AppFrameProps {
  children: ReactNode;
}

export function AppFrame({ children }: AppFrameProps) {
  return (
    <div className="relative flex min-h-dvh w-full flex-col bg-[#FAF9F6] lg:h-dvh lg:flex-row lg:items-center lg:justify-center lg:gap-12 lg:overflow-hidden xl:gap-16">
      <AppStyles />

      {/* زخرفة خلفية ذهبية خفيفة جداً على سطح المكتب */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden lg:block"
        style={{
          background:
            "radial-gradient(900px 500px at 78% 18%, rgba(201,162,39,0.05), transparent 60%), radial-gradient(700px 420px at 12% 85%, rgba(11,11,12,0.04), transparent 60%)",
        }}
      />

      {/* الهاتف — يمين في RTL (أول عنصر) */}
      <div className="h-dvh w-full lg:h-[844px] lg:w-[390px] lg:shrink-0">
        <div className="relative h-full w-full lg:rounded-[44px] lg:border-[8px] lg:border-[#0B0B0C] lg:shadow-[0_24px_60px_rgba(11,11,12,0.22)]">
          {/* ثقب الكاميرا (الزاوية العلوية) — سطح المكتب فقط */}
          <div
            aria-hidden="true"
            className="absolute left-4 top-4 z-30 hidden h-3.5 w-3.5 rounded-full border border-[#2A2A2C] bg-[#141416] lg:block"
          >
            <span className="absolute inset-[3px] rounded-full bg-[#232325]" />
          </div>
          {/* حافة علوية لامعة رقيقة */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 z-20 hidden h-[2px] bg-gradient-to-l from-transparent via-[#C9A227]/50 to-transparent lg:block"
          />
          <div className="h-full w-full overflow-hidden lg:rounded-[36px]">{children}</div>
        </div>
      </div>

      {/* لوحة الهوية — يسار في RTL (مخفية على الجوال) */}
      <IdentityPanel />
    </div>
  );
}
