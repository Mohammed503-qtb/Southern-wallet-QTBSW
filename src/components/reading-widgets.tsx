"use client";

/**
 * أدوات القراءة — محفظة الجنوب
 * شريط تقدم القراءة (أعلى الصفحة) + زر العودة للأعلى
 */

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const total =
        document.documentElement.scrollHeight - window.innerHeight;
      setProgress(total > 0 ? Math.min(100, (window.scrollY / total) * 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="no-print fixed inset-x-0 top-0 z-50 h-1">
      <div
        className="h-full bg-gradient-to-l from-[#C9A227] via-[#d4b64a] to-[#8a6d1d] transition-[width] duration-150"
        style={{ width: `${progress}%` }}
        role="progressbar"
        aria-label="تقدم قراءة الوثيقة"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

export function BackToTop() {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setShowTop(window.scrollY > 600);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!showTop) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="العودة إلى أعلى الوثيقة"
      className="no-print fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-[#C9A227]/30 bg-white text-[#8a6d1d] shadow-lg transition-transform hover:scale-105 hover:bg-[#C9A227]/10"
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
