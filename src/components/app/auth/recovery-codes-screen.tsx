/**
 * محفظة الجنوب — شاشة رموز الاسترداد (Recovery Codes)
 * تُعرض مرة واحدة بعد تفعيل المصادقة (أو تجديد الرموز من شاشة الأمان):
 * 8 رموز XXXX-XXXX تُستخدم للدخول عند فقدان جهاز المصادقة (كل رمز
 * مرة واحدة). نسخ/تنزيل + إقرار الحفظ → pin-create (تسجيل جديد) أو
 * التطبيق (إعادة إلحاق/تجديد).
 */
"use client";

import { useEffect, useState } from "react";
import { Copy, Download, ShieldAlert } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { toast } from "@/hooks/use-toast";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ScreenHeader } from "@/components/app/ui/screen-header";

export function RecoveryCodesScreen() {
  const state = useAppStore((s) => s.recoveryCodesState);
  const setRecoveryCodesState = useAppStore((s) => s.setRecoveryCodesState);
  const resetTo = useAppStore((s) => s.resetTo);
  const bootstrap = useAppStore((s) => s.bootstrap);

  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!state) resetTo("login");
  }, [state, resetTo]);

  if (!state) return null;

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(state.codes.join("\n"));
      toast({ title: "نُسخت الرموز الثمانية" });
    } catch {
      toast({ title: "تعذّر النسخ", variant: "destructive" });
    }
  };

  const download = () => {
    setDownloading(true);
    try {
      const content =
        "محفظة الجنوب — رموز الاسترداد\n" +
        "استخدم كل رمز مرة واحدة عند فقدان جهاز المصادقة.\n" +
        "احتفظ بها في مكان آمن ولا تشاركها مع أحد.\n\n" +
        state.codes.join("\n") +
        "\n";
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "janoub-wallet-recovery-codes.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "نُزّل ملف الرموز", description: "احفظه في مكان آمن" });
    } catch {
      toast({ title: "تعذّر التنزيل", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const done = async () => {
    if (state.next === "pin") {
      setRecoveryCodesState(null);
      resetTo("pin-create");
    } else {
      setRecoveryCodesState(null);
      await bootstrap();
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-4 pb-8">
      <ScreenHeader title="رموز الاسترداد" showBack={false} />

      <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-[#B45309]/30 bg-[#B45309]/[0.06] p-3">
        <ShieldAlert strokeWidth={1.5} className="mt-0.5 h-5 w-5 shrink-0 text-[#B45309]" />
        <p className="text-[13px] font-semibold leading-6 text-[#B45309]">
          هذه الرموز الثمانية هي وسيلتك للدخول إذا فقدت جهاز المصادقة — تُعرض
          الآن فقط ولن تظهر مجدداً. كل رمز يُستخدم مرة واحدة. احفظها في مكان آمن.
        </p>
      </div>

      {/* شبكة الرموز */}
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {state.codes.map((c) => (
          <div
            key={c}
            dir="ltr"
            className="flex h-[52px] items-center justify-center rounded-xl border border-[#E8E6E1] bg-white text-[17px] font-extrabold tracking-[0.12em] tabular-nums text-[#141416]"
          >
            {c}
          </div>
        ))}
      </div>

      {/* نسخ وتنزيل */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => void copyAll()}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E8E6E1] bg-white px-4 text-[13.5px] font-bold text-[#5C5A56] transition-colors hover:border-[#C9A227]/60 hover:text-[#141416]"
        >
          <Copy strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
          نسخ الكل
        </button>
        <button
          type="button"
          onClick={download}
          disabled={downloading}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E8E6E1] bg-white px-4 text-[13.5px] font-bold text-[#5C5A56] transition-colors hover:border-[#C9A227]/60 hover:text-[#141416] disabled:opacity-60"
        >
          <Download strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
          تنزيل ملف
        </button>
      </div>

      <div className="mt-6">
        <PrimaryActionButton onClick={() => void done()}>
          حفظتها — متابعة
        </PrimaryActionButton>
      </div>

      <p className="mt-auto pt-6 text-center text-[12px] font-medium leading-5 text-[#A3A09B]">
        يمكنك تجديد رموز الاسترداد لاحقاً من: الحساب ← الأمان.
      </p>
    </div>
  );
}
