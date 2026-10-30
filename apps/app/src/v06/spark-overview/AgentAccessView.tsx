/**
 * A17 – AgentAccessView: „Auf welche Daten greift ein bestimmter Agent zu?“
 * Agent wählen → Quellen-Tabelle (Kind, Referenz, Anzahl, letzter Zugriff) mit
 * Balken je Anzahl. Quellen kommen aus agent_data_access_log (Migration 0400),
 * dem Brain-Log und den Checkbox-Zugriffen des Scope-Editors.
 * Wave 4 (A36): Design-System V2 Rollout.
 */
import { useEffect, useState } from "react";
import { IconDatabase, IconSearch } from "@tabler/icons-react";
import { getFlag } from "@/contracts/v06/flags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  fetchAgentAccess,
  fetchBrainAgents,
  SOURCE_KIND_LABELS,
  type AgentAccess,
  type AccessSource,
  type BrainAgentRef,
} from "./api";
import { Card } from "@/v06/design/Card";
import { EmptyState } from "@/v06/design/EmptyState";
import { Skeleton } from "@/v06/design/Skeleton";

export interface AgentAccessViewProps {
  className?: string;
}

export function AgentAccessView({ className }: AgentAccessViewProps) {
  const isDesignV2 = getFlag("designV2");
  const [agents, setAgents] = useState<BrainAgentRef[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [query, setQuery] = useState("");
  const [access, setAccess] = useState<AgentAccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchBrainAgents().then((list) => {
      if (!alive) return;
      setAgents(list);
      // Vorauswahl: Agent mit Connect-ID, sonst der erste.
      const preferred = list.find((agent) => agent.connectAgentId) ?? list[0];
      setSelectedAgent((current) => current || preferred?.connectAgentId || preferred?.slug || "");
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedAgent.trim()) {
      setAccess(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    void fetchAgentAccess(selectedAgent.trim())
      .then((result) => {
        if (alive) setAccess(result);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "Datenzugriff konnte nicht geladen werden.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedAgent]);

  const sources = access?.sources ?? [];
  const filtered = query.trim()
    ? sources.filter((source) => source.ref.toLowerCase().includes(query.trim().toLowerCase()))
    : sources;
  const maxCount = Math.max(1, ...sources.map((source) => source.count));

  const content = (
    <>
      <div
        className={cn(
          "flex flex-wrap items-end gap-3 pb-3 transition-colors",
          isDesignV2 ? "border-b border-[var(--p-border)]" : "border-b border-border",
        )}
      >
        <label className="min-w-56 flex-1">
          <span
            className={cn(
              "mb-1 block text-xs font-medium",
              isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
            )}
          >
            Agent
          </span>
          <select
            className={cn(
              "w-full px-3 py-2 text-sm outline-none transition-colors",
              isDesignV2
                ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-1)] focus:border-[var(--p-border-focus)] shadow-[var(--p-shadow-sm)]"
                : "rounded-lg border border-border bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-primary",
            )}
            value={selectedAgent}
            onChange={(event) => setSelectedAgent(event.target.value)}
            data-testid="spark-agent-access-select"
          >
            {agents.length === 0 && <option value="">Agenten unbekannt (kein Brain-Listung)</option>}
            {agents.map((agent) => (
              <option key={agent.connectAgentId ?? agent.slug} value={agent.connectAgentId ?? agent.slug}>
                {agent.name ?? agent.slug}
                {agent.connectAgentId ? "" : " (Brain-Slug)"}
              </option>
            ))}
          </select>
        </label>
        <label className="w-56">
          <span
            className={cn(
              "mb-1 block text-xs font-medium",
              isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
            )}
          >
            Quellensuche
          </span>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Kunden, Wiki, ..."
            className={cn(
              "h-9",
              isDesignV2 && "rounded-[var(--p-radius-sm)] border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus-visible:ring-[var(--p-border-focus)]",
            )}
            data-testid="spark-agent-access-query"
          />
        </label>
      </div>

      {error && (
        <p
          className={cn(
            "mt-3 text-xs",
            isDesignV2
              ? "rounded-[var(--p-radius-sm)] border border-[var(--p-danger)]/20 bg-[var(--p-danger-subtle)] p-3 text-[var(--p-danger)] font-medium"
              : "rounded-lg bg-destructive/10 p-3 text-destructive",
          )}
        >
          {error}
        </p>
      )}

      {loading && isDesignV2 && (
        <div className="space-y-2 py-4">
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="rect" height={60} />
          <Skeleton variant="rect" height={60} />
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr
              className={cn(
                "border-b transition-colors",
                isDesignV2
                  ? "border-[var(--p-border)] text-[var(--p-text-3)] font-semibold uppercase tracking-wider text-[10px]"
                  : "border-border text-muted-foreground",
              )}
            >
              <th className="py-2 pr-3">Art</th>
              <th className="py-2 pr-3">Referenz</th>
              <th className="py-2 pr-3">Zugriffe</th>
              <th className="py-2 text-right">Letzter Zugriff</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((source) => (
              <tr
                key={`${source.kind}:${source.ref}`}
                className={cn(
                  "border-b transition-colors",
                  isDesignV2
                    ? "border-[var(--p-border-subtle)] hover:bg-[var(--p-surface-hover)]"
                    : "border-border/40 hover:bg-muted/40",
                )}
              >
                <td className="py-2 pr-3">
                  <span
                    className={cn(
                      "px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                      isDesignV2
                        ? "rounded-[var(--p-radius-xs)] border border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-3)] font-medium"
                        : "rounded bg-muted text-muted-foreground",
                    )}
                  >
                    {SOURCE_KIND_LABELS[source.kind] ?? source.kind}
                  </span>
                </td>
                <td
                  className={cn(
                    "py-2 pr-3 font-mono text-[11px]",
                    isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground",
                  )}
                >
                  {source.ref}
                </td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "h-1.5 w-24 overflow-hidden",
                        isDesignV2
                          ? "rounded-full bg-[var(--p-surface-1)]"
                          : "rounded-full bg-muted",
                      )}
                    >
                      <div
                        className={cn(
                          "h-full transition-all duration-[180ms]",
                          isDesignV2 ? "bg-[var(--p-accent)]" : "bg-primary",
                        )}
                        style={{ width: `${Math.round((source.count / maxCount) * 100)}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "tabular-nums text-[11px]",
                        isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground",
                      )}
                    >
                      {source.count}
                    </span>
                  </div>
                </td>
                <td
                  className={cn(
                    "py-2 text-right tabular-nums text-[11px]",
                    isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
                  )}
                >
                  {source.lastAccess ? new Date(source.lastAccess).toLocaleDateString("de-DE") : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && !loading && (
          <div className="py-6 text-center text-xs">
            {isDesignV2 ? (
              <EmptyState
                compact
                icon={<IconDatabase className="size-6 text-[var(--p-accent)]" />}
                title="Keine Zugriffe protokolliert"
                description={
                  query.trim()
                    ? "Keine Quellen stimmen mit der Suche überein."
                    : "Für diesen Agenten liegen noch keine protokollierten Datenzugriffe vor."
                }
              />
            ) : (
              <p className="text-muted-foreground">Keine Datenzugriffe protokolliert.</p>
            )}
          </div>
        )}
      </div>
    </>
  );

  if (isDesignV2) {
    return (
      <Card
        elevation="raised"
        className={cn("p-5 border-[var(--p-border)] bg-[var(--p-surface-2)] shadow-[var(--p-shadow-sm)]", className)}
        data-testid="spark-agent-access"
      >
        {content}
      </Card>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", className)} data-testid="spark-agent-access">
      {content}
    </div>
  );
}

export default AgentAccessView;
