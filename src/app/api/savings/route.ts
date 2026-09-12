/**
 * S1 — GET /api/savings  → SavingsJarView[] (savedMinor من رصيد محفظة الحصالة)
 * S2 — POST /api/savings { name, targetMinor?, currency } → SavingsJarView
 */
import { ok, route, readJsonBody, reqStr, RouteError, optInt } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { assertValidCurrency } from "@/lib/server/domain";
import { toSavingsJarView } from "@/lib/server/views";
import { getOrCreateSavingsWallet } from "@/lib/server/ledger";
import { db } from "@/lib/db";

export const GET = route(async () => {
  const user = await requireUser();
  const jars = await db.savingsJar.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const wallets = await db.wallet.findMany({ where: { userId: user.id, kind: "SAVINGS" } });
  const byJar = new Map(wallets.map((w) => [w.jarId ?? "", w]));
  return ok(jars.map((j) => toSavingsJarView(j, byJar.get(j.id)?.balanceMinor ?? 0)));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await readJsonBody(req);
  const name = reqStr(body, "name");
  const targetMinor = optInt(body, "targetMinor");
  const currency = assertValidCurrency(reqStr(body, "currency"));
  if (targetMinor !== null && targetMinor < 0) {
    throw new RouteError("SYS-001", 400, { field: "targetMinor", reason: "قيمة هدف غير صالحة" });
  }

  const jar = await db.$transaction(async (tx) => {
    const created = await tx.savingsJar.create({
      data: { userId: user.id, name, targetMinor, currency, status: "ACTIVE" },
    });
    // محفظة الحصالة (رصيد 0)
    await getOrCreateSavingsWallet(tx, user.id, created.id, currency);
    return created;
  });
  return ok(toSavingsJarView(jar, 0));
});
