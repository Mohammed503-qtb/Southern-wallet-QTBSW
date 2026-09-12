/**
 * محفظة الجنوب — الإعدادات (SC-42)
 * صفوف: اللغة (Select عربي/English — تُخزَّن في localStorage sw_lang مع ملاحظة
 * «الترجمة الكاملة في Beta»)، إخفاء الرصيد الافتراضي (Switch يربط
 * store.toggleBalanceHidden)، إشعارات محلية (Switch يخزَّن محلياً فقط)،
 * «حول التطبيق» (Sheet: الإصدار Alpha 0.1.0 + com.janoub.wallet + الشعار) +
 * روابط للوثائق والدعم.
 */
"use client";

import { useState } from "react";
import { Bell, BookOpen, EyeOff, Info, Languages, LifeBuoy } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { SectionCard, SettingRow } from "./account-shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";

const LANG_KEY = "sw_lang";
const LOCAL_NOTIF_KEY = "sw_notif_local";

export function SettingsScreen() {
  const navigate = useAppStore((s) => s.navigate);
  const balanceHidden = useAppStore((s) => s.balanceHidden);
  const toggleBalanceHidden = useAppStore((s) => s.toggleBalanceHidden);

  // قراءة التفضيلات المحلية عند أول تركيب (الشاشة تُركّب بعد الترطيب دائماً)
  const [lang, setLang] = useState<"ar" | "en">(() => {
    try {
      const v = typeof window !== "undefined" ? window.localStorage.getItem(LANG_KEY) : null;
      return v === "en" ? "en" : "ar";
    } catch {
      return "ar";
    }
  });
  const [localNotif, setLocalNotif] = useState<boolean>(() => {
    try {
      return (
        (typeof window !== "undefined" ? window.localStorage.getItem(LOCAL_NOTIF_KEY) : "1") !== "0"
      );
    } catch {
      return true;
    }
  });
  const [aboutOpen, setAboutOpen] = useState(false);

  const changeLang = (v: string) => {
    const next = v === "en" ? "en" : "ar";
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      /* تجاهل */
    }
    toast({
      title: next === "ar" ? "اللغة: العربية" : "Language: English",
      description:
        next === "ar"
          ? "واجهة Alpha تعمل بالعربية الكاملة"
          : "الترجمة الكاملة للإنجليزية قادمة في Beta — ستُحفظ تفضيلاتك",
    });
  };

  const changeLocalNotif = (v: boolean) => {
    setLocalNotif(v);
    try {
      window.localStorage.setItem(LOCAL_NOTIF_KEY, v ? "1" : "0");
    } catch {
      /* تجاهل */
    }
  };

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader title="الإعدادات" subtitle="تفضيلات التطبيق والخصوصية" />

      <div className="mt-4 space-y-2">
        {/* ===== اللغة ===== */}
        <div className="flex min-h-[60px] w-full items-center gap-3 rounded-2xl border border-[#E8E6E1]/70 bg-white p-3 text-right">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]"
          >
            <Languages strokeWidth={1.5} className="h-5 w-5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
            <span className="text-[15px] font-semibold leading-5 text-[#141416]">اللغة</span>
            <span className="text-[12px] font-medium text-[#5C5A56]">
              الترجمة الكاملة للإنجليزية في Beta
            </span>
          </span>
          <Select value={lang} onValueChange={changeLang}>
            <SelectTrigger
              dir="rtl"
              aria-label="اختيار اللغة"
              className="h-11 w-[128px] shrink-0 rounded-xl border-[#E8E6E1] bg-white text-[13.5px] font-semibold text-[#141416]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ar" className="text-[13.5px]">
                عربي
              </SelectItem>
              <SelectItem value="en" className="text-[13.5px]">
                English
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ===== إخفاء الرصيد الافتراضي ===== */}
        <SettingRow
          icon={EyeOff}
          title="إخفاء الرصيد افتراضياً"
          subtitle="إخفاء المبالغ عند فتح التطبيق"
          chevron={false}
          trailing={
            <Switch
              checked={balanceHidden}
              onCheckedChange={toggleBalanceHidden}
              aria-label="إخفاء الرصيد الافتراضي"
              className="h-6 w-11 data-[state=checked]:bg-[#0B0B0C] data-[state=unchecked]:bg-[#E8E6E1]"
            />
          }
        />

        {/* ===== إشعارات محلية ===== */}
        <SettingRow
          icon={Bell}
          title="إشعارات هذا الجهاز"
          subtitle="تفضيل محلي فقط في Alpha"
          chevron={false}
          trailing={
            <Switch
              checked={localNotif}
              onCheckedChange={changeLocalNotif}
              aria-label="إشعارات الجهاز"
              className="h-6 w-11 data-[state=checked]:bg-[#0B0B0C] data-[state=unchecked]:bg-[#E8E6E1]"
            />
          }
        />

        {/* ===== حول التطبيق ===== */}
        <SettingRow
          icon={Info}
          title="حول التطبيق"
          subtitle="الإصدار والمعرّف والشعار"
          onClick={() => setAboutOpen(true)}
        />

        <SettingRow
          icon={BookOpen}
          title="الوثائق الهندسية"
          subtitle="SRS والشاشات وكل وثائق المشروع"
          onClick={() => navigate("docs")}
        />

        <SettingRow
          icon={LifeBuoy}
          title="مركز المساعدة والدعم"
          subtitle="الأسئلة الشائعة وتذاكر الدعم"
          onClick={() => navigate("help")}
        />
      </div>

      {/* ===== Sheet حول التطبيق ===== */}
      <Sheet open={aboutOpen} onOpenChange={setAboutOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl px-5 pb-7 pt-4">
          <SheetHeader className="items-center text-center">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-[#E8E6E1] bg-white">
              <img src="/logo.svg" alt="شعار محفظة الجنوب" className="h-16 w-16" />
            </span>
            <SheetTitle className="text-center text-[18px] font-bold">
              محفظة الجنوب
            </SheetTitle>
            <SheetDescription className="text-center text-[13.5px] font-medium">
              محفظة رقمية يمنية جنوبية — Alpha تجريبي داخلي
            </SheetDescription>
          </SheetHeader>

          <div className="mt-3 divide-y divide-[#E8E6E1]/70 rounded-xl border border-[#E8E6E1] bg-white">
            {[
              { label: "الإصدار", value: "Alpha 0.1.0" },
              { label: "معرّف الحزمة", value: "com.janoub.wallet" },
              { label: "بيئة التشغيل", value: "نظام نقدي مغلق تجريبي" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[13px] font-medium text-[#5C5A56]">{row.label}</span>
                <span dir="auto" className="text-[13.5px] font-semibold tabular-nums text-[#141416]">
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setAboutOpen(false)}
            className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl bg-[#0B0B0C] text-[15px] font-bold text-white transition-colors hover:bg-[#1A1A1C]"
          >
            حسناً، فهمت
          </button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
