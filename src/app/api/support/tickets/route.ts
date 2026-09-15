/**
 * H1 — GET /api/support/tickets
 * العميل: تذاكره فقط. SUPPORT/ADMIN: كل التذاكر (مع بيانات المالك AdminTicketRow).
 * H2 — POST /api/support/tickets { subject, category, message } — فتح تذكرة TK
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { generateRef } from "@/lib/server/domain";
import { notify } from "@/lib/server/notify";
import { toTicketView } from "@/lib/server/views";
import { db } from "@/lib/db";
import type { AdminTicketRow } from "@/lib/api-types";
import type { Prisma } from "@prisma/client";

const CATEGORIES = ["PAYMENT", "TRANSFER", "REMITTANCE", "KYC", "ACCOUNT", "OTHER"];

const TICKET_INCLUDE = {
  messages: { orderBy: { createdAt: "desc" }, take: 1 },
  _count: { select: { messages: true } },
} satisfies Prisma.SupportTicketInclude;

export const GET = route(async () => {
  const user = await requireUser();
  const isStaff = user.role === "SUPPORT" || user.role === "ADMIN";

  const tickets = await db.supportTicket.findMany({
    where: isStaff ? {} : { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: TICKET_INCLUDE,
  });

  if (!isStaff) {
    return ok(tickets.map((t) => toTicketView(t)));
  }
  const owners = await db.user.findMany({
    where: { id: { in: tickets.map((t) => t.userId) } },
    select: { id: true, fullName: true, phone: true },
  });
  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const rows: AdminTicketRow[] = tickets.map((t) => {
    const owner = ownerById.get(t.userId);
    return {
      ...toTicketView(t),
      ownerName: owner?.fullName ?? "مستخدم",
      ownerPhone: owner?.phone ?? "—",
    };
  });
  return ok(rows);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await readJsonBody(req);
  const subject = reqStr(body, "subject");
  const category = reqStr(body, "category");
  const message = reqStr(body, "message");

  if (!(CATEGORIES as string[]).includes(category)) {
    throw new RouteError("SYS-001", 400, { field: "category", reason: "تصنيف غير مدعوم" });
  }

  const ticket = await db.$transaction(async (tx) => {
    const ref = generateRef("TK");
    const t = await tx.supportTicket.create({
      data: { ref, userId: user.id, subject, category, status: "OPEN" },
    });
    const first = await tx.ticketMessage.create({
      data: { ticketId: t.id, authorId: user.id, authorRole: user.role, body: message },
    });
    await notify(
      tx,
      user.id,
      "تم فتح تذكرة دعم",
      `تذكرتك ${ref} قيد المعالجة — سيرد فريق الدعم في أقرب وقت.`,
      "SUPPORT",
      ref
    );
    return { t, first };
  });

  return ok(
    toTicketView({
      ...ticket.t,
      messages: [ticket.first],
      _count: { messages: 1 },
    })
  );
});
