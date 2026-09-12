/**
 * محفظة الجنوب — إطار سطح المكتب (AppFrame)
 * صف RTL: [يمين] هاتف بإطار أنيق (حواف داكنة 8px + ثقب كاميرا علوية،
 * 390×844 بتمرير داخلي) يعرض التطبيق — [يسار] لوحة هوية المشروع
 * (الشعار + الوصف + شارة Alpha + دخول سريع بحسابات Seed + الوثائق)
 * + تذييل رقيق لاصق أسفل. على الجوال (<lg): التطبيق ملء الشاشة بلا إطار.
 */
"use client";

import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";
import { AppStyles } from "./app-styles";
import { DemoLoginButtons } from "./demo-login";

function IdentityPanel() {
  const navigate = useAppStore((s) => s.navigate);

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

      {/* شارة Alpha الذهبية */}
      <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-[#C9A227]/35 bg-[#C9A227]/10 px-3.5 py-1.5 text-[12px] font-bold text-[#8A6E14]">
        <span aria-hidden="true" className="h-2 w-2 rotate-45 rounded-[2px] bg-[#C9A227]" />
        Alpha الداخلي — أموال تجريبية
      </span>

      {/* الدخول السريع */}
      <h2 className="mt-7 text-[13px] font-bold text-[#141416]">
        دخول سريع بحسابات Seed
      </h2>
      <p className="mb-2.5 mt-0.5 text-[12px] font-medium text-[#A3A09B]">
        كل زر يسجّل الدخول بالدور المناسب ثم يفتح عالمه (عميل/لوحة)
      </p>
      <DemoLoginButtons layout="panel" />

      {/* الوثائق الهندسية */}
      <button
        type="button"
        onClick={() => navigate("docs")}
        className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E8E6E1] bg-[#FAF9F6] px-4 text-[14px] font-bold text-[#141416] transition-colors hover:border-[#C9A227]/60 hover:bg-[#F7F6F2]"
      >
        <BookOpen strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
        الوثائق الهندسية
      </button>

      {/* فقرة الميزات */}
      <p className="mt-5 text-[12px] font-medium leading-6 text-[#A3A09B]">
        في هذه الجلسة: تدفق دخول كامل (OTP → PIN → بصمة)، رئيسية بالأرصدة
        والخدمات وآخر العمليات، كتالوج الخدمات بحالاتها، وتفاصيل المحفظة —
        مع الخدمات الموسعة (فواتير، شحن، دفع تاجر) تُدخل تباعاً في Beta.
      </p>

      {/* تذييل رقيق لاصق أسفل */}
      <footer className="mt-auto pt-6 text-[12px] font-medium text-[#A3A09B]">
        محفظة الجنوب © Alpha الداخلي — جميع الأرصدة والعمليات تجريبية
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
