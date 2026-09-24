/**
 * MCP / Connector source mapping — App · Hermes · Manus (Plan 051).
 *
 * Hard isolation:
 * - Manus tasks receive ONLY selected Manus connector UUIDs via
 *   message.connectors[] — never App or Hermes local MCP tools.
 * - App / Hermes agents never get Manus Connectors unless the caller
 *   explicitly maps them (default = no cross-wiring).
 * - OAuth for Manus Connectors is NOT completable via API key alone.
 */

import { getAgentManusApiKey } from "@/lib/agents/agent-api-keys";
import { seedGlobalManusFromEnv } from "@/lib/agents/global-api-keys";
import { listMcpServers, type McpServerEntry } from "@/lib/mcp/local-servers";
import { openLabUrlInChrome } from "@/lib/ui/lab-prefs";

export type ConnectorSource = "app" | "hermes" | "manus";

export const CONNECTOR_SOURCE_LABELS: Record<ConnectorSource, string> = {
  app: "App",
  hermes: "Hermes",
  manus: "Manus",
};

/** Hermes harness tools (read-only catalog — never sent to Manus). */
const HERMES_TOOL_NAMES = [
  "hermes_plan",
  "computer_navigate",
  "computer_read",
  "computer_snapshot",
  "computer_type",
  "computer_click",
  "computer_key",
  "computer_scroll",
  "computer_request_secret",
  "computer_request_help",
  "computer_list_files",
  "computer_read_file",
  "computer_write_file",
  "computer_run_command",
  "askApproval",
  "askChoice",
] as const;

export type ManusConnector = {
  id: string;
  name: string;
  type?: "builtin" | "byok" | "mcp" | string;
  description?: string;
  status?: string;
  authRequired?: boolean;
};

export type ConnectorListItem = {
  id: string;
  name: string;
  description: string;
  source: ConnectorSource;
  /** Manus-only type */
  type?: string;
  authRequired?: boolean;
  enabled?: boolean;
};

const MANUS_BASE = "/api/manus";
const SELECTION_KEY = "connect.manus-connector-selection";
const CACHE_KEY = "connect.manus-connector-cache";
const EVENT = "connect-manus-connectors-changed";
const CACHE_TTL_MS = 60_000;

/** Manus Integrations / product UI — OAuth happens here, not via API key. */
export const MANUS_INTEGRATIONS_URL = "https://manus.im/app";

type SelectionStore = Record<string, string[]>;

type CachePayload = {
  at: number;
  connectors: ManusConnector[];
};

function readSelection(): SelectionStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SELECTION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SelectionStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSelection(map: SelectionStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SELECTION_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(EVENT));
}

/** Selected Manus connector UUIDs for this agent profile (never App/Hermes ids). */
export function getSelectedManusConnectorIds(agentId: string): string[] {
  const row = readSelection()[agentId];
  if (!Array.isArray(row)) return [];
  return row.filter((id) => typeof id === "string" && id.trim().length > 0);
}

export function setSelectedManusConnectorIds(
  agentId: string,
  ids: string[],
): string[] {
  const clean = [
    ...new Set(
      ids
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ];
  const map = readSelection();
  map[agentId] = clean;
  writeSelection(map);
  return clean;
}

export function toggleManusConnector(
  agentId: string,
  connectorId: string,
  on: boolean,
): string[] {
  const current = new Set(getSelectedManusConnectorIds(agentId));
  if (on) current.add(connectorId);
  else current.delete(connectorId);
  return setSelectedManusConnectorIds(agentId, [...current]);
}

export function clearManusConnectorSelection(agentId: string): string[] {
  return setSelectedManusConnectorIds(agentId, []);
}

export function subscribeManusConnectors(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

function readCache(): CachePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    if (!parsed || !Array.isArray(parsed.connectors)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(connectors: ManusConnector[]) {
  if (typeof window === "undefined") return;
  const payload: CachePayload = { at: Date.now(), connectors };
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new Event(EVENT));
}

/** App MCP = Connect’s own Settings → MCP catalog (in-app). */
export function listAppConnectors(): ConnectorListItem[] {
  return listMcpServers().map((s: McpServerEntry) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    source: "app" as const,
    authRequired: s.authRequired,
    enabled: s.enabled,
  }));
}

/**
 * Hermes MCP = Hermes harness tools + granted mcp__* pattern (read-only).
 * Never sent to Manus as connectors.
 */
export function listHermesConnectors(): ConnectorListItem[] {
  const tools = HERMES_TOOL_NAMES.map((name) => ({
    id: `hermes:${name}`,
    name,
    description: "Hermes-agent harness tool (not a Manus Connector).",
    source: "hermes" as const,
    enabled: true,
  }));
  return [
    {
      id: "hermes:mcp-grants",
      name: "Plugin MCP grants",
      description:
        "mcp__server__tool from Connect plugin grants — Hermes may call when granted; never proxied into Manus.",
      source: "hermes",
      enabled: true,
    },
    ...tools,
  ];
}

function normalizeManusConnectors(raw: unknown): ManusConnector[] {
  if (!raw || typeof raw !== "object") return [];
  const body = raw as {
    connectors?: unknown;
    data?: unknown;
    items?: unknown;
  };
  const list = Array.isArray(body.connectors)
    ? body.connectors
    : Array.isArray(body.data)
      ? body.data
      : Array.isArray(body.items)
        ? body.items
        : Array.isArray(raw)
          ? raw
          : [];
  const out: ManusConnector[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id =
      (typeof row.id === "string" && row.id) ||
      (typeof row.connector_id === "string" && row.connector_id) ||
      (typeof row.uuid === "string" && row.uuid) ||
      "";
    if (!id.trim()) continue;
    const name =
      (typeof row.name === "string" && row.name) ||
      (typeof row.title === "string" && row.title) ||
      id;
    const type =
      typeof row.type === "string" ? row.type : undefined;
    const description =
      (typeof row.description === "string" && row.description) ||
      (typeof row.summary === "string" && row.summary) ||
      undefined;
    const status =
      typeof row.status === "string" ? row.status : undefined;
    const authRequired =
      status === "oauth_required" ||
      status === "unauthorized" ||
      row.auth_required === true;
    out.push({
      id: id.trim(),
      name,
      type,
      description,
      status,
      authRequired,
    });
  }
  return out;
}

/**
 * Cached connector.list via /api/manus proxy.
 * Without Manus key → empty list (caller shows API-Keys hint).
 */
export async function fetchManusConnectors(opts?: {
  force?: boolean;
  agentId?: string;
}): Promise<{
  connectors: ManusConnector[];
  fromCache: boolean;
  error?: string;
  hasKey: boolean;
}> {
  seedGlobalManusFromEnv();
  const apiKey = opts?.agentId
    ? getAgentManusApiKey(opts.agentId)
    : (() => {
        if (typeof window === "undefined") return "";
        try {
          const raw = window.localStorage.getItem("connect.global-api-keys");
          if (!raw) return "";
          const parsed = JSON.parse(raw) as { manus?: string };
          return parsed.manus?.trim() || "";
        } catch {
          return "";
        }
      })();

  if (!apiKey) {
    return { connectors: [], fromCache: false, hasKey: false };
  }

  const cached = readCache();
  if (
    !opts?.force &&
    cached &&
    Date.now() - cached.at < CACHE_TTL_MS &&
    cached.connectors.length >= 0
  ) {
    return {
      connectors: cached.connectors,
      fromCache: true,
      hasKey: true,
    };
  }

  try {
    const res = await fetch(`${MANUS_BASE}/connector.list`, {
      method: "GET",
      credentials: "include",
      headers: {
        "x-manus-api-key": apiKey,
        accept: "application/json",
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        body &&
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as { error?: { message?: string } }).error?.message ===
          "string"
          ? (body as { error: { message: string } }).error.message
          : `connector.list HTTP ${res.status}`;
      if (cached) {
        return {
          connectors: cached.connectors,
          fromCache: true,
          error: msg,
          hasKey: true,
        };
      }
      return {
        connectors: [],
        fromCache: false,
        error: msg,
        hasKey: true,
      };
    }
    const connectors = normalizeManusConnectors(body);
    writeCache(connectors);
    return { connectors, fromCache: false, hasKey: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "connector.list fehlgeschlagen";
    if (cached) {
      return {
        connectors: cached.connectors,
        fromCache: true,
        error: message,
        hasKey: true,
      };
    }
    return {
      connectors: [],
      fromCache: false,
      error: message,
      hasKey: true,
    };
  }
}

export function getCachedManusConnectors(): ManusConnector[] {
  return readCache()?.connectors ?? [];
}

/**
 * Payload fragment for Manus task.create / sendMessage.
 * Only Manus UUIDs — never App/Hermes ids.
 */
export function manusMessageConnectorFields(agentId: string): {
  connectors?: string[];
  clear_connectors?: boolean;
} {
  const ids = assertManusOnlyConnectorIds(
    getSelectedManusConnectorIds(agentId),
  );
  if (ids.length === 0) {
    return { clear_connectors: true };
  }
  return { connectors: ids };
}

/** Open Manus Integrations (or task_url) in dedicated Manus Voll-Chrome profile. */
export async function openManusConnectorAuth(input: {
  agentId: string;
  url?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const target = (input.url || MANUS_INTEGRATIONS_URL).trim();
  const launched = await openLabUrlInChrome(target, {
    agentId: input.agentId,
    profileKind: "manus",
  });
  return { ok: launched.ok, error: launched.error };
}

/** Guard: reject any attempt to treat App/Hermes ids as Manus connectors. */
export function assertManusOnlyConnectorIds(ids: string[]): string[] {
  const appIds = new Set(listMcpServers().map((s) => s.id));
  return ids.filter((id) => {
    const t = id.trim();
    if (!t) return false;
    if (t.startsWith("hermes:")) return false;
    if (t.includes("mcp__")) return false;
    if (appIds.has(t)) return false;
    // Manus connector ids are UUIDs (or similarly long opaque ids).
    return t.length >= 16;
  });
}
