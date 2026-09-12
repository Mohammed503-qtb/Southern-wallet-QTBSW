/**
 * محفظة الجنوب — رمز QR (SC-19)
 * وضعان:
 * (أ) رمز استلامي: بطاقة QR كبيرة SWPAY:<هاتفي> من /api/qr + مشاركة الرقم.
 * (ب) مسح: كاميرا عبر BarcodeDetector إن توفرت (ب fallback لطيف) +
 * إدخال يدوي للرقم + أزرار محاكاة تجريبية.
 * التوجيه (قرار 9-c — المسار السلس): عند قراءة SWPAY:<phone> أو إدخاله
 * يدوياً ننتقل دائماً إلى pay-merchant بpayload — وشاشة الدفع نفسها تفصل:
 * تاجر → تدفق الدفع، مستخدم عادي → تعرض زر «تحويل عادي» إلى transfer.
 * (أزرار المحاكاة: عمالاء → transfer كما كان، تجار → pay-merchant مباشرة.)
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Copy, QrCode, ScanLine, Share2, UserRound } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { AmountPad } from "@/components/app/ui/amount-pad";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { PhoneField } from "./money-shared";

/** أنواع BarcodeDetector التجريبية (غير موجودة في lib.dom الافتراضي) */
interface DetectedBarcodeLike {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcodeLike[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

type Mode = "my" | "scan";

const DEMO_CONTACTS = [
  { name: "محمد", phone: "770000004", full: "محمد سعيد العمودي", kind: "customer" as const },
  { name: "نورة", phone: "770000005", full: "نورة عبدالله الكثيري", kind: "customer" as const },
  { name: "متجر الجنوب", phone: "770000020", full: "متجر الجنوب للأغذية", kind: "merchant" as const },
  { name: "صيدلية الشفاء", phone: "770000021", full: "صيدلية الشفاء", kind: "merchant" as const },
];

export function ScanQrScreen() {
  const params = useAppStore((s) => s.params);
  const me = useAppStore((s) => s.me);
  const navigate = useAppStore((s) => s.navigate);
  const resetTo = useAppStore((s) => s.resetTo);

  const [mode, setMode] = useState<Mode>(() => (params.mode === "scan" ? "scan" : "my"));
  const [manualPhone, setManualPhone] = useState<string>(() =>
    params.phone ? params.phone.replace(/\D/g, "").slice(0, 9) : "",
  );

  const myPhone = me?.user.phone ?? "";
  const qrSrc = myPhone ? `/api/qr?text=${encodeURIComponent(`SWPAY:${myPhone}`)}&size=260` : "";

  // ===== مشاركة رقمي =====
  const sharePhone = async () => {
    const text = `رقم محفظتي في محفظة الجنوب: ${myPhone} — أرسل التحويل إلى هذا الرقم (Alpha تجريبي)`;
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        try {
          await navigator.share({ title: "رقم محفظتي", text });
          return;
        } catch {
          /* أُلغيت — نسقط للنسخ */
        }
      }
      await navigator.clipboard.writeText(text);
      toast({ title: "تم نسخ رقمك", description: text });
    } catch {
      toast({ title: "تعذّرت المشاركة", variant: "destructive" });
    }
  };

  const copyPhone = async () => {
    try {
      await navigator.clipboard.writeText(myPhone);
      toast({ title: "تم نسخ الرقم", description: myPhone });
    } catch {
      toast({ title: "تعذّر النسخ", variant: "destructive" });
    }
  };

  /** عميل عادي → تحويل عادي؛ تاجر → شاشة الدفع للتاجر (payload SWPAY) */
  const goContact = (c: (typeof DEMO_CONTACTS)[number]) => {
    if (c.phone.length !== 9) return;
    if (c.kind === "merchant") {
      navigate("pay-merchant", { payload: `SWPAY:${c.phone}` });
    } else {
      navigate("transfer", { phone: c.phone });
    }
  };

  /** مسح/إدخال يدوي → pay-merchant بpayload (يفصل تاجراً عن مستخدم عادي) */
  const goPay = (phone: string) => {
    if (phone.length !== 9) return;
    navigate("pay-merchant", { payload: `SWPAY:${phone}` });
  };

  // ===== الكاميرا + BarcodeDetector (في وضع المسح) =====
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "on" | "unavailable" | "error">(
    "idle",
  );
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);

  useEffect(() => {
    if (mode !== "scan") return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const start = async () => {
      const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setCameraState("unavailable");
        setCameraMessage("المتصفح لا يدعم الكاميرا هنا — استعمل الإدخال اليدوي أو أزرار المحاكاة.");
        return;
      }
      try {
        setCameraState("starting");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setCameraState("on");
        setCameraMessage(null);

        if (ctor) {
          detectorRef.current = new ctor({ formats: ["qr_code"] });
          timer = setInterval(async () => {
            const v = videoRef.current;
            const detector = detectorRef.current;
            if (!v || !detector || v.readyState < 2) return;
            try {
              const codes = await detector.detect(v);
              const hit = codes.find((c) => c.rawValue?.startsWith("SWPAY:"));
              if (hit) {
                const phone = hit.rawValue.slice("SWPAY:".length).replace(/\D/g, "").slice(0, 9);
                if (phone.length === 9) {
                  if (timer) clearInterval(timer);
                  toast({ title: "تم قراءة رمز QR", description: `الرقم ${phone}` });
                  goPay(phone);
                }
              }
            } catch {
              /* تجاهل أخطاء الكشف الفردية */
            }
          }, 700);
        } else {
          setCameraMessage(
            "المسح التلقائي غير مدعوم في هذا المتصفح — عيّن الرمز داخل الإطار وأدخل الرقم يدوياً.",
          );
        }
      } catch {
        setCameraState("error");
        setCameraMessage(
          "تعذّر تشغيل الكاميرا (ربما مرفوضة الصلاحية). استعمل الإدخال اليدوي أو أزرار المحاكاة.",
        );
      }
    };

    void start();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      detectorRef.current = null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [mode]);

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader title="رمز QR" subtitle="استلم أو امسح رموز التحويل" />

      {/* تبويبا الوضع */}
      <div role="tablist" aria-label="وضع الرمز" className="mt-3 grid grid-cols-2 gap-2">
        {(
          [
            { key: "my", label: "رمز استلامي", icon: QrCode },
            { key: "scan", label: "مسح رمز", icon: ScanLine },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={mode === t.key}
            onClick={() => setMode(t.key)}
            className={cn(
              "flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-[13px] font-bold transition-all",
              mode === t.key
                ? "bg-[#0B0B0C] text-white"
                : "border border-[#E8E6E1] bg-[#F7F6F2] text-[#141416] hover:border-[#C9A227]/50",
            )}
          >
            <t.icon strokeWidth={1.5} className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {mode === "my" ? (
        myPhone ? (
          <div className="mt-4 space-y-3">
            {/* بطاقة الرمز الشخصي */}
            <div className="relative overflow-hidden rounded-2xl bg-[#0B0B0C] p-5 text-white shadow-[0_8px_24px_rgba(11,11,12,0.12)]">
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
                <span className="absolute -left-10 -top-10 h-32 w-32 rotate-45 rounded-xl border border-[#C9A227]/20" />
                <span className="absolute -right-12 -bottom-14 h-36 w-36 rotate-45 rounded-xl border border-[#C9A227]/15" />
              </div>
              <div className="relative flex flex-col items-center">
                <p className="text-[12px] font-semibold text-white/60">رمز الاستلام الشخصي</p>
                <div className="mt-3 rounded-2xl bg-white p-3">
                  <img
                    src={qrSrc}
                    alt={`رمز QR لرقم ${myPhone}`}
                    width={208}
                    height={208}
                    className="h-[208px] w-[208px]"
                  />
                </div>
                <p dir="ltr" className="mt-3 text-[22px] font-extrabold tabular-nums tracking-[0.12em] text-[#C9A227]">
                  {myPhone}
                </p>
                <p className="mt-1 text-center text-[11.5px] font-medium leading-5 text-white/50">
                  اطلب من المرسل مسح هذا الرمز أو إدخال رقمك — يصل المبلغ فوراً لمحفظتك
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void sharePhone()}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0B0B0C] px-3 text-[14px] font-bold text-white transition-colors hover:bg-[#1A1A1C]"
              >
                <Share2 strokeWidth={1.5} className="h-4 w-4" />
                مشاركة الرقم
              </button>
              <button
                type="button"
                onClick={() => void copyPhone()}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E8E6E1] bg-white px-3 text-[14px] font-bold text-[#5C5A56] transition-colors hover:border-[#C9A227]/50"
              >
                <Copy strokeWidth={1.5} className="h-4 w-4" />
                نسخ الرقم
              </button>
            </div>
            <button
              type="button"
              onClick={() => setMode("scan")}
              className="flex min-h-11 w-full items-center justify-center gap-2 text-[13px] font-bold text-[#C9A227] hover:text-[#A2831B]"
            >
              <ScanLine strokeWidth={1.5} className="h-4 w-4" />
              التبديل إلى وضع المسح
            </button>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-[#E8E6E1] bg-white p-5 text-center text-[13px] font-medium text-[#5C5A56]">
            لم تُحمّل بيانات حسابك بعد — أعد فتح الشاشة بعد لحظات.
          </div>
        )
      ) : (
        <div className="mt-4 space-y-3">
          {/* عدسة الكاميرا بإطار النجمة الثمانية */}
          <div className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-2xl border border-[#E8E6E1] bg-[#141416]">
            <video
              ref={videoRef}
              playsInline
              muted
              className={cn(
                "h-full w-full object-cover",
                cameraState === "on" ? "opacity-100" : "opacity-25",
              )}
            />
            {/* إطار محاذاة — مربعان متداخلان (نجمة ثمانية) */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <span className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-xl border-[1.5px] border-[#C9A227]/80" />
              <span className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-xl border-[1.5px] border-[#C9A227]/40" />
            </div>
            {cameraState !== "on" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                {cameraState === "starting" ? (
                  <Camera className="h-8 w-8 animate-pulse text-[#C9A227]" />
                ) : (
                  <CameraOff className="h-8 w-8 text-white/40" />
                )}
                <p className="text-[12px] font-semibold leading-5 text-white/80">
                  {cameraState === "starting"
                    ? "جارٍ تشغيل الكاميرا…"
                    : (cameraMessage ?? "الكاميرا غير مفعّلة")}
                </p>
              </div>
            ) : null}
          </div>
          {cameraState === "on" && cameraMessage ? (
            <p className="text-center text-[12px] font-medium text-[#B45309]">{cameraMessage}</p>
          ) : null}

          {/* الإدخال اليدوي */}
          <div className="rounded-2xl border border-[#E8E6E1] bg-white p-4 shadow-[0_2px_8px_rgba(11,11,12,0.04)]">
            <p className="mb-2 text-[14px] font-bold text-[#141416]">أدخل الرقم يدوياً</p>
            <PhoneField
              label="رقم المرسل إليه"
              value={manualPhone}
              active
              onActivate={() => undefined}
            />
            <div className="mt-3">
              <AmountPad
                value={manualPhone}
                onChange={(next) => setManualPhone(next.replace(/\D/g, "").slice(0, 9))}
                mode="phone"
              />
            </div>
            <div className="mt-3">
              <PrimaryActionButton
                onClick={() => goPay(manualPhone)}
                disabled={manualPhone.length !== 9}
                disabledReason={manualPhone.length > 0 ? "أكمل 9 خانات" : "أدخل رقم المستلم"}
              >
                متابعة للدفع / التحويل
              </PrimaryActionButton>
            </div>
          </div>

          {/* محاكاة تجريبية */}
          <div className="rounded-2xl border border-[#C9A227]/30 bg-[#C9A227]/[0.05] p-4">
            <p className="mb-2 text-[12.5px] font-bold text-[#8A6E14]">
              تجربة Alpha — محاكاة قراءة رمز (حسابات Seed):
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_CONTACTS.map((c) => (
                <button
                  key={c.phone}
                  type="button"
                  onClick={() => goContact(c)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#C9A227]/40 bg-white px-3 text-[13px] font-bold text-[#141416] transition-colors hover:bg-[#FDFCFA]"
                >
                  <UserRound strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
                  {c.name} · <span dir="ltr" className="tabular-nums">{c.phone}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] font-medium leading-4 text-[#8A6E14]/80">
              أول خانتين عملاء (تحويل عادي) والثانيتان تجار معتمدون (دفع QR)
            </p>
          </div>

          <button
            type="button"
            onClick={() => resetTo("home")}
            className="flex min-h-11 w-full items-center justify-center text-[13px] font-bold text-[#5C5A56] hover:text-[#141416]"
          >
            إلغاء والعودة
          </button>
        </div>
      )}
    </div>
  );
}
