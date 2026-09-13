/**
 * محفظة الجنوب — الملف الشخصي (SC-38)
 * بطاقة هوية (أفاتار حرف أول ذهبي/الاسم/الهاتف مقنّع/شريحة حالة الحساب/شارة
 * KYC) + معلومات (المحافظة/تاريخ الانضمام/اللغة) + قائمة إعدادات سريعة
 * (روابط صفوف بأسهم) + زر تسجيل خروج (تأكيد → store.logout()).
 */
"use client";

import { useState } from "react";
import {
  BadgeCheck,
  Bell,
  CalendarDays,
  Languages,
  LifeBuoy,
  LogOut,
  MapPin,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { maskPhone } from "@/lib/api-types";
import { ErrorState } from "@/components/app/ui/error-state";
import { ScreenHeader } from "@/components/app/ui/screen-header";
import { Skeleton } from "@/components/app/ui/skeleton";
import { SettingRow, SectionCard, USER_STATUS_LABELS } from "./account-shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/** تاريخ طويل بالعربية: 12 مارس 2026 */
function arabicLongDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar", { dateStyle: "long" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** شريحة حالة الحساب (نشط/مجمّد/…) بألوان الهوية */
function UserStatusChip({ status }: { status: string }) {
  const tone =
    status === "ACTIVE"
      ? "border-[#15803D]/20 bg-[#15803D]/10 text-[#15803D]"
      : status === "FROZEN"
        ? "border-[#B91C1C]/25 bg-[#B91C1C]/10 text-[#B91C1C]"
        : "border-[#B45309]/25 bg-[#B45309]/10 text-[#B45309]";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        tone,
      )}
    >
      {USER_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** شارة مستوى التوثيق */
function KycBadge({ level }: { level: "NONE" | "VERIFIED" }) {
  return level === "VERIFIED" ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#15803D]/20 bg-[#15803D]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#15803D]">
      <BadgeCheck strokeWidth={1.5} className="h-3.5 w-3.5" />
      حساب موثّق
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#B45309]/25 bg-[#B45309]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#B45309]">
      <TriangleAlert strokeWidth={1.5} className="h-3.5 w-3.5" />
      غير موثّق
    </span>
  );
}

const LINKS = [
  {
    icon: BadgeCheck,
    title: "توثيق الحساب",
    subtitle: "ارفع مستوى حسابك وحدوده",
    screen: "kyc" as const,
  },
  {
    icon: ShieldCheck,
    title: "الأمان",
    subtitle: "رمز PIN والجلسات النشطة",
    screen: "security" as const,
  },
  {
    icon: Smartphone,
    title: "أجهزتي",
    subtitle: "الجلسات النشطة وإنهاؤها",
    screen: "devices" as const,
  },
  {
    icon: Bell,
    title: "الإعدادات",
    subtitle: "اللغة والخصوصية وحول التطبيق",
    screen: "settings" as const,
  },
  {
    icon: LifeBuoy,
    title: "مركز المساعدة",
    subtitle: "الأسئلة الشائعة وتذاكر الدعم",
    screen: "help" as const,
  },
];

export function ProfileScreen() {
  const me = useAppStore((s) => s.me);
  const meLoading = useAppStore((s) => s.meLoading);
  const bootstrap = useAppStore((s) => s.bootstrap);
  const navigate = useAppStore((s) => s.navigate);
  const logout = useAppStore((s) => s.logout);
  const [confirmLogout, setConfirmLogout] = useState(false);

  if (!me) {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
        <div className="mt-6 flex items-center gap-3">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <Skeleton className="mt-4 h-24 w-full rounded-2xl" />
        {!meLoading ? (
          <div className="mt-4">
            <ErrorState
              compact
              message="انتهت الجلسة أو لم تُحمَل بياناتك"
              onRetry={() => void bootstrap()}
            />
          </div>
        ) : null}
      </div>
    );
  }

  const user = me.user;
  const initial = (user.fullName ?? "م").trim().charAt(0);

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-8">
      <ScreenHeader title="حسابي" subtitle="ملفك الشخصي وإعداداته" showBack={false} />

      {/* ===== بطاقة الهوية ===== */}
      <section className="mt-4 overflow-hidden rounded-2xl border border-[#E8E6E1] bg-white shadow-[0_2px_8px_rgba(11,11,12,0.04)]">
        <div aria-hidden="true" className="h-[3px] w-full bg-[#C9A227]" />
        <div className="flex items-center gap-3.5 p-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#0B0B0C] text-[26px] font-extrabold text-[#C9A227]">
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[18px] font-bold leading-6 text-[#141416]">
              {user.fullName ?? "بدون اسم"}
            </p>
            <p dir="ltr" className="text-right text-[14px] font-semibold tabular-nums text-[#5C5A56]">
              {maskPhone(user.phone)}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <UserStatusChip status={user.status} />
              <KycBadge level={user.kycLevel} />
            </div>
          </div>
        </div>

        {/* معلومات عامة */}
        <div className="grid grid-cols-3 divide-x divide-x-reverse divide-[#E8E6E1]/70 border-t border-[#E8E6E1]/70">
          <div className="flex flex-col items-center gap-1 px-2 py-3 text-center">
            <MapPin strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
            <span className="text-[10.5px] font-semibold text-[#A3A09B]">المحافظة</span>
            <span className="text-[13px] font-bold text-[#141416]">
              {user.governorate ?? "غير محددة"}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1 px-2 py-3 text-center">
            <CalendarDays strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
            <span className="text-[10.5px] font-semibold text-[#A3A09B]">عضو منذ</span>
            <span className="text-[13px] font-bold text-[#141416]">
              {arabicLongDate(user.createdAt)}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1 px-2 py-3 text-center">
            <Languages strokeWidth={1.5} className="h-4 w-4 text-[#C9A227]" />
            <span className="text-[10.5px] font-semibold text-[#A3A09B]">اللغة</span>
            <span className="text-[13px] font-bold text-[#141416]">العربية</span>
          </div>
        </div>
      </section>

      {/* ===== روابط الإعدادات السريعة ===== */}
      <div className="mt-4 space-y-2">
        {LINKS.map((l) => (
          <SettingRow
            key={l.screen}
            icon={l.icon}
            title={l.title}
            subtitle={l.subtitle}
            onClick={() => navigate(l.screen)}
          />
        ))}
      </div>

      {/* ===== تسجيل الخروج ===== */}
      <div className="mt-5">
        <SettingRow
          icon={LogOut}
          title="تسجيل الخروج"
          subtitle="إنهاء الجلسة على هذا الجهاز"
          danger
          chevron={false}
          onClick={() => setConfirmLogout(true)}
        />
      </div>

      <p className="mt-4 text-center text-[11px] font-medium text-[#A3A09B]">
        محفظة الجنوب — بياناتك محفوظة ومحمية بتشفير
      </p>

      {/* تأكيد تسجيل الخروج */}
      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="items-center text-center">
            <AlertDialogTitle className="text-[18px] font-bold">
              تسجيل الخروج من محفظة الجنوب؟
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] font-medium leading-6">
              ستنتهي جلستك على هذا الجهاز. أرصدتك وعملياتك تبقى كما هي —
              وستحتاج رمز التحقق للدخول مجدداً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter dir="rtl" className="flex-row-reverse gap-2">
            <AlertDialogAction
              onClick={() => void logout()}
              className="min-h-11 rounded-xl bg-[#B91C1C] text-[14px] font-bold text-white hover:bg-[#A01717]"
            >
              نعم، خروج
            </AlertDialogAction>
            <AlertDialogCancel className="min-h-11 rounded-xl border border-[#E8E6E1] text-[14px] font-bold text-[#141416]">
              إلغاء
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
