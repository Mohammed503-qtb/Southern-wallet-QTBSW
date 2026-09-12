/**
 * GET /api/merchant/pos — دور MERCHANT فقط (9-c)
 * ---------------------------------------------
 * بوابة نقطة البيع: إحصاءات اليوم (عدد/حجم إجمالي/صافي بعد الرسوم) +
 * آخر 10 مبيعات + الرصيد المستحق للتسوية (مجموع net لكل معاملات
 * MERCHANT_SALE_IN المكتملة) + بيانات رمز الدفع (SWPAY:<phone>).
 * كل الأرقام من جدول Transaction للتجار — لا تعدّل أي رصيد.
 * ملاحظة "اليوم": بتوقيت عدن (dayStartAden — UTC+3) كما في الحدود اليومية.
 */
import { ok, route } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import { dayStartAden } from "@/lib/server/money";
import { toTxView } from "@/lib/server/views";
import { db } from "@/lib/db";

export const GET = route(async () => {
  const user = await requireUser(["MERCHANT"]);

  const [todayAgg, allAgg, recent] = await Promise.all([
    db.transaction.aggregate({
      where: {
        userId: user.id,
        type: "MERCHANT_SALE_IN",
        status: "COMPLETED",
        createdAt: { gte: dayStartAden() },
      },
      _count: true,
      _sum: { amountMinor: true, feeMinor: true },
    }),
    db.transaction.aggregate({
      where: {
        userId: user.id,
        type: "MERCHANT_SALE_IN",
        status: "COMPLETED",
      },
      _count: true,
      _sum: { amountMinor: true, feeMinor: true },
    }),
    db.transaction.findMany({
      where: { userId: user.id, type: "MERCHANT_SALE_IN" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const todayCount = typeof todayAgg._count === "number" ? todayAgg._count : 0;
  const todayNetMinor = todayAgg._sum.amountMinor ?? 0;
  const todayFeesMinor = todayAgg._sum.feeMinor ?? 0;
  const allCount = typeof allAgg._count === "number" ? allAgg._count : 0;
  const allNetMinor = allAgg._sum.amountMinor ?? 0;

  return ok({
    shopName: user.fullName?.trim() || "متجر معتمد",
    phone: user.phone,
    qrPayload: `SWPAY:${user.phone}`,
    currency: "YER" as const,
    today: {
      count: todayCount,
      grossMinor: todayNetMinor + todayFeesMinor, // حجم المبيعات قبل خصم رسوم التاجر
      netMinor: todayNetMinor, // الصافي بعد الرسوم
      feesMinor: todayFeesMinor,
    },
    total: {
      count: allCount,
      netMinor: allNetMinor,
    },
    /** الرصيد المستحق للتسوية = مجموع صافي كل المبيعات المكتملة */
    dueSettlementMinor: allNetMinor,
    recentSales: recent.map((t) => toTxView(t)),
  });
});
