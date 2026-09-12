/**
 * A5 — GET /api/me
 * MeView: user + wallets + kyc + limits + unread + scopeNotice
 * مع إنهاء كسول خفيف لتحديث حالات المستخدم.
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { runLazyExpiry } from "@/lib/server/cashflow";
import { toPublicUser, toWalletView, toKycView } from "@/lib/server/views";
import { db } from "@/lib/db";
import type { MeView } from "@/lib/api-types";

export const GET = route(async () => {
  const user = await requireUser();
  await runLazyExpiry(user.id);

  const [wallets, kyc, limits, unread] = await Promise.all([
    db.wallet.findMany({ where: { userId: user.id, kind: "MAIN" } }),
    db.kycSubmission.findUnique({ where: { userId: user.id } }),
    db.limitRule.findMany({ where: { kycLevel: user.kycLevel } }),
    db.notification.count({ where: { userId: user.id, read: false } }),
  ]);

  const me: MeView = {
    user: toPublicUser(user),
    wallets: wallets.map(toWalletView),
    kyc: kyc ? toKycView(kyc) : null,
    limits: limits.map((l) => ({
      kycLevel: l.kycLevel as "NONE" | "VERIFIED",
      currency: l.currency as MeView["limits"][number]["currency"],
      dailyTxnCount: l.dailyTxnCount,
      dailyAmountMinor: l.dailyAmountMinor,
      perTxnAmountMinor: l.perTxnAmountMinor,
    })),
    unreadNotifications: unread,
    scopeNotice: user.scopeRestricted
      ? "أنت خارج نطاق الخدمة الجغرافي — حسابك للعرض فقط والعمليات المالية معطلة"
      : null,
  };
  return ok(me);
});
