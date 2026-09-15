/**
 * محفظة الجنوب — المشتركات المالية لشاشات المال (8-c-1)
 * ---------------------------------------------------------
 * أدوات ومكونات موحّدة تخدم نمط الالتزام المالي الحاكم (R-10):
 * إدخال → اقتباس → بطاقة مراجعة → PIN → تنفيذ بمفتاح Idempotency → نتيجة.
 * تُستعمل في: التحويل، الصرف بين المحافظ، الحوالات، النقدي، الحصالة.
 */

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronLeft, Copy, TriangleAlert } from "lucide-react";
import { api, ApiError, beginMoneyAttempt, clearMoneyAttempt, reuseMoneyKey } from "@/lib/api";
import type { CurrencyCode } from "@/lib/api-types";
import { CURRENCY_META } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { PINPad } from "@/components/app/ui/pin-pad";
import { LogoLoader } from "@/components/app/ui/logo-loader";
import { formatDateTime } from "@/components/app/ui/utils";

// ============================================================
// أدوات مالية خالصة
// ============================================================

/** تحويل نص المبلغ المدخل (أرقام + فاصلة اختيارية) إلى وحدات فرعية — null عند البطلان */
export function parseAmountToMinor(value: string, currency: CurrencyCode): number | null {
  const clean = value.trim().replace(/,/g, "");
  if (clean === "" || clean === ".") return null;
  const num = Number(clean);
  if (!Number.isFinite(num) || num <= 0) return null;
  const minor = Math.round(num * Math.pow(10, CURRENCY_META[currency].decimals));
  if (!Number.isSafeInteger(minor) || minor <= 0) return null;
  return minor;
}

/** تحويل وحدات فرعية إلى نص حقل إدخال (بلا فواصل آلاف) */
export function minorToAmountInput(minor: number, currency: CurrencyCode): string {
  const decimals = CURRENCY_META[currency].decimals;
  const major = minor / Math.pow(10, decimals);
  return decimals === 0
    ? String(major)
    : String(Number(major.toFixed(decimals)));
}

/** استخراج كود ورسالة من خطأ API (أو خطأ غير معروف) */
export function errInfo(err: unknown): { code: string; message: string } {
  if (err instanceof ApiError) return { code: err.code, message: err.message };
  return { code: "SYS-001", message: "حدث خطأ غير متوقع — حاول مجدداً" };
}

/**
 * تنفيذ POST مالي بمفتاح Idempotency مع دعم AC-04:
 * أول محاولة تحفظ المفتاح؛ إن فشلت بسبب انقطاع الشبكة (NET-000)
 * تُعاد المحاولة التالية بنفس المفتاح وبنفس الحمولة تلقائياً.
 */
export async function postMoney<T>(url: string, body: unknown): Promise<T> {
  let key = reuseMoneyKey(url, body);
  if (!key) key = beginMoneyAttempt(url, body);
  try {
    const data = await api.post<T>(url, body, { idempotencyKey: key });
    clearMoneyAttempt();
    return data;
  } catch (err) {
    // انقطاع الشبكة: نُبقي المحاولة لإعادة استخدام المفتاح (AC-04)
    if (err instanceof ApiError && err.code === "NET-000") throw err;
    clearMoneyAttempt();
    throw err;
  }
}

/** تعمية الاسم الكامل للعرض: "أحمد سعيد" → "أح*** س." (Master §19) */
export function maskFullName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return fullName;
  const first = words[0];
  const maskedFirst = `${first.slice(0, 2)}***`;
  const lastInitial = words.length > 1 ? ` ${words[words.length - 1].charAt(0)}.` : "";
  return `${maskedFirst}${lastInitial}`;
}

/** تنسيق سعر الصرف للعرض: 521 → "521"، 0.00192 → "0.00192" */
export function formatRateValue(rate: number): string {
  if (rate >= 100) return rate.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (rate >= 1) return rate.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return rate.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** الوقت المتبقي حتى تاريخ ISO بنص عربي ("٣ ساعات") أو null */
export function timeLeftLabel(iso: string): string | null {
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return "منتهية";
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days.toLocaleString("en-US")} يوم`;
  if (hours > 0) return `${hours.toLocaleString("en-US")} ساعة`;
  if (minutes > 0) return `${minutes.toLocaleString("en-US")} دقيقة`;
  return "أقل من دقيقة";
}

// ============================================================
// مكونات عرض مشتركة
// ============================================================

/** صف مراجعة واحد: تسمية يمين + قيمة يسار (RTL) */
export function ReviewRow({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
  /** لون خاص للقيمة (success/error/pending) */
  tone?: "success" | "error" | "pending" | "gold";
}) {
  const toneClass =
    tone === "success"
      ? "text-[#15803D]"
      : tone === "error"
        ? "text-[#B91C1C]"
        : tone === "pending"
          ? "text-[#B45309]"
          : tone === "gold"
            ? "text-[#8A6E14]"
            : "text-[#141416]";
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="shrink-0 text-[13px] font-medium text-[#5C5A56]">{label}</dt>
      <dd
        dir="auto"
        className={cn(
          "min-w-0 text-right tabular-nums",
          strong ? "text-[17px] font-extrabold" : "text-[14px] font-semibold",
          toneClass,
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** بطاقة مراجعة موحّدة: حد ذهبي علوي + صفوف + ملاحظة سفلية اختيارية */
export function ReviewCard({
  title,
  rows,
  note,
  children,
  className,
}: {
  title: string;
  rows: { label: string; value: ReactNode; strong?: boolean; tone?: "success" | "error" | "pending" | "gold" }[];
  note?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-[#E8E6E1] bg-white shadow-[0_2px_8px_rgba(11,11,12,0.04)]",
        className,
      )}
    >
      <div aria-hidden="true" className="h-[3px] w-full bg-[#C9A227]" />
      <div className="p-4">
        <h3 className="mb-1 text-center text-[15px] font-bold text-[#141416]">{title}</h3>
        <dl className="divide-y divide-[#E8E6E1]/70">
          {rows.map((r) => (
            <ReviewRow key={r.label} label={r.label} value={r.value} strong={r.strong} tone={r.tone} />
          ))}
        </dl>
        {note ? (
          <div className="mt-3 rounded-xl bg-[#F7F6F2] px-3 py-2.5 text-[12.5px] font-medium leading-5 text-[#5C5A56]">
            {note}
          </div>
        ) : null}
        {children}
      </div>
    </article>
  );
}

/** بانر خطأ مدمج داخل النماذج (يعرض رسالة الخادم + الكود) */
export function InlineErrorBanner({
  error,
  onRetry,
  className,
}: {
  error: { code: string; message: string } | null;
  onRetry?: () => void;
  className?: string;
}) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-[#B91C1C]/25 bg-[#B91C1C]/[0.05] px-3 py-2.5",
        className,
      )}
    >
      <TriangleAlert strokeWidth={1.5} className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#B91C1C]" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold leading-5 text-[#B91C1C]">{error.message}</p>
        <p dir="ltr" className="text-right text-[10.5px] font-medium tabular-nums text-[#B91C1C]/60">
          {error.code}
        </p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 shrink-0 self-center text-[12px] font-bold text-[#B91C1C] underline underline-offset-4"
        >
          إعادة
        </button>
      ) : null}
    </div>
  );
}

/** رأس النتيجة الناجحة: علامة خضراء + عنوان + سطر */
export function SuccessMark({
  title,
  subtitle,
  amount,
}: {
  title: string;
  subtitle?: string;
  amount?: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col items-center py-2 text-center">
      <span
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-full border border-[#15803D]/20 bg-[#15803D]/[0.08] text-[#15803D]"
      >
        <Check strokeWidth={2} className="h-8 w-8" />
      </span>
      <h2 className="mt-3 text-[20px] font-bold leading-7 text-[#141416]">{title}</h2>
      {amount ? (
        <p dir="auto" className="mt-1 text-[24px] font-extrabold leading-8 tabular-nums text-[#0B0B0C]">
          {amount}
        </p>
      ) : null}
      {subtitle ? (
        <p className="mt-1.5 max-w-[300px] text-[13px] font-medium leading-5 text-[#5C5A56]">{subtitle}</p>
      ) : null}
    </div>
  );
}

// ============================================================
// خطوة PIN المشتركة (SC-13)
// ============================================================

export interface PinStepProps {
  /** عنوان العملية الحساسة (مثال: تأكيد تحويل 5,000 ر.ي) */
  contextLabel: string;
  /** الخطأ من آخر محاولة تنفيذ (PIN-001 / PIN-002 / غيره) */
  error: { code: string; message: string; lockSeconds?: number } | null;
  /** جارٍ التنفيذ بعد اكتمال الرمز */
  executing: boolean;
  /** عند اكتمال 6 أرقام → تنفيذ العملية */
  onConfirm: (pin: string) => void;
  /** الرجوع لخطوة المراجعة */
  onCancel: () => void;
  className?: string;
}

/**
 * خطوة تأكيد PIN inline داخل الشاشة (SC-13):
 * PINPad بمحتوى سياقي + معالجة PIN-002 بعدّاد تنازلي + زر رجوع.
 */
export function PinStep({ contextLabel, error, executing, onConfirm, onCancel, className }: PinStepProps) {
  const [pin, setPin] = useState("");
  const [lockLeft, setLockLeft] = useState(0);
  const [prevErrKey, setPrevErrKey] = useState("");

  const errKey = error ? `${error.code}:${error.lockSeconds ?? 0}` : "";

  // تعديل الحالة أثناء العرض عند تغيّر خطأ PIN (نمط React الرسمي بدل setState داخل التأثير):
  // PIN-001 → تصفير الرمز · PIN-002 → عدّاد قفل تنازلي
  if (errKey !== prevErrKey) {
    setPrevErrKey(errKey);
    if (error && error.code === "PIN-002" && (error.lockSeconds ?? 0) > 0) {
      setLockLeft(error.lockSeconds ?? 0);
      setPin("");
    } else if (error) {
      setPin("");
    }
  }

  const isLocked = lockLeft > 0;
  useEffect(() => {
    if (!isLocked) return;
    const t = setInterval(() => setLockLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [isLocked]);

  return (
    <div className={cn("w-full", className)}>
      <div className="rounded-2xl border border-[#E8E6E1] bg-white p-4 shadow-[0_2px_8px_rgba(11,11,12,0.04)]">
        <p className="mb-1 text-center text-[15px] font-bold leading-6 text-[#141416]">{contextLabel}</p>
        <p className="mb-2 text-center text-[12px] font-medium text-[#A3A09B]">
          أدخل رمز PIN المكوّن من 6 أرقام لإتمام العملية
        </p>
        {executing ? (
          <LogoLoader size={56} label="جارٍ تنفيذ العملية…" className="py-5" />
        ) : (
          <PINPad
            pin={pin}
            onChange={setPin}
            onComplete={(p) => onConfirm(p)}
            error={error && error.code !== "PIN-002" ? error.message : null}
            lockSeconds={lockLeft > 0 ? lockLeft : undefined}
          />
        )}
      </div>
      <button
        type="button"
        onClick={onCancel}
        disabled={executing}
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-1 text-[13px] font-bold text-[#5C5A56] transition-colors hover:text-[#141416] disabled:opacity-50"
      >
        <ChevronLeft strokeWidth={1.5} className="h-4 w-4" />
        العودة للمراجعة
      </button>
    </div>
  );
}

// ============================================================
// بطاقة رمز كبيرة (رمز تسليم الحوالة / رمز السحب / رمز الإيداع)
// ============================================================

export function BigCodeCard({
  code,
  title,
  warning,
  expiryIso,
  showQr = false,
  className,
}: {
  code: string;
  title: string;
  warning?: string;
  expiryIso?: string;
  showQr?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast({ title: "تم نسخ الرمز", description: code });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "تعذّر النسخ", description: "انسخ الرمز يدوياً", variant: "destructive" });
    }
  };

  return (
    <article
      className={cn(
        "relative w-full overflow-hidden rounded-2xl bg-[#0B0B0C] p-5 text-white shadow-[0_8px_24px_rgba(11,11,12,0.12)]",
        className,
      )}
    >
      {/* زخرفة معيّنات ذهبية */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
        <span className="absolute -left-10 -top-10 h-32 w-32 rotate-45 rounded-xl border border-[#C9A227]/20" />
        <span className="absolute -right-12 -bottom-14 h-36 w-36 rotate-45 rounded-xl border border-[#C9A227]/15" />
      </div>
      <div className="relative">
        <p className="text-center text-[12px] font-semibold text-white/60">{title}</p>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label="نسخ الرمز"
          className="group mt-2 flex w-full flex-col items-center"
        >
          <p
            dir="ltr"
            className="flex items-center gap-3 text-[34px] font-extrabold leading-10 tabular-nums tracking-[0.18em] text-[#C9A227]"
          >
            {code}
            <Copy
              strokeWidth={1.5}
              className={cn(
                "h-5 w-5 transition-colors",
                copied ? "text-[#15803D]" : "text-white/40 group-hover:text-white/70",
              )}
            />
          </p>
          <span className="mt-1 text-[11px] font-medium text-white/45">اضغط على الرمز لنسخه</span>
        </button>

        {expiryIso ? (
          <p className="mt-3 text-center text-[12px] font-semibold text-white/70">
            صالح حتى <span className="tabular-nums">{formatDateTime(expiryIso)}</span>
            {timeLeftLabel(expiryIso) ? (
              <span className="text-white/50"> (متبقٍ {timeLeftLabel(expiryIso)})</span>
            ) : null}
          </p>
        ) : null}

        {warning ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#C9A227]/25 bg-[#C9A227]/[0.08] px-3 py-2">
            <TriangleAlert strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-[#C9A227]" />
            <p className="text-[12px] font-semibold leading-5 text-[#E9DFC3]">{warning}</p>
          </div>
        ) : null}

        {showQr ? (
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <img
              src={`/api/qr?text=${encodeURIComponent(code)}&size=140`}
              alt={`رمز QR ${code}`}
              width={112}
              height={112}
              className="h-[112px] w-[112px] rounded-lg bg-white p-1"
            />
            <p className="text-[11px] font-medium text-white/45">اعرض هذا الرمز للوكيل</p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

// ============================================================
// حقل إدخال هاتف (يُغذّى من لوحة الأرقام)
// ============================================================

export function PhoneField({
  value,
  active,
  label,
  onActivate,
  placeholder = "77XXXXXXX",
  hint,
  className,
}: {
  value: string;
  active: boolean;
  label: string;
  onActivate: () => void;
  placeholder?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      <button
        type="button"
        onClick={onActivate}
        aria-label={label}
        className={cn(
          "flex min-h-[64px] w-full items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 text-right transition-colors",
          active
            ? "border-[#C9A227] shadow-[0_0_0_3px_rgba(201,162,39,0.12)]"
            : "border-[#E8E6E1] hover:border-[#C9A227]/50",
        )}
      >
        <span className="text-[12px] font-semibold text-[#5C5A56]">{label}</span>
        <span
          dir="ltr"
          className={cn(
            "text-[22px] font-extrabold leading-7 tabular-nums tracking-[0.08em]",
            value ? "text-[#141416]" : "text-[#A3A09B]",
          )}
        >
          {value || placeholder}
        </span>
      </button>
      {hint ? (
        <p className="mt-1.5 text-center text-[12px] font-medium text-[#5C5A56]">{hint}</p>
      ) : null}
    </div>
  );
}

// ============================================================
// شيت سفلي (Sheet) للتفاصيل — يستعمل في الوكلاء وغيرها
// ============================================================

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* حركة صعود الشيت — معرّفة محلياً (لا تعديل لملفات غير مملوكة) */}
      <style>{`@keyframes sw-sheet-up { from { transform: translateY(48px); opacity: 0.6; } to { transform: translateY(0); opacity: 1; } } .sw-sheet-up { animation: sw-sheet-up 260ms cubic-bezier(0.22, 1, 0.36, 1) both; }`}</style>
      <button
        type="button"
        aria-label="إغلاق"
        onClick={onClose}
        className="absolute inset-0 bg-[#0B0B0C]/45 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sw-sheet-up relative z-10 max-h-[80vh] w-full max-w-[440px] overflow-y-auto rounded-t-3xl border-t border-[#E8E6E1] bg-[#FAF9F6] p-4 pb-6 shadow-[0_-8px_32px_rgba(11,11,12,0.18)]"
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#E8E6E1]" />
        <h3 className="mb-3 text-center text-[17px] font-bold text-[#141416]">{title}</h3>
        {children}
      </div>
    </div>
  );
}
