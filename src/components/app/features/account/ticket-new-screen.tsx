/**
 * محفظة الجنوب — تذكرة دعم جديدة (SC-44)
 * نموذج (الموضوع، الفئة Select من: دفع/تحويل/حوالة/توثيق/حساب/أخرى،
 * الرسالة textarea) → H2 POST /api/support/tickets → نجاح → تفتح محادثة
 * التذكرة مباشرة (ticket-chat {id}). يدعم تمرير params.subject/params.ref
 * من شاشة تفاصيل العملية («الإبلاغ عن مشكلة») لتعبئة مبدئية.
 */
"use client";

import { useState } from "react";
import { LifeBuoy, Link2 } from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { api, ApiError } from "@/lib/api";
import type { TicketView } from "@/lib/api-types";
import { PrimaryActionButton } from "@/components/app/ui/primary-action-button";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { FieldLabel, TextArea, TextField, TICKET_CATEGORY_LABELS } from "./account-shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

const CATEGORIES = ["PAYMENT", "TRANSFER", "REMITTANCE", "KYC", "ACCOUNT", "OTHER"] as const;

export function TicketNewScreen() {
  const params = useAppStore((s) => s.params);
  const navigate = useAppStore((s) => s.navigate);

  // تعبئة مبدئية من سياق العملية (SC-35 «الإبلاغ عن مشكلة»)
  const linkedRef = params.ref ?? null;
  const [subject, setSubject] = useState(
    params.subject ?? (linkedRef ? `مشكلة في عملية ${linkedRef}` : ""),
  );
  const [category, setCategory] = useState<string>(linkedRef ? "TRANSFER" : "ACCOUNT");
  const [message, setMessage] = useState(
    linkedRef
      ? `المرجع: ${linkedRef}\n\nوصف المشكلة:\n`
      : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const subjectValid = subject.trim().length >= 4;
  const messageValid = message.trim().length >= 10;
  const formValid = subjectValid && messageValid;

  const submit = async () => {
    if (!formValid || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const ticket = await api.post<TicketView>("/api/support/tickets", {
        subject: subject.trim(),
        category,
        message: message.trim(),
      });
      toast({
        title: `تم فتح التذكرة ${ticket.ref}`,
        description: "سيرد فريق الدعم في أقرب وقت — تصلك الإشعارات فور الرد",
      });
      navigate("ticket-chat", { id: ticket.id });
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ code: err.code, message: err.message });
      } else {
        setError({ code: "SYS-001", message: "تعذّر فتح التذكرة — تحقق من اتصالك" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-4 pb-8">
      <ScreenHeader title="تذكرة دعم جديدة" subtitle="فريق الدعم يرد خلال ساعات العمل" />

      {/* شريحة العملية المرتبطة */}
      {linkedRef ? (
        <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-[#C9A227]/30 bg-[#C9A227]/[0.06] px-3 py-2.5">
          <Link2 strokeWidth={1.5} className="h-4 w-4 shrink-0 text-[#C9A227]" />
          <p className="flex-1 text-[12.5px] font-semibold text-[#5C5A56]">
            مرتبطة بالعملية{" "}
            <span dir="ltr" className="font-bold tabular-nums text-[#141416]">
              {linkedRef}
            </span>{" "}
            — ستُرفق تلقائياً بالرسالة
          </p>
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        <div>
          <FieldLabel htmlFor="sw-ticket-subject">الموضوع</FieldLabel>
          <TextField
            id="sw-ticket-subject"
            value={subject}
            onChange={setSubject}
            placeholder="مثال: إيداعي لم يظهر بعد تأكيد الوكيل"
            maxLength={120}
          />
        </div>

        <div>
          <FieldLabel>الفئة</FieldLabel>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger
              dir="rtl"
              className="h-[52px] w-full rounded-xl border-[#E8E6E1] bg-white text-[15px] font-semibold text-[#141416]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="text-[15px]">
                  {TICKET_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <FieldLabel htmlFor="sw-ticket-message" hint="10 محارف على الأقل">
            الرسالة
          </FieldLabel>
          <TextArea
            id="sw-ticket-message"
            value={message}
            onChange={setMessage}
            placeholder="اشرح المشكلة بالتفصيل: ما حدث، متى، وأي مراجع لديك…"
            rows={5}
            maxLength={2000}
          />
          <p className="mt-1 text-left text-[11px] font-medium tabular-nums text-[#A3A09B]">
            {message.length}/2000
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-[#B91C1C]/25 bg-[#B91C1C]/[0.05] p-3">
            <p className="text-[13px] font-semibold text-[#B91C1C]">{error.message}</p>
            {error.code !== "SYS-001" ? (
              <p dir="ltr" className="mt-0.5 text-[11px] font-medium text-[#A3A09B]">
                {error.code}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        <PrimaryActionButton
          onClick={() => void submit()}
          loading={submitting}
          disabled={!formValid}
          disabledReason={
            !subjectValid
              ? "أدخل موضوعاً وصفياً (4 محارف على الأقل)"
              : !messageValid
                ? "اشرح المشكلة في 10 محارف على الأقل"
                : undefined
          }
        >
          <LifeBuoy strokeWidth={1.5} className="h-5 w-5" />
          فتح التذكرة
        </PrimaryActionButton>

        <p className="mt-3 text-center text-[12px] font-medium leading-5 text-[#A3A09B]">
          تحصل على مرجع تذكرة (TK-…) يمكنك متابعته من محادثة التذكرة،
          وتصلك إشعارات الردود في مركز الإشعارات.
        </p>
      </div>
    </div>
  );
}
