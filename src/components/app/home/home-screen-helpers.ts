/**
 * محفظة الجنوب — أدوات مشتركة لشاشات المنزل (الرئيسية/تفاصيل المحفظة)
 */
"use client";

import type { WalletView } from "@/lib/api-types";
import { CURRENCIES } from "@/lib/api-types";

/** ضمان الثلاث عملات في بطاقات الرصيد (رصيد 0 لغير الموجود) */
export function normalizeWallets(wallets: WalletView[]): WalletView[] {
  return CURRENCIES.map(
    (c) =>
      wallets.find((w) => w.currency === c) ?? {
        currency: c,
        kind: "MAIN" as const,
        balanceMinor: 0,
      },
  );
}
