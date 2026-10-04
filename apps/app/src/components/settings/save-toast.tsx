import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface SaveToastProps {
  /** Set to a non-null value to show "Gespeichert" for 1.5s */
  savedAt: number | null;
}

export function SaveToast({ savedAt }: SaveToastProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (savedAt === null) return;
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [savedAt]);

  return (
    <div
      className={cn(
        "fixed top-4 right-4 z-50 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1f1f1f] px-3 py-1.5 text-xs text-[#888] transition-opacity duration-300",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      aria-live="polite"
      role="status"
    >
      <svg
        className="size-3 text-emerald-400"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        viewBox="0 0 24 24"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      Gespeichert
    </div>
  );
}
