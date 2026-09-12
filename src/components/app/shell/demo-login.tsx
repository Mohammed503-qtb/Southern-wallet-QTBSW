/**
 * محفظة الجنوب — أزرار الدخول السريع للحسابات التجريبية (Seed)
 * تُستعمل في لوحة الهوية (سطح المكتب) وفي Sheet شاشة الدخول (الجوال).
 * كل زر يستدعي POST /api/auth/demo-login ثم bootstrap() (A3 + A5).
 * الحسابات كما في MVP_CONTRACT §4.
 */
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { api, ApiError, saveSessionToken } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface DemoAccount {
  phone: string;
  label: string;
  note: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { phone: "770000001", label: "عميل موثّق", note: "أحمد السُّقطري — أرصدة وسجل غني" },
  { phone: "770000002", label: "عميلة جديدة", note: "فاطمة العريقي — بدون KYC" },
  { phone: "770000003", label: "خارج النطاق", note: "سامي الحضرمي — اطلاع فقط (AC-07)" },
  { phone: "770000020", label: "تاجر", note: "متجر الجنوب — نقطة البيع QR" },
  { phone: "770000010", label: "وكيل", note: "وكيل النور — عدن، عوم 2 مليون" },
  { phone: "770100001", label: "مدير", note: "ADMIN — كامل الصلاحيات" },
  { phone: "770100002", label: "امتثال", note: "COMPLIANCE — طابور KYC" },
  { phone: "770100003", label: "دعم", note: "SUPPORT — التذاكر" },
];

export interface DemoLoginButtonsProps {
  /** يُستدعى بعد نجاح الدخول وbootstrap (مثل إغلاق Sheet) */
  onDone?: () => void;
  layout?: "panel" | "sheet";
}

export function DemoLoginButtons({ onDone, layout = "panel" }: DemoLoginButtonsProps) {
  const bootstrap = useAppStore((s) => s.bootstrap);
  const [busyPhone, setBusyPhone] = useState<string | null>(null);

  const login = async (account: DemoAccount) => {
    setBusyPhone(account.phone);
    try {
      const data = await api.post<{ sessionToken?: string }>("/api/auth/demo-login", {
        phone: account.phone,
      });
      if (data.sessionToken) saveSessionToken(data.sessionToken);
      await bootstrap();
      toast({ title: `تم الدخول باسم ${account.label}`, description: account.note });
      onDone?.();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? `${err.message}${err.code ? ` (${err.code})` : ""}`
          : "فشل الدخول التجريبي — تأكد أن الخادم وSeed جاهزان";
      toast({
        title: "فشل الدخول التجريبي",
        description: message,
        variant: "destructive",
      });
    } finally {
      setBusyPhone(null);
    }
  };

  return (
    <div
      className={cn(
        "grid gap-2",
        layout === "panel" ? "grid-cols-2" : "grid-cols-1",
      )}
    >
      {DEMO_ACCOUNTS.map((account) => {
        const busy = busyPhone === account.phone;
        return (
          <button
            key={account.phone}
            type="button"
            onClick={() => void login(account)}
            disabled={busyPhone !== null}
            title={account.note}
            className={cn(
              "flex min-h-[56px] flex-col items-start justify-center gap-0.5 rounded-xl border border-[#E8E6E1] bg-white px-3 py-2 text-right transition-colors",
              "hover:border-[#C9A227]/60 hover:bg-[#FDFCFA] disabled:opacity-60",
            )}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="text-[14px] font-bold text-[#141416]">{account.label}</span>
              {busy ? (
                <Loader2 strokeWidth={1.5} className="h-4 w-4 animate-spin text-[#C9A227]" />
              ) : (
                <span dir="ltr" className="text-[12px] font-medium tabular-nums text-[#A3A09B]">
                  {account.phone}
                </span>
              )}
            </span>
            <span className="w-full truncate text-[11px] font-medium text-[#A3A09B]">
              {account.note}
            </span>
          </button>
        );
      })}
    </div>
  );
}
