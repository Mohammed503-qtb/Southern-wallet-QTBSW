/**
 * C4 — POST /api/cash { type, agentId, amountMinor, pin? } + Idempotency-Key
 * C5 — GET /api/cash (مع إنهاء كسول)
 *
 * DEPOSIT  → طلب PENDING فقط (بلا حركة مالية) + Transaction CASH_IN PENDING.
 * WITHDRAW → خصم فوري وحجز: [MAIN DEBIT a+f] + [FEE CREDIT f] + [SUSPENSE CREDIT a] Σ=0
 *            + Transaction CASH_OUT PENDING. صلاحية 24 ساعة، رمز 6 أرقام.
 * (عملة العمليات النقدية: YER فقط في Alpha)
 */
import { ok, route, readJsonBody, reqStr, reqInt, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { assertNotFrozen, assertInScope, generateRef, randomCode } from "@/lib/server/domain";
import { verifyPin } from "@/lib/server/pin";
import { computeFee, getFeeRule, requireValidAmount, assertDailyLimit, formatMinor } from "@/lib/server/money";
import { getOrCreateMainWallet, getSystemWallet, postEntries } from "@/lib/server/ledger";
import { notify } from "@/lib/server/notify";
import { readIdempotencyKey, findIdempotentTx, assertSamePayload, idmMeta } from "@/lib/server/idempotency";
import { runLazyExpiry } from "@/lib/server/cashflow";
import { toCashOpView } from "@/lib/server/views";
import { db } from "@/lib/db";

const CASH_TTL_MS = 24 * 3600_000;

async function loadAgentContext(agentProfileId: string) {
  const profile = await db.agentProfile.findUnique({ where: { id: agentProfileId } });
  if (!profile) {
    throw new RouteError("SYS-001", 404, { field: "agentId", reason: "وكيل غير موجود" });
  }
  if (profile.status !== "ACTIVE") {
    throw new RouteError("SRV-001", 403, { reason: "الوكيل غير مفعّل حالياً" });
  }
  return profile;
}

export const GET = route(async () => {
  const user = await requireUser();
  await runLazyExpiry(user.id);
  const rows = await db.cashOperation.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const agentIds = [...new Set(rows.map((r) => r.agentId))];
  const profiles = agentIds.length
    ? await db.agentProfile.findMany({ where: { userId: { in: agentIds } } })
    : [];
  const owners = agentIds.length
    ? await db.user.findMany({ where: { id: { in: agentIds } }, select: { id: true, fullName: true } })
    : [];
  const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
  const nameByUser = new Map(owners.map((o) => [o.id, o.fullName]));
  return ok(
    rows.map((r) => toCashOpView(r, profileByUser.get(r.agentId) ?? null, nameByUser.get(r.agentId) ?? null))
  );
});

export const POST = route(async (req) => {
  const user = await requireUser();
  assertNotFrozen(user);
  await assertInScope(db, user);

  const body = await readJsonBody(req);
  const type = reqStr(body, "type");
  const agentId = reqStr(body, "agentId");
  const amountMinor = requireValidAmount("YER", reqInt(body, "amountMinor"));
  const pin = typeof body["pin"] === "string" ? (body["pin"] as string) : null;

  if (type !== "DEPOSIT" && type !== "WITHDRAW") {
    throw new RouteError("SYS-001", 400, { field: "type", reason: "نوع العملية غير صالح" });
  }
  const profile = await loadAgentContext(agentId);

  // Idempotency
  const idemKey = readIdempotencyKey(req);
  if (idemKey) {
    const existing = await findIdempotentTx(db, user.id, idemKey);
    if (existing) {
      const expectedType = type === "DEPOSIT" ? "CASH_IN" : "CASH_OUT";
      if (existing.type !== expectedType) throw new RouteError("TXN-003", 409);
      assertSamePayload(existing, body);
      const op = await db.cashOperation.findFirst({ where: { ref: existing.ref, userId: user.id } });
      if (op) {
        return ok({ ...toCashOpView(op, profile, user.id === profile.userId ? user.fullName : null), replayed: true });
      }
      throw new RouteError("TXN-003", 409);
    }
  }

  if (type === "WITHDRAW" && !pin) {
    throw new RouteError("SYS-001", 400, { field: "pin", reason: "رمز PIN مطلوب للسحب" });
  }
  if (pin) {
    await verifyPin(db, user, pin);
  }

  const ref = generateRef("CW");
  const code = randomCode(6);
  const expiresAt = new Date(Date.now() + CASH_TTL_MS);

  if (type === "DEPOSIT") {
    // طلب معلق فقط — لا خصم ولا قيود حتى إتمام الوكيل (G3)
    const op = await db.$transaction(async (tx) => {
      const created = await tx.cashOperation.create({
        data: {
          ref,
          userId: user.id,
          agentId: profile.userId,
          type: "DEPOSIT",
          currency: "YER",
          amountMinor,
          feeMinor: 0,
          code,
          status: "PENDING",
          expiresAt,
        },
      });
      await tx.transaction.create({
        data: {
          ref,
          userId: user.id,
          type: "CASH_IN",
          status: "PENDING",
          currency: "YER",
          amountMinor,
          feeMinor: 0,
          direction: "CREDIT",
          counterpartyName: profile.shopName,
          counterpartyPhone: null,
          description: `طلب إيداع نقدي لدى ${profile.shopName}`,
          idempotencyKey: idemKey,
          metadataJson: JSON.stringify(
            idemKey ? idmMeta(body, { cashOpRef: ref, code, agentId: profile.userId }) : { cashOpRef: ref, code, agentId: profile.userId }
          ),
        },
      });
      await notify(
        tx,
        user.id,
        "طلب إيداع بانتظار الوكيل",
        `قدم رمز التحقق ${code} لدى ${profile.shopName} لإتمام إيداع ${formatMinor(amountMinor, "YER")} — صالح 24 ساعة.`,
        "TXN",
        ref
      );
      return created;
    });
    return ok(toCashOpView(op!, profile, user.id === profile.userId ? user.fullName : null));
  }

  // WITHDRAW: خصم وحجز فوري في SUSPENSE
  const op = await db.$transaction(async (tx) => {
    const main = await getOrCreateMainWallet(tx, user.id, "YER");
    const feeRule = await getFeeRule(tx, "WITHDRAW", "YER");
    const feeMinor = computeFee(feeRule, amountMinor);
    const totalDebit = amountMinor + feeMinor;

    if (main.balanceMinor < totalDebit) {
      throw new RouteError("TXN-001", 400, { currency: "YER", balance: main.balanceMinor });
    }
    await assertDailyLimit(tx, user, "YER", totalDebit);

    const feeWallet = await getSystemWallet(tx, "FEE", "YER");
    const suspense = await getSystemWallet(tx, "SUSPENSE", "YER");

    const created = await tx.cashOperation.create({
      data: {
        ref,
        userId: user.id,
        agentId: profile.userId,
        type: "WITHDRAW",
        currency: "YER",
        amountMinor,
        feeMinor,
        code,
        status: "PENDING",
        expiresAt,
      },
    });
    await tx.transaction.create({
      data: {
        ref,
        userId: user.id,
        type: "CASH_OUT",
        status: "PENDING",
        currency: "YER",
        amountMinor,
        feeMinor,
        direction: "DEBIT",
        counterpartyName: profile.shopName,
        counterpartyPhone: null,
        description: `طلب سحب نقدي لدى ${profile.shopName}`,
        idempotencyKey: idemKey,
        metadataJson: JSON.stringify(
          idemKey ? idmMeta(body, { cashOpRef: ref, code, agentId: profile.userId }) : { cashOpRef: ref, code, agentId: profile.userId }
        ),
      },
    });
    await postEntries(
      tx,
      [
        { walletId: main.id, direction: "DEBIT", amountMinor: totalDebit },
        { walletId: feeWallet.id, direction: "CREDIT", amountMinor: feeMinor },
        { walletId: suspense.id, direction: "CREDIT", amountMinor },
      ],
      { transactionRef: ref, currency: "YER" }
    );
    await notify(
      tx,
      user.id,
      "طلب سحب بانتظار الوكيل",
      `مبلغ ${formatMinor(totalDebit, "YER")} محجوز — استلم ${formatMinor(amountMinor, "YER")} من ${profile.shopName} برمز ${code} (صالح 24 ساعة).`,
      "TXN",
      ref
    );
    return created;
  });
  return ok(toCashOpView(op!, profile, user.id === profile.userId ? user.fullName : null));
});
