import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { client } from "@/lib/client";

/** Verbinder (MCP) und Agent-Einstellungen aus /api/agent-hub. */

export type ConnectorField = {
  key: string;
  label: string;
  type: "text" | "secret" | "folders" | "url" | "command";
  placeholder?: string;
  help?: string;
  required?: boolean;
};

export type ConnectorCatalogEntry = {
  key: string;
  title: string;
  description: string;
  icon: string;
  transport: "stdio" | "http" | "sse" | "builtin";
  perAgent?: boolean;
  fields: ConnectorField[];
  docsUrl?: string;
};

export type ConnectorStatus = {
  state: "connected" | "connecting" | "error" | "idle";
  error?: string;
  at: string;
  toolCount?: number;
};

export type ConnectorServer = {
  id: string;
  catalogKey: string;
  title: string;
  transport: "stdio" | "http" | "sse";
  ownerAgentId: string | null;
  url: string | null;
  command: string | null;
  options: Record<string, unknown>;
  hasSecrets: boolean;
  running: boolean;
  status: ConnectorStatus;
  tools: { name: string; description: string }[];
};

export type AgentHubCatalog = {
  catalog: ConnectorCatalogEntry[];
  servers: ConnectorServer[];
  defaults: Record<string, string>;
};

export type ModelProvider = "default" | "openai" | "anthropic" | "ollama-local" | "ollama-cloud" | "openai-compatible" | "codex-cli" | "claude-cli" | "antigravity-cli";

export type AgentModelView = {
  provider: ModelProvider;
  model: string;
  baseUrl: string | null;
  hasKey: boolean;
  keyHint: string | null;
};

export type AgentHubAgent = {
  agentId: string;
  model: AgentModelView;
  links: { serverId: string; enabled: boolean }[];
  browser: { root: string; profile: string; output: string; serverId: string };
  recent: { at: string; serverId: string; tool: string; ok: boolean; ms: number; preview: string }[];
};

export const agentHubKeys = {
  all: ["agent-hub"] as const,
  catalog: () => ["agent-hub", "catalog"] as const,
  agent: (agentId: string) => ["agent-hub", "agent", agentId] as const,
  ollama: () => ["agent-hub", "ollama"] as const,
};

const base = "/api/agent-hub";
const enc = encodeURIComponent;

export function agentHubCatalogQuery() {
  return queryOptions({
    queryKey: agentHubKeys.catalog(),
    queryFn: async (): Promise<AgentHubCatalog> => {
      const response = await client(`${base}/catalog`, { fallback: "Verbinder konnten nicht geladen werden" });
      return (await response.json()) as AgentHubCatalog;
    },
    // Status-Punkte sollen sich bewegen, während ein Server startet.
    refetchInterval: (query) => (query.state.data?.servers.some((server) => server.status.state === "connecting") ? 2_000 : 15_000),
  });
}

export function agentHubAgentQuery(agentId: string) {
  return queryOptions({
    queryKey: agentHubKeys.agent(agentId),
    queryFn: async (): Promise<AgentHubAgent> => {
      const response = await client(`${base}/agents/${enc(agentId)}`, { fallback: "Agent-Einstellungen konnten nicht geladen werden" });
      return (await response.json()) as AgentHubAgent;
    },
  });
}

export function ollamaModelsQuery() {
  return queryOptions({
    queryKey: agentHubKeys.ollama(),
    queryFn: async (): Promise<{ running: boolean; models: { name: string; size: number; parameters: string | null }[] }> => {
      const response = await client(`${base}/ollama/models`, { fallback: "Ollama nicht erreichbar" });
      return (await response.json()) as { running: boolean; models: { name: string; size: number; parameters: string | null }[] };
    },
    staleTime: 30_000,
  });
}

export function invalidateAgentHub(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: agentHubKeys.all });
}

export function addConnector(input: { catalogKey: string; values: Record<string, string>; agentId?: string; attach?: boolean }) {
  return client<ConnectorServer>(`${base}/servers`, "server", { method: "POST", body: input, fallback: "Verbinder konnte nicht hinzugefügt werden" });
}

export function reconnectConnector(serverId: string) {
  return client<ConnectorServer>(`${base}/servers/${enc(serverId)}/connect`, "server", { method: "POST", body: {}, fallback: "Verbindung fehlgeschlagen" });
}

export function stopConnector(serverId: string) {
  return client<ConnectorServer>(`${base}/servers/${enc(serverId)}/stop`, "server", { method: "POST", body: {}, fallback: "Stoppen fehlgeschlagen" });
}

export function removeConnector(serverId: string) {
  return client(`${base}/servers/${enc(serverId)}`, { method: "DELETE", fallback: "Entfernen fehlgeschlagen" });
}

export function setAgentConnector(agentId: string, serverId: string, enabled: boolean) {
  return client(`${base}/agents/${enc(agentId)}/mcp/${enc(serverId)}`, { method: "PUT", body: { enabled }, fallback: "Speichern fehlgeschlagen" });
}

export function saveAgentModel(agentId: string, input: { provider: ModelProvider; model: string; baseUrl?: string; apiKey?: string; clearKey?: boolean }) {
  return client<AgentModelView>(`${base}/agents/${enc(agentId)}/model`, "model", { method: "PUT", body: input, fallback: "Modell konnte nicht gespeichert werden" });
}

export async function testAgentModel(agentId: string) {
  const response = await client(`${base}/agents/${enc(agentId)}/model/test`, { method: "POST", body: {}, fallback: "Test fehlgeschlagen" });
  return (await response.json()) as { ok: boolean; text?: string; error?: string; ms?: number };
}

export type CliProviderStatus = {
  kind: string;
  label: string;
  installed: boolean;
  version: string | null;
  loggedIn: boolean | null;
  detail: string;
  models?: string[];
  botCount?: number | null;
  installHint?: string;
};

export type GrokBotListItem = {
  id: string;
  name: string;
  title?: string;
  description?: string;
  avatarColor?: string;
  avatarShape?: string;
  hiddenFromSidebar?: boolean;
  alreadyImported: boolean;
  connectAgentId: string | null;
};

export function grokBotsQuery() {
  return queryOptions({
    queryKey: [...agentHubKeys.all, "grok-bots"] as const,
    queryFn: async (): Promise<{ bots: GrokBotListItem[]; status: CliProviderStatus }> => {
      const response = await client(`${base}/grok-bots`, { fallback: "Grok Bots konnten nicht geladen werden" });
      return (await response.json()) as { bots: GrokBotListItem[]; status: CliProviderStatus };
    },
    staleTime: 15_000,
  });
}

export async function importGrokBots(ids: string[]) {
  const response = await client(`${base}/grok-bots/import`, {
    method: "POST",
    body: { ids },
    fallback: "Grok-Import fehlgeschlagen",
  });
  return (await response.json()) as {
    imported: { grokBotId: string; agentId: string; name: string; status: "created" | "skipped" }[];
    errors: { grokBotId: string; name?: string; error: string }[];
  };
}

export function cliProvidersQuery() {
  return queryOptions({
    queryKey: [...agentHubKeys.all, "cli-providers"] as const,
    queryFn: async (): Promise<{ providers: CliProviderStatus[] }> => {
      const response = await client(`${base}/cli-providers`, { fallback: "Anbieter-Status nicht abrufbar" });
      return (await response.json()) as { providers: CliProviderStatus[] };
    },
    staleTime: 15_000,
  });
}

export type ManagedCliKind = "antigravity" | "freebuff" | "claude" | "codex" | "hermes";

export type CliInfo = {
  kind: ManagedCliKind;
  name: string;
  category: string;
  installed: boolean;
  version: string | null;
  loggedIn: boolean | null;
  path: string | null;
  statusDetail: string;
  installCommand: string;
};

export function cliManagerStatusQuery() {
  return queryOptions({
    queryKey: [...agentHubKeys.all, "cli-manager-status"] as const,
    queryFn: async (): Promise<{ ok: boolean; clis: CliInfo[] }> => {
      const response = await client(`${base}/cli-manager/status`, {
        fallback: "CLI-Manager-Status nicht abrufbar",
      });
      return (await response.json()) as { ok: boolean; clis: CliInfo[] };
    },
    staleTime: 5_000,
  });
}

export type CliInstallJob = {
  id: string;
  kind: ManagedCliKind;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  step: string;
  logs: string[];
  error?: string | null;
  startedAt: number;
  finishedAt: number | null;
  command: string;
};

export type CliLoginSession = {
  kind: ManagedCliKind;
  status: "idle" | "running" | "waiting_for_user" | "completed" | "failed";
  authUrl?: string | null;
  deviceCode?: string | null;
  message: string;
  logs: string[];
  startedAt: number;
  finishedAt?: number | null;
};

export async function startCliInstall(
  kind: ManagedCliKind,
  options?: { hermesApiKey?: string; customEnv?: Record<string, string> },
) {
  const response = await client(`${base}/cli-manager/install/${enc(kind)}`, {
    method: "POST",
    body: options ?? {},
    fallback: "Installation konnte nicht gestartet werden",
  });
  return (await response.json()) as { ok: boolean; job: CliInstallJob };
}

export function cliInstallJobQuery(jobId: string | null) {
  return queryOptions({
    queryKey: [...agentHubKeys.all, "cli-install-job", jobId] as const,
    queryFn: async (): Promise<{ ok: boolean; job: CliInstallJob } | null> => {
      if (!jobId) return null;
      const response = await client(`${base}/cli-manager/jobs/${enc(jobId)}`, {
        fallback: "Installationsjob nicht gefunden",
      });
      return (await response.json()) as { ok: boolean; job: CliInstallJob };
    },
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      if (status === "pending" || status === "running") return 1_000;
      return false;
    },
  });
}

export async function startCliLoginFlow(kind: ManagedCliKind) {
  const response = await client(`${base}/cli-manager/login/${enc(kind)}`, {
    method: "POST",
    body: {},
    fallback: "Login-Flow konnte nicht gestartet werden",
  });
  return (await response.json()) as { ok: boolean; session: CliLoginSession };
}

export function cliLoginSessionQuery(kind: ManagedCliKind | null) {
  return queryOptions({
    queryKey: [...agentHubKeys.all, "cli-login-session", kind] as const,
    queryFn: async (): Promise<{ ok: boolean; session: CliLoginSession | null }> => {
      if (!kind) return { ok: true, session: null };
      const response = await client(`${base}/cli-manager/login/${enc(kind)}`, {
        fallback: "Login-Status nicht abrufbar",
      });
      return (await response.json()) as { ok: boolean; session: CliLoginSession | null };
    },
    enabled: Boolean(kind),
    refetchInterval: 2_000,
  });
}

export async function saveHermesApiKey(apiKey: string) {
  const response = await client(`${base}/cli-manager/hermes-key`, {
    method: "POST",
    body: { apiKey },
    fallback: "Hermes API-Key konnte nicht gespeichert werden",
  });
  return (await response.json()) as { ok: boolean; message: string };
}

export async function startCliProviderLogin(kind: string) {
  const response = await client(`${base}/cli-providers/${enc(kind)}/login`, { method: "POST", body: {}, fallback: "Anmeldung konnte nicht gestartet werden" });
  return (await response.json()) as { started: boolean; message: string };
}

export function saveAgentBrowser(agentId: string, input: { enabled: boolean; headless: boolean }) {
  return client<ConnectorServer>(`${base}/agents/${enc(agentId)}/browser`, "server", { method: "PUT", body: input, fallback: "Browser konnte nicht eingerichtet werden" });
}

export async function testAgentBrowser(agentId: string) {
  const response = await client(`${base}/agents/${enc(agentId)}/browser/test`, { method: "POST", body: {}, fallback: "Browser-Test fehlgeschlagen" });
  return (await response.json()) as { ok: boolean; text?: string; error?: string };
}

/** Phase C Schritt 12: Öffnet das Helium-Profil für diesen Agenten im Desktop-Fenster */
export async function openAgentBrowserProfile(agentId: string) {
  const response = await client(`${base}/agents/${enc(agentId)}/browser/open-profile`, {
    method: "POST",
    body: {},
    fallback: "Helium-Profil konnte nicht geöffnet werden",
  });
  return (await response.json()) as { ok: boolean; profileDir?: string; error?: string; message?: string; isStefanProtected?: boolean };
}

/** Phase C Schritt 12: Fragt den detaillierten Browser- und Profil-Status ab */
export async function getAgentBrowserProfileStatus(agentId: string) {
  const response = await client(`${base}/agents/${enc(agentId)}/browser/status`, {
    fallback: "Browser-Status konnte nicht geladen werden",
  });
  return (await response.json()) as {
    agentId: string;
    enabled: boolean;
    profileDir: string;
    profileExists: boolean;
    status: string;
    isStefanProtected: boolean;
  };
}

/* ========================================================================= */
/* Phase E Schritt 18: Browser-use als Dienst anbinden                      */
/* ========================================================================= */

export type BrowserUseServiceStatus = {
  serviceAvailable: boolean;
  serviceDir: string;
  pythonBinary: string;
  bridgeScript: string;
  agentId: string;
  profileDir: string;
  cdpPort: number;
  isStefanProtected: boolean;
  browserRunning: boolean;
  installedPackages: {
    playwright: boolean;
    browserUse: boolean;
    cometBridge: boolean;
  };
};

export type BrowserUseActionResult = {
  ok: boolean;
  agentId: string;
  action: "open" | "click" | "type" | "screenshot" | "task" | "status";
  url?: string | null;
  title?: string | null;
  screenshot?: string | null;
  output?: string;
  error?: string;
  durationMs?: number;
};

export function browserUseStatusQuery(agentId: string) {
  return queryOptions({
    queryKey: ["agents", agentId, "browser-use-status"] as const,
    queryFn: async (): Promise<{ ok: boolean; status: BrowserUseServiceStatus }> => {
      const response = await client(`/api/agents/${enc(agentId)}/browser-use/status`, {
        fallback: "Browser-Use Dienststatus konnte nicht geladen werden",
      });
      return (await response.json()) as { ok: boolean; status: BrowserUseServiceStatus };
    },
    enabled: Boolean(agentId),
    refetchInterval: 3000,
  });
}

export async function openBrowserUseUrl(agentId: string, url: string): Promise<BrowserUseActionResult> {
  const response = await client(`/api/agents/${enc(agentId)}/browser-use/open`, {
    method: "POST",
    body: { url },
    fallback: "Öffnen im Browser-Use Dienst fehlgeschlagen",
  });
  return (await response.json()) as BrowserUseActionResult;
}

export async function clickBrowserUseElement(
  agentId: string,
  options: { selector?: string; x?: number; y?: number },
): Promise<BrowserUseActionResult> {
  const response = await client(`/api/agents/${enc(agentId)}/browser-use/click`, {
    method: "POST",
    body: options,
    fallback: "Klicken im Browser-Use Dienst fehlgeschlagen",
  });
  return (await response.json()) as BrowserUseActionResult;
}

export async function typeBrowserUseText(
  agentId: string,
  options: { text?: string; key?: string; submit?: boolean },
): Promise<BrowserUseActionResult> {
  const response = await client(`/api/agents/${enc(agentId)}/browser-use/type`, {
    method: "POST",
    body: options,
    fallback: "Tippen im Browser-Use Dienst fehlgeschlagen",
  });
  return (await response.json()) as BrowserUseActionResult;
}

export async function captureBrowserUseScreenshot(agentId: string): Promise<BrowserUseActionResult> {
  const response = await client(`/api/agents/${enc(agentId)}/browser-use/screenshot`, {
    fallback: "Screenshot erfassen fehlgeschlagen",
  });
  return (await response.json()) as BrowserUseActionResult;
}

export async function runBrowserUseTask(agentId: string, task: string): Promise<BrowserUseActionResult> {
  const response = await client(`/api/agents/${enc(agentId)}/browser-use/task`, {
    method: "POST",
    body: { task },
    fallback: "Browser-Use Aufgabe fehlgeschlagen",
  });
  return (await response.json()) as BrowserUseActionResult;
}

const ICON_FILES: Record<string, string> = {
  helium: "helium.png",
  folder: "folder.svg",
  brain: "brain.svg",
  github: "github.svg",
  notion: "notion.svg",
  supabase: "supabase.svg",
  deepwiki: "deepwiki.png",
  context7: "context7.png",
  cloudflare: "cloudflare.svg",
  memory: "memory.svg",
  custom: "custom.svg",
  playwright: "playwright.svg",
};

export function connectorIconUrl(icon: string): string {
  return `/connector-icons/${ICON_FILES[icon] ?? "custom.svg"}`;
}

export type CustomMcpTool = {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
};

export type CustomMcpItem = {
  id: string;
  scope: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  color: string;
  endpointPath: string;
  enabled: boolean;
  tools: CustomMcpTool[];
};

export type AgentCustomMcpsResponse = {
  agentId: string;
  customMcps: CustomMcpItem[];
};

export type ToggleCustomMcpResponse = {
  ok: boolean;
  agentId: string;
  mcpId: string;
  enabled: boolean;
  sync: {
    agentId: string;
    cli: string;
    enabledCount: number;
    writtenFiles: string[];
  };
};

export function agentCustomMcpsQuery(agentId: string) {
  return queryOptions({
    queryKey: ["agent-hub", "agents", agentId, "custom-mcps"],
    queryFn: async (): Promise<AgentCustomMcpsResponse> => {
      const response = await client(`${base}/agents/${enc(agentId)}/custom-mcps`, {
        fallback: "Eigene MCPs konnten nicht geladen werden",
      });
      return (await response.json()) as AgentCustomMcpsResponse;
    },
    enabled: Boolean(agentId),
  });
}

export async function toggleAgentCustomMcp(
  agentId: string,
  mcpId: string,
  enabled: boolean,
): Promise<ToggleCustomMcpResponse> {
  const response = await client(
    `${base}/agents/${enc(agentId)}/custom-mcps/${enc(mcpId)}`,
    {
      method: "PUT",
      body: { enabled },
      fallback: "MCP konnte nicht umgeschaltet werden",
    },
  );
  return (await response.json()) as ToggleCustomMcpResponse;
}

/* ========================================================================= */
/* Phase C Schritt 15: Echte MCP-Server pro CLI                              */
/* ========================================================================= */

export type RealMcpServerItem = {
  id: string;
  name: string;
  type: "http" | "sse" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  description?: string;
  enabled: boolean;
};

export type AgentCliMcpResponse = {
  cli: string;
  agentId: string;
  configFilePath: string;
  format: "json" | "toml" | "yaml";
  exists: boolean;
  lastModified: string | null;
  sizeBytes: number;
  servers: RealMcpServerItem[];
  rawContent: string;
  availableClis: string[];
  chosenCli: string;
  isWatching: boolean;
};

export function agentCliMcpQuery(agentId: string, cli?: string) {
  return queryOptions({
    queryKey: ["agent-cli-mcp", agentId, cli ?? "default"],
    queryFn: async (): Promise<AgentCliMcpResponse> => {
      const q = cli ? `?cli=${encodeURIComponent(cli)}` : "";
      const response = await client(`/api/agents/${enc(agentId)}/cli-mcp${q}`, {
        fallback: "CLI-MCP-Konfiguration konnte nicht geladen werden",
      });
      return (await response.json()) as AgentCliMcpResponse;
    },
    enabled: Boolean(agentId),
    refetchInterval: 5000, // Polling-Fallback ergänzend zum SSE-Stream
  });
}

export async function saveAgentCliMcpServer(
  agentId: string,
  cli: string,
  server: Partial<RealMcpServerItem>,
): Promise<{ ok: boolean; cli: string; server: RealMcpServerItem; config: AgentCliMcpResponse }> {
  const response = await client(`/api/agents/${enc(agentId)}/cli-mcp/server`, {
    method: "POST",
    body: { cli, server },
    fallback: "MCP-Server konnte nicht gespeichert werden",
  });
  return (await response.json()) as any;
}

export async function toggleAgentCliMcpServer(
  agentId: string,
  cli: string,
  serverId: string,
  enabled?: boolean,
): Promise<{ ok: boolean; cli: string; config: AgentCliMcpResponse }> {
  const response = await client(`/api/agents/${enc(agentId)}/cli-mcp/toggle`, {
    method: "POST",
    body: { cli, serverId, enabled },
    fallback: "MCP-Server konnte nicht umgeschaltet werden",
  });
  return (await response.json()) as any;
}

export async function deleteAgentCliMcpServer(
  agentId: string,
  cli: string,
  serverId: string,
): Promise<{ ok: boolean; cli: string; deletedId: string; config: AgentCliMcpResponse }> {
  const response = await client(
    `/api/agents/${enc(agentId)}/cli-mcp/server/${enc(serverId)}?cli=${encodeURIComponent(cli)}`,
    {
      method: "DELETE",
      fallback: "MCP-Server konnte nicht gelöscht werden",
    },
  );
  return (await response.json()) as any;
}

export async function saveAgentCliMcpRaw(
  agentId: string,
  cli: string,
  rawContent: string,
): Promise<{ ok: boolean; cli: string; config: AgentCliMcpResponse }> {
  const response = await client(`/api/agents/${enc(agentId)}/cli-mcp/raw`, {
    method: "PUT",
    body: { cli, rawContent },
    fallback: "Raw-Konfiguration konnte nicht gespeichert werden",
  });
  return (await response.json()) as any;
}

export async function syncAllAgentCliMcps(
  agentId: string,
  sourceCli?: string,
): Promise<{ ok: boolean; sourceCli: string; syncedClis: string[]; writtenFiles: string[] }> {
  const q = sourceCli ? `?cli=${encodeURIComponent(sourceCli)}` : "";
  const response = await client(`/api/agents/${enc(agentId)}/cli-mcp/sync-all${q}`, {
    method: "POST",
    fallback: "MCP-Konfiguration konnte nicht in alle CLIs gespiegelt werden",
  });
  return (await response.json()) as any;
}

export async function setAgentChosenCli(
  agentId: string,
  cli: string,
): Promise<{ ok: boolean; chosenCli: string; agent?: any }> {
  const response = await client(`/api/agents/${enc(agentId)}/chosen-cli`, {
    method: "POST",
    body: { cli },
    fallback: "Standard-CLI konnte nicht gesetzt werden",
  });
  return (await response.json()) as any;
}

// ============================================================================
// Swarm-Controller & Connect-MCP Client (Phase E Schritt 20/21)
// ============================================================================

export const CONNECT_MCP_TOKEN_STORAGE_KEY = "connect_mcp_token";

let inFlightTokenPromise: Promise<string | null> | null = null;

export function getStoredConnectMcpToken(): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage.getItem(CONNECT_MCP_TOKEN_STORAGE_KEY);
}

export function setStoredConnectMcpToken(token: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(CONNECT_MCP_TOKEN_STORAGE_KEY, token);
}

export async function ensureConnectMcpToken(): Promise<string | null> {
  const existing = getStoredConnectMcpToken();
  if (existing) return existing;

  if (inFlightTokenPromise) return inFlightTokenPromise;

  inFlightTokenPromise = (async () => {
    try {
      const res = await fetch("/api/connect-mcp/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Swarm-Dashboard Client",
          lifetime: "permanent",
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.plaintextToken) {
          setStoredConnectMcpToken(data.plaintextToken);
          return data.plaintextToken as string;
        }
      }
    } catch (err) {
      console.warn("Konnte keinen Connect-MCP-Token erstellen:", err);
    } finally {
      inFlightTokenPromise = null;
    }
    return null;
  })();

  return inFlightTokenPromise;
}

/**
 * Ruft ein Connect-MCP Tool über den standardisierten JSON-RPC-Endpunkt auf.
 * Nutzt automatische Authentifizierung per Bearer-Token.
 */
export async function callConnectMcpTool<T = any>(
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const token = await ensureConnectMcpToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch("/api/connect-mcp/jsonrpc", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Connect-MCP HTTP Fehler (${res.status}): ${res.statusText}`);
  }

  const rpc = (await res.json()) as any;
  if (rpc.error) {
    throw new Error(rpc.error.message || `Connect-MCP Fehler: ${JSON.stringify(rpc.error)}`);
  }

  const content = rpc.result?.content?.[0];
  if (!content) return rpc.result as T;

  if (content.type === "text" && typeof content.text === "string") {
    try {
      return JSON.parse(content.text) as T;
    } catch {
      return content.text as unknown as T;
    }
  }

  return content as T;
}

export type SwarmStatusResponse = {
  controller: string;
  version: string;
  activeWorkers: number;
  totalWorkers: number;
  maxConcurrent: number;
  queueLength: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalCrashesRecovered: number;
  overallProgress?: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    runningTasks: number;
    queuedTasks: number;
    percent: number;
    activeRunId?: string;
    activeRunCompleted?: number;
    activeRunTotal?: number;
  };
  resourceStatus: {
    allowed: boolean;
    reason?: string;
    metrics: {
      cpuPercent: number;
      totalMemMb: number;
      freeMemMb: number;
      usedMemMb: number;
      memPercent: number;
      timestamp: string;
    };
  };
  systemMetrics: {
    cpuPercent: number;
    totalMemMb: number;
    freeMemMb: number;
    usedMemMb: number;
    memPercent: number;
    timestamp: string;
  };
  limits: {
    maxConcurrent: number;
    maxCpuPercent: number;
    minFreeMemMb: number;
    maxMemPercent: number;
    taskTimeoutMs: number;
    maxRetries: number;
    retryDelayMs: number;
  };
  workers: Array<{
    agentId: string;
    agentName: string;
    profileDir: string;
    cdpPort: number;
    status: "idle" | "busy" | "restarting" | "offline" | "error" | "stopped" | "takeover";
    currentTaskId?: string;
    currentTaskTitle?: string;
    currentTaskAction?: string;
    currentTaskUrl?: string;
    currentTaskStartedAt?: string;
    lastScreenshot?: string | null;
    lastScreenshotAt?: string;
    lastUrl?: string | null;
    lastTitle?: string | null;
    crashCount: number;
    tasksCompleted: number;
    lastActiveAt: string;
    lastError?: string;
  }>;
};

export async function fetchSwarmStatus(): Promise<SwarmStatusResponse> {
  try {
    return await callConnectMcpTool<SwarmStatusResponse>("swarm_status", {});
  } catch (err) {
    // Fallback auf REST falls JSON-RPC vorübergehend blockiert ist
    const res = await fetch("/api/connect-mcp/swarm/status");
    if (!res.ok) throw new Error("Swarm-Status konnte nicht geladen werden.");
    return (await res.json()) as SwarmStatusResponse;
  }
}

export function swarmStatusQuery() {
  return queryOptions({
    queryKey: ["connect-mcp", "swarm", "status"],
    queryFn: fetchSwarmStatus,
    refetchInterval: 2500,
  });
}

export async function runSwarmBatch(options: {
  count?: number;
  max_concurrent?: number;
  url?: string;
  task?: string;
  action?: string;
  priority?: "high" | "normal" | "low";
  tasks?: Array<{
    action?: string;
    url?: string;
    selector?: string;
    text?: string;
    expression?: string;
    priority?: "high" | "normal" | "low";
    agent_id?: string;
  }>;
}): Promise<any> {
  try {
    return await callConnectMcpTool("run_swarm", options);
  } catch {
    const res = await fetch("/api/connect-mcp/swarm/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
    if (!res.ok) throw new Error(`Swarm-Run fehlgeschlagen (${res.status})`);
    return await res.json();
  }
}

export async function stopSwarmWorker(agentId: string): Promise<{ ok: boolean; agentId: string; message?: string }> {
  try {
    return await callConnectMcpTool("swarm_stop_worker", { agent_id: agentId });
  } catch {
    const res = await fetch(`/api/connect-mcp/swarm/worker/${encodeURIComponent(agentId)}/stop`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Worker konnte nicht gestoppt werden");
    return await res.json();
  }
}

export async function takeoverSwarmWorker(agentId: string): Promise<{
  ok: boolean;
  agentId: string;
  agentName: string;
  profileDir: string;
  cdpPort: number;
  url: string;
  message: string;
}> {
  try {
    return await callConnectMcpTool("swarm_takeover_worker", { agent_id: agentId });
  } catch {
    const res = await fetch(`/api/connect-mcp/swarm/worker/${encodeURIComponent(agentId)}/takeover`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Übernahme des Workers fehlgeschlagen");
    return await res.json();
  }
}

export async function captureSwarmWorkerScreenshot(agentId: string): Promise<{
  ok: boolean;
  screenshot?: string | null;
  error?: string;
}> {
  try {
    return await callConnectMcpTool("swarm_capture_screenshot", { agent_id: agentId });
  } catch {
    const res = await fetch(`/api/connect-mcp/swarm/worker/${encodeURIComponent(agentId)}/screenshot`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Screenshot konnte nicht aktualisiert werden");
    return await res.json();
  }
}

export async function stopAllSwarm(): Promise<{ ok: boolean; cancelledQueue: number; stoppedRunning: number }> {
  try {
    return await callConnectMcpTool("swarm_stop_all", {});
  } catch {
    const res = await fetch("/api/connect-mcp/swarm/stop-all", {
      method: "POST",
    });
    if (!res.ok) throw new Error("Swarm konnte nicht gestoppt werden");
    return await res.json();
  }
}

export async function submitSwarmTask(task: {
  action: string;
  title?: string;
  url?: string;
  selector?: string;
  text?: string;
  expression?: string;
  agent_id?: string;
  priority?: "high" | "normal" | "low";
}): Promise<any> {
  return await callConnectMcpTool("swarm_submit_task", task);
}

export async function getSwarmResults(query: {
  run_id?: string;
  task_id?: string;
  limit?: number;
}): Promise<any> {
  return await callConnectMcpTool("swarm_get_results", query);
}

export async function cancelSwarmTask(taskId: string): Promise<{ ok: boolean; taskId: string }> {
  return await callConnectMcpTool("swarm_cancel_task", { task_id: taskId });
}




