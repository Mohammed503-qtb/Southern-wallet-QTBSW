/**
 * S5 — POST /api/savings/:id/break { pin }
 * تحطيم الحصالة: سحب كامل الرصيد + الحالة BROKEN (عملية غير قابلة للتكرار).
 */
import { ok, route, readJsonBody, reqStr, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { assertNotFrozen, assertInScope, generateRef } from "@/lib/server/domain";
import { verifyPin } from "@/lib/server/pin";
import { formatMinor } from "@/lib/server/money";
import { getOrCreateMainWallet, getOrCreateSavingsWallet, postEntries } from "@/lib/server/ledger";
import { notify } from "@/lib/server/notify";
import { toSavingsJarView, toTxView } from "@/lib/server/views";
import { db } from "@/lib/db";
import type { CurrencyCode } from "@/lib/api-types";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  assertNotFrozen(user);
  await assertInScope(db, user);
  const { id } = await ctx.params;

  const body = await readJsonBody(req);
  const pin = reqStr(body, "pin");

  const jar = await db.savingsJar.findFirst({ where: { id, userId: user.id } });
  if (!jar) {
    throw new RouteError("SYS-001", 404, { reason: "حصالة غير موجودة" });
  }
  if (jar.status === "BROKEN") {
    throw new RouteError("SYS-001", 400, { reason: "هذه الحصالة محطمة بالفعل" });
  }

  await verifyPin(db, user, pin);

  const result = await db.$transaction(async (tx) => {
    const savings = await getOrCreateSavingsWallet(tx, user.id, jar.id, jar.currency);
    const amount = savings.balanceMinor;
    const txRow = amount > 0
      ? await (async () => {
          const main = await getOrCreateMainWallet(tx, user.id, jar.currency);
          const ref = generateRef("SW");
          const row = await tx.transaction.create({
            data: {
              ref,
              userId: user.id,
              type: "SAVING_OUT",
              status: "COMPLETED",
              currency: jar.currency,
              amountMinor: amount,
              feeMinor: 0,
              direction: "CREDIT",
              description: `تحطيم حصالة «${jar.name}»`,
              completedAt: new Date(),
              metadataJson: JSON.stringify({ jarId: jar.id, broken: true }),
            },
          });
          await postEntries(
            tx,
            [
              { walletId: savings.id, direction: "DEBIT", amountMinor: amount },
              { walletId: main.id, direction: "CREDIT", amountMinor: amount },
            ],
            { transactionRef: ref, currency: jar.currency }
          );
          return row;
        })()
      : null;
    await tx.savingsJar.update({ where: { id: jar.id }, data: { status: "BROKEN" } });
    await notify(
      tx,
      user.id,
      "تم تحطيم الحصالة",
      `حُطمت حصالة «${jar.name}»${amount > 0 ? ` واستُرد ${formatMinor(amount, jar.currency as CurrencyCode)} إلى محفظتك` : ""}.`,
      "TXN",
      txRow?.ref ?? null
    );
    return { txRow, saved: 0 };
  });

  const freshJar = await db.savingsJar.findUnique({ where: { id: jar.id } });
  return ok({ jar: toSavingsJarView(freshJar!, 0), tx: result.txRow ? toTxView(result.txRow) : null });
});
