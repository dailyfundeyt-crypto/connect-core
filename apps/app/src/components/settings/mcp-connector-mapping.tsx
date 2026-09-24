import { useQuery } from "@tanstack/react-query";
import {
  IconLock,
  IconRefresh,
  IconShieldCheck,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import {
  PageRows,
  PageSection,
} from "@/components/layout/page-shell";
import { agentListQueryOptions } from "@/lib/agents/queries";
import {
  clearManusConnectorSelection,
  CONNECTOR_SOURCE_LABELS,
  fetchManusConnectors,
  getSelectedManusConnectorIds,
  listAppConnectors,
  listHermesConnectors,
  openManusConnectorAuth,
  setSelectedManusConnectorIds,
  subscribeManusConnectors,
  toggleManusConnector,
  type ConnectorListItem,
  type ConnectorSource,
  type ManusConnector,
} from "@/lib/mcp/connector-sources";
import { cn } from "@/lib/utils";

/**
 * Settings → MCP: three isolated connector sources (App · Hermes · Manus).
 * Only Manus checkboxes are writable for Manus tasks (Plan 051).
 */
export function McpConnectorMappingPanel() {
  const agentsQuery = useQuery(agentListQueryOptions());
  const agents = agentsQuery.data ?? [];
  const [agentId, setAgentId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [manusList, setManusList] = useState<ManusConnector[]>([]);
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId && agents[0]?.id) {
      setAgentId(agents[0].id);
    }
  }, [agents, agentId]);

  useEffect(() => {
    if (!agentId) return;
    const refresh = () => setSelected(getSelectedManusConnectorIds(agentId));
    refresh();
    return subscribeManusConnectors(refresh);
  }, [agentId]);

  const loadManus = async (force = false) => {
    if (!agentId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchManusConnectors({ force, agentId });
      setManusList(result.connectors);
      setHasKey(result.hasKey);
      if (result.error) setError(result.error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (agentId) void loadManus(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when agent changes
  }, [agentId]);

  const appRows = useMemo(() => listAppConnectors(), []);
  const hermesRows = useMemo(() => listHermesConnectors(), []);

  const onAuth = async () => {
    if (!agentId) return;
    setAuthStatus(null);
    const result = await openManusConnectorAuth({ agentId });
    setAuthStatus(
      result.ok
        ? "Manus Integrations im dedizierten Manus-Profil geöffnet — OAuth dort abschließen."
        : result.error || "Chrome-Start fehlgeschlagen.",
    );
  };

  return (
    <PageSection
      className="mt-6"
      title="MCP / Connectors · Quellen"
    >
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        Drei getrennte Quellen mit Badge. Manus-Tasks bekommen{" "}
        <strong className="font-medium text-foreground">nur</strong> ausgewählte
        Manus Connectors über{" "}
        <code className="text-[11px]">message.connectors[]</code> — App- und
        Hermes-MCP werden nie an Manus proxied. OAuth nur in manus.im (Voll-Chrome
        Manus-Profil).
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground" htmlFor="mcp-agent">
          Agent-Profil
        </label>
        <select
          className="h-9 min-w-[12rem] rounded-md border border-input bg-background px-2 text-sm"
          disabled={agents.length === 0}
          id="mcp-agent"
          onChange={(e) => setAgentId(e.target.value)}
          value={agentId}
        >
          {agents.length === 0 ? (
            <option value="">Kein Agent</option>
          ) : (
            agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.id}
              </option>
            ))
          )}
        </select>
        <Button
          className="gap-1.5"
          disabled={loading || !agentId || !hasKey}
          onClick={() => void loadManus(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <IconRefresh
            className={cn("size-3.5", loading && "animate-spin")}
          />
          Manus aktualisieren
        </Button>
        <Button
          className="gap-1.5"
          disabled={!agentId}
          onClick={() => void onAuth()}
          size="sm"
          type="button"
          variant="secondary"
        >
          <IconLock className="size-3.5" />
          Authentifizieren
        </Button>
      </div>

      {!hasKey ? (
        <p className="mb-3 rounded-xl bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
          Kein Manus-Key — unter Settings → API-Keys hinterlegen. Manus-Liste ist
          leer/disabled.
        </p>
      ) : null}
      {error ? (
        <p className="mb-3 text-[11px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {authStatus ? (
        <p className="mb-3 text-[11px] text-muted-foreground" role="status">
          {authStatus}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <SourceColumn
          badge="app"
          hint="Connect interne MCP (Settings-Katalog). Read-only hier — Enable unter MCP-Liste unten."
          readOnly
          rows={appRows.slice(0, 24)}
          title="App"
        />
        <SourceColumn
          badge="hermes"
          hint="Hermes-agent Tools + Plugin-Grants. Nie an Manus gesendet."
          readOnly
          rows={hermesRows}
          title="Hermes"
        />
        <SourceColumn
          badge="manus"
          clearLabel="Auswahl leeren"
          hint="Nur diese UUIDs gehen in task.create / sendMessage. Ohne Auswahl: clear_connectors."
          onClear={
            agentId
              ? () => {
                  clearManusConnectorSelection(agentId);
                  setSelected([]);
                }
              : undefined
          }
          onToggle={
            agentId
              ? (id, on) => {
                  const next = toggleManusConnector(agentId, id, on);
                  setSelected(next);
                }
              : undefined
          }
          readOnly={!hasKey || !agentId}
          rows={manusList.map((c) => ({
            id: c.id,
            name: c.name,
            description:
              [c.type, c.description, c.status].filter(Boolean).join(" · ") ||
              "Manus Connector",
            source: "manus" as const,
            type: c.type,
            authRequired: c.authRequired,
          }))}
          selectedIds={selected}
          title="Manus"
        />
      </div>

      {selected.length > 0 ? (
        <Item className="mt-3" size="sm" variant="muted">
          <ItemContent>
            <ItemTitle className="flex items-center gap-1.5 text-sm">
              <IconShieldCheck className="size-3.5 text-emerald-600" />
              {selected.length} Manus Connector
              {selected.length === 1 ? "" : "s"} für dieses Profil
            </ItemTitle>
            <ItemDescription className="font-mono text-[10px]">
              {selected.join(", ")}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              onClick={() => {
                if (!agentId) return;
                setSelectedManusConnectorIds(agentId, selected);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Gespeichert
            </Button>
          </ItemActions>
        </Item>
      ) : null}
    </PageSection>
  );
}

function SourceColumn({
  title,
  badge,
  hint,
  rows,
  readOnly,
  selectedIds,
  onToggle,
  onClear,
  clearLabel,
}: {
  title: string;
  badge: ConnectorSource;
  hint: string;
  rows: ConnectorListItem[];
  readOnly?: boolean;
  selectedIds?: string[];
  onToggle?: (id: string, on: boolean) => void;
  onClear?: () => void;
  clearLabel?: string;
}) {
  const selected = new Set(selectedIds ?? []);
  return (
    <div className="flex min-h-[16rem] flex-col rounded-2xl border border-border bg-background/80">
      <div className="border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold tracking-tight">{title}</p>
          <SourceBadge source={badge} />
        </div>
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
          {hint}
        </p>
        {onClear ? (
          <button
            className="mt-1.5 text-[10px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={onClear}
            type="button"
          >
            {clearLabel ?? "Leeren"}
          </button>
        ) : null}
      </div>
      <PageRows className="max-h-72 flex-1 overflow-y-auto px-1 py-1">
        {rows.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-muted-foreground">
            Keine Einträge.
          </p>
        ) : (
          rows.map((row) => {
            const checked = selected.has(row.id);
            return (
              <label
                className={cn(
                  "flex cursor-default items-start gap-2 rounded-xl px-2 py-1.5 hover:bg-muted/60",
                  readOnly && badge === "manus" && "opacity-60",
                )}
                key={row.id}
              >
                {badge === "manus" && onToggle ? (
                  <input
                    checked={checked}
                    className="mt-1"
                    disabled={readOnly}
                    onChange={(e) => onToggle(row.id, e.target.checked)}
                    type="checkbox"
                  />
                ) : (
                  <SourceBadge className="mt-0.5 shrink-0" source={row.source} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {row.name}
                    {row.authRequired ? (
                      <span className="ml-1 text-[9px] font-normal text-amber-700">
                        OAuth
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                    {row.description}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </PageRows>
    </div>
  );
}

function SourceBadge({
  source,
  className,
}: {
  source: ConnectorSource;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
        source === "app" && "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
        source === "hermes" &&
          "bg-violet-500/15 text-violet-800 dark:text-violet-300",
        source === "manus" && "bg-sky-500/15 text-sky-800 dark:text-sky-300",
        className,
      )}
    >
      {CONNECTOR_SOURCE_LABELS[source]}
    </span>
  );
}
