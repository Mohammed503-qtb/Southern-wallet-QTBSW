/**
 * H4 — POST /api/support/tickets/:id/messages { body }
 * رد على التذكرة (المالك أو SUPPORT/ADMIN). رد الطاقم → IN_PROGRESS.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { notify } from "@/lib/server/notify";
import { toTicketMessageView } from "@/lib/server/views";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const payload = await readJsonBody(req);
  const bodyText = reqStr(payload, "body");

  const ticket = await db.supportTicket.findUnique({ where: { id } });
  const isStaff = user.role === "SUPPORT" || user.role === "ADMIN";
  if (!ticket || (ticket.userId !== user.id && !isStaff)) {
    throw new RouteError("SYS-001", 404, { reason: "تذكرة غير موجودة" });
  }
  if (ticket.status === "RESOLVED" && !isStaff) {
    throw new RouteError("SYS-001", 400, { reason: "التذكرة محلولة — افتح تذكرة جديدة" });
  }

  const message = await db.$transaction(async (tx) => {
    const m = await tx.ticketMessage.create({
      data: { ticketId: ticket.id, authorId: user.id, authorRole: user.role, body: bodyText },
    });
    if (isStaff && ticket.status === "OPEN") {
      await tx.supportTicket.update({ where: { id: ticket.id }, data: { status: "IN_PROGRESS" } });
    }
    // إشعار الطرف الآخر
    const targetUserId = isStaff ? ticket.userId : (await db.user.findFirst({
      where: { role: "SUPPORT", status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }))?.id;
    if (targetUserId) {
      await notify(
        tx,
        targetUserId,
        isStaff ? "رد من الدعم" : "رسالة جديدة على تذكرة",
        `${ticket.ref}: ${bodyText.slice(0, 120)}`,
        "SUPPORT",
        ticket.ref
      );
    }
    return m;
  });

  return ok(toTicketMessageView(message, user.fullName));
});
