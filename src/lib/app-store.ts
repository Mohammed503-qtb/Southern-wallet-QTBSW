/**
 * محفظة الجنوب — متجر التطبيق العام (zustand)
 * ---------------------------------------------------------
 * يملكه الوكيل 8-b، ويعتمد عليه 8-c (شاشات الميزات) و8-d (لوحات الأدوار).
 *
 * مسؤولياته:
 * 1) الجلسة: bootstrap() يقرأ GET /api/me ويقرر الوجهة:
 *    - 401 (لا جلسة)        → onboarding (أول مرة) أو login
 *    - CUSTOMER             → home
 *    - أي دور آخر           → console
 * 2) التوجيه: مكدس شاشات SPA (navigate/back/resetTo) مع params لكل شاشة.
 * 3) حالة الواجهة العامة: إخفاء الرصيد، سياق OTP الجاري، مسودة بيانات التسجيل.
 *
 * ملاحظة الإضافة الوحيدة عن عقد المهمة: الحقل paramStack (موازٍ لstack)
 * لاسترجاع params عند الرجوع — الشكل الظاهر (stack: ScreenKey[]) كما في العقد.
 */
"use client";

import { create } from "zustand";
import { api, ApiError } from "./api";
import type { MeView } from "./api-types";

/** مفاتيح كل شاشات التطبيق (عقد التوجيه الموحد) */
export type ScreenKey =
  | "splash"
  | "onboarding"
  | "login"
  | "otp"
  | "register"
  | "pin-create"
  | "biometric"
  | "home"
  | "services"
  | "wallet-details"
  | "transfer"
  | "scan-qr"
  | "wallet-transfer"
  | "remittance-create"
  | "remittances"
  | "cash-deposit"
  | "cash-withdraw"
  | "withdraw-code"
  | "agents-map"
  | "savings"
  | "savings-new"
  | "savings-goal"
  | "transactions"
  | "transaction-details"
  | "statement"
  | "notifications"
  | "profile"
  | "kyc"
  | "security"
  | "devices"
  | "settings"
  | "help"
  | "ticket-new"
  | "ticket-chat"
  | "docs"
  | "console";

/** الشاشات الجذرية لشريط التنقل السفلي (زبون فقط) */
export const ROOT_SCREENS: readonly ScreenKey[] = [
  "home",
  "services",
  "transactions",
  "notifications",
  "profile",
];

export interface PendingOtp {
  phone: string;
  mode: "REGISTER" | "LOGIN";
  devCode?: string;
}

/** بيانات نموذج التسجيل التي تُرسل مع verify عند إنشاء حساب جديد */
export interface RegisterDraft {
  fullName: string;
  governorate: string;
}

const ONBOARDED_KEY = "sw_onboarded";

export interface AppStore {
  // ---- الجلسة ----
  me: MeView | null;
  meLoading: boolean;
  bootstrapped: boolean;
  bootstrapError: { code: string; message: string } | null;
  bootstrap(): Promise<void>;
  refreshMe(): Promise<void>;
  logout(): Promise<void>;

  // ---- التوجيه ----
  screen: ScreenKey;
  params: Record<string, string>;
  stack: ScreenKey[];
  /** نسخة params لكل عنصر في stack لاسترجاعها عند back() */
  paramStack: Record<string, string>[];
  navigate(screen: ScreenKey, params?: Record<string, string>): void;
  back(): void;
  resetTo(screen: ScreenKey): void;

  // ---- حالة الواجهة ----
  balanceHidden: boolean;
  toggleBalanceHidden(): void;

  // ---- سياق المصادقة ----
  pendingOtp: PendingOtp | null;
  setPendingOtp(v: PendingOtp | null): void;
  registerDraft: RegisterDraft | null;
  setRegisterDraft(v: RegisterDraft | null): void;
}

function readOnboarded(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return false;
  }
}

/** تعليم أن المستخدم شاهد شرائح التعريف (لا تتكرر) */
export function markOnboarded(): void {
  try {
    window.localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    /* تجاهل — التخزين غير متاح */
  }
}

export const useAppStore = create<AppStore>((set, get) => ({
  // ================= الجلسة =================
  me: null,
  meLoading: false,
  bootstrapped: false,
  bootstrapError: null,

  bootstrap: async () => {
    set({ meLoading: true, bootstrapError: null });
    try {
      const me = await api.get<MeView>("/api/me");
      set({ me, meLoading: false, bootstrapped: true });
      get().resetTo(me.user.role === "CUSTOMER" ? "home" : "console");
    } catch (err) {
      set({ meLoading: false });
      if (err instanceof ApiError && err.status === 401) {
        // لا جلسة — نحو التعريف أو الدخول
        set({ me: null, bootstrapped: true });
        get().resetTo(readOnboarded() ? "login" : "onboarding");
        return;
      }
      const code = err instanceof ApiError ? err.code : "SYS-001";
      const message =
        err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء فتح التطبيق";
      set({ bootstrapError: { code, message } });
    }
  },

  refreshMe: async () => {
    try {
      const me = await api.get<MeView>("/api/me");
      set({ me, bootstrapped: true });
    } catch {
      // نُبقي آخر لقطة — شاشات الخطأ تتكفل بالعرض
    }
  },

  logout: async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // حتى لو فشل الطلب ننظف الحالة محلياً
    }
    set({ me: null, pendingOtp: null, registerDraft: null });
    get().resetTo(readOnboarded() ? "login" : "onboarding");
  },

  // ================= التوجيه =================
  screen: "splash",
  params: {},
  stack: [],
  paramStack: [],

  navigate: (screen, params = {}) => {
    set((s) => ({
      // ندفع الشاشة الحالية (مع params الخاصة بها) إلى المكدس
      stack: [...s.stack.slice(-59), s.screen],
      paramStack: [...s.paramStack.slice(-59), s.params],
      screen,
      params,
    }));
  },

  back: () => {
    const s = get();
    if (s.stack.length === 0) {
      // شاشة جذرية أو بلا تاريخ — العودة إلى الرئيسية لعميل مسجل
      if (s.me && s.me.user.role === "CUSTOMER" && s.screen !== "home") {
        s.resetTo("home");
      }
      return;
    }
    const prev = s.stack[s.stack.length - 1];
    const prevParams = s.paramStack[s.paramStack.length - 1] ?? {};
    set((st) => ({
      screen: prev,
      params: prevParams,
      stack: st.stack.slice(0, -1),
      paramStack: st.paramStack.slice(0, -1),
    }));
  },

  resetTo: (screen) => set({ screen, params: {}, stack: [], paramStack: [] }),

  // ================= حالة الواجهة =================
  balanceHidden: false,
  toggleBalanceHidden: () => set((s) => ({ balanceHidden: !s.balanceHidden })),

  // ================= سياق المصادقة =================
  pendingOtp: null,
  setPendingOtp: (v) => set({ pendingOtp: v }),
  registerDraft: null,
  setRegisterDraft: (v) => set({ registerDraft: v }),
}));
