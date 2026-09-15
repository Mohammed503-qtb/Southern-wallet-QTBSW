/**
 * محفظة الجنوب — الأمان (SC-40)
 * صفوف: المصادقة الثنائية (TOTP) + تغيير PIN (Sheet بثلاث خطوات عبر
 * PINPad — A7 PUT /api/pin) + إعادة توليد رموز الاسترداد (A6 عبر رمز
 * TOTP حالي) + «إنهاء كل الجلسات الأخرى» (من شاشة أجهزتي) + معلومات
 * أمان تعريفية (قواعد PIN والقفل).
 */
"use client";

import { useEffect, useState } from "react";
import { KeyRound, LifeBuoy, Lock, LogOut, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { api, ApiError } from "@/lib/api";
import { ErrorState } from "@/components/app/ui/error-state";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { PINPad } from "@/components/app/ui/pin-pad";
import { SectionCard, SettingRow } from "./account-shared";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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

  // ===== Sheet إعادة توليد رموز الاسترداد =====
  const [recoverySheetOpen, setRecoverySheetOpen] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const resetRecoverySheet = () => {
    setTotpCode("");
    setRecoveryBusy(false);
    setRecoveryError(null);
    setNewCodes(null);
  };

  const regenRecovery = async () => {
    if (totpCode.length !== 6 || recoveryBusy) return;
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      const data = await api.post<{ recoveryCodes: string[] }>("/api/auth/recovery/regen", {
        code: totpCode,
      });
      setNewCodes(data.recoveryCodes);
      toast({ title: "صدرت رموز استرداد جديدة", description: "احفظها — القديمة أُبطلت" });
    } catch (err) {
      if (err instanceof ApiError) {
        setRecoveryError(err.message);
        if (err.code === "AUTH-002") setTotpCode("");
      } else {
        setRecoveryError("تعذّر إصدار الرموز — تحقق من اتصالك");
      }
    } finally {
      setRecoveryBusy(false);
    }
  };

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
      <ScreenHeader title="الأمان" subtitle="المصادقة الثنائية ورمز PIN وإدارة جلستك" />

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
          icon={ShieldCheck}
          title="المصادقة الثنائية (TOTP)"
          subtitle="مفعّلة — رمز من تطبيق المصادقة يتجدد كل 30 ثانية"
          chevron={false}
        />

        <SettingRow
          icon={RefreshCw}
          title="إعادة توليد رموز الاسترداد"
          subtitle="أبطل القديمة وأصدر 8 رموز جديدة (يتطلب رمز المصادقة الحالي)"
          onClick={() => {
            resetRecoverySheet();
            setRecoverySheetOpen(true);
          }}
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
              {
                icon: LifeBuoy,
                text: "فقدت جهاز المصادقة؟ استخدم رمز استرداد للدخول، أو تواصل مع الدعم لإعادة التفعيل.",
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

      {/* ===== Sheet إعادة توليد رموز الاسترداد ===== */}
      <Sheet
        open={recoverySheetOpen}
        onOpenChange={(o) => {
          setRecoverySheetOpen(o);
          if (!o) resetRecoverySheet();
        }}
      >
        <SheetContent side="bottom" className="max-h-[86dvh] overflow-y-auto rounded-t-3xl px-5 pb-7 pt-4">
          <SheetHeader className="items-center text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]">
              <RefreshCw strokeWidth={1.5} className="h-6 w-6" />
            </span>
            <SheetTitle className="text-center text-[18px] font-bold">
              إعادة توليد رموز الاسترداد
            </SheetTitle>
            <SheetDescription className="text-center text-[13px] font-medium">
              {newCodes
                ? "احفظ الرموز الجديدة الآن — لن تظهر مجدداً"
                : "أدخل رمز المصادقة الحالي للتأكيد (من تطبيق المصادقة)"}
            </SheetDescription>
          </SheetHeader>

          {newCodes ? (
            <div className="mt-4">
              <div className="grid grid-cols-2 gap-2.5">
                {newCodes.map((c) => (
                  <div
                    key={c}
                    dir="ltr"
                    className="flex h-[48px] items-center justify-center rounded-xl border border-[#E8E6E1] bg-white text-[16px] font-extrabold tracking-[0.12em] tabular-nums text-[#141416]"
                  >
                    {c}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setRecoverySheetOpen(false);
                  resetRecoverySheet();
                }}
                className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl bg-[#0B0B0C] text-[14px] font-bold text-white"
              >
                حفظتها — إغلاق
              </button>
            </div>
          ) : (
            <div className="mt-3">
              <input
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={totpCode}
                onChange={(e) => {
                  setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setRecoveryError(null);
                }}
                disabled={recoveryBusy}
                placeholder="000000"
                aria-label="رمز المصادقة الحالي"
                className="h-[56px] w-full rounded-xl border border-[#E8E6E1] bg-white text-center text-[22px] font-extrabold tracking-[0.3em] tabular-nums text-[#141416] placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:outline-none"
              />
              {recoveryError ? (
                <p className="mt-2 text-center text-[13px] font-semibold text-[#B91C1C]">
                  {recoveryError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void regenRecovery()}
                disabled={totpCode.length !== 6 || recoveryBusy}
                className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-[#C9A227] text-[14px] font-bold text-white disabled:opacity-50"
              >
                {recoveryBusy ? "جارٍ التحقق…" : "تأكيد وإصدار الرموز"}
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
