/**
 * محفظة الجنوب — رمز الدفع الخاص بي (MERCHANT_PAY — 9-c)
 * ------------------------------------------------------
 * (أ) رمز الاستلام الشخصي الكبير SWPAY:<هاتفي> من /api/qr + اسمي +
 *     زرا مشاركة/نسخ الرقم.
 * (ب) قسم «الدفع لتاجر»: زر «ادفع بمسح الرمز» يفتح الماسح (scan-qr)
 *     (المسح/الإدخال يوجه دائماً إلى pay-merchant الذي يفصل تاجراً عن
 *     مستخدم عادي) + إدخال يدوي سريع لرمز تاجر → pay-merchant.
 */
"use client";

import { useState } from "react";
import { Copy, QrCode, ScanLine, Share2, Store } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { toast } from "@/hooks/use-toast";
import { AmountPad } from "@/components/app/ui/amount-pad";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { PhoneField } from "./money-shared";

export function MyQrScreen() {
  const me = useAppStore((s) => s.me);
  const navigate = useAppStore((s) => s.navigate);

  const [merchantPhone, setMerchantPhone] = useState("");

  const myPhone = me?.user.phone ?? "";
  const myName = me?.user.fullName ?? "حسابي";
  const qrSrc = myPhone ? `/api/qr?text=${encodeURIComponent(`SWPAY:${myPhone}`)}&size=260` : "";

  const sharePhone = async () => {
    const text = `رقم محفظتي في محفظة الجنوب: ${myPhone} — أرسل التحويل إلى هذا الرقم`;
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

  const goPayMerchant = (phone: string) => {
    if (phone.length !== 9) return;
    navigate("pay-merchant", { payload: `SWPAY:${phone}` });
  };

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader title="رمز الدفع" subtitle="استلم حوالاتك وادفع للتجار بQR" />

      {/* ===== رمز الاستلام الشخصي ===== */}
      {myPhone ? (
        <div className="mt-4 space-y-3">
          <div className="relative overflow-hidden rounded-2xl bg-[#0B0B0C] p-5 text-white shadow-[0_8px_24px_rgba(11,11,12,0.12)]">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
              <span className="absolute -left-10 -top-10 h-32 w-32 rotate-45 rounded-xl border border-[#C9A227]/20" />
              <span className="absolute -right-12 -bottom-14 h-36 w-36 rotate-45 rounded-xl border border-[#C9A227]/15" />
            </div>
            <div className="relative flex flex-col items-center">
              <p className="text-[12px] font-semibold text-white/60">رمز الاستلام الشخصي</p>
              <p className="mt-1 text-[15px] font-bold text-white/90">{myName}</p>
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
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-[#E8E6E1] bg-white p-5 text-center text-[13px] font-medium text-[#5C5A56]">
          لم تُحمّل بيانات حسابك بعد — أعد فتح الشاشة بعد لحظات.
        </div>
      )}

      {/* ===== قسم الدفع لتاجر ===== */}
      <section className="mt-6">
        <h2 className="mb-2.5 flex items-center gap-2 text-[18px] font-semibold leading-6 text-[#141416]">
          <Store strokeWidth={1.5} className="h-5 w-5 text-[#C9A227]" />
          الدفع لتاجر
        </h2>

        <div className="space-y-3">
          {/* زر المسح — الواجهة الرئيسية للدفع */}
          <button
            type="button"
            onClick={() => navigate("scan-qr", { mode: "scan" })}
            className="flex w-full items-center gap-3 rounded-2xl bg-[#0B0B0C] p-4 text-white transition-colors hover:bg-[#161618]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#C9A227]/15 text-[#C9A227]">
              <ScanLine strokeWidth={1.5} className="h-5 w-5" />
            </span>
            <span className="flex-1 text-right">
              <span className="block text-[15px] font-bold">ادفع بمسح الرمز</span>
              <span className="block text-[12px] font-medium text-white/55">
                وجّه الكاميرا نحو رمز التاجر SWPAY أو أدخل رقمه يدوياً
              </span>
            </span>
          </button>

          {/* إدخال يدوي لرمز تاجر */}
          <div className="rounded-2xl border border-[#E8E6E1] bg-white p-4 shadow-[0_2px_8px_rgba(11,11,12,0.04)]">
            <p className="mb-2 flex items-center gap-1.5 text-[14px] font-bold text-[#141416]">
              <QrCode strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
              إدخال رمز التاجر يدوياً
            </p>
            <PhoneField
              label="رقم التاجر"
              value={merchantPhone}
              active
              onActivate={() => undefined}
              hint="رقم متجر معتمد في شبكة الدفع — يبدأ بـ 7"
            />
            <div className="mt-3">
              <AmountPad
                value={merchantPhone}
                onChange={(next) => setMerchantPhone(next.replace(/\D/g, "").slice(0, 9))}
                mode="phone"
              />
            </div>
            <div className="mt-3">
              <PrimaryActionButton
                onClick={() => goPayMerchant(merchantPhone)}
                disabled={merchantPhone.length !== 9}
                disabledReason={
                  merchantPhone.length > 0 ? "أكمل 9 خانات" : "أدخل رقم التاجر"
                }
              >
                <span className="inline-flex items-center gap-2">
                  <Store strokeWidth={1.5} className="h-4 w-4" />
                  متابعة للدفع
                </span>
              </PrimaryActionButton>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
