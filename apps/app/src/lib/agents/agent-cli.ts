/**
 * Per-agent external CLI bridge queue (Manus, ChatGPT, Claude, Grok, Cursor, Lovable).
 *
 * ChatGPT + Cursor go through the Phase B Codex bridge (`/api/cli-bridge`). Other targets stay
 * local until their own bridges exist.
 */

import { tryClient } from "@/lib/client";

export type CliTarget =
  | "manus"
  | "codex"
  | "chatgpt"
  | "claude"
  | "grok"
  | "cursor"
  | "lovable";

export type CliEntry = {
  id: string;
  target: CliTarget;
  command: string;
  /** `in` = user/command, `out` = CLI reply shown back in the panel. */
  kind?: "in" | "out";
  status: "queued" | "sent" | "error";
  createdAt: string;
  note?: string;
};

export type CliBridgeStatus = {
  configured: boolean;
  reachable: boolean | null;
  mode: "live" | "mock";
  baseUrl: string;
  model: string;
  hasToken: boolean;
  hint: string;
};

export const CLI_TARGETS: {
  id: CliTarget;
  label: string;
  prompt: string;
  hint: string;
}[] = [
  {
    id: "manus",
    label: "Manus",
    prompt: "manus>",
    hint: "Manus CLI — also used for mail→chat routing",
  },
  {
    id: "codex",
    label: "Codex",
    prompt: "codex>",
    hint: "OpenAI Codex via your API key (Settings → Usage)",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    prompt: "chatgpt>",
    hint: "ChatGPT models via the same Codex bridge",
  },
  {
    id: "claude",
    label: "Claude",
    prompt: "claude>",
    hint: "Anthropic Claude Code / CLI",
  },
  {
    id: "grok",
    label: "Grok",
    prompt: "grok>",
    hint: "xAI Grok bot / CLI",
  },
  {
    id: "cursor",
    label: "Cursor",
    prompt: "cursor>",
    hint: "Cursor agent via Codex bridge (same local proxy)",
  },
  {
    id: "lovable",
    label: "Lovable",
    prompt: "lovable>",
    hint: "Lovable builder CLI",
  },
];

const QUEUE_KEY = "connect.agent-cli-queue";
const DEFAULT_KEY = "connect.agent-cli-default";

type QueueStore = Record<string, CliEntry[]>;
type DefaultStore = Record<string, CliTarget>;

function readQueue(): QueueStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as QueueStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeQueue(store: QueueStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event("connect-agent-cli-changed"));
}

function readDefaults(): DefaultStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DEFAULT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DefaultStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDefaults(store: DefaultStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEFAULT_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event("connect-agent-cli-changed"));
}

export function getAgentCliDefault(agentId: string): CliTarget {
  const saved = readDefaults()[agentId];
  return CLI_TARGETS.some((t) => t.id === saved) ? saved : "codex";
}

export function setAgentCliDefault(agentId: string, target: CliTarget) {
  const store = readDefaults();
  store[agentId] = target;
  writeDefaults(store);
}

export function listAgentCli(agentId: string): CliEntry[] {
  return readQueue()[agentId] ?? [];
}

/** Targets that hit `/api/cli-bridge` instead of a local mock. */
export function isBridgedCliTarget(target: CliTarget): boolean {
  return target === "codex" || target === "chatgpt" || target === "cursor";
}

export function enqueueAgentCli(
  agentId: string,
  input: { target: CliTarget; command: string },
): CliEntry[] {
  const command = input.command.trim();
  if (!command) return listAgentCli(agentId);
  const store = readQueue();
  const bridged = isBridgedCliTarget(input.target);
  const entry: CliEntry = {
    id: `cli-${Date.now().toString(36)}`,
    target: input.target,
    command,
    kind: "in",
    status: "queued",
    createdAt: new Date().toISOString(),
    note: bridged
      ? "Sending to Codex bridge…"
      : "Waiting for local desktop bridge",
  };
  store[agentId] = [entry, ...(store[agentId] ?? [])].slice(0, 80);
  writeQueue(store);

  if (typeof window !== "undefined") {
    if (bridged) {
      void dispatchCodexBridge(agentId, entry);
    } else {
      const replyId = entry.id;
      window.setTimeout(() => {
        markAgentCliSent(agentId, replyId);
        appendAgentCliReply(agentId, {
          target: input.target,
          text: simulateCliReply(input.target, command),
        });
      }, 280);
    }
  }

  return store[agentId];
}

async function dispatchCodexBridge(agentId: string, entry: CliEntry) {
  try {
    const { resolveAgentCodexApiKey } = await import(
      "@/lib/agents/agent-api-keys"
    );
    const agentApiKey = resolveAgentCodexApiKey(agentId);
    const response = await tryClient("/api/cli-bridge/run", {
      method: "POST",
      body: {
        target: entry.target,
        command: entry.command,
        ...(agentApiKey ? { apiKey: agentApiKey } : {}),
      },
      fallback: "Codex bridge could not be reached",
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      text?: string;
      mode?: string;
      latencyMs?: number;
    } | null;

    if (!response.ok || !payload?.text) {
      markAgentCliError(
        agentId,
        entry.id,
        payload?.text?.trim() ||
          `Bridge HTTP ${response.status}`,
      );
      appendAgentCliReply(agentId, {
        target: entry.target,
        text:
          payload?.text?.trim() ||
          `Codex bridge failed (HTTP ${response.status}). Check Settings → MCP → Codex bridge.`,
      });
      return;
    }

    const latency =
      typeof payload.latencyMs === "number"
        ? ` · ${payload.latencyMs}ms`
        : "";
    markAgentCliSent(
      agentId,
      entry.id,
      `Accepted by Codex bridge (${payload.mode ?? "live"}${latency})`,
    );
    appendAgentCliReply(agentId, {
      target: entry.target,
      text: payload.text,
    });
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Codex bridge failed";
    markAgentCliError(agentId, entry.id, reason);
    appendAgentCliReply(agentId, {
      target: entry.target,
      text: reason,
    });
  }
}

function simulateCliReply(target: CliTarget, command: string): string {
  const meta = cliMeta(target);
  return `${meta.label} · ${command.length > 160 ? `${command.slice(0, 160)}…` : command}`;
}

export function markAgentCliSent(
  agentId: string,
  entryId: string,
  note = "Accepted by local bridge",
) {
  const store = readQueue();
  const list = store[agentId] ?? [];
  store[agentId] = list.map((entry) =>
    entry.id === entryId
      ? { ...entry, status: "sent" as const, note }
      : entry,
  );
  writeQueue(store);
}

export function markAgentCliError(
  agentId: string,
  entryId: string,
  note: string,
) {
  const store = readQueue();
  const list = store[agentId] ?? [];
  store[agentId] = list.map((entry) =>
    entry.id === entryId
      ? { ...entry, status: "error" as const, note }
      : entry,
  );
  writeQueue(store);
}

export function appendAgentCliReply(
  agentId: string,
  input: { target: CliTarget; text: string },
): CliEntry[] {
  const text = input.text.trim();
  if (!text) return listAgentCli(agentId);
  const store = readQueue();
  const entry: CliEntry = {
    id: `cli-out-${Date.now().toString(36)}`,
    target: input.target,
    command: text,
    kind: "out",
    status: "sent",
    createdAt: new Date().toISOString(),
    note: "Reply",
  };
  store[agentId] = [entry, ...(store[agentId] ?? [])].slice(0, 80);
  writeQueue(store);
  return store[agentId];
}

export async function fetchCliBridgeStatus(): Promise<CliBridgeStatus | null> {
  try {
    const response = await tryClient("/api/cli-bridge/status", {
      fallback: "Could not read Codex bridge status",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { bridge?: CliBridgeStatus };
    return body.bridge ?? null;
  } catch {
    return null;
  }
}

/** Session UI: CLI panel is permanently hidden (background only). */
let cliPanelOpen = false;

export function isAgentCliPanelOpen(): boolean {
  return false;
}

export function setAgentCliPanelOpen(_open: boolean) {
  // Never open — Model One keeps CLI invisible.
  if (cliPanelOpen) {
    cliPanelOpen = false;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("connect-agent-cli-ui-changed"));
    }
  }
}

export function toggleAgentCliPanel(): boolean {
  setAgentCliPanelOpen(false);
  return false;
}

export function subscribeAgentCliUi(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("connect-agent-cli-ui-changed", handler);
  return () => window.removeEventListener("connect-agent-cli-ui-changed", handler);
}

export function clearAgentCli(agentId: string) {
  const store = readQueue();
  store[agentId] = [];
  writeQueue(store);
}

export function subscribeAgentCli(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("connect-agent-cli-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("connect-agent-cli-changed", handler);
    window.removeEventListener("storage", handler);
  };
}

export function cliMeta(target: CliTarget) {
  return CLI_TARGETS.find((t) => t.id === target) ?? CLI_TARGETS[0]!;
}
