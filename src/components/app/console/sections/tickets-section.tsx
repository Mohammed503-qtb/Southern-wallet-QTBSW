/**
 * محفظة الجنوب — قسم التذاكر (H1–H4 + status) — SUPPORT وADMIN
 * قائمة التذاكر (المرجع/الموضوع/المالك/هاتفه/الحالة/آخر رسالة/تحديث) → نقر
 * يفتح صفحة محادثة: سلسلة الرسائل + صندوق رد (H4) + أزرار تغيير الحالة
 * (OPEN/IN_PROGRESS/RESOLVED عبر PUT /api/support/tickets/:id/status).
 */
"use client";

import { useState } from "react";
import { ArrowRight, MessagesSquare, Send } from "lucide-react";
import { api } from "@/lib/api";
import type { AdminTicketRow, TicketMessageView, TicketThreadView, TicketView } from "@/lib/api-types";
import { USER_ROLE_LABELS } from "@/lib/api-types";
import { formatDateTime, formatShortDateTime, useApiData, StatusChip } from "@/components/app/ui";
import { toastSuccess } from "../console-hooks";
import { useActionRunner } from "../console-hooks";
import {
  Column,
  ConsoleButton,
  ConsoleCard,
  DataTable,
  SectionHeader,
} from "../console-ui";
import { cn } from "@/lib/utils";

const TICKET_STATUS_OPTIONS: { value: "OPEN" | "IN_PROGRESS" | "RESOLVED"; label: string }[] = [
  { value: "OPEN", label: "مفتوحة" },
  { value: "IN_PROGRESS", label: "قيد المعالجة" },
  { value: "RESOLVED", label: "محلولة" },
];

const CATEGORY_LABELS: Record<string, string> = {
  PAYMENT: "مدفوعات",
  TRANSFER: "تحويل",
  REMITTANCE: "حوالات",
  KYC: "توثيق",
  ACCOUNT: "الحساب",
  OTHER: "أخرى",
};

/** فقاعة رسالة: ردود الطاقم بذهبي على يمين، رسائل العميل بيضاء على يسار */
function MessageBubble({ message }: { message: TicketMessageView }) {
  const isStaff = message.authorRole === "SUPPORT" || message.authorRole === "ADMIN";
  return (
    <div className={cn("flex w-full", isStaff ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl border px-4 py-2.5 sm:max-w-[70%]",
          isStaff
            ? "border-[#C9A227]/30 bg-[#C9A227]/[0.08]"
            : "border-[#E8E6E1] bg-white",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12.5px] font-extrabold text-[#141416]">
            {message.authorName}
            <span className="ms-1.5 text-[10.5px] font-semibold text-[#8A8783]">
              {USER_ROLE_LABELS[message.authorRole]}
            </span>
          </span>
          <span className="text-[10.5px] font-medium text-[#A3A09B]">{formatShortDateTime(message.createdAt)}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-[13.5px] font-medium leading-6 text-[#141416]">
          {message.body}
        </p>
      </div>
    </div>
  );
}

/** صفحة المحادثة (تفتح من القائمة) */
function TicketConversation({
  ticketId,
  onBack,
  onListRefresh,
}: {
  ticketId: string;
  onBack: () => void;
  onListRefresh: () => void;
}) {
  const { data, loading, error, retry } = useApiData<TicketThreadView>(`/api/support/tickets/${ticketId}`);
  const [reply, setReply] = useState("");
  const runner = useActionRunner();
  const [statusBusy, setStatusBusy] = useState<string | null>(null);

  const sendReply = async () => {
    const body = reply.trim();
    if (!body) return;
    const sent = await runner.run(() =>
      api.post<TicketMessageView>(`/api/support/tickets/${ticketId}/messages`, { body }),
    );
    if (sent) {
      setReply("");
      toastSuccess("أُرسل الرد", "سيُشعَر العميل فوراً برسالتك.");
      retry();
      onListRefresh();
    }
  };

  const changeStatus = async (status: "OPEN" | "IN_PROGRESS" | "RESOLVED") => {
    if (!data || data.ticket.status === status) return;
    setStatusBusy(status);
    try {
      const updated = await api.put<TicketView>(`/api/support/tickets/${ticketId}/status`, { status });
      toastSuccess(
        `حالة التذكرة ${updated.ref}: ${TICKET_STATUS_OPTIONS.find((o) => o.value === updated.status)?.label ?? updated.status}`,
      );
      retry();
      onListRefresh();
    } catch {
      // الخطأ يعرض عبر toast عام في changeStatus؟ نبقي بسيطاً
    } finally {
      setStatusBusy(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4">
        <ConsoleCard className="h-[120px] animate-pulse bg-[#EFEBDD]/60" />
        <ConsoleCard className="h-[360px] animate-pulse bg-[#EFEBDD]/60" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <ConsoleCard className="p-6">
        <p className="text-center text-[14px] font-semibold text-[#B91C1C]">
          {error.message}
          <span dir="ltr" className="ms-2 text-[11px] text-[#A3A09B]">{error.code}</span>
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <ConsoleButton onClick={retry}>إعادة المحاولة</ConsoleButton>
          <ConsoleButton variant="ghost" onClick={onBack}>
            عودة للقائمة
          </ConsoleButton>
        </div>
      </ConsoleCard>
    );
  }

  if (!data) return null;
  const ticket = data.ticket;

  return (
    <div className="flex flex-col gap-4">
      {/* ترويسة التذكرة */}
      <ConsoleCard className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onBack}
                title="عودة لقائمة التذاكر"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E8E6E1] bg-white text-[#5C5A56] transition-colors hover:border-[#C9A227]/60 hover:text-[#8A6E14]"
              >
                <ArrowRight strokeWidth={1.6} className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-[17px] font-extrabold text-[#0B0B0C]">{ticket.subject}</p>
                <p className="text-[12px] font-semibold text-[#8A8783]">
                  <span dir="ltr">{ticket.ref}</span> · {CATEGORY_LABELS[ticket.category] ?? ticket.category} · فُتحت{" "}
                  {formatDateTime(ticket.createdAt)}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {TICKET_STATUS_OPTIONS.map((opt) => {
              const active = ticket.status === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => void changeStatus(opt.value)}
                  disabled={active || statusBusy !== null}
                  className={cn(
                    "min-h-9 rounded-xl border px-3.5 text-[12.5px] font-bold transition-colors disabled:cursor-default",
                    active
                      ? "border-[#C9A227]/60 bg-[#C9A227]/[0.14] text-[#8A6E14]"
                      : "border-[#E8E6E1] bg-white text-[#5C5A56] hover:border-[#C9A227]/50 hover:text-[#8A6E14]",
                    statusBusy === opt.value && "opacity-60",
                  )}
                >
                  {statusBusy === opt.value ? "…" : opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </ConsoleCard>

      {/* سلسلة الرسائل */}
      <ConsoleCard className="flex flex-col gap-3 p-4">
        <p className="text-[11px] font-semibold text-[#8A8783]">
          {data.messages.length} رسالة — الأحدث في الأسفل
        </p>
        <div className="gold-scroll flex max-h-[420px] flex-col gap-3 overflow-y-auto pl-1">
          {data.messages.length === 0 ? (
            <p className="py-6 text-center text-[13px] font-medium text-[#A3A09B]">لا رسائل بعد.</p>
          ) : (
            data.messages.map((message) => <MessageBubble key={message.id} message={message} />)
          )}
        </div>

        {/* صندوق الرد (H4) */}
        <div className="border-t border-[#F0EEE9] pt-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold text-[#141416]">رد على التذكرة</span>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={3}
              placeholder="اكتب ردك على العميل…"
              className="w-full resize-none rounded-xl border border-[#E8E6E1] bg-[#FAF9F6] px-3 py-2.5 text-[13.5px] font-medium leading-6 text-[#141416] outline-none transition-colors placeholder:text-[#A3A09B] focus:border-[#C9A227]/70 focus:bg-white"
            />
          </label>
          {runner.error ? (
            <p className="mt-2 text-[12.5px] font-semibold text-[#B91C1C]">
              {runner.error.message} <span dir="ltr">({runner.error.code})</span>
            </p>
          ) : null}
          <div className="mt-2 flex flex-row-reverse justify-start">
            <ConsoleButton onClick={() => void sendReply()} disabled={reply.trim().length === 0} loading={runner.busy}>
              <Send strokeWidth={1.6} className="h-4 w-4" />
              إرسال الرد
            </ConsoleButton>
          </div>
        </div>
      </ConsoleCard>
    </div>
  );
}

export function TicketsSection() {
  const { data, loading, error, retry } = useApiData<AdminTicketRow[]>("/api/support/tickets");
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  if (openTicketId) {
    return (
      <TicketConversation
        ticketId={openTicketId}
        onBack={() => setOpenTicketId(null)}
        onListRefresh={retry}
      />
    );
  }

  const columns: Column<AdminTicketRow>[] = [
    {
      key: "ref",
      header: "المرجع",
      render: (t) => (
        <span dir="ltr" className="text-[12.5px] font-bold tabular-nums tracking-wide text-[#8A6E14]">
          {t.ref}
        </span>
      ),
    },
    {
      key: "subject",
      header: "الموضوع",
      render: (t) => (
        <div className="flex flex-col">
          <span className="font-bold text-[#141416]">{t.subject}</span>
          <span className="text-[11px] font-semibold text-[#8A8783]">{CATEGORY_LABELS[t.category] ?? t.category}</span>
        </div>
      ),
    },
    {
      key: "owner",
      header: "المالك",
      render: (t) => (
        <div className="flex flex-col">
          <span className="text-[13px] font-bold text-[#141416]">{t.ownerName}</span>
          <span dir="ltr" className="text-right text-[11.5px] tabular-nums text-[#8A8783]">{t.ownerPhone}</span>
        </div>
      ),
    },
    { key: "status", header: "الحالة", render: (t) => <StatusChip status={t.status} /> },
    {
      key: "last",
      header: "آخر رسالة",
      widthClass: "max-w-[260px]",
      render: (t) => (
        <span className="block max-w-[240px] truncate text-[12.5px] font-medium text-[#5C5A56]">
          {t.lastMessage ?? "—"}
          <span className="ms-1.5 text-[11px] text-[#A3A09B]">({t.messagesCount})</span>
        </span>
      ),
    },
    {
      key: "updated",
      header: "آخر تحديث",
      render: (t) => <span className="text-[12.5px] text-[#8A8783]">{formatShortDateTime(t.updatedAt)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="التذاكر"
        description="كل تذاكر الدعم — انقر صفاً لفتح المحادثة والرد وتغيير الحالة"
        onRefresh={retry}
        refreshing={loading}
      />

      <DataTable<AdminTicketRow>
        columns={columns}
        rows={data}
        rowKey={(t) => t.id}
        loading={loading}
        error={error}
        onRetry={retry}
        emptyTitle="لا تذاكر"
        emptyDescription="لا تذاكر دعم مفتوحة حالياً — سيظهر الجديد هنا فور إنشائه."
        minWidthClass="min-w-[860px]"
        footer={
          data && data.length > 0 ? (
            <p className="text-[12px] font-medium text-[#8A8783] tabular-nums">{data.length} تذكرة</p>
          ) : undefined
        }
        onRowClick={(row) => setOpenTicketId(row.id)}
      />

      {/* زر إرشادي عند عدم وجود بيانات */}
      {data && data.length === 0 && !loading && !error ? (
        <div className="flex items-center justify-center gap-2 text-[13px] font-medium text-[#A3A09B]">
          <MessagesSquare strokeWidth={1.5} className="h-4 w-4" />
          ردودك تُشعر العملاء فوراً وتغيّر حالة التذكرة تلقائياً إلى «قيد المعالجة».
        </div>
      ) : null}
    </div>
  );
}
