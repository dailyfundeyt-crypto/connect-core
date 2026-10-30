import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconBook,
  IconBrandChrome,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCode,
  IconCopy,
  IconFileText,
  IconInfoCircle,
  IconNetwork,
  IconPencil,
  IconPlus,
  IconPuzzle,
  IconRefresh,
  IconShare,
  IconShieldCheck,
  IconShoppingCart,
  IconSparkles,
  IconTerminal2,
  IconTools,
  IconTrash,
  IconTrendingUp,
} from "@tabler/icons-react";
import {
  agentCliMcpQuery,
  agentCustomMcpsQuery,
  agentHubAgentQuery,
  deleteAgentCliMcpServer,
  saveAgentCliMcpRaw,
  saveAgentCliMcpServer,
  syncAllAgentCliMcps,
  toggleAgentCliMcpServer,
  toggleAgentCustomMcp,
  setAgentChosenCli,
  type CustomMcpItem,
  type RealMcpServerItem,
  type ToggleCustomMcpResponse,
} from "@/lib/agent-hub/api";
import { setAgentCliDefault, type CliTarget } from "@/lib/agents/agent-cli";
import { agentQueryOptions } from "@/lib/agents/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConnectorGallery } from "./connector-gallery";

function getMcpIcon(iconKey: string) {
  switch (iconKey) {
    case "shopping-cart":
    case "shopping-bag":
      return <IconShoppingCart className="size-5 text-emerald-500" />;
    case "brain":
      return <IconBook className="size-5 text-indigo-500" />;
    case "chart-line":
      return <IconTrendingUp className="size-5 text-amber-500" />;
    case "share-2":
      return <IconShare className="size-5 text-sky-500" />;
    case "network":
      return <IconNetwork className="size-5 text-blue-500" />;
    case "browser":
    case "chrome":
      return <IconBrandChrome className="size-5 text-purple-500" />;
    default:
      return <IconPuzzle className="size-5 text-primary" />;
  }
}

const PRESET_MCP_SERVERS = [
  {
    id: "flux",
    name: "Flux (E-Commerce)",
    type: "http" as const,
    url: "http://localhost:3101/api/connect-mcp/flux/jsonrpc",
    description: "Warenwirtschaft & Bestellungen",
  },
  {
    id: "spark",
    name: "Spark (Wissen)",
    type: "http" as const,
    url: "http://localhost:3101/api/connect-mcp/spark/jsonrpc",
    description: "Brain-Memory & Notizen",
  },
  {
    id: "hyper",
    name: "Hyper (Trading)",
    type: "http" as const,
    url: "http://localhost:3101/api/connect-mcp/hyper/jsonrpc",
    description: "Marktdaten & Orders",
  },
  {
    id: "analyse",
    name: "Analyse (Social)",
    type: "http" as const,
    url: "http://localhost:3101/api/connect-mcp/analyse/jsonrpc",
    description: "Social Automation & Analytics",
  },
  {
    id: "connect-mcp",
    name: "Connect-MCP",
    type: "http" as const,
    url: "http://localhost:3101/api/connect-mcp/jsonrpc",
    description: "Globale Connect-Tools",
  },
  {
    id: "connect-browser",
    name: "Connect-Browser",
    type: "http" as const,
    url: "http://localhost:3101/api/connect-mcp/browser/jsonrpc",
    description: "Browser-Steuerung via Helium",
  },
  {
    id: "filesystem",
    name: "Local Filesystem",
    type: "stdio" as const,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
    description: "Lokale Dateien im Workspace",
  },
  {
    id: "postgres",
    name: "PostgreSQL DB",
    type: "stdio" as const,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://connect:...@127.0.0.1:5544/connect"],
    description: "Direkter Datenbankzugriff",
  },
];

function CustomMcpCard({
  mcp,
  agentId,
  onToggled,
}: {
  mcp: CustomMcpItem;
  agentId: string;
  onToggled: (sync: ToggleCustomMcpResponse["sync"]) => void;
}) {
  const [showTools, setShowTools] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (newEnabled: boolean) =>
      toggleAgentCustomMcp(agentId, mcp.id, newEnabled),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: ["agent-hub", "agents", agentId, "custom-mcps"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["agent-cli-mcp", agentId],
      });
      onToggled(data.sync);
    },
  });

  const isEnabled = mcp.enabled;
  const isPending = mutation.isPending;

  return (
    <div
      className={`group relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 ${
        isEnabled
          ? "border-emerald-500/40 bg-emerald-500/[0.03] shadow-xs dark:border-emerald-500/30 dark:bg-emerald-500/[0.04]"
          : "border-border bg-card/60 hover:border-border/80"
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-lg border shadow-xs ${
                isEnabled
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-border/60 bg-muted/50"
              }`}
            >
              {getMcpIcon(mcp.icon)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-foreground">
                  {mcp.name}
                </h4>
                <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/50">
                  {mcp.category}
                </span>
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">
                scope: {mcp.scope} · {mcp.endpointPath}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={isEnabled}
              disabled={isPending}
              onCheckedChange={(checked) => mutation.mutate(checked)}
              aria-label={`${mcp.name} umschalten`}
            />
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {mcp.description}
        </p>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowTools((prev) => !prev)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <IconTools className="size-3.5" />
            <span>
              {mcp.tools.length} Tools ({showTools ? "Ausblenden" : "Anzeigen"})
            </span>
            {showTools ? (
              <IconChevronUp className="size-3" />
            ) : (
              <IconChevronDown className="size-3" />
            )}
          </button>

          {showTools && (
            <div className="mt-2 space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs">
              {mcp.tools.map((t) => (
                <div
                  key={t.name}
                  className="flex flex-col gap-0.5 border-b border-border/30 pb-1.5 last:border-b-0 last:pb-0"
                >
                  <span className="font-mono text-[11px] font-semibold text-foreground">
                    {t.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {t.description}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-[11px]">
        {isEnabled ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
            <IconCheck className="size-3.5 stroke-[2.5]" />
            In CLI-Config eingetragen
          </span>
        ) : (
          <span className="text-muted-foreground/70">Inaktiv</span>
        )}

        <span className="font-mono text-[10px] text-muted-foreground/60">
          JSON-RPC 2.0
        </span>
      </div>
    </div>
  );
}

/**
 * Agent → Einstellungen → MCP: Echte MCP-Server pro CLI (Phase C Schritt 15).
 * Liest die MCP-Konfiguration der jeweiligen CLI aus deren Config-Datei im Agenten-Konto
 * und zeigt sie 1:1. Änderungen schreiben zurück in die CLI-Config; Dateiüberwachung
 * hält es synchron.
 */
export function AgentMcpPanel({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const agent = useQuery(agentHubAgentQuery(agentId));
  const profileQuery = useQuery(agentQueryOptions(agentId));
  const customMcps = useQuery(agentCustomMcpsQuery(agentId));

  // Ausgewählte CLI für die Ansicht (Standard: agent.chosenCli oder "antigravity")
  const chosenCli = profileQuery.data?.chosenCli || "antigravity";
  const [selectedCli, setSelectedCli] = useState<string>(chosenCli);

  // Synchronisiere selectedCli wenn der Agent geladen wird
  useEffect(() => {
    if (profileQuery.data?.chosenCli && selectedCli === "antigravity" && profileQuery.data.chosenCli !== "antigravity") {
      setSelectedCli(profileQuery.data.chosenCli);
    }
  }, [profileQuery.data?.chosenCli]);

  const cliMcp = useQuery(agentCliMcpQuery(agentId, selectedCli));

  const [settingDefault, setSettingDefault] = useState(false);
  const setDefaultCliMutation = useMutation({
    mutationFn: async (targetCli: string) => {
      return setAgentChosenCli(agentId, targetCli);
    },
    onSuccess: (_, targetCli) => {
      setAgentCliDefault(agentId, targetCli as CliTarget);
      void queryClient.invalidateQueries({ queryKey: agentQueryOptions(agentId).queryKey });
      void queryClient.invalidateQueries({ queryKey: ["agent-cli-mcp", agentId] });
      void queryClient.invalidateQueries({ queryKey: ["agent-hub", "agents", agentId] });
      setSettingDefault(false);
    },
    onError: () => {
      setSettingDefault(false);
    },
  });

  const [lastSync, setLastSync] = useState<ToggleCustomMcpResponse["sync"] | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const [showRawEditor, setShowRawEditor] = useState(false);
  const [rawText, setRawText] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);

  // Formular-Zustand für "Server hinzufügen / bearbeiten"
  const [showForm, setShowForm] = useState(false);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"http" | "sse" | "stdio">("http");
  const [formUrl, setFormUrl] = useState("");
  const [formCommand, setFormCommand] = useState("");
  const [formArgs, setFormArgs] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // SSE Dateiüberwachungs-Listener: Hält das Menü automatisch synchron
  useEffect(() => {
    let active = true;
    const sseUrl = `/api/agents/${encodeURIComponent(agentId)}/cli-mcp/watch`;
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(sseUrl);
      eventSource.addEventListener("mcp_change", () => {
        if (!active) return;
        void queryClient.invalidateQueries({
          queryKey: ["agent-cli-mcp", agentId],
        });
      });
    } catch {
      // Fallback auf React Query Polling
    }

    return () => {
      active = false;
      if (eventSource) eventSource.close();
    };
  }, [agentId, queryClient]);

  // Wenn Rohdaten aus dem Backend geladen werden, Textarea-State synchronisieren
  useEffect(() => {
    if (cliMcp.data?.rawContent && !showRawEditor) {
      setRawText(cliMcp.data.rawContent);
    }
  }, [cliMcp.data?.rawContent, showRawEditor]);

  // Mutation: Server speichern (hinzufügen oder bearbeiten)
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formId.trim()) throw new Error("Server-ID ist erforderlich.");
      const server: Partial<RealMcpServerItem> = {
        id: formId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
        name: formName.trim() || formId.trim(),
        type: formType,
        url: formType !== "stdio" ? formUrl.trim() : undefined,
        command: formType === "stdio" ? formCommand.trim() : undefined,
        args:
          formType === "stdio" && formArgs.trim()
            ? formArgs
                .split(" ")
                .map((a) => a.trim())
                .filter(Boolean)
            : undefined,
        description: formDesc.trim() || undefined,
        enabled: true,
      };
      return await saveAgentCliMcpServer(agentId, selectedCli, server);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: ["agent-cli-mcp", agentId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["agent-hub", "agents", agentId, "custom-mcps"],
      });
      setShowForm(false);
      resetForm();
      setLastSync({
        agentId,
        cli: selectedCli,
        enabledCount: data.config.servers.filter((s) => s.enabled).length,
        writtenFiles: [data.config.configFilePath],
      });
    },
    onError: (err: any) => {
      setFormError(err.message || "Fehler beim Speichern des Servers.");
    },
  });

  // Mutation: Server umschalten (Toggle an/aus)
  const toggleMutation = useMutation({
    mutationFn: async ({ serverId, enabled }: { serverId: string; enabled: boolean }) => {
      return await toggleAgentCliMcpServer(agentId, selectedCli, serverId, enabled);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: ["agent-cli-mcp", agentId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["agent-hub", "agents", agentId, "custom-mcps"],
      });
      setLastSync({
        agentId,
        cli: selectedCli,
        enabledCount: data.config.servers.filter((s) => s.enabled).length,
        writtenFiles: [data.config.configFilePath],
      });
    },
  });

  // Mutation: Server löschen
  const deleteMutation = useMutation({
    mutationFn: async (serverId: string) => {
      return await deleteAgentCliMcpServer(agentId, selectedCli, serverId);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: ["agent-cli-mcp", agentId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["agent-hub", "agents", agentId, "custom-mcps"],
      });
      setLastSync({
        agentId,
        cli: selectedCli,
        enabledCount: data.config.servers.filter((s) => s.enabled).length,
        writtenFiles: [data.config.configFilePath],
      });
    },
  });

  // Mutation: Raw Config speichern
  const saveRawMutation = useMutation({
    mutationFn: async () => {
      return await saveAgentCliMcpRaw(agentId, selectedCli, rawText);
    },
    onSuccess: (data) => {
      setRawError(null);
      void queryClient.invalidateQueries({
        queryKey: ["agent-cli-mcp", agentId],
      });
      setLastSync({
        agentId,
        cli: selectedCli,
        enabledCount: data.config.servers.filter((s) => s.enabled).length,
        writtenFiles: [data.config.configFilePath],
      });
    },
    onError: (err: any) => {
      setRawError(err.message || "Fehler beim Speichern der Raw-Konfiguration.");
    },
  });

  // Mutation: In alle CLIs spiegeln
  const syncAllMutation = useMutation({
    mutationFn: async () => {
      return await syncAllAgentCliMcps(agentId, selectedCli);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: ["agent-cli-mcp", agentId],
      });
      setLastSync({
        agentId,
        cli: selectedCli,
        enabledCount: cliMcp.data?.servers.filter((s) => s.enabled).length || 0,
        writtenFiles: data.writtenFiles,
      });
    },
  });

  const resetForm = () => {
    setEditingServerId(null);
    setFormId("");
    setFormName("");
    setFormType("http");
    setFormUrl("");
    setFormCommand("");
    setFormArgs("");
    setFormDesc("");
    setFormError(null);
  };

  const startEdit = (server: RealMcpServerItem) => {
    setEditingServerId(server.id);
    setFormId(server.id);
    setFormName(server.name || server.id);
    setFormType(server.type);
    setFormUrl(server.url || "");
    setFormCommand(server.command || "");
    setFormArgs(server.args ? server.args.join(" ") : "");
    setFormDesc(server.description || "");
    setFormError(null);
    setShowForm(true);
  };

  const applyPreset = (preset: (typeof PRESET_MCP_SERVERS)[number]) => {
    setFormId(preset.id);
    setFormName(preset.name);
    setFormType(preset.type);
    setFormUrl(preset.url || "");
    setFormCommand(preset.command || "");
    setFormArgs(preset.args ? preset.args.join(" ") : "");
    setFormDesc(preset.description || "");
  };

  const copyPath = () => {
    if (cliMcp.data?.configFilePath) {
      void navigator.clipboard.writeText(cliMcp.data.configFilePath);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    }
  };

  const configInfo = cliMcp.data;
  const servers = configInfo?.servers ?? [];
  const activeCount = servers.filter((s) => s.enabled).length;

  const clisList = configInfo?.availableClis ?? [
    "antigravity",
    "codex",
    "claude",
    "hermes",
    "freebuff",
    "workspace",
  ];

  const recent = agent.data?.recent ?? [];
  const mcps = customMcps.data?.customMcps ?? [];

  return (
    <div className="flex flex-col gap-8" data-testid="agent-cli-mcp-section">
      {/* =================================================================== */}
      {/* 1. Echte MCP-Server pro CLI (Phase C Schritt 15)                     */}
      {/* =================================================================== */}
      <section className="flex flex-col gap-4 rounded-xl border border-primary/20 bg-card/60 p-5 shadow-xs">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <IconTerminal2 className="size-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                  Echte MCP-Server pro CLI (Phase C Schritt 15)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Liest 1:1 die Konfigurationsdatei der jeweiligen CLI im Agenten-Konto.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Dateiüberwachung aktiv
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground border border-border">
                {activeCount} von {servers.length} aktiv
              </span>
            </div>
          </div>

          {/* CLI Selector Tabs */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
              CLI wählen:
            </span>
            {clisList.map((cli) => {
              const isSelected = selectedCli.toLowerCase() === cli.toLowerCase();
              const isAgentDefault = chosenCli.toLowerCase() === cli.toLowerCase();

              return (
                <button
                  key={cli}
                  type="button"
                  onClick={() => {
                    setSelectedCli(cli);
                    setShowForm(false);
                    setShowRawEditor(false);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span className="capitalize">{cli}</span>
                  {isAgentDefault && (
                    <span
                      className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                        isSelected
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      Agent-Standard
                    </span>
                  )}
                </button>
              );
            })}

            {selectedCli.toLowerCase() !== "workspace" && selectedCli.toLowerCase() !== chosenCli.toLowerCase() && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto text-xs h-7 gap-1 border-primary/40 hover:bg-primary/10 hover:text-primary"
                disabled={setDefaultCliMutation.isPending || settingDefault}
                onClick={() => {
                  setSettingDefault(true);
                  setDefaultCliMutation.mutate(selectedCli);
                }}
              >
                {setDefaultCliMutation.isPending || settingDefault ? (
                  <IconRefresh className="size-3 animate-spin" />
                ) : (
                  <IconCheck className="size-3 text-primary" />
                )}
                <span>Als Standard-CLI setzen</span>
              </Button>
            )}
          </div>

          {/* Exact Config File Path on Disk */}
          {configInfo && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border/70 bg-muted/30 p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <IconFileText className="size-3.5 text-primary" />
                  <span className="font-semibold text-foreground">
                    Echte Datei auf Festplatte:
                  </span>
                  <span className="uppercase text-[10px] font-bold bg-muted px-1.5 py-0.5 rounded border border-border">
                    {configInfo.format}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {configInfo.lastModified && (
                    <span className="text-[10px] text-muted-foreground">
                      Zuletzt geändert:{" "}
                      {new Date(configInfo.lastModified).toLocaleTimeString("de-DE", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={copyPath}
                    className="h-6 gap-1 px-2 text-[11px]"
                    title="Pfad kopieren"
                  >
                    {copiedPath ? (
                      <>
                        <IconCheck className="size-3 text-emerald-500" />
                        <span className="text-emerald-500">Kopiert</span>
                      </>
                    ) : (
                      <>
                        <IconCopy className="size-3" />
                        <span>Kopieren</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <code className="break-all font-mono text-[11px] text-foreground/90 bg-background/80 p-1.5 rounded border border-border/50">
                {configInfo.configFilePath}
              </code>
            </div>
          )}

          {/* Action Toolbar */}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  resetForm();
                  setShowForm((prev) => !prev);
                }}
                className="h-8 gap-1.5 text-xs font-semibold"
              >
                <IconPlus className="size-3.5" />
                <span>{showForm ? "Formular schließen" : "Server hinzufügen"}</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!showRawEditor && configInfo?.rawContent) {
                    setRawText(configInfo.rawContent);
                  }
                  setShowRawEditor((prev) => !prev);
                }}
                className="h-8 gap-1.5 text-xs"
              >
                <IconCode className="size-3.5" />
                <span>{showRawEditor ? "1:1 Editor ausblenden" : "1:1 Config-Text anzeigen"}</span>
              </Button>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={syncAllMutation.isPending}
              onClick={() => syncAllMutation.mutate()}
              className="h-8 gap-1.5 text-xs"
              title="Überträgt die aktiven MCPs dieser CLI in alle anderen CLIs"
            >
              <IconRefresh className={`size-3.5 ${syncAllMutation.isPending ? "animate-spin" : ""}`} />
              <span>In alle CLIs spiegeln</span>
            </Button>
          </div>
        </div>

        {/* Sync notification feedback */}
        {lastSync && (
          <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            <IconCheck className="size-4 shrink-0 text-emerald-500" />
            <div className="flex-1">
              <span className="font-semibold">CLI-Config auf Festplatte aktualisiert:</span>{" "}
              {lastSync.enabledCount} MCPs aktiv für CLI{" "}
              <code className="font-mono font-bold">{lastSync.cli}</code>.
              {lastSync.writtenFiles?.length > 0 && (
                <span className="text-muted-foreground ml-1">
                  ({lastSync.writtenFiles.length} Dateien synchronisiert)
                </span>
              )}
            </div>
          </div>
        )}

        {/* 1:1 Raw File Text Editor (Collapsible) */}
        {showRawEditor && (
          <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <IconFileText className="size-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">
                  1:1 Rohdatei ({configInfo?.format?.toUpperCase()}): Direkte Bearbeitung
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Änderungen schreiben direkt in die Datei auf der Festplatte
              </span>
            </div>

            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={10}
              className="font-mono text-xs leading-relaxed bg-background"
              placeholder={`MCP-Konfiguration im ${configInfo?.format || "json"} Format`}
            />

            {rawError && (
              <p className="text-xs text-destructive font-medium">{rawError}</p>
            )}

            <div className="flex items-center justify-end gap-2 mt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowRawEditor(false)}
                className="text-xs"
              >
                Abbrechen
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saveRawMutation.isPending}
                onClick={() => saveRawMutation.mutate()}
                className="text-xs gap-1.5"
              >
                <IconCheck className="size-3.5" />
                <span>
                  {saveRawMutation.isPending
                    ? "Speichere..."
                    : "Änderungen auf Festplatte speichern"}
                </span>
              </Button>
            </div>
          </div>
        )}

        {/* Add/Edit Server Form */}
        {showForm && (
          <div className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <IconPlus className="size-4 text-primary" />
                {editingServerId ? "MCP-Server bearbeiten" : "Neuen MCP-Server zur CLI-Config hinzufügen"}
              </h4>
              <span className="text-[11px] text-muted-foreground">
                Ziel-CLI: <strong className="capitalize text-foreground">{selectedCli}</strong>
              </span>
            </div>

            {/* Presets Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground mr-1">
                Vorlagen:
              </span>
              {PRESET_MCP_SERVERS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="rounded-md border border-border/80 bg-background px-2 py-0.5 text-[10px] font-medium text-foreground hover:border-primary transition-colors cursor-pointer"
                >
                  {preset.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Server-ID / Schlüssel</label>
                <Input
                  value={formId}
                  onChange={(e) => setFormId(e.target.value)}
                  placeholder="z.B. flux, postgres, filesystem"
                  className="h-8 text-xs font-mono"
                  disabled={Boolean(editingServerId)}
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Anzeigename</label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="z.B. Flux E-Commerce"
                  className="h-8 text-xs"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Transport-Typ</label>
                <div className="flex gap-2">
                  {(["http", "sse", "stdio"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormType(t)}
                      className={`flex-1 rounded-md px-2 py-1 text-center font-mono text-xs uppercase cursor-pointer border ${
                        formType === t
                          ? "border-primary bg-primary/10 text-primary font-bold"
                          : "border-border bg-background text-muted-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {formType !== "stdio" ? (
                <div>
                  <label className="font-semibold block mb-1">HTTP / SSE URL</label>
                  <Input
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="http://localhost:3101/api/connect-mcp/.../jsonrpc"
                    className="h-8 text-xs font-mono"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="font-semibold block mb-1">Befehl (Command)</label>
                    <Input
                      value={formCommand}
                      onChange={(e) => setFormCommand(e.target.value)}
                      placeholder="npx, node, python"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="col-span-full">
                    <label className="font-semibold block mb-1">Argumente (durch Leerzeichen getrennt)</label>
                    <Input
                      value={formArgs}
                      onChange={(e) => setFormArgs(e.target.value)}
                      placeholder="-y @modelcontextprotocol/server-filesystem C:\Pfad"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </>
              )}

              <div className="col-span-full">
                <label className="font-semibold block mb-1">Beschreibung (Optional)</label>
                <Input
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Wofür dieser Server genutzt wird"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {formError && (
              <p className="text-xs text-destructive font-medium">{formError}</p>
            )}

            <div className="flex items-center justify-end gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="text-xs"
              >
                Abbrechen
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="text-xs gap-1.5"
              >
                <IconCheck className="size-3.5" />
                <span>
                  {saveMutation.isPending
                    ? "Speichere..."
                    : editingServerId
                      ? "Server aktualisieren"
                      : "Server eintragen"}
                </span>
              </Button>
            </div>
          </div>
        )}

        {/* Real Servers Table / Cards (1:1 aus der Config-Datei) */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              Konfigurierte Server ({servers.length}) in <code className="font-mono text-foreground">{selectedCli}</code>:
            </span>
            <span className="text-[11px]">
              Änderungen schreiben direkt in die Datei
            </span>
          </div>

          {cliMcp.isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Lade MCP-Konfiguration aus der CLI-Datei...
            </div>
          ) : servers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground">
              Keine MCP-Server in dieser Datei konfiguriert. Klicke auf "Server hinzufügen", um einen Server einzutragen.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {servers.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-start justify-between gap-3 rounded-xl border p-3.5 transition-all ${
                    s.enabled
                      ? "border-emerald-500/40 bg-emerald-500/[0.03] dark:border-emerald-500/30 dark:bg-emerald-500/[0.04]"
                      : "border-border bg-card/60 opacity-75"
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg border shadow-xs ${
                        s.enabled
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "border-border/60 bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      {s.type === "stdio" ? (
                        <IconTerminal2 className="size-4" />
                      ) : (
                        <IconNetwork className="size-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">
                          {s.id}
                        </span>
                        {s.name && s.name !== s.id && (
                          <span className="text-xs text-muted-foreground font-medium">
                            ({s.name})
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.2 text-[9px] font-bold uppercase border ${
                            s.type === "stdio"
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
                          }`}
                        >
                          {s.type}
                        </span>
                      </div>

                      {s.url && (
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground break-all">
                          URL: <span className="text-foreground/80">{s.url}</span>
                        </p>
                      )}

                      {s.command && (
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground break-all">
                          Command: <span className="text-foreground/80">{s.command}</span>{" "}
                          {s.args && (
                            <span className="text-muted-foreground/90">
                              {s.args.join(" ")}
                            </span>
                          )}
                        </p>
                      )}

                      {s.description && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {s.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(s)}
                      className="size-7 p-0 text-muted-foreground hover:text-foreground"
                      title="Bearbeiten"
                    >
                      <IconPencil className="size-3.5" />
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(s.id)}
                      className="size-7 p-0 text-muted-foreground hover:text-destructive"
                      title="Löschen"
                    >
                      <IconTrash className="size-3.5" />
                    </Button>

                    <Switch
                      checked={s.enabled}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ serverId: s.id, enabled: checked })
                      }
                      aria-label={`${s.id} umschalten`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* =================================================================== */}
      {/* 2. Eigene MCPs Schnellschalter (Flux, Spark, etc.)                 */}
      {/* =================================================================== */}
      <section className="flex flex-col gap-4 border-t border-border pt-6">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <IconSparkles className="size-4" />
              </div>
              <h3 className="font-semibold text-sm text-foreground">
                Eigene MCP-Schnellschalter
              </h3>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              <IconShieldCheck className="size-3" />
              {mcps.filter((m) => m.enabled).length} von 6 aktiv
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Flux (E-Commerce/Warenverwaltung), Spark (Wissen), Hyper (Trading), Analyse (Social Automatisierung), Connect-MCP, Connect-Browser.
            Pro Agent an/aus schaltbar. Jede Änderung wird automatisch in die isolierte CLI-Konfiguration des Agenten eingetragen (Codex, Claude, Hermes, Antigravity).
          </p>
        </div>

        {/* Grid of the 6 Custom MCPs */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {customMcps.isLoading ? (
            <div className="col-span-full py-8 text-center text-xs text-muted-foreground">
              Lade eigene MCPs...
            </div>
          ) : mcps.length > 0 ? (
            mcps.map((mcp) => (
              <CustomMcpCard
                key={mcp.id}
                mcp={mcp}
                agentId={agentId}
                onToggled={(sync) => setLastSync(sync)}
              />
            ))
          ) : (
            <div className="col-span-full py-6 text-center text-xs text-muted-foreground">
              Keine eigenen MCPs gefunden.
            </div>
          )}
        </div>
      </section>

      {/* =================================================================== */}
      {/* 3. Externe Verbinder & Katalog                                      */}
      {/* =================================================================== */}
      <section className="flex flex-col gap-4 border-t border-border pt-6">
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold text-sm text-foreground">
            Externe Verbinder & Standard-MCPs
          </h3>
          <p className="text-xs text-muted-foreground">
            Globale Verbinder aus dem Katalog (GitHub, Supabase, Cloudflare, etc.).
          </p>
        </div>
        <ConnectorGallery agentId={agentId} variant="full" />
      </section>

      {/* =================================================================== */}
      {/* 4. Zuletzt benutzt                                                  */}
      {/* =================================================================== */}
      {recent.length ? (
        <section className="flex flex-col gap-2 border-t border-border pt-6">
          <h3 className="font-semibold text-[13px]">Zuletzt benutzt</h3>
          <ul className="flex flex-col gap-1">
            {recent.slice(0, 8).map((call) => (
              <li
                key={`${call.at}-${call.tool}`}
                className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-1.5 text-[12px]"
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    call.ok ? "bg-emerald-500" : "bg-red-500"
                  }`}
                />
                <span className="font-mono">
                  {call.serverId} · {call.tool}
                </span>
                <span className="ml-auto shrink-0 text-muted-foreground">
                  {(call.ms / 1000).toFixed(1)} s ·{" "}
                  {new Date(call.at).toLocaleTimeString("de-DE", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
