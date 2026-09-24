import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PageRows,
  PageSection,
} from "@/components/layout/page-shell";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { McpConnectorMappingPanel } from "@/components/settings/mcp-connector-mapping";
import {
  fetchCliBridgeStatus,
  type CliBridgeStatus,
} from "@/lib/agents/agent-cli";
import {
  readShellPermission,
  type ShellPermission,
  writeShellPermission,
} from "@/lib/computers/shell-permission";
import {
  disableAllMcpServers,
  enableCursorMcpPack,
  enableAllMcpServersAsk,
  listMcpServers,
  MCP_CATEGORY_LABELS,
  setAllMcpPermissions,
  setMcpServerEnabled,
  setMcpServerPermission,
  subscribeMcpServers,
  type McpCategory,
  type McpPermission,
  type McpServerEntry,
} from "@/lib/mcp/local-servers";
import { mcpLogoInitial, mcpLogoUrl } from "@/lib/mcp/logos";

const CATEGORY_ORDER: McpCategory[] = [
  "ai-agents",
  "productivity",
  "dev",
  "design",
  "commerce",
  "automation",
  "local",
];

/**
 * Settings → MCP: enable Cursor MCP servers and set call permissions.
 */
export function McpSettingsPanel() {
  const [servers, setServers] = useState<McpServerEntry[]>(() =>
    listMcpServers(),
  );
  const [query, setQuery] = useState("");
  const [shellPermission, setShellPermission] = useState<ShellPermission>(() =>
    readShellPermission(),
  );
  const [bridge, setBridge] = useState<CliBridgeStatus | null>(null);

  useEffect(() => subscribeMcpServers(() => setServers(listMcpServers())), []);

  useEffect(() => {
    let cancelled = false;
    void fetchCliBridgeStatus().then((status) => {
      if (!cancelled) setBridge(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enabledCount = servers.filter((s) => s.enabled).length;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return servers;
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.id.includes(q) ||
        s.category.includes(q),
    );
  }, [servers, query]);

  const grouped = useMemo(() => {
    const map = new Map<McpCategory, McpServerEntry[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const server of filtered) {
      const list = map.get(server.category) ?? [];
      list.push(server);
      map.set(server.category, list);
    }
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      label: MCP_CATEGORY_LABELS[cat],
      rows: map.get(cat) ?? [],
    })).filter((g) => g.rows.length > 0);
  }, [filtered]);

  return (
    <>
    <McpConnectorMappingPanel />
    <PageSection className="mt-6" title="Computer">
      <PageRows>
        <Item size="sm">
          <ItemContent>
            <ItemTitle>Shell commands</ItemTitle>
            <ItemDescription>
              Hermes Ask gate for <code>computer_run_command</code>. Ask waits
              for Allow / Deny on each command; Allow runs without prompting;
              Deny refuses the shell.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <select
              aria-label="Shell command permission"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              onChange={(e) => {
                const next = e.target.value as ShellPermission;
                writeShellPermission(next);
                setShellPermission(next);
              }}
              value={shellPermission}
            >
              <option value="ask">Ask</option>
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
            </select>
          </ItemActions>
        </Item>
        <Item size="sm">
          <ItemContent>
            <ItemTitle>Codex bridge</ItemTitle>
            <ItemDescription>
              {bridge
                ? `${bridge.hint} URL: ${bridge.baseUrl} · model ${bridge.model} · mode ${bridge.mode}${bridge.hasToken ? " · token set" : " · no token (local trust)"}`
                : "Bot-CLI ChatGPT/Cursor → local plan proxy (not OPENAI_API_KEY). Loading status…"}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              onClick={() => {
                void fetchCliBridgeStatus().then(setBridge);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Refresh
            </Button>
            <span
              className={
                bridge?.reachable
                  ? "text-xs text-emerald-600"
                  : "text-xs text-amber-600"
              }
            >
              {bridge
                ? bridge.reachable
                  ? "online"
                  : "offline"
                : "…"}
            </span>
          </ItemActions>
        </Item>
      </PageRows>
    </PageSection>
    <PageSection className="mt-8" title="Servers">
      <PageRows>
          <Item size="sm">
            <ItemContent>
              <ItemTitle>Model Context Protocol</ItemTitle>
              <ItemDescription>
                Alle MCP-Server wie in Cursor — mit Ein/Aus und Berechtigung
                Ask / Allow / Deny pro Aufruf. Auth-pflichtige Server müssen
                einmal verbunden werden; Admin-Plugin-Grants gelten zusätzlich.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <span className="text-xs text-muted-foreground">
                {enabledCount}/{servers.length} on
              </span>
            </ItemActions>
          </Item>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Input
              className="h-9 max-w-sm"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Server suchen…"
              value={query}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setServers(enableCursorMcpPack())}
                size="sm"
                type="button"
                variant="secondary"
              >
                Cursor-Pack aktivieren
              </Button>
              <Button
                onClick={() => setServers(enableAllMcpServersAsk())}
                size="sm"
                type="button"
                variant="outline"
              >
                Alle (Ask)
              </Button>
              <Button
                onClick={() => setServers(setAllMcpPermissions("allow"))}
                size="sm"
                type="button"
                variant="ghost"
              >
                Aktive → Allow
              </Button>
              <Button
                onClick={() => setServers(disableAllMcpServers())}
                size="sm"
                type="button"
                variant="ghost"
              >
                Alle aus
              </Button>
            </div>
          </div>

          {grouped.map(({ cat, label, rows }) => (
            <div className="space-y-2" key={cat}>
              <p className="px-1 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {label}
              </p>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {rows.map((server) => (
                  <li
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    key={server.id}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <McpServerLogo name={server.name} serverId={server.id} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {server.name}
                          {server.authRequired ? (
                            <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-amber-600">
                              Auth
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {server.description}
                        </p>
                        {server.commandHint ? (
                          <code className="mt-1 block truncate text-[10px] text-muted-foreground/80">
                            {server.commandHint}
                          </code>
                        ) : (
                          <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                            {server.transport}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <select
                        aria-label={`${server.name} permission`}
                        className="h-8 rounded-lg border border-border bg-background px-2 text-xs disabled:opacity-50"
                        disabled={!server.enabled}
                        onChange={(e) =>
                          setServers(
                            setMcpServerPermission(
                              server.id,
                              e.target.value as McpPermission,
                            ),
                          )
                        }
                        value={server.permission}
                      >
                        <option value="ask">Ask</option>
                        <option value="allow">Allow</option>
                        <option value="deny">Deny</option>
                      </select>
                      <Switch
                        checked={server.enabled}
                        onCheckedChange={(enabled) =>
                          setServers(setMcpServerEnabled(server.id, enabled))
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </PageRows>
    </PageSection>
    </>
  );
}

function McpServerLogo({
  serverId,
  name,
}: {
  serverId: string;
  name: string;
}) {
  const src = mcpLogoUrl(serverId);
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground"
      >
        {mcpLogoInitial(name)}
      </span>
    );
  }
  return (
    <img
      alt=""
      className="size-8 shrink-0 rounded-lg border border-border bg-white object-contain p-1.5 dark:bg-white"
      decoding="async"
      onError={() => setFailed(true)}
      src={src}
    />
  );
}
