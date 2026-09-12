/**
 * محفظة الجنوب — حصالة جديدة (SC-31)
 * نموذج (الاسم + العملة من محافظ المستخدم + المبلغ الهدف اختياري)
 * → S2 POST /api/savings → نجاح → العودة لشاشة الحصالة (back)
 * مع معالجة أخطاء العقد inline.
 */

"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/app-store";
import type { CurrencyCode, SavingsJarView, WalletView } from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { AmountInputField } from "@/components/app/ui/amount-input-field";
import { AmountPad } from "@/components/app/ui/amount-pad";
import { CurrencyTabs } from "@/components/app/ui/currency-tabs";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { normalizeWallets } from "@/components/app/home/home-screen-helpers";
import { toast } from "@/hooks/use-toast";
import { InlineErrorBanner, errInfo, parseAmountToMinor } from "./money-shared";

export function SavingsNewScreen() {
  const me = useAppStore((s) => s.me);
  const back = useAppStore((s) => s.back);
  const refreshMe = useAppStore((s) => s.refreshMe);

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("YER");
  const [targetInput, setTargetInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<{ code: string; message: string } | null>(null);

  const wallets: WalletView[] = me ? normalizeWallets(me.wallets) : [];
  const activeWallet = wallets.find((w) => w.currency === currency);
  const targetMinor = parseAmountToMinor(targetInput, currency); // null = بدون هدف
  const nameValid = name.trim().length >= 2;

  const createJar = async () => {
    setSubmitting(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim().slice(0, 40),
        currency,
      };
      if (targetMinor !== null) body.targetMinor = targetMinor;
      const jar = await api.post<SavingsJarView>("/api/savings", body);
      toast({ title: "تم إنشاء الهدف", description: jar.name });
      void refreshMe();
      back();
    } catch (err) {
      setFormError(errInfo(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader title="حصالة جديدة" subtitle="هدف ادخاري جديد" />

      <div className="mt-4 space-y-3">
        {/* الاسم */}
        <div className="w-full">
          <label htmlFor="jar-name" className="mb-1.5 block text-[12px] font-semibold text-[#5C5A56]">
            اسم الهدف
          </label>
          <input
            id="jar-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            placeholder="مثال: حج 1448 · دراسة · مشروع"
            className="min-h-11 w-full rounded-xl border border-[#E8E6E1] bg-white px-4 py-2.5 text-[14px] font-semibold text-[#141416] placeholder:font-medium placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:outline-none"
          />
        </div>

        {/* العملة */}
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-[#5C5A56]">عملة الحصالة</p>
          <CurrencyTabs wallets={wallets} value={currency} onChange={setCurrency} />
        </div>

        {/* الهدف (اختياري) */}
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-[#5C5A56]">
            المبلغ المستهدف <span className="text-[#A3A09B]">(اختياري)</span>
          </p>
          <button
            type="button"
            className="w-full"
            aria-label="حقل الهدف — يُكتب بلوحة الأرقام أدناه"
          >
            <AmountInputField
              value={targetInput}
              currency={currency}
              placeholder="بلا هدف"
              hint={
                targetInput === ""
                  ? `رصيد محفظة ${currency}: ${formatMoney(activeWallet?.balanceMinor ?? 0, currency)}`
                  : undefined
              }
            />
          </button>
        </div>

        <AmountPad
          value={targetInput}
          onChange={(next) => setTargetInput(next.replace(/[^\d.]/g, "").slice(0, 13))}
          mode="amount"
          decimal={currency !== "YER"}
        />

        {targetMinor !== null ? (
          <p className="text-center text-[12px] font-medium text-[#5C5A56]">
            عند بلوغ {formatMoney(targetMinor, currency)} تُعلَّم الحصالة "تم تحقيقها" تلقائياً
          </p>
        ) : null}

        {formError ? <InlineErrorBanner error={formError} /> : null}

        <PrimaryActionButton
          onClick={() => void createJar()}
          disabled={!nameValid || submitting}
          loading={submitting}
          disabledReason={!nameValid ? "أدخل اسماً للهدف (حرفان على الأقل)" : undefined}
        >
          <span className="inline-flex items-center gap-2">
            <Plus strokeWidth={2} className="h-4 w-4" />
            إنشاء الهدف
          </span>
        </PrimaryActionButton>
      </div>
    </div>
  );
}
