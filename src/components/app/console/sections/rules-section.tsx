/**
 * محفظة الجنوب — قسم قواعد التشغيل (M9–M12) — ADMIN فقط
 * 4 تبويبات: الحدود (M9)، الرسوم (M10)، أسعار الصرف (M11)، الخدمات (M12).
 * تحرير inline لكل صف + زر حفظ يفتح ReasonDialog يعرض القيم القديمة→الجديدة
 * بسبب إلزامي قبل الإرسال (يُرسل reason مع الحمولة؛ الخادم يسجل التدقيق).
 * تبويب الخدمات: تحذير كهرماني (Master §139) عند تفعيل خدمة بلا تكامل حقيقي.
 */
"use client";

import { useState, type ReactNode } from "react";
import { Save } from "lucide-react";
import { api } from "@/lib/api";
import type {
  AdminFeeRow,
  AdminFxRow,
  AdminLimitRow,
  AdminServiceRow,
  CurrencyCode,
  ServiceStateValue,
} from "@/lib/api-types";
import { CURRENCY_META, formatMoney, SERVICE_STATE_LABELS } from "@/lib/api-types";
import { formatShortDateTime, useApiData } from "@/components/app/ui";
import { toastSuccess } from "../console-hooks";
import { useActionRunner } from "../console-hooks";
import { OldNewRow, ReasonDialog, WarningBox } from "../confirm-dialog";
import { ConsoleButton, ConsoleCard, ConsoleChip, PillTabs, SectionHeader, Skeleton } from "../console-ui";
import { cn } from "@/lib/utils";

type RulesTab = "limits" | "fees" | "fx" | "services";

const TABS: { value: RulesTab; label: string }[] = [
  { value: "limits", label: "الحدود اليومية" },
  { value: "fees", label: "الرسوم" },
  { value: "fx", label: "أسعار الصرف" },
  { value: "services", label: "الخدمات" },
];

const KYC_LEVEL_LABELS: Record<string, string> = {
  NONE: "بدون توثيق",
  VERIFIED: "موثّق",
};

const FEE_OP_LABELS: Record<string, string> = {
  TRANSFER: "تحويل",
  REMITTANCE: "حوالة",
  WITHDRAW: "سحب نقدي",
  FX: "صرف عملات",
};

const SERVICE_KEY_LABELS: Record<string, string> = {
  BILLS: "فواتير",
  TOPUP: "شحن رصيد",
  NETWORK_CARDS: "كروت الشبكات",
  MERCHANT_PAY: "دفع للتجار",
  REMITTANCE_IN: "حوالة واردة",
  OFFLINE: "العمل دون اتصال",
};

/** خدمات بلا تكامل حقيقي في Alpha (D-02) — تحذير §139 عند التفعيل */
const NOT_INTEGRATED_SERVICES = new Set(["BILLS", "TOPUP", "NETWORK_CARDS", "MERCHANT_PAY", "REMITTANCE_IN"]);

const SERVICE_STATE_OPTIONS: ServiceStateValue[] = ["ON", "OFF", "COMING_LATER", "MAINTENANCE"];

function minorToMajor(minor: number, currency: CurrencyCode): string {
  const d = CURRENCY_META[currency].decimals;
  return (minor / Math.pow(10, d)).toLocaleString("en-US", { maximumFractionDigits: d });
}

function parseMajorToMinor(text: string, currency: CurrencyCode): number | null {
  const cleaned = text.replace(/[,،\s]/g, "");
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  const minor = Math.round(value * Math.pow(10, CURRENCY_META[currency].decimals));
  return Number.isSafeInteger(minor) ? minor : null;
}

function parseIntField(text: string): number | null {
  const cleaned = text.replace(/[,،\s]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? value : null;
}

/** خانة إدخال رقمية inline داخل الجدول — تُبرز عند التغيير */
function NumCellInput({
  value,
  onChange,
  dirty,
  placeholder,
  ltr = true,
  width = "w-[110px]",
}: {
  value: string;
  onChange: (v: string) => void;
  dirty: boolean;
  placeholder?: string;
  ltr?: boolean;
  width?: string;
}) {
  return (
    <input
      dir={ltr ? "ltr" : "rtl"}
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "h-9 rounded-lg border bg-white px-2 text-center text-[13px] font-bold tabular-nums text-[#141416] outline-none transition-colors placeholder:text-[#A3A09B]",
        width,
        dirty ? "border-[#C9A227]/70 bg-[#C9A227]/[0.06]" : "border-[#E8E6E1] hover:border-[#C9A227]/40",
      )}
    />
  );
}

/** رأس عمود داخل بطاقات القواعد */
function RuleHead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[11px] font-semibold leading-4 text-[#8A8783]", className)}>{children}</div>
  );
}

// ==================================================================
// الحدود (M9)
// ==================================================================

interface LimitEdits {
  count: string;
  daily: string;
  perTxn: string;
}

function LimitsTab({
  rows,
  loading,
  onSaved,
}: {
  rows: AdminLimitRow[] | null;
  loading: boolean;
  onSaved: () => void;
}) {
  const [edits, setEdits] = useState<Record<string, LimitEdits>>({});
  const [pending, setPending] = useState<{ row: AdminLimitRow; next: { count: number; daily: number; perTxn: number } } | null>(null);
  const runner = useActionRunner();

  const editOf = (row: AdminLimitRow): LimitEdits =>
    edits[row.id] ?? {
      count: String(row.dailyTxnCount),
      daily: minorToMajor(row.dailyAmountMinor, row.currency),
      perTxn: minorToMajor(row.perTxnAmountMinor, row.currency),
    };

  const isDirty = (row: AdminLimitRow) => {
    const e = editOf(row);
    return (
      e.count !== String(row.dailyTxnCount) ||
      parseMajorToMinor(e.daily, row.currency) !== row.dailyAmountMinor ||
      parseMajorToMinor(e.perTxn, row.currency) !== row.perTxnAmountMinor
    );
  };

  const buildNext = (row: AdminLimitRow) => {
    const e = editOf(row);
    const count = parseIntField(e.count);
    const daily = parseMajorToMinor(e.daily, row.currency);
    const perTxn = parseMajorToMinor(e.perTxn, row.currency);
    if (count === null || daily === null || perTxn === null) return null;
    return { count, daily, perTxn };
  };

  const save = async (reason: string) => {
    if (!pending) return;
    const result = await runner.run(() =>
      api.put<AdminLimitRow>(`/api/admin/limits/${pending.row.id}`, {
        dailyTxnCount: pending.next.count,
        dailyAmountMinor: pending.next.daily,
        perTxnAmountMinor: pending.next.perTxn,
        reason,
      }),
    );
    if (result.ok) {
      const updated = result.value;
      toastSuccess("حُفظت قاعدة الحدود", `${KYC_LEVEL_LABELS[updated.kycLevel]} · ${updated.currency} — السبب: ${reason}`);
      setPending(null);
      setEdits((prev) => {
        const next = { ...prev };
        delete next[updated.id];
        return next;
      });
      onSaved();
    }
  };

  if (loading && !rows) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[64px]" />
        ))}
      </div>
    );
  }

  return (
    <ConsoleCard className="overflow-x-auto gold-scroll">
      <div className="min-w-[820px]">
        <div className="grid grid-cols-[130px_80px_110px_1fr_1fr_120px] items-center gap-2 border-b border-[#E8E6E1] bg-[#FAF9F6] px-4 py-2.5">
          <RuleHead>مستوى KYC</RuleHead>
          <RuleHead>العملة</RuleHead>
          <RuleHead>عدد يومي</RuleHead>
          <RuleHead>مبلغ يومي</RuleHead>
          <RuleHead>حد العملية</RuleHead>
          <RuleHead className="text-center">حفظ</RuleHead>
        </div>
        {(rows ?? []).map((row) => {
          const e = editOf(row);
          const dirty = isDirty(row);
          const next = buildNext(row);
          return (
            <div
              key={row.id}
              className="grid grid-cols-[130px_80px_110px_1fr_1fr_120px] items-center gap-2 border-b border-[#F0EEE9] px-4 py-2.5 transition-colors last:border-b-0 hover:bg-[#F7F6F2]"
            >
              <span className="text-[13px] font-bold text-[#141416]">{KYC_LEVEL_LABELS[row.kycLevel]}</span>
              <span className="text-[12.5px] font-semibold tabular-nums text-[#8A6E14]">{row.currency}</span>
              <NumCellInput
                value={e.count}
                onChange={(v) => setEdits((s) => ({ ...s, [row.id]: { ...editOf(row), count: v } }))}
                dirty={e.count !== String(row.dailyTxnCount)}
                width="w-full"
              />
              <div className="flex items-center justify-center gap-1.5">
                <NumCellInput
                  value={e.daily}
                  onChange={(v) => setEdits((s) => ({ ...s, [row.id]: { ...editOf(row), daily: v } }))}
                  dirty={parseMajorToMinor(e.daily, row.currency) !== row.dailyAmountMinor}
                  width="w-[130px]"
                />
                <span className="text-[11px] font-semibold text-[#A3A09B]">{CURRENCY_META[row.currency].symbolAr}</span>
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <NumCellInput
                  value={e.perTxn}
                  onChange={(v) => setEdits((s) => ({ ...s, [row.id]: { ...editOf(row), perTxn: v } }))}
                  dirty={parseMajorToMinor(e.perTxn, row.currency) !== row.perTxnAmountMinor}
                  width="w-[130px]"
                />
                <span className="text-[11px] font-semibold text-[#A3A09B]">{CURRENCY_META[row.currency].symbolAr}</span>
              </div>
              <div className="flex justify-center">
                <ConsoleButton
                  variant={dirty && next ? "gold" : "ghost"}
                  size="sm"
                  disabled={!dirty || next === null}
                  title={next === null ? "قيم غير صالحة" : "حفظ القاعدة — M9"}
                  onClick={() => next && setPending({ row, next })}
                >
                  <Save strokeWidth={1.6} className="h-3.5 w-3.5" />
                  حفظ
                </ConsoleButton>
              </div>
            </div>
          );
        })}
      </div>

      <ReasonDialog
        open={pending !== null}
        title="حفظ قاعدة الحدود اليومية"
        description={pending ? `${KYC_LEVEL_LABELS[pending.row.kycLevel]} · ${pending.row.currency}` : null}
        oldNewRows={
          pending ? (
            <>
              <OldNewRow label="عدد العمليات اليومي" old={pending.row.dailyTxnCount} new={pending.next.count} />
              <OldNewRow
                label="المبلغ اليومي"
                old={formatMoney(pending.row.dailyAmountMinor, pending.row.currency)}
                new={formatMoney(pending.next.daily, pending.row.currency)}
              />
              <OldNewRow
                label="حد العملية الواحدة"
                old={formatMoney(pending.row.perTxnAmountMinor, pending.row.currency)}
                new={formatMoney(pending.next.perTxn, pending.row.currency)}
              />
            </>
          ) : null
        }
        confirmLabel="حفظ القاعدة"
        confirmVariant="gold"
        busy={runner.busy}
        error={runner.error}
        onConfirm={(reason) => void save(reason)}
        onCancel={() => {
          runner.setError(null);
          setPending(null);
        }}
      />
    </ConsoleCard>
  );
}

// ==================================================================
// الرسوم (M10)
// ==================================================================

interface FeeEdits {
  bps: string;
  fixed: string;
  min: string;
  max: string;
}

function FeesTab({ rows, loading, onSaved }: { rows: AdminFeeRow[] | null; loading: boolean; onSaved: () => void }) {
  const [edits, setEdits] = useState<Record<string, FeeEdits>>({});
  const [pending, setPending] = useState<{
    row: AdminFeeRow;
    next: { bps: number; fixed: number; min: number; max: number | null };
  } | null>(null);
  const runner = useActionRunner();

  const editOf = (row: AdminFeeRow): FeeEdits =>
    edits[row.id] ?? {
      bps: String(row.pctBps),
      fixed: minorToMajor(row.fixedMinor, row.currency),
      min: minorToMajor(row.minFeeMinor, row.currency),
      max: row.maxFeeMinor === null ? "" : minorToMajor(row.maxFeeMinor, row.currency),
    };

  const buildNext = (row: AdminFeeRow) => {
    const e = editOf(row);
    const bps = parseIntField(e.bps);
    const fixed = parseMajorToMinor(e.fixed, row.currency);
    const min = parseMajorToMinor(e.min, row.currency);
    if (bps === null || bps > 10_000 || fixed === null || min === null) return null;
    const max = e.max.trim() === "" ? null : parseMajorToMinor(e.max, row.currency);
    if (max === undefined || (max !== null && max < min)) return null;
    return { bps, fixed, min, max };
  };

  const save = async (reason: string) => {
    if (!pending) return;
    const result = await runner.run(() =>
      api.put<AdminFeeRow>(`/api/admin/fees/${pending.row.id}`, {
        pctBps: pending.next.bps,
        fixedMinor: pending.next.fixed,
        minFeeMinor: pending.next.min,
        maxFeeMinor: pending.next.max,
        reason,
      }),
    );
    if (result.ok) {
      const updated = result.value;
      toastSuccess(
        "حُفظت قاعدة الرسوم",
        `${FEE_OP_LABELS[updated.opType] ?? updated.opType} · ${updated.currency} — السبب: ${reason}`,
      );
      setPending(null);
      setEdits((prev) => {
        const next = { ...prev };
        delete next[updated.id];
        return next;
      });
      onSaved();
    }
  };

  if (loading && !rows) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[64px]" />
        ))}
      </div>
    );
  }

  return (
    <ConsoleCard className="overflow-x-auto gold-scroll">
      <div className="min-w-[900px]">
        <div className="grid grid-cols-[110px_80px_120px_130px_130px_130px_120px] items-center gap-2 border-b border-[#E8E6E1] bg-[#FAF9F6] px-4 py-2.5">
          <RuleHead>العملية</RuleHead>
          <RuleHead>العملة</RuleHead>
          <RuleHead>pctBps</RuleHead>
          <RuleHead>رسم ثابت</RuleHead>
          <RuleHead>أدنى رسم</RuleHead>
          <RuleHead>أقصى رسم</RuleHead>
          <RuleHead className="text-center">حفظ</RuleHead>
        </div>
        {(rows ?? []).map((row) => {
          const e = editOf(row);
          const next = buildNext(row);
          const dirty =
            parseIntField(e.bps) !== row.pctBps ||
            parseMajorToMinor(e.fixed, row.currency) !== row.fixedMinor ||
            parseMajorToMinor(e.min, row.currency) !== row.minFeeMinor ||
            (row.maxFeeMinor === null ? e.max.trim() !== "" : parseMajorToMinor(e.max, row.currency) !== row.maxFeeMinor);
          return (
            <div
              key={row.id}
              className="grid grid-cols-[110px_80px_120px_130px_130px_130px_120px] items-center gap-2 border-b border-[#F0EEE9] px-4 py-2.5 transition-colors last:border-b-0 hover:bg-[#F7F6F2]"
            >
              <span className="text-[13px] font-bold text-[#141416]">{FEE_OP_LABELS[row.opType] ?? row.opType}</span>
              <span className="text-[12.5px] font-semibold tabular-nums text-[#8A6E14]">{row.currency}</span>
              <NumCellInput
                value={e.bps}
                onChange={(v) => setEdits((s) => ({ ...s, [row.id]: { ...editOf(row), bps: v } }))}
                dirty={parseIntField(e.bps) !== row.pctBps}
                width="w-full"
              />
              <NumCellInput
                value={e.fixed}
                onChange={(v) => setEdits((s) => ({ ...s, [row.id]: { ...editOf(row), fixed: v } }))}
                dirty={parseMajorToMinor(e.fixed, row.currency) !== row.fixedMinor}
                width="w-full"
              />
              <NumCellInput
                value={e.min}
                onChange={(v) => setEdits((s) => ({ ...s, [row.id]: { ...editOf(row), min: v } }))}
                dirty={parseMajorToMinor(e.min, row.currency) !== row.minFeeMinor}
                width="w-full"
              />
              <NumCellInput
                value={e.max}
                onChange={(v) => setEdits((s) => ({ ...s, [row.id]: { ...editOf(row), max: v } }))}
                dirty={row.maxFeeMinor === null ? e.max.trim() !== "" : parseMajorToMinor(e.max, row.currency) !== row.maxFeeMinor}
                placeholder="بلا حد"
                width="w-full"
              />
              <div className="flex justify-center">
                <ConsoleButton
                  variant={dirty && next ? "gold" : "ghost"}
                  size="sm"
                  disabled={!dirty || next === null}
                  title={next === null ? "قيم غير صالحة (أقصى ≥ أدنى)" : "حفظ القاعدة — M10"}
                  onClick={() => next && setPending({ row, next })}
                >
                  <Save strokeWidth={1.6} className="h-3.5 w-3.5" />
                  حفظ
                </ConsoleButton>
              </div>
            </div>
          );
        })}
      </div>

      <ReasonDialog
        open={pending !== null}
        title="حفظ قاعدة الرسوم"
        description={
          pending
            ? `${FEE_OP_LABELS[pending.row.opType] ?? pending.row.opType} · ${pending.row.currency} — ${
                pending.next.bps
              } bps = ${(pending.next.bps / 100).toFixed(2)}%`
            : null
        }
        oldNewRows={
          pending ? (
            <>
              <OldNewRow label="النسبة (bps)" old={pending.row.pctBps} new={pending.next.bps} />
              <OldNewRow
                label="رسم ثابت"
                old={formatMoney(pending.row.fixedMinor, pending.row.currency)}
                new={formatMoney(pending.next.fixed, pending.row.currency)}
              />
              <OldNewRow
                label="أدنى رسم"
                old={formatMoney(pending.row.minFeeMinor, pending.row.currency)}
                new={formatMoney(pending.next.min, pending.row.currency)}
              />
              <OldNewRow
                label="أقصى رسم"
                old={pending.row.maxFeeMinor === null ? "بلا حد" : formatMoney(pending.row.maxFeeMinor, pending.row.currency)}
                new={pending.next.max === null ? "بلا حد" : formatMoney(pending.next.max, pending.row.currency)}
              />
            </>
          ) : null
        }
        confirmLabel="حفظ القاعدة"
        confirmVariant="gold"
        busy={runner.busy}
        error={runner.error}
        onConfirm={(reason) => void save(reason)}
        onCancel={() => {
          runner.setError(null);
          setPending(null);
        }}
      />
    </ConsoleCard>
  );
}

// ==================================================================
// أسعار الصرف (M11)
// ==================================================================

function FxTab({ rows, loading, onSaved }: { rows: AdminFxRow[] | null; loading: boolean; onSaved: () => void }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ row: AdminFxRow; nextRate: number } | null>(null);
  const runner = useActionRunner();

  const parseRate = (text: string): number | null => {
    const cleaned = text.replace(/[,،\s]/g, "");
    if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
    const value = Number(cleaned);
    return Number.isFinite(value) && value > 0 ? value : null;
  };

  const save = async (reason: string) => {
    if (!pending) return;
    const result = await runner.run(() =>
      api.put<AdminFxRow>(`/api/admin/fx/${pending.row.id}`, { rate: pending.nextRate, reason }),
    );
    if (result.ok) {
      const updated = result.value;
      toastSuccess(
        "حُفظ سعر الصرف",
        `1 ${updated.fromCurrency} = ${updated.rate.toLocaleString("en-US")} ${updated.toCurrency} — السبب: ${reason}`,
      );
      setPending(null);
      setEdits((prev) => {
        const next = { ...prev };
        delete next[updated.id];
        return next;
      });
      onSaved();
    }
  };

  if (loading && !rows) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[64px]" />
        ))}
      </div>
    );
  }

  return (
    <ConsoleCard className="overflow-x-auto gold-scroll">
      <div className="min-w-[680px]">
        <div className="grid grid-cols-[90px_90px_1fr_160px_110px] items-center gap-2 border-b border-[#E8E6E1] bg-[#FAF9F6] px-4 py-2.5">
          <RuleHead>من</RuleHead>
          <RuleHead>إلى</RuleHead>
          <RuleHead>السعر الحالي (مقروء)</RuleHead>
          <RuleHead>سعر جديد</RuleHead>
          <RuleHead className="text-center">حفظ</RuleHead>
        </div>
        {(rows ?? []).map((row) => {
          const text = edits[row.id] ?? row.rate.toLocaleString("en-US", { maximumFractionDigits: 6 });
          const parsed = parseRate(text);
          const dirty = parsed !== null && Math.abs(parsed - row.rate) > 1e-9;
          return (
            <div
              key={row.id}
              className="grid grid-cols-[90px_90px_1fr_160px_110px] items-center gap-2 border-b border-[#F0EEE9] px-4 py-2.5 transition-colors last:border-b-0 hover:bg-[#F7F6F2]"
            >
              <span dir="ltr" className="text-[13px] font-bold tabular-nums text-[#141416]">{row.fromCurrency}</span>
              <span dir="ltr" className="text-[13px] font-bold tabular-nums text-[#141416]">{row.toCurrency}</span>
              <span dir="ltr" className="text-right text-[13.5px] font-extrabold tabular-nums text-[#8A6E14]">
                1 {row.fromCurrency} = {row.rate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}{" "}
                {row.toCurrency}
                <span className="ms-2 text-[11px] font-medium text-[#A3A09B]">
                  {formatShortDateTime(row.updatedAt)}
                </span>
              </span>
              <NumCellInput
                value={text}
                onChange={(v) => setEdits((s) => ({ ...s, [row.id]: v }))}
                dirty={dirty}
                width="w-full"
              />
              <div className="flex justify-center">
                <ConsoleButton
                  variant={dirty && parsed ? "gold" : "ghost"}
                  size="sm"
                  disabled={!dirty || parsed === null}
                  title="حفظ السعر — M11"
                  onClick={() => parsed && setPending({ row, nextRate: parsed })}
                >
                  <Save strokeWidth={1.6} className="h-3.5 w-3.5" />
                  حفظ
                </ConsoleButton>
              </div>
            </div>
          );
        })}
      </div>

      <ReasonDialog
        open={pending !== null}
        title="حفظ سعر الصرف"
        description={
          pending
            ? `يخزَّن داخلياً ×1e6 — يؤثر فوراً على عروض الصرف للعملاء.`
            : null
        }
        oldNewRows={
          pending ? (
            <OldNewRow
              label={`1 ${pending.row.fromCurrency} (${pending.row.toCurrency})`}
              old={pending.row.rate.toLocaleString("en-US", { maximumFractionDigits: 4 })}
              new={pending.nextRate.toLocaleString("en-US", { maximumFractionDigits: 4 })}
            />
          ) : null
        }
        confirmLabel="حفظ السعر"
        confirmVariant="gold"
        busy={runner.busy}
        error={runner.error}
        onConfirm={(reason) => void save(reason)}
        onCancel={() => {
          runner.setError(null);
          setPending(null);
        }}
      />
    </ConsoleCard>
  );
}

// ==================================================================
// الخدمات (M12)
// ==================================================================

function ServicesTab({ rows, loading, onSaved }: { rows: AdminServiceRow[] | null; loading: boolean; onSaved: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, { state: ServiceStateValue; note: string }>>({});
  const [pending, setPending] = useState<{
    row: AdminServiceRow;
    state: ServiceStateValue;
    note: string;
  } | null>(null);
  const runner = useActionRunner();

  const draftOf = (row: AdminServiceRow) => drafts[row.id] ?? { state: row.state, note: row.note ?? "" };

  const save = async (reason: string) => {
    if (!pending) return;
    const result = await runner.run(() =>
      api.put<AdminServiceRow>(`/api/admin/services/${pending.row.id}`, {
        state: pending.state,
        note: pending.note,
        reason,
      }),
    );
    if (result.ok) {
      const updated = result.value;
      toastSuccess(
        `حُفظت حالة «${SERVICE_KEY_LABELS[updated.key] ?? updated.key}»`,
        `الحالة: ${SERVICE_STATE_LABELS[updated.state]} — السبب: ${reason}`,
      );
      setPending(null);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[updated.id];
        return next;
      });
      onSaved();
    }
  };

  const stateTone = (s: ServiceStateValue) =>
    s === "ON" ? "success" : s === "MAINTENANCE" ? "pending" : s === "COMING_LATER" ? "gold" : "muted";

  if (loading && !rows) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[150px]" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(rows ?? []).map((row) => {
          const draft = draftOf(row);
          const dirty = draft.state !== row.state || draft.note !== (row.note ?? "");
          const needsWarning = draft.state === "ON" && NOT_INTEGRATED_SERVICES.has(row.key);
          return (
            <ConsoleCard key={row.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-extrabold text-[#0B0B0C]">
                    {SERVICE_KEY_LABELS[row.key] ?? row.key}
                  </p>
                  <p dir="ltr" className="text-right text-[11px] font-semibold text-[#A3A09B]">
                    {row.key} · آخر تحديث {formatShortDateTime(row.updatedAt)}
                  </p>
                </div>
                <ConsoleChip tone={stateTone(draft.state)}>{SERVICE_STATE_LABELS[draft.state]}</ConsoleChip>
              </div>

              {/* محدد الحالة (Select من 4 حالات) */}
              <label className="flex items-center gap-2 rounded-xl border border-[#E8E6E1] bg-[#FAF9F6] px-3 py-2">
                <span className="shrink-0 text-[11px] font-semibold text-[#8A8783]">الحالة</span>
                <select
                  value={draft.state}
                  onChange={(e) =>
                    setDrafts((s) => ({
                      ...s,
                      [row.id]: { ...draft, state: e.target.value as ServiceStateValue },
                    }))
                  }
                  className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-[13px] font-bold text-[#141416] outline-none"
                >
                  {SERVICE_STATE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {SERVICE_STATE_LABELS[s]}
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

              {/* الملاحظة */}
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-[#8A8783]">ملاحظة تظهر للعملاء (اختيارية)</span>
                <textarea
                  value={draft.note}
                  onChange={(e) => setDrafts((s) => ({ ...s, [row.id]: { ...draft, note: e.target.value } }))}
                  rows={2}
                  placeholder="مثال: متاحة قريباً مع إطلاق المرحلة 2…"
                  className="w-full resize-none rounded-xl border border-[#E8E6E1] bg-white px-3 py-2 text-[13px] font-medium leading-5 text-[#141416] outline-none transition-colors placeholder:text-[#A3A09B] focus:border-[#C9A227]/70"
                />
              </label>

              {needsWarning ? (
                <WarningBox>Master §139: لا تُفعَّل خدمة قبل تكامل حقيقي — هل أنت متأكد؟</WarningBox>
              ) : null}

              <div className="mt-auto flex flex-row-reverse justify-start border-t border-[#F0EEE9] pt-3">
                <ConsoleButton
                  variant={dirty ? "gold" : "ghost"}
                  size="sm"
                  disabled={!dirty}
                  title={dirty ? "حفظ الحالة — M12" : "لا تغييرات"}
                  onClick={() => setPending({ row, state: draft.state, note: draft.note.trim() })}
                >
                  <Save strokeWidth={1.6} className="h-3.5 w-3.5" />
                  حفظ الحالة
                </ConsoleButton>
              </div>
            </ConsoleCard>
          );
        })}
      </div>

      <ReasonDialog
        open={pending !== null}
        title={`حفظ حالة «${pending ? SERVICE_KEY_LABELS[pending.row.key] ?? pending.row.key : ""}»`}
        description="كل تغيير حالة خدمة يُسجَّل في التدقيق — تحقق من الحالة والملاحظة قبل الحفظ."
        warning={
          pending?.state === "ON" && NOT_INTEGRATED_SERVICES.has(pending.row.key)
            ? "Master §139: لا تُفعَّل خدمة قبل تكامل حقيقي — هل أنت متأكد؟"
            : undefined
        }
        oldNewRows={
          pending ? (
            <>
              <OldNewRow
                label="الحالة"
                old={SERVICE_STATE_LABELS[pending.row.state]}
                new={SERVICE_STATE_LABELS[pending.state]}
              />
              <OldNewRow
                label="الملاحظة"
                old={pending.row.note ?? "بلا ملاحظة"}
                new={pending.note || "بلا ملاحظة"}
              />
            </>
          ) : null
        }
        reasonLabel="سبب تغيير الحالة (إلزامي)"
        reasonPlaceholder="مثال: إعادة فتح الخدمة بعد اكتمال التكامل…"
        confirmLabel="حفظ الحالة"
        confirmVariant="gold"
        busy={runner.busy}
        error={runner.error}
        onConfirm={(reason) => void save(reason)}
        onCancel={() => {
          runner.setError(null);
          setPending(null);
        }}
      />
    </>
  );
}

// ==================================================================
// غلاف القسم بالتبويبات
// ==================================================================

export function RulesSection() {
  const [tab, setTab] = useState<RulesTab>("limits");

  const limits = useApiData<AdminLimitRow[]>("/api/admin/limits");
  const fees = useApiData<AdminFeeRow[]>("/api/admin/fees");
  const fx = useApiData<AdminFxRow[]>("/api/admin/fx");
  const services = useApiData<AdminServiceRow[]>("/api/admin/services");

  const refreshCurrent =
    tab === "limits" ? limits.retry : tab === "fees" ? fees.retry : tab === "fx" ? fx.retry : services.retry;
  const refreshingCurrent =
    tab === "limits" ? limits.loading : tab === "fees" ? fees.loading : tab === "fx" ? fx.loading : services.loading;

  return (
    <div className="relative flex flex-col gap-4">
      <SectionHeader
        title="قواعد التشغيل"
        description="الحدود اليومية والرسوم وأسعار الصرف وحالات الخدمات — تحرير حساس بسبب إلزامي"
        onRefresh={refreshCurrent}
        refreshing={refreshingCurrent}
      />

      <PillTabs items={TABS} value={tab} onChange={setTab} className="self-start" />

      {tab === "limits" ? <LimitsTab rows={limits.data} loading={limits.loading} onSaved={limits.retry} /> : null}
      {tab === "fees" ? <FeesTab rows={fees.data} loading={fees.loading} onSaved={fees.retry} /> : null}
      {tab === "fx" ? <FxTab rows={fx.data} loading={fx.loading} onSaved={fx.retry} /> : null}
      {tab === "services" ? <ServicesTab rows={services.data} loading={services.loading} onSaved={services.retry} /> : null}
    </div>
  );
}
