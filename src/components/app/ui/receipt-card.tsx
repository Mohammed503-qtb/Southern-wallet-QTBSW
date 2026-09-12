/**
 * محفظة الجنوب — المكون القياسي 6/10: بطاقة الإيصال (ReceiptCard)
 * بطاقة بيضاء بحد ذهبي علوي رفيع: المرجع SW-… بخط tabular، الأطراف،
 * شبكة الحقول (المبلغ/الرسوم/الإجمالي/العملة/الحالة/التاريخ)،
 * QR تحقق (GET /api/qr)، زر مشاركة (navigator.share مع سقوط للنسخ)،
 * وزر "الإبلاغ عن مشكلة" يفتح شاشة تذكرة جديدة مرتبطة بالمرجع.
 * لا يعرض PIN أبداً (Master §60) — هذا المكون لا يقبل أي حقل سري أصلاً.
 */
"use client";

import { LifeBuoy, Share2 } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "@/lib/app-store";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { StatusChip } from "./status-chip";
import { formatDateTime } from "./utils";

export interface ReceiptField {
  label: string;
  value: string;
  /** إبراز القيمة (المبالغ الكبرى) */
  strong?: boolean;
}

export interface ReceiptParty {
  label: string;
  value: string;
}

export interface ReceiptCardProps {
  /** المرجع الرسمي SW-YYYYMMDD-XXXXXXXX (أو RM/CW/TK…) */
  reference: string;
  title?: string;
  /** الأطراف: من/إلى (اسم أو رقم مقنّع) */
  parties?: ReceiptParty[];
  /** شبكة الحقول: المبلغ/الرسوم/الإجمالي/العملة… */
  fields: ReceiptField[];
  /** كود الحالة الخام (COMPLETED…) — اختياري */
  status?: string;
  /** وقت العملية (ISO) */
  createdAt?: string;
  /** حمولة QR — افتراضياً المرجع نفسه */
  qrPayload?: string;
  /** نص المشاركة — افتراضياً سطر المرجع */
  shareText?: string;
  /** فتح تذكرة مرتبطة (الافتراضي: navigate('ticket-new', { ref })) */
  onReportProblem?: () => void;
  className?: string;
}

export function ReceiptCard({
  reference,
  title = "إيصال عملية",
  parties,
  fields,
  status,
  createdAt,
  qrPayload,
  shareText,
  onReportProblem,
  className,
}: ReceiptCardProps) {
  const navigate = useAppStore((s) => s.navigate);
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    const text =
      shareText ??
      `${title} — المرجع ${reference} — محفظة الجنوب (Alpha تجريبي)`;
    setSharing(true);
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        try {
          await navigator.share({ title: "محفظة الجنوب", text });
          return;
        } catch {
          // أُلغيت المشاركة أو فشلت — نسقط للنسخ
        }
      }
      await navigator.clipboard.writeText(text);
      toast({ title: "تم نسخ تفاصيل الإيصال", description: text });
    } catch {
      toast({
        title: "تعذّرت المشاركة",
        description: "انسخ المرجع يدوياً من البطاقة",
        variant: "destructive",
      });
    } finally {
      setSharing(false);
    }
  };

  const qrSrc = `/api/qr?text=${encodeURIComponent(qrPayload ?? reference)}&size=152`;

  return (
    <article
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-[#E8E6E1] bg-white shadow-[0_2px_8px_rgba(11,11,12,0.04)]",
        className,
      )}
    >
      {/* الحد الذهبي العلوي الرفيع */}
      <div aria-hidden="true" className="h-[3px] w-full bg-[#C9A227]" />

      <div className="p-4">
        <header className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-bold text-[#5C5A56]">{title}</h3>
          {status ? <StatusChip status={status} /> : null}
        </header>

        {/* المرجع الرسمي */}
        <p
          dir="ltr"
          className="mt-2 text-center text-[17px] font-bold tabular-nums tracking-wide text-[#141416]"
        >
          {reference}
        </p>

        {/* الأطراف */}
        {parties && parties.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-[#F7F6F2] p-3 sm:grid-cols-2">
            {parties.map((p) => (
              <div key={p.label} className="min-w-0">
                <p className="text-[11px] font-semibold text-[#A3A09B]">{p.label}</p>
                <p className="truncate text-[14px] font-semibold text-[#141416]">
                  {p.value}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {/* شبكة الحقول */}
        <dl className="mt-3 divide-y divide-[#E8E6E1]/70">
          {fields.map((f) => (
            <div key={f.label} className="flex items-center justify-between gap-3 py-2">
              <dt className="text-[13px] font-medium text-[#5C5A56]">{f.label}</dt>
              <dd
                dir="auto"
                className={cn(
                  "tabular-nums",
                  f.strong
                    ? "text-[16px] font-extrabold text-[#141416]"
                    : "text-[14px] font-semibold text-[#141416]",
                )}
              >
                {f.value}
              </dd>
            </div>
          ))}
          {createdAt ? (
            <div className="flex items-center justify-between gap-3 py-2">
              <dt className="text-[13px] font-medium text-[#5C5A56]">التاريخ والوقت</dt>
              <dd className="text-[13px] font-medium tabular-nums text-[#141416]">
                {formatDateTime(createdAt)}
              </dd>
            </div>
          ) : null}
        </dl>

        {/* QR تحقق */}
        <div className="mt-3 flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-[#E8E6E1] p-3">
          <img
            src={qrSrc}
            alt={`رمز تحقق ${reference}`}
            width={120}
            height={120}
            className="h-[120px] w-[120px] rounded-lg bg-white"
          />
          <p className="text-[11px] font-medium text-[#A3A09B]">
            امسح الرمز للتحقق من العملية
          </p>
        </div>

        {/* الإجراءات */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleShare()}
            disabled={sharing}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0B0B0C] px-3 text-[14px] font-bold text-white transition-colors hover:bg-[#1A1A1C] disabled:opacity-60"
          >
            <Share2 strokeWidth={1.5} className="h-4 w-4" />
            مشاركة
          </button>
          <button
            type="button"
            onClick={
              onReportProblem ??
              (() => navigate("ticket-new", { ref: reference }))
            }
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E8E6E1] bg-white px-3 text-[14px] font-bold text-[#5C5A56] transition-colors hover:border-[#B91C1C]/40 hover:text-[#B91C1C]"
          >
            <LifeBuoy strokeWidth={1.5} className="h-4 w-4" />
            الإبلاغ عن مشكلة
          </button>
        </div>
      </div>
    </article>
  );
}
