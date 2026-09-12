/**
 * محفظة الجنوب — حوارات تأكيد اللوحة (8-d)
 * كل إجراء إداري حساس يمر عبر ReasonDialog: شرح + صفوف قديم→جديد اختيارية +
 * حقل سبب إلزامي (Master §141 + R-05) + حالة انشغال وخطأ الخادم داخل الحوار.
 * WarningBox: تحذير كهرماني (مثل §139 لتفعيل خدمة بلا تكامل حقيقي).
 */
"use client";

import { useEffect, useState, type ReactNode } from "react";

import { AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConsoleButton } from "./console-ui";
import type { ApiError } from "@/lib/api";

function DialogShell({
  title,
  icon,
  children,
  onClose,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  onClose: () => void;
}) {
  // إغلاق بزر Escape — إمكانية وصول
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="absolute inset-0 z-50 flex items-center justify-center bg-[#0B0B0C]/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sw-fade-in max-h-full w-full max-w-[560px] overflow-y-auto gold-scroll rounded-2xl border border-[#E8E6E1] bg-white shadow-[0_24px_60px_rgba(11,11,12,0.25)]">
        <header className="flex items-center gap-3 border-b border-[#F0EEE9] px-5 py-4">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C9A227]/10 text-[#8A6E14]"
          >
            {icon}
          </span>
          <h3 className="text-[16px] font-extrabold leading-6 text-[#0B0B0C]">{title}</h3>
        </header>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/** صفوف ملخص "القيمة القديمة → الجديدة" قبل الحفظ */
export function OldNewRow({ label, old: oldValue, new: newValue }: { label: string; old: ReactNode; new: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E8E6E1] bg-[#FAF9F6] px-3 py-2 text-[13px]">
      <span className="font-semibold text-[#5C5A56]">{label}</span>
      <span className="flex items-center gap-2">
        <span className="tabular-nums font-semibold text-[#8A8783] line-through decoration-[#B91C1C]/40">
          {oldValue}
        </span>
        <span aria-hidden="true" className="text-[#C9A227]">←</span>
        <span className="tabular-nums font-extrabold text-[#141416]">{newValue}</span>
      </span>
    </div>
  );
}

/** صندوق تحذير كهرماني (§139 وأمثاله) */
export function WarningBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-[#B45309]/25 bg-[#B45309]/[0.07] px-3.5 py-2.5 text-[13px] font-semibold leading-6 text-[#B45309]">
      <AlertTriangle strokeWidth={1.75} className="mt-1 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export interface ReasonDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  /** صفوف قديم→جديد تُعرض فوق حقل السبب */
  oldNewRows?: ReactNode;
  warning?: ReactNode;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** افتراضياً السبب إلزامي؛ false لجعله اختيارياً (اعتماد KYC) */
  reasonOptional?: boolean;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger" | "gold";
  busy?: boolean;
  error?: ApiError | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function ReasonDialog({
  open,
  title,
  description,
  oldNewRows,
  warning,
  reasonLabel = "سبب الإجراء (إلزامي — يُسجَّل في التدقيق)",
  reasonPlaceholder = "اكتب سبباً واضحاً لا يقل عن 3 أحرف…",
  reasonOptional = false,
  confirmLabel,
  confirmVariant = "primary",
  busy,
  error,
  onConfirm,
  onCancel,
}: ReasonDialogProps) {
  const [reason, setReason] = useState("");
  // إعادة تعيين السبب عند فتح الحوار (نمط "ضبط الحالة عند تغيّر الخاصية" الرسمي)
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason("");
  }

  if (!open) return null;

  const trimmed = reason.trim();
  const canConfirm = !busy && (reasonOptional || trimmed.length >= 3);

  return (
    <DialogShell title={title} icon={<ShieldAlert strokeWidth={1.5} className="h-5 w-5" />} onClose={busy ? () => undefined : onCancel}>
      <div className="flex flex-col gap-3">
        {description ? (
          <div className="text-[13.5px] font-medium leading-6 text-[#5C5A56]">{description}</div>
        ) : null}
        {warning ? <WarningBox>{warning}</WarningBox> : null}
        {oldNewRows ? <div className="flex flex-col gap-2">{oldNewRows}</div> : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-bold text-[#141416]">
            {reasonLabel}
            {reasonOptional ? " (اختياري)" : ""}
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={reasonPlaceholder}
            rows={3}
            disabled={busy}
            className={cn(
              "w-full resize-none rounded-xl border border-[#E8E6E1] bg-[#FAF9F6] px-3 py-2.5 text-[13.5px] font-medium leading-6 text-[#141416] outline-none transition-colors placeholder:text-[#A3A09B] focus:border-[#C9A227]/70 focus:bg-white",
            )}
          />
          {!reasonOptional && trimmed.length > 0 && trimmed.length < 3 ? (
            <span className="text-[11.5px] font-semibold text-[#B91C1C]">السبب قصير جداً — 3 أحرف على الأقل.</span>
          ) : null}
        </label>

        {error ? (
          <div className="rounded-xl border border-[#B91C1C]/25 bg-[#B91C1C]/[0.06] px-3.5 py-2.5 text-[13px] font-semibold leading-6 text-[#B91C1C]">
            {error.message}
            {error.code ? (
              <span dir="ltr" className="ms-2 text-[11px] tabular-nums opacity-80">
                {error.code}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-row-reverse items-center justify-start gap-2 pt-1">
          <ConsoleButton
            variant={confirmVariant === "danger" ? "primary" : confirmVariant === "gold" ? "gold" : "primary"}
            onClick={() => canConfirm && onConfirm(trimmed)}
            disabled={!canConfirm}
            loading={busy}
            className={confirmVariant === "danger" ? "bg-[#B91C1C] hover:bg-[#991B1B] disabled:hover:bg-[#B91C1C]" : undefined}
          >
            {confirmLabel}
          </ConsoleButton>
          <ConsoleButton variant="ghost" onClick={onCancel} disabled={busy}>
            إلغاء
          </ConsoleButton>
        </div>
      </div>
    </DialogShell>
  );
}

/** حوار إدخال رمز (إتمام عملية نقدية G3) */
export function CodeInputDialog({
  open,
  title,
  description,
  inputLabel,
  placeholder,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  inputLabel: string;
  placeholder?: string;
  confirmLabel: string;
  busy?: boolean;
  error?: ApiError | null;
  onConfirm: (code: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  // إعادة تعيين الرمز عند فتح الحوار (نمط "ضبط الحالة عند تغيّر الخاصية" الرسمي)
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setCode("");
  }

  if (!open) return null;
  const canConfirm = !busy && code.trim().length > 0;

  return (
    <DialogShell title={title} icon={<ShieldAlert strokeWidth={1.5} className="h-5 w-5" />} onClose={busy ? () => undefined : onCancel}>
      <div className="flex flex-col gap-3">
        {description ? (
          <div className="text-[13.5px] font-medium leading-6 text-[#5C5A56]">{description}</div>
        ) : null}
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-bold text-[#141416]">{inputLabel}</span>
          <input
            dir="ltr"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 8))}
            placeholder={placeholder}
            disabled={busy}
            className="w-full rounded-xl border border-[#E8E6E1] bg-[#FAF9F6] px-3 py-2.5 text-center text-[18px] font-extrabold tracking-[0.3em] tabular-nums text-[#141416] outline-none transition-colors placeholder:text-[#A3A09B] focus:border-[#C9A227]/70 focus:bg-white"
          />
        </label>
        {error ? (
          <div className="rounded-xl border border-[#B91C1C]/25 bg-[#B91C1C]/[0.06] px-3.5 py-2.5 text-[13px] font-semibold leading-6 text-[#B91C1C]">
            {error.message}
            {error.code ? (
              <span dir="ltr" className="ms-2 text-[11px] tabular-nums opacity-80">
                {error.code}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-row-reverse items-center justify-start gap-2 pt-1">
          <ConsoleButton variant="gold" onClick={() => canConfirm && onConfirm(code.trim())} disabled={!canConfirm} loading={busy}>
            {confirmLabel}
          </ConsoleButton>
          <ConsoleButton variant="ghost" onClick={onCancel} disabled={busy}>
            إلغاء
          </ConsoleButton>
        </div>
      </div>
    </DialogShell>
  );
}
