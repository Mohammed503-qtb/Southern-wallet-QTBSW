/**
 * H3 — GET /api/support/tickets/:id  { ticket, messages }
 * المالك أو طاقم الدعم (SUPPORT/ADMIN).
 */
import { ok, route, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { toTicketView, toTicketMessageView } from "@/lib/server/views";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const ticket = await db.supportTicket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 100 } },
  });
  const isStaff = user.role === "SUPPORT" || user.role === "ADMIN";
  if (!ticket || (ticket.userId !== user.id && !isStaff)) {
    throw new RouteError("SYS-001", 404, { reason: "تذكرة غير موجودة" });
  }

  const authors = await db.user.findMany({
    where: { id: { in: ticket.messages.map((m) => m.authorId) } },
    select: { id: true, fullName: true },
  });
  const nameById = new Map(authors.map((a) => [a.id, a.fullName]));

  return ok({
    ticket: toTicketView(ticket),
    messages: ticket.messages.map((m) => toTicketMessageView(m, nameById.get(m.authorId) ?? null)),
  });
});
