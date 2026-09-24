import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { FloatingPanel } from "@/components/channels/floating-panel";
import {
  type CompanyLevel,
  getActiveLevel,
  subscribeLevel,
} from "@/lib/companies/level";

const POS_KEY = "connect.floating-composer";

function homeDefaultPos(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 80, y: 320 };
  const width = Math.min(560, window.innerWidth - 24);
  return {
    x: Math.max(12, Math.round((window.innerWidth - width) / 2)),
    y: Math.max(12, Math.round(window.innerHeight * 0.62)),
  };
}

/**
 * Draggable shell for the home composer — same light card look as channel bots.
 * Hidden while Focus is open so it does not float above the Focus overlay.
 */
export function FloatingComposerBar({
  children,
  className,
  title = "Ask anything",
  storageKey = POS_KEY,
  defaultPos = homeDefaultPos,
  zIndex = 30,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  storageKey?: string;
  defaultPos?: () => { x: number; y: number };
  zIndex?: number;
}) {
  const [level, setLevel] = useState<CompanyLevel>(() => getActiveLevel());
  useEffect(() => subscribeLevel(() => setLevel(getActiveLevel())), []);

  // Focus has its own composer; keep HQ panel behind / unmounted.
  if (level === 1) return null;

  return (
    <FloatingPanel
      className={className}
      defaultPos={defaultPos}
      storageKey={storageKey}
      title={title}
      width="min(35rem, calc(100vw - 1.5rem))"
      zIndex={zIndex}
    >
      <div className="p-1 [&_[data-floating-composer]]:border-0 [&_[data-floating-composer]]:bg-transparent [&_[data-floating-composer]]:shadow-none [&_[data-floating-composer]]:ring-0">
        {children}
      </div>
    </FloatingPanel>
  );
}
