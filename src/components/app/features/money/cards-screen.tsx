/**
 * محفظة الجنوب — كروت الشبكة (المرحلة 2 / 9-b)
 * باقات بيانات كل مشغل ببطاقات سعر ثابتة → تأكيد → PIN → إيصال يبرز
 * **رمز الكرت** (11 خانة) ببطاقة داكنة ذهبية بزر نسخ + تحذير
 * «لن يظهر الرمز مرة أخرى إلا في تفاصيل العملية».
 */
"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Wifi } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAppStore } from "@/lib/app-store";
import type { CardProductView, TxResultView, WalletView } from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { useApiData } from "@/components/app/ui/api-hooks";
import { ErrorState } from "@/components/app/ui/error-state";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ReceiptCard } from "@/components/app/ui/receipt-card";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { normalizeWallets } from "@/components/app/home/home-screen-helpers";
import { toast } from "@/hooks/use-toast";
import {
  BigCodeCard,
  PinStep,
  ReviewCard,
  SuccessMark,
  errInfo,
  postMoney,
} from "./money-shared";

type Step = "browse" | "review" | "pin" | "result" | "fail";

/** الباقة مع الرسوم الحية (حقل إضافي من /api/cards فوق CardProductView) */
interface CardProductWithFee extends CardProductView {
  feeMinor?: number;
}

/** نتيجة الشراء المحلية — api-types مغلق أمام الإضافة */
interface CardPurchaseResultView extends TxResultView {
  cardCode: string | null;
  productName: string;
  operatorName: string;
}

export function CardsScreen() {
  const me = useAppStore((s) => s.me);
  const refreshMe = useAppStore((s) => s.refreshMe);
  const navigate = useAppStore((s) => s.navigate);
  const resetTo = useAppStore((s) => s.resetTo);

  const cards = useApiData<CardProductWithFee[]>("/api/cards");

  // ===== حالة التدفق =====
  const [selected, setSelected] = useState<CardProductWithFee | null>(null);
  const [step, setStep] = useState<Step>("browse");
  const [result, setResult] = useState<CardPurchaseResultView | null>(null);
  const [executing, setExecuting] = useState(false);
  const [formError, setFormError] = useState<{ code: string; message: string } | null>(null);
  const [pinError, setPinError] = useState<{ code: string; message: string; lockSeconds?: number } | null>(
    null,
  );

  /** تجميع الباقات حسب المشغل (بترتيب الكتالوج) */
  const byOperator = useMemo(() => {
    const sections: { operator: string; items: CardProductWithFee[] }[] = [];
    for (const c of cards.data ?? []) {
      const last = sections[sections.length - 1];
      if (last && last.operator === c.operator) last.items.push(c);
      else sections.push({ operator: c.operator, items: [c] });
    }
    return sections;
  }, [cards.data]);

  const wallets: WalletView[] = me ? normalizeWallets(me.wallets) : [];
  const yerWallet = wallets.find((w) => w.currency === "YER");

  const feeMinor = selected?.feeMinor ?? 0;
  const totalMinor = selected ? selected.priceMinor + feeMinor : null;

  /** تنفيذ الشراء بعد PIN (cards + Idempotency) */
  const executePurchase = async (pin: string) => {
    if (!selected) return;
    setExecuting(true);
    setPinError(null);
    try {
      const tx = await postMoney<CardPurchaseResultView>("/api/cards", {
        productCode: selected.code,
        pin,
      });
      setResult(tx);
      setStep("result");
      void refreshMe();
      toast({
        title: "تم شراء كرت الشبكة",
        description: `${tx.operatorName} — ${tx.productName}`,
      });
    } catch (err) {
      if (err instanceof ApiError && (err.code === "PIN-001" || err.code === "PIN-002")) {
        const secs =
          err.code === "PIN-002" && err.details && typeof err.details.secondsRemaining === "number"
            ? err.details.secondsRemaining
            : undefined;
        setPinError({ code: err.code, message: err.message, lockSeconds: secs });
      } else {
        setStep("fail");
        setFormError(errInfo(err));
      }
    } finally {
      setExecuting(false);
    }
  };

  const shell = (children: ReactNode) => (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">{children}</div>
  );

  // ===== النتيجة: رمز الكرت + الإيصال =====
  if (step === "result" && result) {
    return shell(
      <>
        <ScreenHeader title="نتيجة الشراء" showBack={false} />
        <SuccessMark
          title="تم شراء كرت الشبكة"
          amount={formatMoney(result.amountMinor, result.currency)}
          subtitle={`${result.operatorName} • ${result.productName}`}
        />
        <div className="mt-4 space-y-3">
          {result.cardCode ? (
            <BigCodeCard
              code={result.cardCode}
              title="رمز الكرت — 11 خانة"
              warning="احفظ الرمز الآن — لن يظهر مرة أخرى إلا في تفاصيل العملية وإشعارها."
              showQr
            />
          ) : null}
          <ReceiptCard
            reference={result.ref}
            title="إيصال شراء كرت شبكة"
            status={result.status}
            createdAt={result.createdAt}
            parties={[
              { label: "من", value: me?.user.fullName ?? "أنت" },
              { label: "إلى", value: result.operatorName },
            ]}
            fields={[
              { label: "الباقة", value: result.productName },
              { label: "سعر الكرت", value: formatMoney(result.amountMinor, result.currency) },
              { label: "الرسوم", value: formatMoney(result.feeMinor, result.currency) },
              {
                label: "الإجمالي المخصوم",
                value: formatMoney(result.amountMinor + result.feeMinor, result.currency),
                strong: true,
              },
            ]}
          />
          <div className="grid grid-cols-1 gap-2">
            <PrimaryActionButton onClick={() => navigate("transaction-details", { ref: result.ref })}>
              مشاهدة العملية
            </PrimaryActionButton>
            <button
              type="button"
              onClick={() => resetTo("home")}
              className="flex min-h-[52px] w-full items-center justify-center rounded-xl border border-[#E8E6E1] bg-white text-[16px] font-bold text-[#5C5A56] transition-colors hover:bg-[#F7F6F2]"
            >
              تم
            </button>
          </div>
        </div>
      </>,
    );
  }

  // ===== الفشل =====
  if (step === "fail") {
    return shell(
      <>
        <ScreenHeader title="نتيجة الشراء" showBack={false} />
        <div className="mt-6">
          <ErrorState
            message={formError?.message ?? "تعذّر إتمام شراء الكرت"}
            code={formError?.code}
            onRetry={() => {
              setStep("browse");
              setSelected(null);
              setFormError(null);
              setPinError(null);
            }}
          >
            <button
              type="button"
              onClick={() => resetTo("home")}
              className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-[#E8E6E1] bg-white px-6 text-[14px] font-bold text-[#5C5A56] transition-colors hover:bg-[#F7F6F2]"
            >
              العودة للرئيسية
            </button>
          </ErrorState>
        </div>
      </>,
    );
  }

  // ===== PIN =====
  if (step === "pin" && selected && totalMinor !== null) {
    return shell(
      <>
        <ScreenHeader title="تأكيد الشراء" />
        <div className="mt-6">
          <PinStep
            contextLabel={`تأكيد شراء كرت ${selected.name} من ${selected.operator} — ${formatMoney(
              selected.priceMinor,
              "YER",
            )}`}
            error={pinError}
            executing={executing}
            onConfirm={(pin) => void executePurchase(pin)}
            onCancel={() => {
              setStep("review");
              setPinError(null);
            }}
          />
        </div>
      </>,
    );
  }

  // ===== المراجعة =====
  if (step === "review" && selected && totalMinor !== null) {
    return shell(
      <>
        <ScreenHeader title="مراجعة الشراء" subtitle="راجع الباقة قبل التأكيد" onBack={() => setStep("browse")} />
        <div className="mt-4 space-y-3">
          <ReviewCard
            title="تفاصيل كرت الشبكة"
            rows={[
              { label: "المشغل", value: selected.operator },
              { label: "الباقة", value: `${selected.name} — ${selected.size}` },
              { label: "سعر الكرت", value: formatMoney(selected.priceMinor, "YER") },
              { label: "الرسوم", value: formatMoney(feeMinor, "YER") },
              { label: "الإجمالي المخصوم", value: formatMoney(totalMinor, "YER"), strong: true },
              {
                label: "رصيدك المتاح",
                value: formatMoney(yerWallet?.balanceMinor ?? 0, "YER"),
                tone: totalMinor > (yerWallet?.balanceMinor ?? 0) ? ("error" as const) : undefined,
              },
            ]}
            note="فور الشراء يُولَّد رمز كرت من 11 خانة ويُخصم الإجمالي من محفظة الريال اليمني — اضغط الرمز لنسخه واحتفظ به."
          />
          <PrimaryActionButton onClick={() => setStep("pin")}>تأكيد الشراء</PrimaryActionButton>
          <button
            type="button"
            onClick={() => setStep("browse")}
            className="flex min-h-11 w-full items-center justify-center text-[13px] font-bold text-[#5C5A56] transition-colors hover:text-[#141416]"
          >
            اختيار باقة أخرى
          </button>
        </div>
      </>,
    );
  }

  // ===== الكتالوج (البداية) =====
  if (cards.loading) {
    return shell(
      <>
        <ScreenHeader title="كروت الشبكة" subtitle="باقات بيانات المشغلين" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] w-full rounded-2xl" />
          ))}
        </div>
      </>,
    );
  }
  if (cards.error) {
    return shell(
      <>
        <ScreenHeader title="كروت الشبكة" />
        <div className="mt-6">
          <ErrorState message={cards.error.message} code={cards.error.code} onRetry={cards.retry} />
        </div>
      </>,
    );
  }
  return shell(
    <>
      <ScreenHeader title="كروت الشبكة" subtitle="باقات بيانات المشغلين — بأسعار ثابتة بالريال" />
      <div className="mt-4 space-y-5">
        {byOperator.map((section) => (
          <section key={section.operator}>
            <h2 className="mb-2.5 flex items-center gap-2 text-[16px] font-semibold leading-6 text-[#141416]">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#C9A227]/25 bg-[#C9A227]/[0.07] text-[#8A6E14]">
                <Wifi strokeWidth={1.5} className="h-4 w-4" />
              </span>
              {section.operator}
            </h2>
            <div className="space-y-2">
              {section.items.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    setSelected(c);
                    setStep("review");
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-[#E8E6E1]/70 bg-white p-3.5 text-right transition-colors hover:border-[#C9A227]/50 hover:bg-[#FDFCFA] active:bg-[#F7F6F2]"
                >
                  <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#0B0B0C] text-white">
                    <Wifi strokeWidth={1.5} className="h-5 w-5 text-[#C9A227]" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-bold text-[#141416]">{c.name}</span>
                    <span className="truncate text-[12px] font-medium text-[#5C5A56]">{c.size}</span>
                    {c.feeMinor ? (
                      <span className="text-[11px] font-medium text-[#A3A09B]">
                        + رسوم {formatMoney(c.feeMinor, c.currency)}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 rounded-xl border border-[#C9A227]/30 bg-[#C9A227]/[0.06] px-3 py-1.5 text-[14px] font-extrabold tabular-nums text-[#8A6E14]">
                    {formatMoney(c.priceMinor, c.currency)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
        <p className="rounded-xl bg-[#F7F6F2] px-3 py-2.5 text-center text-[12px] font-medium leading-5 text-[#5C5A56]">
          يظهر رمز الكرت فور الشراء في الإيصال مرة واحدة — احفظه أو انسخه، ثم
          فعّله من إعدادات المشغل (رمز الاستعلام بالعادة 141* أو نحوه).
        </p>
      </div>
    </>,
  );
}
