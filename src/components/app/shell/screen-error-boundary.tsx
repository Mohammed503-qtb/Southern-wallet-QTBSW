/**
 * محفظة الجنوب — حدود أخطاء عرض الشاشات
 * يمنع سقوط التطبيق كله لو رمى مكوّن شاشة استثناءً (خاصة شاشات 8-c/8-d
 * المستقبلية) — يعرض ErrorState مع إعادة المحاولة (إعادة تركيب الشاشة).
 */
"use client";

import { Component, type ReactNode } from "react";
import { ErrorState } from "@/components/app/ui/error-state";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto w-full max-w-[440px] px-4 pb-6">
          <ErrorState
            message="حدث خطأ غير متوقع في هذه الشاشة"
            code={`UI-${this.state.error.name}`}
            onRetry={this.reset}
          />
        </div>
      );
    }
    // بلا DOM وسيط: يحافظ على سلسلة الارتفاع (main ← wrapper ← الشاشة)
    // حتى تمتد شاشة البداية لكامل منطقة العرض — وعند زوال الخطأ
    // تُعاد الشاشة بتركيب جديد (أُزيلت أثناء العرض الخطأ ثم عادت).
    return this.props.children;
  }
}
