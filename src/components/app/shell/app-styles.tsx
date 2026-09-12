/**
 * محفظة الجنوب — أنماط الحركة العامة للتطبيق (مرة واحدة)
 * حركات CSS المخصصة (لا تُعدّل globals.css — مملوكة لـ8-0):
 * - sw-splash-in: دخول شعار البداية (fade + scale)
 * - sw-fade-in: انتقال خفيف بين الشاشات
 * - sw-progress: مؤشر التقدم الذهبي أسفل زر الإجراء الأساسي
 * - sw-breathe: تنفّس لطيف (مؤشر الخانة النشطة في OTP)
 */
"use client";

const CSS = `
@keyframes sw-splash-in {
  from { opacity: 0; transform: scale(0.86); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes sw-fade-in {
  /* نبدأ من شبه مرئي (0.3) لا من الصفر — يمنع وميض الإطار الفارغ عند الانتقال */
  from { opacity: 0.3; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes sw-progress {
  0% { right: 100%; }
  100% { right: -33%; }
}
@keyframes sw-breathe {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
.sw-splash-logo { animation: sw-splash-in 700ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.sw-fade-in { animation: sw-fade-in 220ms ease-out both; }
.sw-progress-track { background: rgba(201, 162, 39, 0.18); }
.sw-progress-bar { animation: sw-progress 1.15s ease-in-out infinite; }
.sw-breathe { animation: sw-breathe 2.2s ease-in-out infinite; }
`;

export function AppStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
