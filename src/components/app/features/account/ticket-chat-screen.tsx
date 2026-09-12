/**
 * محفظة الجنوب — محادثة التذكرة (SC-45)
 * params.id → H3 GET /api/support/tickets/:id: سلسلة رسائل بفقاعات
 * (رسائلي يمين داكنة / ردود الدعم يسار فاتحة + اسم الدور والوقت) +
 * صندوق إرسال (H4 POST …/messages) + شريط حالة التذكرة (StatusChip).
 * يُعاد جلب الخيط بعد كل إرسال ناجح.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, Send, User } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { api, ApiError } from "@/lib/api";
import type { TicketThreadView } from "@/lib/api-types";
import { StatusChip } from "@/components/app/ui/status-chip";
import { ErrorState } from "@/components/app/ui/error-state";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { formatShortDateTime } from "@/components/app/ui/utils";
import { TICKET_CATEGORY_LABELS, TICKET_STATUS_LABELS } from "./account-shared";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: "عميل",
  SUPPORT: "فريق الدعم",
  ADMIN: "إدارة النظام",
  COMPLIANCE: "الامتثال",
};

export function TicketChatScreen() {
  const params = useAppStore((s) => s.params);
  const meRole = useAppStore((s) => s.me?.user.role);
  const navigate = useAppStore((s) => s.navigate);
  const ticketId = params.id ?? "";

  const [thread, setThread] = useState<TicketThreadView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  /** جلب الخيط (H3) */
  const fetchThread = async (scroll: boolean) => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const data = await api.get<TicketThreadView>(
        `/api/support/tickets/${encodeURIComponent(ticketId)}`,
      );
      setThread(data);
      setError(null);
      if (scroll) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 60);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("SYS-001", "تعذّر جلب المحادثة", 0));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchThread(true);
    // ticketId ثابت لكل شاشة (params.id)
  }, [ticketId]);

  /** إرسال رسالة (H4) ثم إعادة الجلب */
  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await api.post(`/api/support/tickets/${encodeURIComponent(ticketId)}/messages`, {
        body: text,
      });
      setBody("");
      await fetchThread(true);
    } catch (err) {
      toast({
        title: "تعذّر إرسال الرسالة",
        description: err instanceof ApiError ? err.message : "تحقق من اتصالك وحاول مجدداً",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  if (!ticketId) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <ScreenHeader title="محادثة التذكرة" />
        <ErrorState message="لم تُحدَّد التذكرة — افتحها من مركز المساعدة" />
      </div>
    );
  }

  const isStaff = meRole === "SUPPORT" || meRole === "ADMIN";
  const resolved = thread?.ticket.status === "RESOLVED";

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[440px] flex-col px-4 pb-8">
      <ScreenHeader
        title="محادثة التذكرة"
        subtitle={thread ? thread.ticket.subject : "…"}
      />

      {/* ===== شريط حالة التذكرة ===== */}
      {thread ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#E8E6E1] bg-white p-3">
          <div className="flex min-w-0 flex-col items-start gap-0.5">
            <span dir="ltr" className="text-[13px] font-bold tabular-nums text-[#141416]">
              {thread.ticket.ref}
            </span>
            <span className="text-[11.5px] font-medium text-[#5C5A56]">
              {TICKET_CATEGORY_LABELS[thread.ticket.category] ?? thread.ticket.category} ·{" "}
              {thread.messages.length} رسالة
            </span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <StatusChip status={thread.ticket.status} />
            <span className="text-[10.5px] font-bold text-[#A3A09B]">
              {TICKET_STATUS_LABELS[thread.ticket.status] ?? thread.ticket.status}
            </span>
          </div>
        </div>
      ) : null}

      {/* ===== سلسلة الرسائل ===== */}
      <div className="mt-3 flex-1">
        {loading && !thread ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-3/4 rounded-2xl" />
            <Skeleton className="ms-auto h-20 w-2/3 rounded-2xl" />
            <Skeleton className="h-14 w-3/5 rounded-2xl" />
          </div>
        ) : error && !thread ? (
          <ErrorState
            compact
            message={error.message}
            code={error.code}
            onRetry={() => void fetchThread(false)}
          />
        ) : thread && thread.messages.length === 0 ? (
          <div className="rounded-2xl border border-[#E8E6E1] bg-white p-6 text-center">
            <p className="text-[13px] font-semibold text-[#5C5A56]">
              لا رسائل بعد — أرسل أول رسالة لبدء المحادثة
            </p>
          </div>
        ) : thread ? (
          <div className="space-y-3">
            {thread.messages.map((m) => {
              // رسائلي: أنا عميل والمرسل عميل، أو أنا طاقم والمرسل طاقم
              const mine = isStaff
                ? m.authorRole === "SUPPORT" || m.authorRole === "ADMIN"
                : m.authorRole === "CUSTOMER";
              return (
                <div
                  key={m.id}
                  className={cn("flex w-full items-end gap-2", mine ? "justify-start" : "justify-end")}
                >
                  {/* أيقونة الدور */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                      mine
                        ? "border-[#0B0B0C]/20 bg-[#0B0B0C] text-[#C9A227]"
                        : "border-[#E8E6E1] bg-[#F7F6F2] text-[#5C5A56]",
                    )}
                  >
                    {mine ? (
                      <User strokeWidth={1.5} className="h-4 w-4" />
                    ) : (
                      <Headphones strokeWidth={1.5} className="h-4 w-4" />
                    )}
                  </span>

                  {/* الفقاعة */}
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl p-3 shadow-[0_1px_4px_rgba(11,11,12,0.05)]",
                      mine
                        ? "rounded-bl-md bg-[#0B0B0C] text-white"
                        : "rounded-br-md border border-[#E8E6E1] bg-[#F7F6F2] text-[#141416]",
                    )}
                  >
                    <p
                      className={cn(
                        "mb-1 text-[10.5px] font-bold",
                        mine ? "text-[#C9A227]" : "text-[#5C5A56]",
                      )}
                    >
                      {m.authorName} · {ROLE_LABELS[m.authorRole] ?? m.authorRole}
                    </p>
                    <p
                      dir="auto"
                      className={cn(
                        "whitespace-pre-wrap break-words text-[13.5px] font-medium leading-6",
                        mine ? "text-white/95" : "text-[#141416]",
                      )}
                    >
                      {m.body}
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-left text-[10px] font-semibold tabular-nums",
                        mine ? "text-white/40" : "text-[#A3A09B]",
                      )}
                    >
                      {formatShortDateTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        ) : null}
      </div>

      {/* ===== صندوق الإرسال (H4) ===== */}
      <div className="sticky bottom-0 -mx-4 mt-4 bg-[#FAF9F6]/95 px-4 pb-2 pt-2 backdrop-blur">
        {resolved ? (
          <div className="rounded-2xl border border-[#15803D]/25 bg-[#15803D]/[0.05] p-3 text-center">
            <p className="text-[13px] font-bold text-[#15803D]">
              التذكرة محلولة — إن استمرت المشكلة افتح تذكرة جديدة
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#E8E6E1] bg-white p-2 shadow-[0_2px_10px_rgba(11,11,12,0.06)]">
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={body}
                maxLength={2000}
                onChange={(e) => setBody(e.target.value)}
                placeholder="اكتب رسالتك للدعم…"
                aria-label="نص الرسالة"
                className="max-h-32 min-h-11 flex-1 resize-none rounded-xl bg-[#F7F6F2] px-3 py-2.5 text-[14px] font-semibold leading-6 text-[#141416] placeholder:font-medium placeholder:text-[#A3A09B] focus:bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || body.trim().length === 0}
                aria-label="إرسال الرسالة"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0B0B0C] text-white transition-colors hover:bg-[#1A1A1C] disabled:bg-[#A3A09B]"
              >
                <Send strokeWidth={1.5} className="h-5 w-5 -scale-x-100" />
              </button>
            </div>
          </div>
        )}
        {loading && thread ? (
          <p className="pt-1 text-center text-[11px] font-medium text-[#A3A09B]">جارٍ التحديث…</p>
        ) : null}
      </div>

      {/* زر فتح تذكرة جديدة بعد الحل */}
      {resolved ? (
        <div className="mt-3">
          <PrimaryActionButton onClick={() => navigate("ticket-new")}>
            تذكرة دعم جديدة
          </PrimaryActionButton>
        </div>
      ) : null}
    </div>
  );
}
