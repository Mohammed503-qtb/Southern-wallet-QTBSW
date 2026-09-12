/**
 * محفظة الجنوب — مركز المساعدة (SC-43)
 * FAQ accordion ثابت بأسئلة واقعية مستمدة من سلوك النظام الفعلي (رسوم Seed،
 * Idempotency، قفل PIN، رمز تسليم الحوالة، توثيق KYC) + زر «تذكرة دعم
 * جديدة» → ticket-new + بطاقة «دعم واتساب» COMING_LATER.
 */
"use client";

import { Headphones, LifeBuoy, MessageCircle, MessageCirclePlus, ReceiptText } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { SectionCard } from "./account-shared";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FaqEntry {
  q: string;
  a: string;
}

/** أسئلة مبنية على السلوك الفعلي للنظام (العقد + Seed) */
const FAQ: FaqEntry[] = [
  {
    q: "كيف أفعّل حسابي؟",
    a: "سجّل برقمك اليمني (9 أرقام تبدأ بـ7)، أدخل رمز التحقق الذي وصلك، ثم عيّن رمز PIN من 6 أرقام. حسابك يعمل فوراً بمستوى «غير موثّق» ويمكنك رفع مستواه لاحقاً بالتوثيق. البصمة اختيارية وتسرّع العمليات الحساسة.",
  },
  {
    q: "ما رسوم التحويل والعمليات؟",
    a: "رسوم التحويل بين المشتركين 0.25% من المبلغ بحد أدنى وأقصى لكل عملة (مثلاً باليمني: بين 50 و1,000 ريال). الحوالة لغير المشتركين 1%، والسحب النقدي 1%، والتحويل بين محافظك بعملات مختلفة 0.25%. الإيداع النقدي لدى الوكلاء مجاني تماماً. الرسوم الدقيقة تظهر دائماً في شاشة المراجعة قبل إدخال رمز PIN — لا مفاجآت بعد التنفيذ.",
  },
  {
    q: "ماذا لو انقطع الإنترنت أثناء تنفيذ تحويل؟",
    a: "كل عملية مالية تُرسل بمفتاح حماية (Idempotency): إن انقطع الاتصال وأعدت المحاولة فستُعاد نفس النتيجة دون تكرار الخصم. تحقق أولاً من «سجل العمليات» — إن ظهرت العملية مكتملة فتمّت بنجاح، وإن لم تظهر فأعد الإرسال بأمان. لأي شك متبقٍ افتح تذكرة دعم وأرفق المرجع (SW-…).",
  },
  {
    q: "كيف أوثّق حسابي وما فائدة ذلك؟",
    a: "من «حسابي → توثيق الحساب» أدخل بياناتك كما في الهوية (الاسم، نوع الوثيقة ورقمها، المحافظة، العنوان والمهنة). يراجع فريق الامتثال الطلب عادة خلال 24 ساعة عمل ويصلك إشعار فور القرار. التوثيق يرفع حدودك اليومية (عدد العمليات وقيمتها وحد العملية الواحدة) لكل العملات الثلاث.",
  },
  {
    q: "نسيت رمز PIN أو قُفل — ماذا أفعل؟",
    a: "بعد 3 محاولات خاطئة يُقفل الرمز 5 دقائق، وبعد 6 محاولات 30 دقيقة ثم يعمل مجدداً. لا توجد إعادة تعيين ذاتية في Alpha: افتح تذكرة دعم من فئة «حساب» وسيتحقق الفريق من هويتك ويرشدك. إن اشتبهت باستخدام غيرك لحسابك أنهِ كل الجلسات الأخرى من «أجهزتي» فوراً.",
  },
  {
    q: "كيف أستلم حوالة أرسلها لي شخص غير مشترك؟",
    a: "اطلب من المرسل «رمز التسليم» الذي وصله عند إنشاء الحوالة (6 أرقام)، ثم توجه لأي وكيل معتمد في محافظتك واطلب «دفع حوالة» وأعطه الرمز. تُسلَّم الحوالة فوراً إلى محفظتك. إن لم تُستلم خلال 7 أيام تنتهي صلاحيتها تلقائياً ويُسترجع المبلغ كاملاً للمرسل.",
  },
  {
    q: "رصيد الريال لا يكفي ولدي دولارات — كيف أنفّقها؟",
    a: "لكل عملة محفظة مستقلة تماماً. استخدم «التحويل بين محافظي» (من الخدمات أو تفاصيل المحفظة) لصرف USD/SAR إلى الريال بسعر صرف لحظي معتمد ورسوم 0.25% — ثم نفّذ عمليتك بالريال.",
  },
  {
    q: "لماذا تظهر بعض الخدمات «قريباً»؟",
    a: "الفواتير وشحن الرصيد والبطاقات والدفع لدى التجار مجدولة للمرحلة الثانية (Beta) وفق خارطة الطريق — تظهر هنا للتعريف فقط. الحوالة الواردة من شبكات الصرافة خارجية قادمة أيضاً لاحقاً.",
  },
];

export function HelpScreen() {
  const navigate = useAppStore((s) => s.navigate);

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader title="مركز المساعدة" subtitle="أسئلة شائعة ودعم بشري عند الحاجة" />

      {/* ===== الأسئلة الشائعة ===== */}
      <div className="mt-4">
        <SectionCard title="الأسئلة الشائعة">
          <Accordion type="single" collapsible className="w-full">
            {FAQ.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border-[#E8E6E1]/70">
                <AccordionTrigger className="min-h-11 py-3.5 text-right text-[14px] font-bold leading-6 text-[#141416] hover:no-underline [&>svg]:mr-auto [&>svg]:ml-0">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-[13.5px] font-medium leading-7 text-[#5C5A56]">{f.a}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </SectionCard>
      </div>

      {/* ===== تذكرة دعم جديدة ===== */}
      <div className="mt-5">
        <PrimaryActionButton onClick={() => navigate("ticket-new")}>
          <MessageCirclePlus strokeWidth={1.5} className="h-5 w-5" />
          تذكرة دعم جديدة
        </PrimaryActionButton>
        <p className="mt-2 text-center text-[12px] font-medium leading-5 text-[#A3A09B]">
          يرد فريق الدعم على التذاكر خلال ساعات العمل — تصلك الإشعارات هنا وفي مركز الإشعارات.
        </p>
      </div>

      {/* ===== بطاقات الدعم الإضافية ===== */}
      <div className="mt-5 space-y-2">
        {/* دعم واتساب — قادم (COMING_LATER) */}
        <div className="flex items-center gap-3 rounded-2xl border border-[#E8E6E1]/70 bg-[#F7F6F2] p-3.5 opacity-90">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E8E6E1] bg-white text-[#5C5A56]"
          >
            <MessageCircle strokeWidth={1.5} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-[#5C5A56]">دعم واتساب</p>
            <p className="text-[12px] font-medium leading-5 text-[#A3A09B]">
              محادثة فورية مع فريق الدعم — قادمة في Beta
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[#E8E6E1] bg-white px-2.5 py-1 text-[10.5px] font-bold text-[#A3A09B]">
            قريباً — المرحلة 2
          </span>
        </div>

        {/* روابط سريعة */}
        <button
          type="button"
          onClick={() => navigate("transactions")}
          className="flex w-full items-center gap-3 rounded-2xl border border-[#E8E6E1]/70 bg-white p-3.5 text-right transition-colors hover:border-[#C9A227]/40 hover:bg-[#FDFCFA]"
        >
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]"
          >
            <ReceiptText strokeWidth={1.5} className="h-5 w-5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-start">
            <span className="text-[14px] font-bold text-[#141416]">راجع سجل عملياتك</span>
            <span className="text-[12px] font-medium text-[#5C5A56]">
              تحقق من حالة أي عملية ومرجعها قبل فتح التذكرة
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate("notifications")}
          className="flex w-full items-center gap-3 rounded-2xl border border-[#E8E6E1]/70 bg-white p-3.5 text-right transition-colors hover:border-[#C9A227]/40 hover:bg-[#FDFCFA]"
        >
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]"
          >
            <Headphones strokeWidth={1.5} className="h-5 w-5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-start">
            <span className="text-[14px] font-bold text-[#141416]">إشعارات ردود الدعم</span>
            <span className="text-[12px] font-medium text-[#5C5A56]">
              تصل في مركز الإشعارات مع رابط للتذكرة
            </span>
          </span>
        </button>
      </div>

      <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-[#C9A227]/30 bg-[#C9A227]/[0.05] p-3">
        <LifeBuoy strokeWidth={1.5} className="mt-0.5 h-5 w-5 shrink-0 text-[#C9A227]" />
        <p className="text-[12px] font-medium leading-5 text-[#5C5A56]">
          نصيحة: عند فتح تذكرة عن عملية مالية أرفق المرجع (SW-/RM-/CW-) —
          يظهر في تفاصيل العملية ويسرّع الحل كثيراً.
        </p>
      </div>
    </div>
  );
}
