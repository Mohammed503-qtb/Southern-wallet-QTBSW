/**
 * PUT /api/support/tickets/:id/status { status }
 * تغيير حالة التذكرة — SUPPORT/ADMIN فقط + تدقيق.
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { toTicketView } from "@/lib/server/views";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"];

export const PUT = route<Ctx>(async (req, ctx) => {
  const user = await requireUser(["SUPPORT", "ADMIN"]);
  const { id } = await ctx.params;
  const payload = await readJsonBody(req);
  const status = reqStr(payload, "status");

  if (!(STATUSES as string[]).includes(status)) {
    throw new RouteError("SYS-001", 400, { field: "status", reason: "حالة غير صالحة" });
  }
  const ticket = await db.supportTicket.findUnique({ where: { id } });
  if (!ticket) {
    throw new RouteError("SYS-001", 404, { reason: "تذكرة غير موجودة" });
  }

  const updated = await db.$transaction(async (tx) => {
    const t = await tx.supportTicket.update({
      where: { id },
      data: { status },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: true } },
      },
    });
    await writeAudit(
      tx,
      { id: user.id, role: user.role },
      "TICKET_STATUS",
      "TICKET",
      ticket.id,
      `تغيير حالة التذكرة ${ticket.ref}`,
      { from: ticket.status, to: status }
    );
    if (status === "RESOLVED") {
      await notify(
        tx,
        ticket.userId,
        "تم حل تذكرتك",
        `أُغلقت التذكرة ${ticket.ref} — يمكنك الرد لإعادة فتحها إن لزم.`,
        "SUPPORT",
        ticket.ref
      );
    }
    return t;
  });

  return ok(toTicketView(updated));
});
