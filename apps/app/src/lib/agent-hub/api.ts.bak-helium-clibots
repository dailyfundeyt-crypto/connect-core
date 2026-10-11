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

export type ModelProvider = "default" | "openai" | "anthropic" | "ollama-local" | "ollama-cloud" | "openai-compatible";

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

export function saveAgentBrowser(agentId: string, input: { enabled: boolean; headless: boolean }) {
  return client<ConnectorServer>(`${base}/agents/${enc(agentId)}/browser`, "server", { method: "PUT", body: input, fallback: "Browser konnte nicht eingerichtet werden" });
}

export async function testAgentBrowser(agentId: string) {
  const response = await client(`${base}/agents/${enc(agentId)}/browser/test`, { method: "POST", body: {}, fallback: "Browser-Test fehlgeschlagen" });
  return (await response.json()) as { ok: boolean; text?: string; error?: string };
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
