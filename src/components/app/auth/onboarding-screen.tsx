/**
 * محفظة الجنوب — شاشة التعريف (SC-02 Onboarding)
 * 3 شرائح قابلة للتمرير أفقي (snap) بنقاط ذهبية:
 * (1) محفظتك في جنوب اليمن (2) حوّل وأرسل لحظياً بأمان (3) وكلاء معتمدون قربك.
 * "ابدأ الآن" → login مع تعليم localStorage (sw_onboarded) لعدم التكرار.
 */
"use client";

import { useRef, useState } from "react";
import { MapPin, Send, Wallet } from "lucide-react";
import { markOnboarded, useAppStore } from "@/lib/app-store";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { cn } from "@/lib/utils";

interface Slide {
  icon: typeof Wallet;
  title: string;
  desc: string;
}

const SLIDES: Slide[] = [
  {
    icon: Wallet,
    title: "محفظتك في جنوب اليمن",
    desc: "محفظة إلكترونية واحدة لثلاث عملات: اليمني والريال السعودي والدولار — أرصدتك وعملياتك في مكان واحد.",
  },
  {
    icon: Send,
    title: "حوّل وأرسل لحظياً بأمان",
    desc: "تحويلات فورية بين المشتركين برمز PIN، وحوالات نقدية لغير المشتركين برمز تسليم يعمل مرة واحدة.",
  },
  {
    icon: MapPin,
    title: "وكلاء معتمدون قربك",
    desc: "إيداع وسحب نقدي من أقرب وكيل معتمد في المحافظات الجنوبية الثماني — برمز تحقق ودفتر محاسبي مزدوج.",
  },
];

export function OnboardingScreen() {
  const resetTo = useAppStore((s) => s.resetTo);
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const isLast = index === SLIDES.length - 1;

  const goTo = (i: number) => {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, i));
    setIndex(clamped);
    const track = trackRef.current;
    if (track) {
      const slide = track.children[clamped] as HTMLElement | undefined;
      slide?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  };

  const finish = () => {
    markOnboarded();
    resetTo("login");
  };

  return (
    <div className="flex min-h-full w-full flex-col bg-[#FAF9F6]">
      {/* ترويسة: شعار مصغر + تخطي */}
      <header className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="" className="h-9 w-9" />
          <span className="text-[15px] font-bold text-[#141416]">محفظة الجنوب</span>
        </div>
        <button
          type="button"
          onClick={finish}
          className="flex min-h-11 items-center rounded-lg px-3 text-[14px] font-bold text-[#5C5A56] transition-colors hover:text-[#141416]"
        >
          تخطي
        </button>
      </header>

      {/* الشرائح */}
      <div
        ref={trackRef}
        dir="rtl"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
          if (i !== index) setIndex(i);
        }}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden gold-scroll"
      >
        {SLIDES.map((slide, i) => {
          const Icon = slide.icon;
          return (
            <section
              key={slide.title}
              className="flex w-full shrink-0 snap-center flex-col items-center justify-center px-8 text-center"
            >
              <span className="relative flex h-36 w-36 items-center justify-center">
                {/* زخرفة معيّنات ذهبية */}
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rotate-45 rounded-3xl border-[1.5px] border-[#C9A227]/30"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-4 rotate-45 rounded-2xl border-[1.5px] border-[#C9A227]/50"
                />
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#0B0B0C] text-[#C9A227]">
                  <Icon strokeWidth={1.5} className="h-9 w-9" />
                </span>
              </span>
              <h2 className="mt-9 text-[24px] font-bold leading-8 text-[#141416]">
                {slide.title}
              </h2>
              <p className="mt-3 max-w-[300px] text-[15px] font-medium leading-7 text-[#5C5A56]">
                {slide.desc}
              </p>
              <span className="sr-only">{`شريحة ${i + 1} من ${SLIDES.length}`}</span>
            </section>
          );
        })}
      </div>

      {/* نقاط + زر */}
      <div className="px-6 pb-7 pt-2">
        <div className="mb-5 flex items-center justify-center gap-2">
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              type="button"
              aria-label={`الشريحة ${i + 1}`}
              onClick={() => goTo(i)}
              aria-current={i === index}
              className={cn(
                "h-2 rounded-full transition-all",
                i === index ? "w-6 bg-[#C9A227]" : "w-2 bg-[#E8E6E1]",
              )}
            />
          ))}
        </div>
        {isLast ? (
          <PrimaryActionButton onClick={finish}>ابدأ الآن</PrimaryActionButton>
        ) : (
          <PrimaryActionButton onClick={() => goTo(index + 1)}>التالي</PrimaryActionButton>
        )}
      </div>
    </div>
  );
}
