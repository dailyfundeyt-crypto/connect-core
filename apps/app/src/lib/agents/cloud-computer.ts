/**
 * Per-agent Cloud Computer — 24/7 workspace for cloud agents.
 * Bundles Qwen runtime, MCP access, Anchor browser, and automations.
 */

import { setAgentBrowserMode } from "@/lib/agents/agent-browser";
import { setAgentModelFamily } from "@/lib/agents/agent-models";
import {
  listEnabledMcpServers,
  type McpServerEntry,
} from "@/lib/mcp/local-servers";

export type CloudComputer = {
  agentId: string;
  /** Whether the cloud workspace is provisioned. */
  active: boolean;
  /** Model runtime for the cloud agent. */
  runtime: "qwen";
  /** Attach workspace MCP servers to this computer. */
  mcpEnabled: boolean;
  /** Cloud browser (Anchor) for mobile / remote use. */
  browserEnabled: boolean;
  /** Allow scheduled / uploaded automations on this computer. */
  automationsEnabled: boolean;
  createdAt?: string;
  note?: string;
};

const KEY = "connect.cloud-computers";
const EVENT = "connect-cloud-computer-changed";

type Store = Record<string, CloudComputer>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(EVENT));
}

export function getCloudComputer(agentId: string): CloudComputer | null {
  return read()[agentId] ?? null;
}

export function isCloudComputerActive(agentId: string): boolean {
  return getCloudComputer(agentId)?.active === true;
}

/** Workspace MCP is attached while the cloud computer is on and MCP is enabled. */
export function cloudComputerAllowsMcp(agentId: string): boolean {
  const computer = getCloudComputer(agentId);
  return Boolean(computer?.active && computer.mcpEnabled);
}

/** Uploaded / scheduled tasks run on the cloud computer when this is on. */
export function cloudComputerAllowsAutomations(agentId: string): boolean {
  const computer = getCloudComputer(agentId);
  if (!computer?.active) return true; // no cloud computer → local automations still ok
  return computer.automationsEnabled;
}

/** Enabled workspace MCP servers available to this cloud agent. */
export function listCloudComputerMcpServers(
  agentId: string,
): McpServerEntry[] {
  if (!cloudComputerAllowsMcp(agentId)) return [];
  return listEnabledMcpServers();
}

export function createCloudComputer(
  agentId: string,
  opts?: Partial<
    Pick<
      CloudComputer,
      "mcpEnabled" | "browserEnabled" | "automationsEnabled"
    >
  >,
): CloudComputer {
  const next: CloudComputer = {
    agentId,
    active: true,
    runtime: "qwen",
    mcpEnabled: opts?.mcpEnabled ?? true,
    browserEnabled: opts?.browserEnabled ?? true,
    automationsEnabled: opts?.automationsEnabled ?? true,
    createdAt: new Date().toISOString(),
    note: "24/7 Cloud-Arbeitsbereich — Qwen + MCP + Browser + Automationen",
  };
  const store = read();
  store[agentId] = next;
  write(store);
  // Cloud agents run on Qwen by default.
  setAgentModelFamily(agentId, "qwen", { syncCli: false, resetModel: true });
  // Cloud computers default to Anchor cloud browser for mobile access.
  if (next.browserEnabled) {
    setAgentBrowserMode(agentId, "cloud", "azure");
  }
  return next;
}

export function updateCloudComputer(
  agentId: string,
  patch: Partial<
    Pick<
      CloudComputer,
      "mcpEnabled" | "browserEnabled" | "automationsEnabled" | "active" | "note"
    >
  >,
): CloudComputer {
  const existing = getCloudComputer(agentId);
  if (!existing) {
    return createCloudComputer(agentId, patch);
  }
  const next: CloudComputer = { ...existing, ...patch };
  const store = read();
  store[agentId] = next;
  write(store);
  if (next.browserEnabled && next.active) {
    setAgentBrowserMode(agentId, "cloud", "azure");
  }
  return next;
}

export function destroyCloudComputer(agentId: string) {
  const store = read();
  delete store[agentId];
  write(store);
  setAgentBrowserMode(agentId, "local");
}

export function subscribeCloudComputers(cb: () => void) {
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
