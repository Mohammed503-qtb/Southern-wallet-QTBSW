/**
 * محفظة الجنوب — الأمان (SC-40)
 * صفوف: تغيير PIN (Sheet بثلاث خطوات عبر PINPad: الحالي/الجديد/تأكيده —
 * A7 PUT /api/pin)، البصمة Switch (A9 — محاكاة فورية)، «إنهاء كل الجلسات
 * الأخرى» (من شاشة أجهزتي)، ومعلومات أمان تعريفية صغيرة (قواعد PIN والقفل).
 */
"use client";

import { useEffect, useState } from "react";
import { Fingerprint, KeyRound, Lock, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { api, ApiError } from "@/lib/api";
import { ErrorState } from "@/components/app/ui/error-state";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { PINPad } from "@/components/app/ui/pin-pad";
import { SectionCard, SettingRow } from "./account-shared";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type PinStep = "CURRENT" | "NEW" | "CONFIRM";

const STEP_LABELS: Record<PinStep, string> = {
  CURRENT: "الخطوة 1 من 3 — أدخل رمز PIN الحالي",
  NEW: "الخطوة 2 من 3 — أدخل الرمز الجديد",
  CONFIRM: "الخطوة 3 من 3 — أكّد الرمز الجديد",
};

export function SecurityScreen() {
  const me = useAppStore((s) => s.me);
  const meLoading = useAppStore((s) => s.meLoading);
  const bootstrap = useAppStore((s) => s.bootstrap);
  const refreshMe = useAppStore((s) => s.refreshMe);
  const navigate = useAppStore((s) => s.navigate);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [step, setStep] = useState<PinStep>("CURRENT");
  const [pin, setPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lockSeconds, setLockSeconds] = useState(0);
  const [busy, setBusy] = useState(false);

  // عدّاد تنازلي للقفل (PIN-002)
  useEffect(() => {
    if (lockSeconds <= 0) return;
    const timer = setInterval(() => setLockSeconds((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [lockSeconds]);

  const resetSheet = () => {
    setStep("CURRENT");
    setPin("");
    setCurrentPin("");
    setNewPin("");
    setError(null);
    setLockSeconds(0);
    setBusy(false);
  };

  /** إرسال A7 بعد اكتمال الخطوات الثلاث */
  const submitChange = async (confirmed: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.put("/api/pin", { currentPin, newPin: confirmed });
      toast({
        title: "تم تغيير رمز PIN بنجاح",
        description: "استخدم الرمز الجديد في عملياتك القادمة",
      });
      setSheetOpen(false);
      resetSheet();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.code === "PIN-002") {
          const secs = err.details?.["secondsRemaining"];
          if (typeof secs === "number") setLockSeconds(Math.max(1, Math.round(secs)));
          // عودة للخطوة الأولى بعد القفل
          setStep("CURRENT");
          setPin("");
        } else if (err.code === "PIN-001") {
          // رمز حالي خاطئ → أعد الخطوة الأولى
          setStep("CURRENT");
          setPin("");
        }
      } else {
        setError("تعذّر تغيير الرمز — تحقق من اتصالك");
      }
    } finally {
      setBusy(false);
    }
  };

  /** اكتمال إدخال 6 أرقام في الخطوة الحالية */
  const handleComplete = (value: string) => {
    // مهلة قصيرة ليرى المستخدم النقاط ممتلئة قبل الانتقال
    setTimeout(() => {
      if (step === "CURRENT") {
        setCurrentPin(value);
        setPin("");
        setError(null);
        setStep("NEW");
      } else if (step === "NEW") {
        setNewPin(value);
        setPin("");
        setError(null);
        setStep("CONFIRM");
      } else if (step === "CONFIRM") {
        if (value !== newPin) {
          setError("الرمز الجديد وتأكيده غير متطابقين — أعد إدخال الرمز الجديد");
          setStep("NEW");
          setNewPin("");
          setPin("");
          return;
        }
        setPin("");
        void submitChange(value);
      }
    }, 180);
  };

  /** تبديل البصمة (A9) مع تحديث متفائل وسقوط عند الخطأ */
  const toggleBiometric = async (next: boolean) => {
    try {
      await api.put("/api/me/biometric", { enabled: next });
      await refreshMe();
      toast({
        title: next ? "تم تفعيل البصمة" : "تم تعطيل البصمة",
        description: next
          ? "يمكنك استخدام البصمة بدل الرمز في العمليات الحساسة (محاكاة Alpha)"
          : "ستُطلب لوحة الرمز عند كل عملية حساسة",
      });
    } catch {
      toast({
        title: "تعذّر تحديث البصمة",
        description: "حاول مرة أخرى",
        variant: "destructive",
      });
    }
  };

  if (!me) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="الأمان" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
        {!meLoading ? (
          <div className="mt-4">
            <ErrorState
              compact
              message="انتهت الجلسة أو لم تُحمَل بياناتك"
              onRetry={() => void bootstrap()}
            />
          </div>
        ) : null}
      </div>
    );
  }

  const user = me.user;

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader title="الأمان" subtitle="رمز PIN والبصمة وإدارة جلستك" />

      <div className="mt-4 space-y-2">
        <SettingRow
          icon={KeyRound}
          title="تغيير رمز PIN"
          subtitle="رمز من 6 أرقام لكل عملية حساسة"
          onClick={() => {
            resetSheet();
            setSheetOpen(true);
          }}
        />

        <SettingRow
          icon={Fingerprint}
          title="الدخول بالبصمة"
          subtitle="محاكاة تجريبية في Alpha"
          chevron={false}
          trailing={
            <Switch
              checked={user.biometricEnabled}
              onCheckedChange={(v) => void toggleBiometric(v)}
              aria-label="تفعيل البصمة"
              className="h-6 w-11 data-[state=checked]:bg-[#0B0B0C] data-[state=unchecked]:bg-[#E8E6E1]"
            />
          }
        />

        <SettingRow
          icon={LogOut}
          title="إنهاء كل الجلسات الأخرى"
          subtitle="من شاشة أجهزتي — لكل جهاز على حدة"
          onClick={() => navigate("devices")}
        />
      </div>

      {/* ===== معلومات أمان تعريفية ===== */}
      <div className="mt-4">
        <SectionCard title="أمان حسابك">
          <div className="space-y-2.5">
            {[
              {
                icon: Lock,
                text: "رمز PIN من 6 أرقام يُطلب قبل كل عملية مالية حساسة (تحويل/حوالة/سحب/حصالة).",
              },
              {
                icon: ShieldCheck,
                text: "بعد 3 محاولات خاطئة يُقفل الرمز 5 دقائق، وبعد 6 محاولات 30 دقيقة — ثم يُصفَّر العداد عند النجاح.",
              },
              {
                icon: Smartphone,
                text: "كل جهاز تسجّل منه الدخول يظهر في «أجهزتي» ويمكنك إنهاء جلسته في أي وقت.",
              },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <item.icon strokeWidth={1.5} className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#C9A227]" />
                <p className="text-[12.5px] font-medium leading-6 text-[#5C5A56]">{item.text}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* ===== Sheet تغيير PIN (ثلاث خطوات بPINPad) ===== */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) resetSheet();
        }}
      >
        <SheetContent side="bottom" className="rounded-t-3xl px-5 pb-7 pt-4">
          <SheetHeader className="items-center text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]">
              <KeyRound strokeWidth={1.5} className="h-6 w-6" />
            </span>
            <SheetTitle className="text-center text-[18px] font-bold">
              تغيير رمز PIN
            </SheetTitle>
            <SheetDescription className="text-center text-[13px] font-medium">
              {STEP_LABELS[step]}
            </SheetDescription>
          </SheetHeader>

          {/* مؤشر الخطوات */}
          <div dir="rtl" className="mx-auto mt-2 flex w-fit items-center gap-1.5">
            {(["CURRENT", "NEW", "CONFIRM"] as PinStep[]).map((s, i) => (
              <span
                key={s}
                aria-hidden="true"
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  ["CURRENT", "NEW", "CONFIRM"].indexOf(step) >= i
                    ? "w-7 bg-[#C9A227]"
                    : "w-3 bg-[#E8E6E1]",
                )}
              />
            ))}
          </div>

          <div className="mt-3">
            <PINPad
              contextLabel={
                step === "CURRENT"
                  ? "أدخل رمز PIN الحالي"
                  : step === "NEW"
                    ? "أدخل الرمز الجديد (6 أرقام)"
                    : "أعد إدخال الرمز الجديد"
              }
              pin={pin}
              onChange={(v) => {
                setPin(v);
                if (error && step !== "CONFIRM") setError(null);
              }}
              onComplete={handleComplete}
              error={step === "CONFIRM" ? null : error}
              lockSeconds={lockSeconds > 0 ? lockSeconds : undefined}
              disabled={busy}
            />
          </div>

          {busy ? (
            <p className="mt-2 text-center text-[13px] font-semibold text-[#5C5A56]">
              جارٍ التحقق من الرمز…
            </p>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSheetOpen(false);
                resetSheet();
              }}
              className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-[#E8E6E1] bg-white text-[14px] font-bold text-[#5C5A56]"
            >
              إلغاء
            </button>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
