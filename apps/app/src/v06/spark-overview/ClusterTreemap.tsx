/**
 * A17 – ClusterTreemap: Kachel-Übersicht; Größe = noteCount, Farbe = Heat.
 * Klick auf eine Kachel → Drill-down.
 * Wave 4 (A36): Design-System V2 Token-Farben & Transitions.
 */
import { useMemo } from "react";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";
import { computeLayout, type TreemapRect } from "./treemap";
import type { Cluster } from "./api";
import { EmptyState } from "@/v06/design/EmptyState";
import { IconFolderSearch } from "@tabler/icons-react";

export const TREEMAP_COLORS = ["#16a34a", "#facc15", "#f97316", "#dc2626"];
export const TREEMAP_DESIGN_TOKENS = [
  "var(--p-success)",
  "var(--p-accent)",
  "var(--p-warning)",
  "var(--p-danger)",
];

const MIN_TILE_W = 34;
const MIN_TILE_H = 22;

export interface ClusterTreemapProps {
  clusters: Cluster[];
  /** Bekant des Containers (wird intern via useMeasure anpassungsort). */
  width?: number;
  height?: number;
  selectedClusterId?: string | null;
  onClusterSelect?: (clusterId: string) => void;
  className?: string;
}

export function heatColor(heat: number, isDesignV2 = false): string {
  const palette = isDesignV2 ? TREEMAP_DESIGN_TOKENS : TREEMAP_COLORS;
  const idx = Math.min(palette.length - 1, Math.max(0, Math.round(heat * (palette.length - 1))));
  return palette[idx];
}

export function ClusterTreemap({
  clusters,
  width = 800,
  height = 400,
  selectedClusterId,
  onClusterSelect,
  className,
}: ClusterTreemapProps) {
  const isDesignV2 = getFlag("designV2");
  const rects = useMemo(() => computeLayout(clusters, { width, height }), [clusters, width, height]);

  return (
    <div
      className={cn(
        "relative overflow-hidden transition-colors",
        isDesignV2
          ? "rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-1)] shadow-[var(--p-shadow-sm)]"
          : "rounded-xl border border-border bg-card shadow-sm",
        className,
      )}
      style={{ width, height }}
      data-testid="spark-cluster-treemap"
    >
      {rects.length === 0 && (
        <div className="flex h-full items-center justify-center">
          {isDesignV2 ? (
            <EmptyState
              compact
              icon={<IconFolderSearch className="size-6 text-[var(--p-accent)]" />}
              title="Kein Cluster gefunden"
              description="Es konnten keine passenden Wissens-Cluster ermittelt werden."
            />
          ) : (
            <span className="text-sm text-muted-foreground">Kein Cluster gefunden.</span>
          )}
        </div>
      )}
      {rects.map((rect) => {
        const selected = rect.id === selectedClusterId;
        const tooSmall = rect.w < MIN_TILE_W || rect.h < MIN_TILE_H;
        return (
          <button
            key={rect.id}
            type="button"
            onClick={() => onClusterSelect?.(rect.id)}
            className={cn(
              "absolute flex flex-col justify-between overflow-hidden p-1.5 text-left",
              isDesignV2
                ? "rounded-[var(--p-radius-sm)] border border-white/15 dark:border-white/10 shadow-[var(--p-shadow-sm)] transition-all duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:z-10 hover:scale-[1.02] hover:shadow-[var(--p-shadow-md)]"
                : "rounded-md transition-[transform,box-shadow] duration-150 hover:z-10 hover:scale-[1.02] hover:shadow-lg",
              selected
                ? isDesignV2
                  ? "ring-2 ring-[var(--p-border-focus)] ring-offset-2 ring-offset-[var(--p-bg)] z-10 scale-[1.02]"
                  : "ring-2 ring-primary z-10"
                : "",
            )}
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
              background: heatColor(rect.heat, isDesignV2),
            }}
            title={`${rect.label} · ${rect.noteCount} Notizen`}
            aria-label={`Cluster ${rect.label} mit ${rect.noteCount} Notizen`}
            data-testid={`spark-cluster-tile-${rect.id}`}
          >
            {!tooSmall && (
              <>
                <span className="text-[11px] font-semibold leading-tight text-white drop-shadow-sm truncate">
                  {rect.label}
                </span>
                <span className="text-[9px] text-white/90 tabular-nums">{rect.noteCount} Notizen</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

export type { TreemapRect };
export default ClusterTreemap;
