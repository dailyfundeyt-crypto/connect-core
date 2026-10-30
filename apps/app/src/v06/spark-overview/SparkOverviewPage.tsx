/**
 * A17 – SparkOverviewPage: „Firmenstruktur statt Graph“.
 *
 * Zwei Tabs:
 *   1. Übersicht – ClusterTreemap über alle Firmen-Ordner, Klick → ClusterDetail
 *      (Top-Begriffe, neueste Notizen, „Wichtigste Fakten“ aus Überschriften).
 *   2. Agenten-Datenzugriff – AgentAccessView.
 *
 * Die Seite wird hinter dem Flag sparkOverview eingehängt (Wiring: Integrations-
 * Agent, siehe Bericht). Der alte Graph bleibt unter „Graph (alt)“ erreichbar.
 * Wave 4 (A36): Design-System V2 Premium Rollout.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconChevronRight, IconDots, IconEye, IconLoader2 } from "@tabler/icons-react";
import { getFlag } from "@/contracts/v06/flags";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ClusterTreemap, TREEMAP_COLORS, TREEMAP_DESIGN_TOKENS } from "./ClusterTreemap";
import { ClusterDetail } from "./ClusterDetail";
import { AgentAccessView } from "./AgentAccessView";
import {
  fetchCompanyOverview,
  fetchNoteDetail,
  type CompanyOverview,
  type Cluster,
  type NoteDetail,
} from "./api";
import { Button } from "@/v06/design/Button";
import { Card } from "@/v06/design/Card";
import { EmptyState } from "@/v06/design/EmptyState";
import { SegmentedControl } from "@/v06/design/SegmentedControl";
import { Skeleton } from "@/v06/design/Skeleton";

type Tab = "overview" | "agents";

export interface SparkOverviewPageProps {
  className?: string;
  /** Start-Cluster-ID für Deep-Links (z. B. ?cluster=…). */
  initialClusterId?: string;
}

export function SparkOverviewPage({ className, initialClusterId }: SparkOverviewPageProps) {
  const isDesignV2 = getFlag("designV2");
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<CompanyOverview | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(initialClusterId ?? null);
  const [detail, setDetail] = useState<NoteDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(() => {
    let alive = true;
    setLoading(true);
    void fetchCompanyOverview()
      .then((result) => {
        if (!alive) return;
        setOverview(result.data);
        setError(result.healthy ? null : (result.errorNote ?? null));
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const cleanup = loadOverview();
    return cleanup;
  }, [loadOverview]);

  const clusters = overview?.clusters ?? [];
  const selectedCluster = useMemo(
    () => clusters.find((cluster) => cluster.id === selectedClusterId) ?? null,
    [clusters, selectedClusterId],
  );

  useEffect(() => {
    if (!selectedCluster) {
      setDetail(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    void fetchNoteDetail(selectedCluster.id)
      .then((result) => {
        if (alive) setDetail(result.data);
      })
      .catch(() => {
        if (alive) {
          setDetail({
            id: selectedCluster.id,
            label: selectedCluster.label,
            path: [],
            childCount: 0,
            lastModified: new Date().toISOString(),
            topTerms: selectedCluster.topTerms,
            notes: [],
            headings: [],
          });
        }
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedCluster]);

  const filteredClusters = filter.trim()
    ? clusters.filter(
        (cluster) =>
          cluster.label.toLowerCase().includes(filter.trim().toLowerCase()) ||
          cluster.topTerms.some((term) => term.includes(filter.trim().toLowerCase())),
      )
    : clusters;

  const treemapPalette = isDesignV2 ? TREEMAP_DESIGN_TOKENS : TREEMAP_COLORS;

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 transition-colors",
        isDesignV2 ? "text-[var(--p-text-1)]" : "",
        className,
      )}
      data-testid="spark-overview-page"
    >
      {/* Header mit Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1
            className={cn(
              "text-xl font-semibold tracking-tight",
              isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground",
            )}
          >
            Spark-Übersicht
          </h1>
          <span
            className={cn(
              "px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              isDesignV2
                ? "rounded-[var(--p-radius-xs)] border border-[var(--p-accent)]/20 bg-[var(--p-accent-subtle)] text-[var(--p-accent)]"
                : "rounded-full bg-primary/10 text-primary",
            )}
          >
            v06
          </span>
        </div>

        {isDesignV2 ? (
          <SegmentedControl
            size="sm"
            value={tab}
            onChange={(val) => setTab(val as Tab)}
            items={[
              { value: "overview", label: "Karten" },
              { value: "agents", label: "Agenten" },
            ]}
          />
        ) : (
          <div className="flex rounded-lg border border-border bg-background p-0.5 text-sm">
            {(["overview", "agents"] as Tab[]).map((tb) => (
              <button
                key={tb}
                type="button"
                onClick={() => setTab(tb)}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  tab === tb ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tb === "overview" ? "Karten" : "Agenten"}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p
          className={cn(
            "p-3 text-sm",
            isDesignV2
              ? "rounded-[var(--p-radius-sm)] border border-[var(--p-danger)]/20 bg-[var(--p-danger-subtle)] text-[var(--p-danger)] font-medium"
              : "rounded-lg bg-destructive/10 text-destructive",
          )}
        >
          {error}
        </p>
      )}

      {tab === "overview" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Cluster oder Begriff filtern…"
              className={cn(
                "h-9 w-64",
                isDesignV2 && "rounded-[var(--p-radius-sm)] border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus-visible:ring-[var(--p-border-focus)]",
              )}
            />
            {isDesignV2 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={loadOverview}
                loading={loading}
                leftIcon={!loading ? undefined : null}
              >
                Neu laden
              </Button>
            ) : (
              <button
                onClick={loadOverview}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                disabled={loading}
                type="button"
              >
                {loading ? <IconLoader2 className="size-3.5 animate-spin" /> : null}
                Neu laden
              </button>
            )}
          </div>

          {loading && !overview && isDesignV2 && (
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <Skeleton variant="rect" height={400} />
              <div className="space-y-3">
                <Skeleton variant="rect" height={180} />
                <Skeleton variant="rect" height={120} />
              </div>
            </div>
          )}

          {(!loading || overview) && (
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <ClusterTreemap
                clusters={filteredClusters}
                onClusterSelect={(id) => setSelectedClusterId((current) => (current === id ? null : id))}
                selectedClusterId={selectedClusterId}
                className="min-h-96"
              />
              <div className="flex flex-col gap-3">
                {selectedCluster && (
                  <ClusterDetail cluster={selectedCluster} detail={detail} loading={detailLoading} />
                )}
                {!selectedCluster && (
                  isDesignV2 ? (
                    <Card
                      elevation="flat"
                      className="border-dashed border-[var(--p-border)] bg-[var(--p-surface-1)] p-6 text-center"
                    >
                      <EmptyState
                        compact
                        icon={<IconEye className="size-6 text-[var(--p-accent)]" />}
                        title="Kein Cluster ausgewählt"
                        description="Klicke eine Kachel an, um Top-Begriffe, zuletzt geänderte Notizen und wichtige Fakten zu sehen."
                      />
                    </Card>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      <IconEye className="mx-auto mb-2 size-6 opacity-40" />
                      Klicke einen Kreis an, um
                      <br />
                      Top-Begriffe, zuletzt geänderte Notizen und wichtige Fakten zu sehen.
                    </div>
                  )
                )}
                {filteredClusters.length > 0 && (
                  <div
                    className={cn(
                      "p-3.5 text-xs transition-colors",
                      isDesignV2
                        ? "rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] shadow-[var(--p-shadow-sm)]"
                        : "rounded-xl border border-border bg-card",
                    )}
                  >
                    <p
                      className={cn(
                        "mb-2 flex items-center gap-1.5 font-medium",
                        isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground/80",
                      )}
                    >
                      <IconDots
                        className={cn(
                          "size-3.5",
                          isDesignV2 ? "text-[var(--p-accent)]" : "text-muted-foreground",
                        )}
                      />
                      Legende: Farbe = Aufheizung
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {treemapPalette.map((color, idx) => (
                        <span
                          key={idx}
                          className={cn(
                            "inline-block h-4 w-7 shadow-sm",
                            isDesignV2
                              ? "rounded-[var(--p-radius-xs)] border border-black/10 dark:border-white/10"
                              : "rounded",
                          )}
                          style={{ background: color }}
                          title="Abklingendes Aufheizen über 90 Tage"
                        />
                      ))}
                    </div>
                    <p
                      className={cn(
                        "mt-2 text-[11px] leading-relaxed",
                        isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
                      )}
                    >
                      Je wärmer die Kachel, desto frischer die Änderung. Die Kachelgröße skaliert mit der Anzahl der Notizen im Cluster.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {clusters.length > 0 && (
            <p
              className={cn(
                "text-xs",
                isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
              )}
            >
              {clusters.length} Cluster · Top-Begriffe aus einfachem TF-IDF (ohne externe API) · Aufheizung =
              Änderungen der letzten 30 Tage.
            </p>
          )}
        </div>
      )}

      {tab === "agents" && <AgentAccessView />}

      <nav
        className={cn(
          "flex items-center gap-1.5 pt-3 text-xs transition-colors",
          isDesignV2
            ? "border-t border-[var(--p-border)] text-[var(--p-text-3)]"
            : "border-t border-border text-muted-foreground",
        )}
      >
        <span>Verwandte Punkte:</span>
        <a
          href="#"
          onClick={(event) => event.preventDefault()}
          className={cn(
            "inline-flex items-center gap-0.5 transition-colors",
            isDesignV2 ? "hover:text-[var(--p-accent)]" : "hover:text-foreground",
          )}
        >
          Spark-Brain <IconChevronRight className="size-3" />
        </a>
        <span className="opacity-40">·</span>
        <a
          href="#"
          onClick={(event) => event.preventDefault()}
          className={cn(
            "inline-flex items-center gap-0.5 transition-colors",
            isDesignV2 ? "hover:text-[var(--p-accent)]" : "hover:text-foreground",
          )}
        >
          Graph (alt) <IconChevronRight className="size-3" />
        </a>
      </nav>
    </div>
  );
}

export default SparkOverviewPage;
