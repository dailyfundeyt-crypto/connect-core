/**
 * Per-agent external CLI bridge queue (Manus, ChatGPT, Claude, Grok, Cursor, Lovable).
 *
 * ChatGPT + Cursor go through the Phase B Codex bridge (`/api/cli-bridge`). Other targets stay
 * local until their own bridges exist.
 *
 * A38 · T3-TAUSCH: Ziele mit T3-Engine (Codex, Claude, Cursor, Grok, Freebuff, Antigravity)
 * gehen an die T3-Brücke (`POST /api/t3-agents/:agentId/messages`), wenn der Tausch eingeschaltet
 * ist. Legacy-Ziele (Manus, Lovable) und der alte `cli-bridge` bleiben unverändert.
 */

import { tryClient } from "@/lib/client";
import {
  CLI_TARGET_TO_T3_PROVIDER,
  getT3Flag,
  type T3ProviderId,
} from "@/lib/t3/contracts";

export type CliTarget =
  | "antigravity"
  | "manus"
  | "codex"
  | "chatgpt"
  | "claude"
  | "grok"
  | "cursor"
  | "lovable"
  | "freebuff";

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
    id: "antigravity",
    label: "Antigravity",
    prompt: "agy>",
    hint: "Antigravity CLI (agy) — Browser Use, Sandbox, Login via Google",
  },
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
  {
    id: "freebuff",
    label: "Freebuff",
    prompt: "freebuff>",
    hint: "Freebuff CLI — Browser-OAuth, Built-in Browser-Use",
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

/**
 * A38 · Ob der Tausch der CLI-Auswahl eingeschaltet ist.
 *
 * `bridge` schaltet die T3-Brücke frei, `cliSwap` den Tausch an der Auswahl. Beide zusammen
 * schalten das Routing um; per A01 sind beide standardmäßig AUS, also bleibt alles beim alten.
 */
export function isT3CliSwapActive(): boolean {
  return getT3Flag("bridge") || getT3Flag("cliSwap");
}

/**
 * A38 · Der T3-Treiber für dieses Ziel — oder `null` für ein Legacy-Ziel.
 *
 * `manus` und `lovable` haben keinen T3-Treiber (Vertrag A01: `"legacy"`). Sie bleiben auf dem
 * alten Weg, damit der Tausch keinen Bestand verändert.
 */
export function t3ProviderForCliTarget(
  target: CliTarget | string,
): T3ProviderId | null {
  const provider = CLI_TARGET_TO_T3_PROVIDER[target];
  if (!provider || provider === "legacy") return null;
  return provider;
}

/**
 * A38 · Läuft dieses Ziel über die T3-Engine?
 *
 * Nur wenn der Tausch eingeschaltet ist UND das Ziel einen T3-Treiber hat. Alles andere bleibt,
 * wo es war: Legacy-Ziele lokal, Codex-Bridge-Ziele über `/api/cli-bridge`.
 */
export function isT3CliTarget(target: CliTarget | string): boolean {
  if (!isT3CliSwapActive()) return false;
  return t3ProviderForCliTarget(target) !== null;
}

export function enqueueAgentCli(
  agentId: string,
  input: { target: CliTarget; command: string },
): CliEntry[] {
  const command = input.command.trim();
  if (!command) return listAgentCli(agentId);
  const store = readQueue();
  const t3 = isT3CliTarget(input.target);
  const bridged = isBridgedCliTarget(input.target);
  const entry: CliEntry = {
    id: `cli-${Date.now().toString(36)}`,
    target: input.target,
    command,
    kind: "in",
    status: "queued",
    createdAt: new Date().toISOString(),
    note: t3
      ? "Sending to T3 bridge…"
      : bridged
        ? "Sending to Codex bridge…"
        : "Waiting for local desktop bridge",
  };
  store[agentId] = [entry, ...(store[agentId] ?? [])].slice(0, 80);
  writeQueue(store);

  if (typeof window !== "undefined") {
    if (t3) {
      void dispatchT3Bridge(agentId, entry);
    } else if (bridged) {
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

/**
 * A38 · Ein T3-Ziel an die T3-Brücke.
 *
 * Der Text geht an `POST /api/t3-agents/:agentId/messages` (A11/A21) und startet dort einen Turn.
 * Die Antwort kommt NICHT hier zurück — sie läuft über den SSE-Stream in den T3-Chat (A22). Der
 * Eintrag in dieser Warteschlange wird deshalb als „angenommen" markiert, mit der Thread-Id als
 * Beleg; die eigentliche Antwort steht im Chat.
 */
async function dispatchT3Bridge(agentId: string, entry: CliEntry) {
  try {
    const { sendT3Message } = await import("@/lib/t3");
    const provider = t3ProviderForCliTarget(entry.target) ?? undefined;
    const response = await sendT3Message(
      agentId,
      {
        clientMessageId: entry.id,
        text: entry.command,
        ...(provider ? { provider } : {}),
      },
    );
    markAgentCliSent(
      agentId,
      entry.id,
      `Accepted by T3 bridge (thread ${response.threadId ?? "—"})`,
    );
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "T3 bridge failed";
    markAgentCliError(agentId, entry.id, reason);
    appendAgentCliReply(agentId, {
      target: entry.target,
      text: reason,
    });
  }
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
