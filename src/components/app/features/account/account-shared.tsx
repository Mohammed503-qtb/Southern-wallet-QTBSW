/**
 * محفظة الجنوب — مكونات مساعدة مشتركة لشاشات الحساب (8-c-2)
 * SettingRow (صف إعداد/رابط)، PillTabs (شرائح فلاتر)، SectionCard (بطاقة قسم)،
 * FieldLabel + TextField + TextArea (حقول موحّدة) و downloadTextFile (تنزيل blob).
 * الهوية البصرية من SCREENS_FLOWS §2.1 — لا أزرق إطلاقاً، لمس ≥44px.
 */
"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** صف إعدادات/رابط: أيقونة بدائرة دافئة + عنوان + وصف اختياري + قيمة أو سهم */
export function SettingRow({
  icon: Icon,
  title,
  subtitle,
  onClick,
  trailing,
  chevron = true,
  danger = false,
  disabled = false,
  className,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  onClick?: () => void;
  /** عنصر طرف (Switch/شريحة) — يلغي السهم */
  trailing?: ReactNode;
  chevron?: boolean;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const inner = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border",
          danger
            ? "border-[#B91C1C]/15 bg-[#B91C1C]/[0.06] text-[#B91C1C]"
            : "border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]",
        )}
      >
        <Icon strokeWidth={1.5} className="h-5 w-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-right">
        <span
          className={cn(
            "w-full truncate text-[15px] font-semibold leading-5",
            danger ? "text-[#B91C1C]" : "text-[#141416]",
          )}
        >
          {title}
        </span>
        {subtitle ? (
          <span className="w-full truncate text-[12px] font-medium text-[#5C5A56]">
            {subtitle}
          </span>
        ) : null}
      </span>
      {trailing}
      {chevron && !trailing ? (
        <ChevronLeft strokeWidth={1.5} className="h-4 w-4 shrink-0 text-[#A3A09B]" />
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "flex min-h-[60px] w-full items-center gap-3 rounded-2xl border border-[#E8E6E1]/70 bg-white p-3 text-right transition-colors",
          danger
            ? "hover:border-[#B91C1C]/35 hover:bg-[#B91C1C]/[0.03]"
            : "hover:border-[#C9A227]/40 hover:bg-[#FDFCFA] active:bg-[#F7F6F2]",
          disabled && "opacity-50",
          className,
        )}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-[60px] w-full items-center gap-3 rounded-2xl border border-[#E8E6E1]/70 bg-white p-3 text-right",
        className,
      )}
    >
      {inner}
    </div>
  );
}

/** بطاقة قسم بيضاء بعنوان صغير وخط ذهبي علوي رفيع */
export function SectionCard({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-[#E8E6E1] bg-white shadow-[0_2px_8px_rgba(11,11,12,0.03)]",
        className,
      )}
    >
      {title ? (
        <header className="flex items-center justify-between gap-2 border-b border-[#E8E6E1]/70 px-4 py-3">
          <h2 className="text-[14px] font-bold text-[#141416]">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className="p-3">{children}</div>
    </section>
  );
}

export interface PillOption<T extends string> {
  value: T;
  label: string;
}

/** شرائح فلاتر pill أفقية (الكل/دخل/خرج…) — قيمة واحدة نشطة */
export function PillTabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: PillOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex items-center gap-2", className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-full border px-4 text-[13px] font-bold transition-colors",
              active
                ? "border-[#0B0B0C] bg-[#0B0B0C] text-white"
                : "border-[#E8E6E1] bg-white text-[#5C5A56] hover:border-[#C9A227]/50 hover:text-[#141416]",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** تسمية حقل موحّدة */
export function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[11px] font-semibold text-[#5C5A56]">
      {children}
      {hint ? <span className="font-medium text-[#A3A09B]"> · {hint}</span> : null}
    </label>
  );
}

const FIELD_CLASS =
  "h-[52px] w-full rounded-xl border border-[#E8E6E1] bg-white px-4 text-[15px] font-semibold text-[#141416] placeholder:font-medium placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:outline-none disabled:opacity-60";

/** حقل نص موحّد (52px — لمس مريح) */
export function TextField({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  dir,
  disabled,
  maxLength,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "text" | "numeric" | "tel" | "decimal";
  dir?: "ltr" | "rtl";
  disabled?: boolean;
  maxLength?: number;
}) {
  return (
    <input
      id={id}
      type={type}
      inputMode={inputMode}
      dir={dir}
      value={value}
      maxLength={maxLength}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={FIELD_CLASS}
    />
  );
}

/** مربع نص متعدد الأسطر موحّد */
export function TextArea({
  id,
  value,
  onChange,
  placeholder,
  rows = 4,
  disabled,
  maxLength,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  maxLength?: number;
}) {
  return (
    <textarea
      id={id}
      rows={rows}
      value={value}
      maxLength={maxLength}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full resize-none rounded-xl border border-[#E8E6E1] bg-white px-4 py-3 text-[15px] font-semibold leading-7 text-[#141416] placeholder:font-medium placeholder:text-[#A3A09B] focus:border-[#C9A227] focus:outline-none disabled:opacity-60"
    />
  );
}

/** تنزيل ملف نصي عبر Blob (يستعمله كشف CSV ووثائق .md) */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/plain;charset=utf-8",
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** ملصقات حالة المستخدم (PENDING/ACTIVE/FROZEN/CLOSED) — عربية */
export const USER_STATUS_LABELS: Record<string, string> = {
  PENDING: "قيد التفعيل",
  ACTIVE: "نشط",
  FROZEN: "مجمّد",
  CLOSED: "مغلق",
};

/** ملصقات فئات التذاكر (كما في H2) — عربية */
export const TICKET_CATEGORY_LABELS: Record<string, string> = {
  PAYMENT: "دفع",
  TRANSFER: "تحويل",
  REMITTANCE: "حوالة",
  KYC: "توثيق",
  ACCOUNT: "حساب",
  OTHER: "أخرى",
};

/** ملصق حالة التذكرة عربية (OPEN/IN_PROGRESS/RESOLVED) */
export const TICKET_STATUS_LABELS: Record<string, string> = {
  OPEN: "مفتوحة",
  IN_PROGRESS: "قيد المعالجة",
  RESOLVED: "تم الحل",
};
