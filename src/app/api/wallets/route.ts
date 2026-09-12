/**
 * W1 — GET /api/wallets  → WalletView[] (محافظ MAIN فقط)
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { toWalletView } from "@/lib/server/views";
import { db } from "@/lib/db";

export const GET = route(async () => {
  const user = await requireUser();
  const wallets = await db.wallet.findMany({ where: { userId: user.id, kind: "MAIN" } });
  return ok(wallets.map(toWalletView));
});
