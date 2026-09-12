/**
 * S3 — POST /api/savings/:id/contribute { amountMinor, pin } + Idempotency-Key
 * إيداع في الحصالة: [MAIN DEBIT a] + [SAVINGS CREDIT a]  Σ=0
 * + Transaction SAVING_IN + إشعار + ترقية الحالة ACHIEVED عند بلوغ الهدف.
 */
import { ok, route, readJsonBody, reqStr, reqInt, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { assertNotFrozen, assertInScope, generateRef } from "@/lib/server/domain";
import { verifyPin } from "@/lib/server/pin";
import { requireValidAmount, formatMinor } from "@/lib/server/money";
import { getOrCreateMainWallet, getOrCreateSavingsWallet, postEntries } from "@/lib/server/ledger";
import { notify } from "@/lib/server/notify";
import { readIdempotencyKey, findIdempotentTx, assertSamePayload, idmMeta } from "@/lib/server/idempotency";
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
  const amountMinor = requireValidAmount("YER", reqInt(body, "amountMinor"));
  const pin = reqStr(body, "pin");

  const idemKey = readIdempotencyKey(req);
  if (idemKey) {
    const existing = await findIdempotentTx(db, user.id, idemKey);
    if (existing) {
      if (existing.type !== "SAVING_IN") throw new RouteError("TXN-003", 409);
      assertSamePayload(existing, body);
      const jar = await db.savingsJar.findFirst({ where: { id, userId: user.id } });
      const wallet = jar
        ? await db.wallet.findFirst({ where: { userId: user.id, kind: "SAVINGS", jarId: jar.id } })
        : null;
      return ok({
        jar: jar ? toSavingsJarView(jar, wallet?.balanceMinor ?? 0) : null,
        tx: toTxView(existing),
        replayed: true,
      });
    }
  }

  const jar = await db.savingsJar.findFirst({ where: { id, userId: user.id } });
  if (!jar) {
    throw new RouteError("SYS-001", 404, { reason: "حصالة غير موجودة" });
  }
  if (jar.status === "BROKEN") {
    throw new RouteError("SYS-001", 400, { reason: "هذه الحصالة محطمة" });
  }

  await verifyPin(db, user, pin);

  const result = await db.$transaction(async (tx) => {
    const main = await getOrCreateMainWallet(tx, user.id, jar.currency);
    const savings = await getOrCreateSavingsWallet(tx, user.id, jar.id, jar.currency);
    if (main.balanceMinor < amountMinor) {
      throw new RouteError("TXN-001", 400, { currency: jar.currency as CurrencyCode, balance: main.balanceMinor });
    }
    const ref = generateRef("SW");
    const txRow = await tx.transaction.create({
      data: {
        ref,
        userId: user.id,
        type: "SAVING_IN",
        status: "COMPLETED",
        currency: jar.currency,
        amountMinor,
        feeMinor: 0,
        direction: "DEBIT",
        description: `إيداع في حصالة «${jar.name}»`,
        idempotencyKey: idemKey,
        completedAt: new Date(),
        metadataJson: idemKey ? JSON.stringify(idmMeta(body, { jarId: jar.id })) : JSON.stringify({ jarId: jar.id }),
      },
    });
    await postEntries(
      tx,
      [
        { walletId: main.id, direction: "DEBIT", amountMinor },
        { walletId: savings.id, direction: "CREDIT", amountMinor },
      ],
      { transactionRef: ref, currency: jar.currency }
    );
    // بلوغ الهدف
    const newSaved = savings.balanceMinor + amountMinor;
    if (jar.targetMinor && newSaved >= jar.targetMinor && jar.status === "ACTIVE") {
      await tx.savingsJar.update({ where: { id: jar.id }, data: { status: "ACHIEVED" } });
    }
    await notify(
      tx,
      user.id,
      "إيداع في الحصالة",
      `أودعت ${formatMinor(amountMinor, jar.currency as CurrencyCode)} في حصالة «${jar.name}» — الرصيد ${formatMinor(newSaved, jar.currency as CurrencyCode)}.`,
      "TXN",
      ref
    );
    return { txRow, jarId: jar.id, saved: newSaved };
  });

  const freshJar = await db.savingsJar.findUnique({ where: { id: result.jarId } });
  return ok({ jar: toSavingsJarView(freshJar!, result.saved), tx: toTxView(result.txRow) });
});
