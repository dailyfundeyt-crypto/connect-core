import React from "react";
import { cn } from "@/lib/utils";
import type { QuotaConfidence } from "./types";

export interface QuotaRingProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
  confidence?: QuotaConfidence;
  isShared?: boolean;
  className?: string;
}

export function QuotaRing({
  percent,
  size = 76,
  strokeWidth = 7,
  confidence = "exact",
  isShared = false,
  className,
}: QuotaRingProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  // Determine color scheme
  let strokeColor = "stroke-emerald-500";
  let textColor = "text-emerald-400";
  let glowColor = "drop-shadow-[0_0_8px_rgba(16,185,129,0.35)]";

  if (isShared) {
    strokeColor = "stroke-sky-500/60";
    textColor = "text-sky-300";
    glowColor = "drop-shadow-[0_0_6px_rgba(56,189,248,0.25)]";
  } else if (clamped >= 90) {
    strokeColor = "stroke-rose-500";
    textColor = "text-rose-400";
    glowColor = "drop-shadow-[0_0_8px_rgba(244,63,94,0.4)]";
  } else if (clamped >= 70) {
    strokeColor = "stroke-amber-500";
    textColor = "text-amber-400";
    glowColor = "drop-shadow-[0_0_8px_rgba(245,158,11,0.35)]";
  }

  return (
    <div
      className={cn("relative inline-flex items-center justify-center select-none", className)}
      style={{ width: size, height: size }}
      aria-label={`Quota: ${isShared ? "Shared" : `${clamped.toFixed(1)}%`}`}
      role="progressbar"
      aria-valuenow={isShared ? undefined : clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {/* Background track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="stroke-zinc-800/80 dark:stroke-white/[0.08]"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Animated Progress circle */}
        {!isShared && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className={cn(
              "transition-all duration-700 ease-out",
              strokeColor,
              glowColor
            )}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="none"
          />
        )}
        {/* Subtle decorative dot for shared */}
        {isShared && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className={cn("stroke-sky-500/40", glowColor)}
            strokeWidth={strokeWidth}
            strokeDasharray="4 6"
            fill="none"
          />
        )}
      </svg>

      {/* Center Label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {isShared ? (
          <span className="text-[11px] font-semibold tracking-wide text-sky-400 uppercase">
            Shared
          </span>
        ) : (
          <>
            <span className={cn("text-sm font-bold tracking-tight font-mono", textColor)}>
              {clamped < 10 && clamped > 0 ? clamped.toFixed(1) : Math.round(clamped)}%
            </span>
            <span className="text-[9px] uppercase tracking-wider text-zinc-400 -mt-0.5 font-medium">
              Used
            </span>
          </>
        )}
      </div>
    </div>
  );
}
