/**
 * محفظة الجنوب — قسم «الحوالات الواردة» في لوحة الإدارة (9-c)
 * ---------------------------------------------------------
 * (ADMIN/COMPLIANCE — GET/POST /api/admin/remit-in):
 * (أ) KPIs: الواردة المعلقة/المستلمة/المنتهية.
 * (ب) نموذج إصدار حوالة واردة: هاتف المستلم (مسجل) + اسم المرسل +
 *     شبكة من الكتالوج + المبلغ (YER) → POST برمز مطالبة 6 أرقام
 *     (يظهر في البطاقة الجديدة) + إشعار للمستلم + AuditLog.
 * (ج) القائمة بفلاتر حالة (الكل/معلقة/مستلمة/منتهية) ببطاقات تعرض
 *     الشبكة/المرسل/المبلغ/الرمز/الانتهاء + تحديث.
 */
"use client";

import { useState } from "react";
import { Landmark, Plus, Send, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import type { InboundRemittanceView } from "@/lib/api-types";
import { formatMoney } from "@/lib/api-types";
import { formatDateTime, useApiData, Skeleton } from "@/components/app/ui";
import { toastSuccess, useActionRunner } from "../console-hooks";
import { ConsoleButton, ConsoleCard, MoneyText, SectionHeader } from "../console-ui";
import { cn } from "@/lib/utils";

/** واجهة استجابة GET /api/admin/remit-in */
interface AdminRemitInView {
  items: InboundRemittanceView[];
  count: number;
}

type StatusFilter = "ALL" | "PENDING" | "CLAIMED" | "EXPIRED";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "ALL", label: "الكل" },
  { key: "PENDING", label: "معلقة" },
  { key: "CLAIMED", label: "مستلمة" },
  { key: "EXPIRED", label: "منتهية" },
];

const STATUS_LABELS: Record<InboundRemittanceView["status"], string> = {
  PENDING: "بانتظار الاستلام",
  CLAIMED: "تم الاستلام",
  EXPIRED: "منتهية أو ملغاة",
};

/** شبكات الكتالوج (نفس قائمة الخادم remit-in-networks.ts — للعرض والاختيار) */
const NETWORKS = [
  "الفلوس للصرافة",
  "الخليج للصرافة",
  "برقة للصرافة",
  "الهناء للصرافة",
  "اليمن الأولى للصرافة",
];

export function RemitInSection() {
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const query = filter === "ALL" ? "" : `?status=${filter}`;
  const { data, loading, error, retry } = useApiData<AdminRemitInView>(`/api/admin/remit-in${query}`);
  const runner = useActionRunner();

  // ===== نموذج الإصدار =====
  const [beneficiaryPhone, setBeneficiaryPhone] = useState("");
  const [senderName, setSenderName] = useState("");
  const [networkName, setNetworkName] = useState(NETWORKS[0]);
  const [amountInput, setAmountInput] = useState("");

  const phoneValid = /^7\d{8}$/.test(beneficiaryPhone);
  const amountMinor = Number(amountInput.replace(/[^\d]/g, ""));
  const amountValid = Number.isInteger(amountMinor) && amountMinor > 0;
  const nameValid = senderName.trim().length >= 3;
  const canIssue = phoneValid && nameValid && amountValid && !runner.busy;

  const submitIssue = async () => {
    const result = await runner.run(() =>
      api.post<InboundRemittanceView>("/api/admin/remit-in", {
        beneficiaryPhone,
        senderName: senderName.trim(),
        networkName,
        amountMinor,
        currency: "YER",
      }),
    );
    if (!result.ok) return;
    toastSuccess(
      `أُصدرت الحوالة الواردة ${result.value.ref}`,
      `رمز المطالبة ${result.value.claimCode} — أُشعر المستلم (${result.value.senderName} → ${formatMoney(result.value.amountMinor, result.value.currency)})`,
    );
    // تفريغ النموذج + تحديث القائمة
    setBeneficiaryPhone("");
    setSenderName("");
    setAmountInput("");
    setFilter("ALL");
    retry();
  };

  const items = data?.items ?? [];
  const pendingCount = items.filter((i) => i.status === "PENDING").length;
  const claimedCount = items.filter((i) => i.status === "CLAIMED").length;
  const expiredCount = items.filter((i) => i.status === "EXPIRED").length;

  return (
    <div className="relative flex flex-col gap-5">
      <SectionHeader
        title="الحوالات الواردة"
        description="إصدار حوالات شبكات الصرافة (A-03) وتتبع استلامها بالرمز — التمويل يقيَّد من محفظة FX عند المطالبة"
        onRefresh={retry}
        refreshing={loading}
      />

      {/* ===== KPIs ===== */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ConsoleCard className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-[11px] font-semibold leading-4 text-[#8A8783]">معلقة</p>
            <p className="mt-1.5 text-[22px] font-extrabold leading-8 tabular-nums text-[#B45309]">
              {pendingCount.toLocaleString("en-US")}
            </p>
          </div>
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#B45309]/10 text-[#B45309]">
            <Send strokeWidth={1.6} className="h-4 w-4" />
          </span>
        </ConsoleCard>
        <ConsoleCard className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-[11px] font-semibold leading-4 text-[#8A8783]">مستلمة</p>
            <p className="mt-1.5 text-[22px] font-extrabold leading-8 tabular-nums text-[#15803D]">
              {claimedCount.toLocaleString("en-US")}
            </p>
          </div>
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#15803D]/10 text-[#15803D]">
            <Landmark strokeWidth={1.6} className="h-4 w-4" />
          </span>
        </ConsoleCard>
        <ConsoleCard className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-[11px] font-semibold leading-4 text-[#8A8783]">منتهية/ملغاة</p>
            <p className="mt-1.5 text-[22px] font-extrabold leading-8 tabular-nums text-[#5C5A56]">
              {expiredCount.toLocaleString("en-US")}
            </p>
          </div>
        </ConsoleCard>
        <ConsoleCard className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-[11px] font-semibold leading-4 text-[#8A8783]">قيمة المعلقة</p>
            <p dir="ltr" className="mt-1.5 text-right text-[18px] font-extrabold leading-8 tabular-nums text-[#8A6E14]">
              {formatMoney(
                items.filter((i) => i.status === "PENDING").reduce((s, i) => s + i.amountMinor, 0),
                "YER",
              )}
            </p>
          </div>
        </ConsoleCard>
      </div>

      {/* ===== نموذج الإصدار ===== */}
      <ConsoleCard className="p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[15px] font-extrabold text-[#0B0B0C]">
          <Plus strokeWidth={1.6} className="h-4 w-4 text-[#C9A227]" />
          إصدار حوالة واردة جديدة
        </h3>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <label htmlFor="ri-phone" className="mb-1 block text-[11px] font-semibold text-[#8A8783]">
              هاتف المستلم (مسجل في المحفظة)
            </label>
            <input
              id="ri-phone"
              type="text"
              dir="ltr"
              inputMode="numeric"
              value={beneficiaryPhone}
              onChange={(e) => setBeneficiaryPhone(e.target.value.replace(/\D/g, "").slice(0, 9))}
              placeholder="77XXXXXXX"
              className="min-h-10 w-full rounded-xl border border-[#E8E6E1] bg-white px-3 text-[14px] font-semibold tabular-nums text-[#141416] placeholder:font-medium placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="ri-sender" className="mb-1 block text-[11px] font-semibold text-[#8A8783]">
              اسم المرسل الحقيقي
            </label>
            <input
              id="ri-sender"
              type="text"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value.slice(0, 60))}
              placeholder="مثال: سالم ناصر باعلوي"
              className="min-h-10 w-full rounded-xl border border-[#E8E6E1] bg-white px-3 text-[14px] font-semibold text-[#141416] placeholder:font-medium placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="ri-network" className="mb-1 block text-[11px] font-semibold text-[#8A8783]">
              الشبكة المرسلة
            </label>
            <select
              id="ri-network"
              value={networkName}
              onChange={(e) => setNetworkName(e.target.value)}
              className="min-h-10 w-full rounded-xl border border-[#E8E6E1] bg-white px-3 text-[14px] font-semibold text-[#141416] focus:border-[#C9A227] focus:outline-none"
            >
              {NETWORKS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ri-amount" className="mb-1 block text-[11px] font-semibold text-[#8A8783]">
              المبلغ (ريال يمني — بلا كسور)
            </label>
            <input
              id="ri-amount"
              type="text"
              dir="ltr"
              inputMode="numeric"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value.replace(/[^\d]/g, "").slice(0, 12))}
              placeholder="85000"
              className="min-h-10 w-full rounded-xl border border-[#E8E6E1] bg-white px-3 text-[14px] font-semibold tabular-nums text-[#141416] placeholder:font-medium placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ConsoleButton variant="gold" onClick={() => void submitIssue()} disabled={!canIssue} loading={runner.busy}>
            <Send strokeWidth={1.6} className="h-4 w-4" />
            إصدار برمز مطالبة
          </ConsoleButton>
          <p className="text-[12px] font-medium text-[#8A8783]">
            {phoneValid && nameValid && amountValid
              ? "سيُشعر المستلم برمز المطالبة (قناة التسليم)"
              : "أكمل الهاتف (9 خانات مسجلة) واسم المرسل (3 أحرف+) والمبلغ"}
          </p>
        </div>
        {runner.error ? (
          <p className="mt-2 text-[13px] font-semibold text-[#B91C1C]">
            {runner.error.message}
            <span dir="ltr" className="ms-2 text-[11px] text-[#A3A09B]">{runner.error.code}</span>
          </p>
        ) : null}
      </ConsoleCard>

      {/* ===== فلاتر الحالة ===== */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "min-h-9 rounded-full border px-3.5 text-[12.5px] font-bold transition-colors",
              filter === f.key
                ? "border-[#C9A227] bg-[#C9A227]/15 text-[#8A6E14]"
                : "border-[#E8E6E1] bg-white text-[#5C5A56] hover:border-[#C9A227]/60",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ===== القائمة ===== */}
      {error && !data ? (
        <ConsoleCard className="p-6">
          <p className="text-center text-[14px] font-semibold text-[#B91C1C]">
            {error.message}
            <span dir="ltr" className="ms-2 text-[11px] text-[#A3A09B]">{error.code}</span>
          </p>
          <div className="mt-4 flex justify-center">
            <ConsoleButton onClick={retry}>إعادة المحاولة</ConsoleButton>
          </div>
        </ConsoleCard>
      ) : null}

      {loading && !data ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[168px] w-full rounded-2xl" />
          ))}
        </div>
      ) : null}

      {!loading && data && items.length === 0 ? (
        <ConsoleCard className="p-10 text-center">
          <span aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#C9A227]/10 text-[#C9A227]">
            <Landmark strokeWidth={1.5} className="h-7 w-7" />
          </span>
          <p className="mt-4 text-[16px] font-bold text-[#141416]">لا حوالات واردة بهذا الفلتر</p>
          <p className="mt-1 text-[13px] font-medium text-[#5C5A56]">
            أصدر حوالة جديدة من النموذج أعلاه — أو غيّر الفلتر لرؤية السجل الكامل.
          </p>
        </ConsoleCard>
      ) : null}

      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <ConsoleCard key={item.ref} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0EEE9] pb-2.5">
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-xl",
                      item.status === "PENDING"
                        ? "bg-[#B45309]/10 text-[#B45309]"
                        : item.status === "CLAIMED"
                          ? "bg-[#15803D]/10 text-[#15803D]"
                          : "bg-[#F7F6F2] text-[#A3A09B]",
                    )}
                  >
                    <Landmark strokeWidth={1.6} className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[14px] font-bold text-[#141416]">{item.networkName}</p>
                    <p dir="ltr" className="text-right text-[11.5px] tabular-nums text-[#8A8783]">{item.ref}</p>
                  </div>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    item.status === "PENDING"
                      ? "border-[#B45309]/25 bg-[#B45309]/10 text-[#B45309]"
                      : item.status === "CLAIMED"
                        ? "border-[#15803D]/20 bg-[#15803D]/10 text-[#15803D]"
                        : "border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]",
                  )}
                >
                  {STATUS_LABELS[item.status]}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <p className="flex items-center gap-1 text-[11px] font-semibold text-[#8A8783]">
                    <UserRound strokeWidth={1.6} className="h-3.5 w-3.5" />
                    المرسل
                  </p>
                  <p className="text-[13.5px] font-bold text-[#141416]">{item.senderName}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#8A8783]">المبلغ</p>
                  <MoneyText minor={item.amountMinor} currency={item.currency} className="text-[15px]" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#8A8783]">رمز المطالبة</p>
                  <p dir="ltr" className="text-right text-[13px] font-extrabold tracking-[0.14em] tabular-nums text-[#8A6E14]">
                    {item.claimCode}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#8A8783]">الانتهاء</p>
                  <p className="text-[12.5px] font-semibold text-[#5C5A56]">{formatDateTime(item.expiresAt)}</p>
                </div>
              </div>
              <p className="mt-auto border-t border-[#F0EEE9] pt-2 text-[11.5px] font-medium text-[#8A8783]">
                أُصدرت {formatDateTime(item.createdAt)} · الرسوم {formatMoney(item.feeMinor, item.currency)}
              </p>
            </ConsoleCard>
          ))}
        </div>
      ) : null}
    </div>
  );
}
