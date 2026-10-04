import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCheck, IconChevronLeft, IconChevronRight, IconExternalLink, IconLoader2, IconPlus, IconRefresh } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  addConnector,
  agentHubAgentQuery,
  agentHubCatalogQuery,
  type ConnectorCatalogEntry,
  type ConnectorServer,
  type ConnectorStatus,
  connectorIconUrl,
  invalidateAgentHub,
  reconnectConnector,
  removeConnector,
  setAgentConnector,
  stopConnector,
} from "@/lib/agent-hub/api";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { cn } from "@/lib/utils";

/**
 * „Verbinder“: MCP-Server als Karten im Stil der Manus-Galerie.
 *
 * Mit `agentId` gilt ein Haken für diesen Agent (Server verbunden und für ihn eingeschaltet); ohne
 * gilt er für die Installation (Server eingerichtet). Die Karte öffnet Details mit Status, Werkzeugen
 * und Schaltern pro Agent.
 */
export function ConnectorGallery({
  agentId,
  variant = "section",
  pageSize = 6,
  className,
}: {
  agentId?: string;
  variant?: "section" | "full";
  pageSize?: number;
  className?: string;
}) {
  const catalogQuery = useQuery(agentHubCatalogQuery());
  const agentQuery = useQuery({ ...agentHubAgentQuery(agentId ?? ""), enabled: !!agentId });
  const [page, setPage] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [connectEntry, setConnectEntry] = useState<ConnectorCatalogEntry | null>(null);
  const [detailEntry, setDetailEntry] = useState<ConnectorCatalogEntry | null>(null);
  const queryClient = useQueryClient();

  const catalog = catalogQuery.data?.catalog ?? [];
  const servers = catalogQuery.data?.servers ?? [];
  const links = agentQuery.data?.links ?? [];

  const quickAdd = useMutation({
    mutationFn: async (entry: ConnectorCatalogEntry) => {
      const existing = serversFor(entry, servers, agentId)[0];
      if (agentId && existing) {
        await setAgentConnector(agentId, existing.id, true);
        if (existing.status.state !== "connected") await reconnectConnector(existing.id);
        return;
      }
      await addConnector({ catalogKey: entry.key, values: {}, ...(agentId ? { agentId, attach: true } : {}) });
    },
    onSettled: () => invalidateAgentHub(queryClient),
  });

  const onPlus = (entry: ConnectorCatalogEntry) => {
    const existing = serversFor(entry, servers, agentId)[0];
    const needsForm = entry.fields.length > 0 || (entry.perAgent && !agentId);
    if ((agentId && existing) || !needsForm) quickAdd.mutate(entry);
    else setConnectEntry(entry);
  };

  const pages = Math.max(1, Math.ceil(catalog.length / pageSize));
  const visible = variant === "full" ? catalog : catalog.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <section className={cn("flex flex-col gap-4", className)} aria-label="Verbinder">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-[17px] text-foreground leading-tight">Verbinder</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Verbinden Sie Apps und APIs, um Ihren Kontext zu teilen.</p>
        </div>
        {variant === "section" ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Zurück"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              className="grid size-8 place-items-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              <IconChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Weiter"
              disabled={page >= pages - 1}
              onClick={() => setPage((current) => Math.min(pages - 1, current + 1))}
              className="grid size-8 place-items-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              <IconChevronRight className="size-4" />
            </button>
            <button type="button" onClick={() => setShowAll(true)} className="ml-2 font-medium text-[13px] text-foreground hover:underline">
              Alle ansehen
            </button>
          </div>
        ) : null}
      </div>

      {catalogQuery.isError ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive text-sm">{(catalogQuery.error as Error).message}</p>
      ) : null}
      {catalogQuery.isLoading ? <p className="text-muted-foreground text-sm">Lade Verbinder …</p> : null}

      <ConnectorGrid
        entries={visible}
        servers={servers}
        links={links}
        agentId={agentId}
        busyKey={quickAdd.isPending ? quickAdd.variables?.key : undefined}
        onPlus={onPlus}
        onOpen={setDetailEntry}
      />
      {quickAdd.isError ? <p className="text-destructive text-xs">{(quickAdd.error as Error).message}</p> : null}

      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="max-w-3xl md:max-h-[720px]">
          <DialogHeader>
            <DialogTitle>Alle Verbinder</DialogTitle>
            <DialogDescription>{agentId ? "Haken = für diesen Agent aktiv." : "Haken = auf diesem PC eingerichtet."}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ConnectorGrid
              entries={catalog}
              servers={servers}
              links={links}
              agentId={agentId}
              busyKey={quickAdd.isPending ? quickAdd.variables?.key : undefined}
              onPlus={onPlus}
              onOpen={setDetailEntry}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>

      {connectEntry ? <ConnectDialog entry={connectEntry} agentId={agentId} onClose={() => setConnectEntry(null)} /> : null}
      {detailEntry ? <ConnectorDetail entry={detailEntry} agentId={agentId} servers={servers} links={links} onClose={() => setDetailEntry(null)} onAdd={onPlus} /> : null}
    </section>
  );
}

function serversFor(entry: ConnectorCatalogEntry, servers: ConnectorServer[], agentId?: string) {
  return servers.filter((server) => server.catalogKey === entry.key && (!entry.perAgent || !agentId || server.ownerAgentId === agentId));
}

function isActive(entry: ConnectorCatalogEntry, servers: ConnectorServer[], links: { serverId: string; enabled: boolean }[], agentId?: string) {
  if (entry.transport === "builtin") return true;
  const mine = serversFor(entry, servers, agentId);
  if (!agentId) return mine.length > 0;
  return mine.some((server) => links.some((link) => link.serverId === server.id && link.enabled));
}

function combinedStatus(entry: ConnectorCatalogEntry, servers: ConnectorServer[], agentId?: string): ConnectorStatus["state"] | null {
  if (entry.transport === "builtin") return "connected";
  const mine = serversFor(entry, servers, agentId);
  if (mine.length === 0) return null;
  if (mine.some((server) => server.status.state === "error")) return "error";
  if (mine.some((server) => server.status.state === "connecting")) return "connecting";
  if (mine.some((server) => server.status.state === "connected")) return "connected";
  return "idle";
}

const DOT: Record<ConnectorStatus["state"], string> = {
  connected: "bg-emerald-500",
  connecting: "bg-amber-400 animate-pulse",
  error: "bg-red-500",
  idle: "bg-zinc-300",
};

const STATE_TEXT: Record<ConnectorStatus["state"], string> = {
  connected: "Verbunden",
  connecting: "Verbinde …",
  error: "Fehler",
  idle: "Bereit – startet bei Bedarf",
};

export function ConnectorIcon({ icon, state, size = "md" }: { icon: string; state?: ConnectorStatus["state"] | null; size?: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center rounded-xl border border-border/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        size === "lg" ? "size-12" : "size-10",
      )}
    >
      <img src={connectorIconUrl(icon)} alt="" className={cn("object-contain", size === "lg" ? "size-7" : "size-6", icon === "deepwiki" && "rounded-md")} draggable={false} />
      {state ? <span className={cn("absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-white", DOT[state])} title={STATE_TEXT[state]} /> : null}
    </span>
  );
}

function ConnectorGrid({
  entries,
  servers,
  links,
  agentId,
  busyKey,
  onPlus,
  onOpen,
}: {
  entries: ConnectorCatalogEntry[];
  servers: ConnectorServer[];
  links: { serverId: string; enabled: boolean }[];
  agentId?: string;
  busyKey?: string;
  onPlus: (entry: ConnectorCatalogEntry) => void;
  onOpen: (entry: ConnectorCatalogEntry) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {entries.map((entry) => {
        const active = isActive(entry, servers, links, agentId);
        const state = combinedStatus(entry, servers, agentId);
        const busy = busyKey === entry.key;
        return (
          // biome-ignore lint/a11y/useSemanticElements: the card holds its own action button
          <div
            key={entry.key}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(entry)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onOpen(entry);
            }}
            className="group flex min-h-[76px] cursor-pointer items-center gap-3.5 rounded-2xl border border-border/80 bg-card px-4 py-3 text-left transition-colors hover:border-border hover:bg-muted/30"
            data-testid={`connector-${entry.key}`}
          >
            <ConnectorIcon icon={entry.icon} state={state} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-[14.5px] text-foreground">{entry.title}</div>
              <div className="line-clamp-2 text-[12.5px] text-muted-foreground leading-snug">{entry.description}</div>
            </div>
            {active ? (
              <span className="grid size-8 shrink-0 place-items-center text-muted-foreground" aria-label="Verbunden">
                {state === "error" ? <span className="size-2 rounded-full bg-red-500" /> : <IconCheck className="size-[18px]" stroke={1.8} />}
              </span>
            ) : (
              <button
                type="button"
                aria-label={`${entry.title} hinzufügen`}
                disabled={busy}
                onClick={(event) => {
                  event.stopPropagation();
                  onPlus(entry);
                }}
                className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                {busy ? <IconLoader2 className="size-4 animate-spin" /> : <IconPlus className="size-4" stroke={1.8} />}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ConnectDialog({ entry, agentId, onClose }: { entry: ConnectorCatalogEntry; agentId?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const agents = useQuery({ ...agentListQueryOptions(), enabled: !!entry.perAgent && !agentId });
  const builtInAgents = (agents.data ?? []).filter((agent) => agent.builtIn || !agent.endpoint);
  const [targetAgent, setTargetAgent] = useState<string>("");
  const effectiveAgent = agentId ?? (targetAgent || undefined);

  const add = useMutation({
    mutationFn: () =>
      addConnector({
        catalogKey: entry.key,
        values,
        ...(effectiveAgent ? { agentId: effectiveAgent, attach: true } : {}),
      }),
    onSuccess: async (server) => {
      await invalidateAgentHub(queryClient);
      if (server.status.state !== "error") onClose();
    },
  });
  const result = add.data;

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-md" overlayClassName="bg-black/20">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <ConnectorIcon icon={entry.icon} size="lg" />
            <div>
              <DialogTitle>{entry.title} verbinden</DialogTitle>
              <DialogDescription className="text-[12.5px]">{entry.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogBody>
          <form
            id="connector-connect-form"
            className="flex flex-col gap-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              add.mutate();
            }}
          >
            {entry.perAgent && !agentId ? (
              <label className="flex flex-col gap-1.5">
                <span className="font-medium text-[13px]">Für welchen Agent?</span>
                <select
                  required
                  value={targetAgent}
                  onChange={(event) => setTargetAgent(event.target.value)}
                  className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm"
                >
                  <option value="">Agent wählen …</option>
                  {builtInAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {entry.fields.map((field) => (
              <label key={field.key} className="flex flex-col gap-1.5">
                <span className="font-medium text-[13px]">
                  {field.label}
                  {field.required ? <span className="text-destructive"> *</span> : null}
                </span>
                {field.type === "folders" ? (
                  <textarea
                    rows={3}
                    required={field.required}
                    placeholder={field.placeholder}
                    value={values[field.key] ?? ""}
                    onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                    className="rounded-lg border border-input bg-background px-2.5 py-2 font-mono text-[12.5px]"
                  />
                ) : (
                  <Input
                    type={field.type === "secret" ? "password" : "text"}
                    autoComplete="off"
                    required={field.required}
                    placeholder={field.placeholder}
                    value={values[field.key] ?? ""}
                    onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                )}
                {field.help ? <span className="text-[12px] text-muted-foreground">{field.help}</span> : null}
              </label>
            ))}
            {entry.fields.some((field) => field.type === "secret") ? (
              <p className="text-[12px] text-muted-foreground">Tokens werden verschlüsselt im Tresor von Connect gespeichert, nicht im Browser.</p>
            ) : null}
            {entry.docsUrl ? (
              <a href={entry.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-primary hover:underline">
                Anleitung &amp; Token erstellen <IconExternalLink className="size-3.5" />
              </a>
            ) : null}
            {add.isError ? <p className="text-destructive text-xs">{(add.error as Error).message}</p> : null}
            {result?.status.state === "error" ? (
              <p className="rounded-lg bg-destructive/5 px-3 py-2 text-destructive text-xs">Eingerichtet, aber die Verbindung schlug fehl: {result.status.error}</p>
            ) : null}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {result ? "Schließen" : "Abbrechen"}
          </Button>
          <Button type="submit" form="connector-connect-form" disabled={add.isPending}>
            {add.isPending ? <IconLoader2 className="animate-spin" /> : null}
            {add.isPending ? "Verbinde …" : "Verbinden"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConnectorDetail({
  entry,
  agentId,
  servers,
  links,
  onClose,
  onAdd,
}: {
  entry: ConnectorCatalogEntry;
  agentId?: string;
  servers: ConnectorServer[];
  links: { serverId: string; enabled: boolean }[];
  onClose: () => void;
  onAdd: (entry: ConnectorCatalogEntry) => void;
}) {
  const queryClient = useQueryClient();
  const mine = serversFor(entry, servers, agentId);
  const agents = useQuery({ ...agentListQueryOptions(), enabled: !agentId && mine.length > 0 });
  const builtInAgents = useMemo(() => (agents.data ?? []).filter((agent) => agent.builtIn || !agent.endpoint), [agents.data]);
  const [allLinks, setAllLinks] = useState<Record<string, Record<string, boolean>>>({});

  const action = useMutation({
    mutationFn: async (input: { kind: "reconnect" | "stop" | "remove" | "toggle"; serverId: string; enabled?: boolean; agent?: string }) => {
      if (input.kind === "reconnect") await reconnectConnector(input.serverId);
      if (input.kind === "stop") await stopConnector(input.serverId);
      if (input.kind === "remove") await removeConnector(input.serverId);
      if (input.kind === "toggle" && input.agent) await setAgentConnector(input.agent, input.serverId, input.enabled !== false);
    },
    onSuccess: (_data, input) => {
      if (input.kind === "toggle" && input.agent) {
        setAllLinks((current) => ({ ...current, [input.serverId]: { ...(current[input.serverId] ?? {}), [input.agent as string]: input.enabled !== false } }));
      }
      if (input.kind === "remove" && mine.length <= 1) onClose();
    },
    onSettled: () => invalidateAgentHub(queryClient),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-lg" overlayClassName="bg-black/20">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <ConnectorIcon icon={entry.icon} size="lg" state={combinedStatus(entry, servers, agentId)} />
            <div>
              <DialogTitle>{entry.title}</DialogTitle>
              <DialogDescription className="text-[12.5px]">{entry.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogBody>
          {entry.transport === "builtin" ? (
            <p className="rounded-xl bg-muted/50 px-3.5 py-3 text-[13px] text-muted-foreground">
              Immer dabei. Welche Bereiche ein Agent lesen und schreiben darf, stellst du im Brain-Tab seiner Einstellungen ein.
            </p>
          ) : mine.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-[13px] text-muted-foreground">Noch nicht eingerichtet.</p>
              <Button
                onClick={() => {
                  onClose();
                  onAdd(entry);
                }}
              >
                <IconPlus /> Hinzufügen
              </Button>
            </div>
          ) : (
            mine.map((server) => {
              const linked = links.find((link) => link.serverId === server.id);
              return (
                <div key={server.id} className="flex flex-col gap-3 rounded-xl border border-border/80 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cn("size-2.5 shrink-0 rounded-full", DOT[server.status.state])} />
                      <span className="truncate font-medium text-[13px]">
                        {STATE_TEXT[server.status.state]}
                        {server.status.state !== "error" && server.tools.length ? ` · ${server.tools.length} Werkzeuge` : ""}
                      </span>
                    </div>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">{server.id}</span>
                  </div>
                  {server.status.state === "error" && server.status.error ? (
                    <p className="max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-destructive/5 px-2.5 py-2 font-mono text-[11.5px] text-destructive">{server.status.error}</p>
                  ) : null}
                  <div className="text-[12px] text-muted-foreground">{server.url ?? server.command ?? server.transport}</div>
                  {agentId ? (
                    <label className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
                      <span className="text-[13px]">Für diesen Agent aktiv</span>
                      <Switch
                        checked={linked?.enabled ?? false}
                        onCheckedChange={(checked) => action.mutate({ kind: "toggle", serverId: server.id, enabled: checked, agent: agentId })}
                      />
                    </label>
                  ) : server.ownerAgentId ? (
                    <p className="text-[12px] text-muted-foreground">Gehört zu Agent {builtInAgents.find((agent) => agent.id === server.ownerAgentId)?.name ?? server.ownerAgentId}.</p>
                  ) : (
                    <AgentToggles
                      serverId={server.id}
                      agents={builtInAgents}
                      overrides={allLinks[server.id] ?? {}}
                      onToggle={(agent, enabled) => action.mutate({ kind: "toggle", serverId: server.id, enabled, agent })}
                    />
                  )}
                  {server.tools.length ? (
                    <details className="text-[12px]">
                      <summary className="cursor-pointer text-muted-foreground">Werkzeuge anzeigen</summary>
                      <ul className="mt-1.5 flex flex-wrap gap-1">
                        {server.tools.map((tool) => (
                          <li key={tool.name} title={tool.description} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                            {tool.name}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ kind: "reconnect", serverId: server.id })}>
                      <IconRefresh /> Neu verbinden
                    </Button>
                    {server.running ? (
                      <Button size="sm" variant="ghost" disabled={action.isPending} onClick={() => action.mutate({ kind: "stop", serverId: server.id })}>
                        Stoppen
                      </Button>
                    ) : null}
                    <Button size="sm" variant="destructive" disabled={action.isPending} onClick={() => action.mutate({ kind: "remove", serverId: server.id })}>
                      Entfernen
                    </Button>
                  </div>
                </div>
              );
            })
          )}
          {action.isError ? <p className="text-destructive text-xs">{(action.error as Error).message}</p> : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/** Settings page: one switch per built-in agent for a shared server. */
function AgentToggles({
  serverId,
  agents,
  overrides,
  onToggle,
}: {
  serverId: string;
  agents: { id: string; name: string }[];
  overrides: Record<string, boolean>;
  onToggle: (agentId: string, enabled: boolean) => void;
}) {
  if (agents.length === 0) return <p className="text-[12px] text-muted-foreground">Keine eingebauten Agents gefunden.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-[12px] text-muted-foreground">Für Agents</span>
      {agents.map((agent) => (
        <AgentToggleRow key={agent.id} agent={agent} serverId={serverId} override={overrides[agent.id]} onToggle={onToggle} />
      ))}
    </div>
  );
}

function AgentToggleRow({
  agent,
  serverId,
  override,
  onToggle,
}: {
  agent: { id: string; name: string };
  serverId: string;
  override?: boolean;
  onToggle: (agentId: string, enabled: boolean) => void;
}) {
  const query = useQuery(agentHubAgentQuery(agent.id));
  const enabled = override ?? query.data?.links.some((link) => link.serverId === serverId && link.enabled) ?? false;
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-1.5">
      <span className="truncate text-[13px]">{agent.name}</span>
      <Switch size="sm" checked={enabled} onCheckedChange={(checked) => onToggle(agent.id, checked)} />
    </label>
  );
}
