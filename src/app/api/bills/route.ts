/**
 * BIL — GET /api/bills → BillerView[] (كتالوج مزودي الفواتير + الرسوم الحية)
 * 9-b: يُدعم أيضاً ?ref=<مرجع عملية BILL_PAY> لإرجاع metadata الفاتورة
 * (اسم المزود ورقم الحساب) لعرضها في تفاصيل العملية — ملك 9-b حصراً.
 * العملة: YER فقط (Beta).
 */
import { ok, route, RouteError } from "@/lib/server/envelope";
import { requireUser } from "@/lib/server/auth";
import {
  BILLERS,
  peekPaymentsFeeMinor,
  toBillerView,
} from "@/lib/server/payments-catalog";
import { db } from "@/lib/db";

export const GET = route(async (req) => {
  const user = await requireUser();

  // وضع استرجاع metadata لعملية BILL_PAY محددة (تفاصيل العملية)
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref");
  if (ref) {
    const tx = await db.transaction.findFirst({ where: { ref, userId: user.id } });
    if (!tx || tx.type !== "BILL_PAY") {
      throw new RouteError("SYS-001", 404, { reason: "عملية سداد فاتورة غير موجودة" });
    }
    let meta: {
      billerName?: string;
      accountNumber?: string;
      dueAmountMinor?: number;
    } = {};
    try {
      meta = tx.metadataJson
        ? (JSON.parse(tx.metadataJson) as typeof meta)
        : {};
    } catch {
      meta = {};
    }
    return ok({
      billerName: meta.billerName ?? tx.counterpartyName ?? "مزوّد فاتورة",
      accountNumber: meta.accountNumber ?? null,
      dueAmountMinor: typeof meta.dueAmountMinor === "number" ? meta.dueAmountMinor : null,
    });
  }

  // الكتالوج مع الرسوم الحية من FeeRule (BILL_PAY/YER)
  const feeMinor = await peekPaymentsFeeMinor(db, "BILL_PAY");
  return ok(BILLERS.map((b) => toBillerView(b, feeMinor)));
});
