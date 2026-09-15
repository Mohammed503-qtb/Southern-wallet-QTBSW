/**
 * محفظة الجنوب — المكون القياسي 3/10: شرائح العملات (CurrencyTabs)
 * شرائح pill لـ YER/SAR/USD تعرض الرمز والرصيد المصغّر المتاح لكل عملة؛
 * العملة ذات الرصيد 0 تظهر مع خفوت. 
 * variant: light (أسطح فاتحة) أو dark (فوق بطاقة الرصيد السوداء).
 */
"use client";

import type { CurrencyCode, WalletView } from "@/lib/api-types";
import { CURRENCIES, formatMoney } from "@/lib/api-types";
import { cn } from "@/lib/utils";

export interface CurrencyTabsProps {
  wallets: WalletView[];
  value: CurrencyCode;
  onChange: (currency: CurrencyCode) => void;
  variant?: "light" | "dark";
  /** تنسيق مخصص للرصيد (مثلاً للإخفاء) */
  formatBalance?: (wallet: WalletView) => string;
  className?: string;
}

export function CurrencyTabs({
  wallets,
  value,
  onChange,
  variant = "light",
  formatBalance,
  className,
}: CurrencyTabsProps) {
  const byCurrency = new Map(wallets.map((w) => [w.currency, w]));

  return (
    <div
      role="tablist"
      aria-label="اختيار العملة"
      className={cn("flex w-full gap-2", className)}
    >
      {CURRENCIES.map((cur) => {
        const wallet = byCurrency.get(cur);
        const balance =
          wallet !== undefined
            ? (formatBalance?.(wallet) ?? formatMoney(wallet.balanceMinor, cur))
            : formatMoney(0, cur);
        const isActive = cur === value;
        const isZero = (wallet?.balanceMinor ?? 0) === 0;

        return (
          <button
            key={cur}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(cur)}
            className={cn(
              "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-3 py-1.5 transition-all",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A227]",
              isActive && variant === "light" && "bg-[#0B0B0C] text-white",
              isActive && variant === "dark" && "bg-[#C9A227] text-[#0B0B0C]",
              !isActive &&
                variant === "light" &&
                "border border-[#E8E6E1] bg-[#F7F6F2] text-[#141416] hover:border-[#C9A227]/50",
              !isActive &&
                variant === "dark" &&
                "border border-white/15 bg-white/5 text-white/85 hover:bg-white/10",
              isZero && !isActive && "opacity-55",
              isZero && isActive && "opacity-90",
            )}
          >
            <span dir="ltr" className="text-[12px] font-bold leading-4 tracking-wide">
              {cur}
            </span>
            <span
              dir="ltr"
              className={cn(
                "max-w-full truncate text-[10px] font-medium leading-4 tabular-nums",
                isActive && variant === "dark" ? "text-[#0B0B0C]/80" : "opacity-70",
              )}
            >
              {balance}
            </span>
          </button>
        );
      })}
    </div>
  );
}
