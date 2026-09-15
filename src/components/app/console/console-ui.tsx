/**
 * محفظة الجنوب — عناصر واجهة اللوحة المشتركة (8-d)
 * بطاقات، رؤوس أقسام، جداول RTL بمعايير العقد (صفوف 14px / رؤوس overline 11px /
 * تمرير داخلي رفيع gold-scroll / hover #F7F6F2 / EmptyState / Skeleton)
 * + شرائح مخصصة لحالات المستخدمين والوكلاء والأدوار (خارج مكونات 8-b المشتركة).
 */
"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, Skeleton } from "@/components/app/ui";

// يعاد تصدير Skeleton لتسهيل الاستيراد الموحد من وحدة اللوحة
export { Skeleton };
import { formatMoney } from "@/lib/api-types";
import type { ApiError } from "@/lib/api";
import type { CurrencyCode } from "@/lib/api-types";
import { RefreshCw } from "lucide-react";

// ============ بطاقات ورؤوس ============

/** بطاقة سطح أبيض بحد ناعم وظل خفيف */
export function ConsoleCard({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[#E8E6E1] bg-white shadow-[0_1px_3px_rgba(11,11,12,0.04)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** رأس القسم: العنوان + الشرح + زر تحديث اختياري */
export function SectionHeader({
  title,
  description,
  onRefresh,
  refreshing,
  children,
}: {
  title: string;
  description?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2.5 text-[20px] font-extrabold leading-7 text-[#0B0B0C]">
          <span aria-hidden="true" className="h-5 w-1.5 rounded-full bg-[#C9A227]" />
          {title}
        </h2>
        {description ? (
          <p className="mt-1 pr-4 text-[13px] font-medium leading-6 text-[#5C5A56]">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {children}
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            title="إعادة جلب البيانات"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E8E6E1] bg-white text-[#5C5A56] transition-colors hover:border-[#C9A227]/60 hover:text-[#8A6E14]"
          >
            <RefreshCw
              strokeWidth={1.75}
              className={cn("h-4 w-4", refreshing && "animate-spin text-[#C9A227]")}
            />
          </button>
        ) : null}
      </div>
    </header>
  );
}

/** بطاقة KPI: تسمية overline + قيمة كبيرة tabular-nums */
export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "gold" | "pending" | "error" | "success";
}) {
  const toneText = {
    default: "text-[#141416]",
    gold: "text-[#8A6E14]",
    pending: "text-[#B45309]",
    error: "text-[#B91C1C]",
    success: "text-[#15803D]",
  }[tone];
  return (
    <ConsoleCard className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold leading-4 text-[#8A8783]">{label}</p>
        <p className={cn("mt-1.5 text-[22px] font-extrabold leading-8 tabular-nums", toneText)}>
          {value}
        </p>
        {hint ? <p className="mt-0.5 text-[12px] font-medium text-[#A3A09B]">{hint}</p> : null}
      </div>
      {icon ? (
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#C9A227]/10 text-[#C9A227]"
        >
          {icon}
        </span>
      ) : null}
    </ConsoleCard>
  );
}

/** مبلغ بعملته بخط tabular (سطر واحد، بلا التفاف) */
export function MoneyText({
  minor,
  currency,
  className,
  signed,
}: {
  minor: number;
  currency: CurrencyCode;
  className?: string;
  signed?: "DEBIT" | "CREDIT";
}) {
  const text = formatMoney(minor, currency);
  return (
    <span
      dir="rtl"
      className={cn(
        "whitespace-nowrap tabular-nums font-semibold",
        signed === "DEBIT" ? "text-[#B91C1C]" : signed === "CREDIT" ? "text-[#15803D]" : null,
        className,
      )}
    >
      {signed === "DEBIT" ? `− ${text}` : signed === "CREDIT" ? `+ ${text}` : text}
    </span>
  );
}

// ============ شرائح مخصصة ============

const CHIP_TONES = {
  success: "border-[#15803D]/20 bg-[#15803D]/10 text-[#15803D]",
  pending: "border-[#B45309]/25 bg-[#B45309]/10 text-[#B45309]",
  error: "border-[#B91C1C]/25 bg-[#B91C1C]/10 text-[#B91C1C]",
  muted: "border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]",
  gold: "border-[#C9A227]/35 bg-[#C9A227]/10 text-[#8A6E14]",
} as const;

export type ChipTone = keyof typeof CHIP_TONES;

/** شريحة صغيرة (11px) بنص عربي — لحالات المستخدمين/الأدوار/مستويات KYC */
export function ConsoleChip({
  tone,
  children,
  className,
}: {
  tone: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4 whitespace-nowrap",
        CHIP_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const USER_STATUS_LABELS: Record<string, string> = {
  PENDING: "قيد التفعيل",
  ACTIVE: "نشط",
  FROZEN: "مجمّد",
  CLOSED: "مغلق",
};

export function UserStatusChip({ status }: { status: string }) {
  const tone: ChipTone =
    status === "ACTIVE" ? "success" : status === "FROZEN" ? "error" : status === "PENDING" ? "pending" : "muted";
  return <ConsoleChip tone={tone}>{USER_STATUS_LABELS[status] ?? status}</ConsoleChip>;
}

export function AgentStatusChip({ status }: { status: "ACTIVE" | "SUSPENDED" }) {
  return status === "ACTIVE" ? (
    <ConsoleChip tone="success">مفعّل</ConsoleChip>
  ) : (
    <ConsoleChip tone="error">معلّق</ConsoleChip>
  );
}

export function KycLevelChip({ level }: { level: string }) {
  return level === "VERIFIED" ? (
    <ConsoleChip tone="success">موثّق</ConsoleChip>
  ) : (
    <ConsoleChip tone="muted">بدون توثيق</ConsoleChip>
  );
}

// ============ تبويبات رقائق ============

export interface PillTabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** صف تبويبات رقائق ذهبية (فئات KYC / قواعد التشغيل / التذاكر) */
export function PillTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: PillTabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn("flex flex-wrap items-center gap-1.5 rounded-2xl border border-[#E8E6E1] bg-white p-1.5", className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "flex min-h-9 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-bold transition-colors",
              active
                ? "bg-[#C9A227]/[0.16] text-[#8A6E14] shadow-[inset_0_0_0_1px_rgba(201,162,39,0.35)]"
                : "text-[#5C5A56] hover:bg-[#F7F6F2]",
            )}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[11px] font-bold tabular-nums",
                  active ? "bg-[#C9A227]/25 text-[#705908]" : "bg-[#F1EFEA] text-[#8A8783]",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ============ الجدول الموحد ============

export interface Column<T> {
  key: string;
  header: string;
  /** عرض min للعمود عند الحاجة (Tailwind w-*) */
  widthClass?: string;
  align?: "start" | "end" | "center";
  render: (row: T) => ReactNode;
}

/**
 * جدول اللوحة القياسي: رؤوس overline لاصقة، صفوف 14px، hover #F7F6F2،
 * تمرير داخلي max-h بشريط رفيع، هياكل تحميل، فراغ، وخطأ — مع تذييل اختياري.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  footer,
  maxHeightClass = "max-h-[520px]",
  minWidthClass = "min-w-[760px]",
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[] | null;
  rowKey: (row: T, index: number) => string;
  loading: boolean;
  error: ApiError | null;
  onRetry?: () => void;
  emptyTitle: string;
  emptyDescription?: string;
  footer?: ReactNode;
  maxHeightClass?: string;
  minWidthClass?: string;
  /** نقر الصف (فتح تفاصيل) — يضيف مؤشر تفاعل ودعم لوحة المفاتيح */
  onRowClick?: (row: T) => void;
}) {
  const alignClass = (a?: Column<T>["align"]) =>
    a === "end" ? "text-left" : a === "center" ? "text-center" : "text-right";

  return (
    <ConsoleCard className="overflow-hidden">
      <div className={cn("gold-scroll overflow-auto", maxHeightClass)}>
        <table className={cn("w-full border-collapse", minWidthClass)}>
          <thead className="sticky top-0 z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "border-b border-[#E8E6E1] bg-[#FAF9F6] px-4 py-2.5 text-[11px] font-semibold leading-4 text-[#8A8783] whitespace-nowrap",
                    alignClass(col.align),
                    col.widthClass,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (!rows || rows.length === 0)
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="border-b border-[#F0EEE9]">
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3">
                        <Skeleton
                          className={cn("h-4", i % 3 === 0 ? "w-3/5" : "w-4/5")}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : null}
            {!loading && error && (!rows || rows.length === 0) ? (
              <tr>
                <td colSpan={columns.length} className="p-2">
                  <ErrorState
                    compact
                    message={error.message}
                    code={error.code}
                    onRetry={onRetry}
                    onSupport={undefined}
                  />
                </td>
              </tr>
            ) : null}
            {!loading && !error && rows && rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-2">
                  <EmptyState compact title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : null}
            {rows && rows.length > 0 && (loading || !error)
              ? rows.map((row, i) => (
                  <tr
                    key={rowKey(row, i)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === "Enter") onRowClick(row);
                          }
                        : undefined
                    }
                    className={cn(
                      "group border-b border-[#F0EEE9] transition-colors last:border-b-0 hover:bg-[#F7F6F2]",
                      onRowClick && "cursor-pointer focus:bg-[#F7F6F2] focus:outline-none",
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-4 py-2.5 text-[14px] leading-6 text-[#141416]",
                          alignClass(col.align),
                          "whitespace-nowrap",
                        )}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
      {footer ? <div className="border-t border-[#E8E6E1] bg-[#FCFBF9] px-4 py-2.5">{footer}</div> : null}
    </ConsoleCard>
  );
}

// ============ شريط الفلاتر ============

/** حقل بحث بخطاف تكبير */
export function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#E8E6E1] bg-white px-3 text-[13px] focus-within:border-[#C9A227]/70",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        className="h-4 w-4 shrink-0 text-[#A3A09B]"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[#141416] outline-none placeholder:text-[#A3A09B]"
      />
    </label>
  );
}

/** قائمة اختيار أصلية بتنسيق اللوحة */
export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex h-10 items-center gap-2 rounded-xl border border-[#E8E6E1] bg-white px-3 transition-colors focus-within:border-[#C9A227]/70",
        className,
      )}
    >
      <span className="shrink-0 text-[11px] font-semibold text-[#8A8783]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="min-w-0 cursor-pointer appearance-none bg-transparent text-[13px] font-bold text-[#141416] outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-3.5 w-3.5 shrink-0 text-[#A3A09B]"
      >
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}

// ============ أزرار اللوحة ============

/** زر إجراء أساسي (ذهبي داكن) */
export function ConsoleButton({
  children,
  onClick,
  variant = "primary",
  disabled,
  loading,
  size = "md",
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "gold";
  disabled?: boolean;
  loading?: boolean;
  size?: "sm" | "md";
  className?: string;
  title?: string;
}) {
  const variants = {
    primary:
      "bg-[#0B0B0C] text-white hover:bg-[#1A1A1C] disabled:hover:bg-[#0B0B0C] border-transparent",
    gold: "bg-[#C9A227] text-[#1C1710] hover:bg-[#D4B54A] border-transparent font-extrabold",
    ghost:
      "bg-white text-[#5C5A56] border-[#E8E6E1] hover:border-[#C9A227]/60 hover:text-[#8A6E14]",
    danger: "bg-white text-[#B91C1C] border-[#B91C1C]/25 hover:bg-[#B91C1C]/[0.06]",
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl border font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "min-h-8 px-3 text-[12px]" : "min-h-10 px-4 text-[13px]",
        variants,
        className,
      )}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}

/** زر "تحميل المزيد" لتذييل الجداول المرقّمة بمؤشر */
export function LoadMoreFooter({
  count,
  nextCursor,
  loading,
  onLoadMore,
}: {
  count: number;
  nextCursor: string | null;
  loading: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[12px] font-medium text-[#8A8783] tabular-nums">
        {count} {nextCursor ? "سجلاً معروضاً" : "سجلاً — النهاية"}
      </p>
      {nextCursor ? (
        <ConsoleButton variant="ghost" size="sm" loading={loading} onClick={onLoadMore}>
          {loading ? "جارٍ التحميل…" : "تحميل المزيد"}
        </ConsoleButton>
      ) : null}
    </div>
  );
}
