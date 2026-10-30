/**
 * Kleine Verlaufslinie des Token-Widgets (Lane A35).
 *
 * Reines SVG ohne Chart-Bibliothek: die Karte bleibt leicht, und die Linie ist
 * bei jeder Größe scharf. Ohne Tageswerte wird nichts gezeichnet (keine erfundenen Daten).
 */

import { useId } from "react";
import { cn } from "@/lib/utils";
import { buildSparklinePath } from "./format";
import type { TokenUsagePoint } from "./types";

export function TokenUsageSparkline({
  points,
  label = "Verlauf des Token-Verbrauchs",
  className,
}: {
  points: TokenUsagePoint[];
  label?: string;
  className?: string;
}) {
  const gradientId = `token-usage-spark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const geometry = buildSparklinePath(points, { width: 120, height: 40 });

  if (!geometry) return null;

  return (
    <svg
      aria-label={label}
      className={cn("h-10 w-[120px] shrink-0 overflow-visible", className)}
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        className="text-sky-500"
        d={geometry.area}
        fill={`url(#${gradientId})`}
      />
      <path
        className="text-sky-500"
        d={geometry.line}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
