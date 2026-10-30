/**
 * A17 – ClusterDetail: Drill-down zu einem Cluster.
 * Zeigt Top-Begriffe, neueste Notizen und „Wichtigste Fakten“ (aus Überschriften).
 * Wave 4 (A36): Design-System V2 Rollout.
 */
import { IconChevronRight, IconFileText, IconLoader2 } from "@tabler/icons-react";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";
import type { Cluster, NoteDetail } from "./api";
import { Card } from "@/v06/design/Card";
import { Skeleton } from "@/v06/design/Skeleton";

export interface ClusterDetailProps {
  cluster: Cluster;
  detail?: NoteDetail | null;
  loading?: boolean;
  className?: string;
}

export function ClusterDetail({ cluster, detail, loading, className }: ClusterDetailProps) {
  const isDesignV2 = getFlag("designV2");
  const topTerms = detail?.topTerms ?? cluster.topTerms;
  const notes = detail?.notes ?? [];
  const headings = detail?.headings ?? [];

  const content = (
    <>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2
            className={cn(
              "text-sm font-semibold",
              isDesignV2 ? "text-[var(--p-text-1)] tracking-tight" : "text-foreground",
            )}
          >
            {cluster.label}
          </h2>
          <p
            className={cn(
              "text-[11px]",
              isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
            )}
          >
            {detail?.childCount ?? cluster.noteCount} Inhalte (Notizen/Unterordner) · Heat {cluster.heat.toFixed(2)}
          </p>
        </div>
        {loading && (
          <IconLoader2
            className={cn(
              "size-4 animate-spin",
              isDesignV2 ? "text-[var(--p-accent)]" : "text-muted-foreground",
            )}
          />
        )}
      </div>

      {loading && !detail && isDesignV2 && (
        <div className="space-y-2 py-2">
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="rect" height={40} />
          <Skeleton variant="text" width="80%" />
        </div>
      )}

      {/* Top-Begriffe */}
      {topTerms.length > 0 && (
        <div className="mb-3">
          <p
            className={cn(
              "mb-1 text-[10px] font-semibold uppercase tracking-wider",
              isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
            )}
          >
            Top-Begriffe
          </p>
          <div className="flex flex-wrap gap-1">
            {topTerms.map((term) => (
              <span
                key={term}
                className={cn(
                  "px-2 py-0.5 text-[10px] font-medium transition-colors",
                  isDesignV2
                    ? "rounded-[var(--p-radius-xs)] border border-[var(--p-accent)]/20 bg-[var(--p-accent-subtle)] text-[var(--p-accent)]"
                    : "rounded-full bg-primary/10 text-primary",
                )}
              >
                {term}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Neueste Notizen */}
      {notes.length > 0 && (
        <div className="mb-3">
          <p
            className={cn(
              "mb-1 text-[10px] font-semibold uppercase tracking-wider",
              isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
            )}
          >
            Neueste Notizen
          </p>
          <ul className="space-y-1 text-xs">
            {notes.slice(0, 6).map((note) => (
              <li
                key={note.path}
                className={cn(
                  "flex items-baseline justify-between gap-2 p-1 transition-colors",
                  isDesignV2
                    ? "rounded-[var(--p-radius-xs)] hover:bg-[var(--p-surface-hover)]"
                    : "",
                )}
              >
                <span
                  className={cn(
                    "truncate",
                    isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground/90",
                  )}
                  title={note.path}
                >
                  <IconFileText
                    className={cn(
                      "mr-1 inline size-3",
                      isDesignV2 ? "text-[var(--p-accent)]" : "text-muted-foreground",
                    )}
                  />
                  {note.title}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[10px] tabular-nums",
                    isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
                  )}
                >
                  {new Date(note.modified).toLocaleDateString("de-DE")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Wichtigste Fakten aus Überschriften */}
      {headings.length > 0 && (
        <div>
          <p
            className={cn(
              "mb-1 text-[10px] font-semibold uppercase tracking-wider",
              isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
            )}
          >
            Wichtigste Fakten (Überschriften)
          </p>
          <ol
            className={cn(
              "space-y-1 text-xs",
              isDesignV2 ? "text-[var(--p-text-2)]" : "text-foreground/90",
            )}
          >
            {headings.slice(0, 6).map((heading) => (
              <li key={heading.text} className="flex items-start gap-1">
                {heading.level > 1 && (
                  <IconChevronRight
                    className={cn(
                      "mt-0.5 size-3 shrink-0",
                      isDesignV2 ? "text-[var(--p-accent)]" : "text-muted-foreground",
                    )}
                  />
                )}
                <span>{heading.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {notes.length === 0 && headings.length === 0 && !loading && (
        <p
          className={cn(
            "py-2 text-xs",
            isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
          )}
        >
          Keine Details verfügbar – nur Cluster-Zusammenfassung.
        </p>
      )}
    </>
  );

  if (isDesignV2) {
    return (
      <Card
        elevation="raised"
        className={cn("p-4 border-[var(--p-border)] bg-[var(--p-surface-2)] shadow-[var(--p-shadow-sm)]", className)}
        data-testid="spark-cluster-detail"
      >
        {content}
      </Card>
    );
  }

  return (
    <div
      className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", className)}
      data-testid="spark-cluster-detail"
    >
      {content}
    </div>
  );
}

export default ClusterDetail;
