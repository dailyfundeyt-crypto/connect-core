/**
 * Typed Client für /api/agent-mcp/* — der Server-Router, der jeden Agent
 * wie einen MCP-Server exponiert.
 *
 * Andere Agents (in Stufe 2: Codex-CLI, Manus, Perplexity) rufen die hier
 * definierten Funktionen auf, um mit einem Agent zu reden (chat, steer,
 * query, profile).
 */
import { client } from "@/lib/client";

export type AgentMcpToolInfo = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type AgentMcpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export type AgentMcpToolsResponse = {
  agentId: string;
  agentName: string;
  tools: AgentMcpToolInfo[];
};

export type AgentMcpProfile = {
  id: string;
  name: string;
  title: string | null;
  model: string | null;
  tools: string[];
};

/**
 * Liste der MCP-Tools, die ein Agent anbietet.
 */
export async function listAgentMcpTools(
  agentId: string,
): Promise<AgentMcpToolsResponse> {
  const response = await client(
    `/api/agent-mcp/${encodeURIComponent(agentId)}/tools`,
    {
      fallback: "MCP-Tools konnten nicht geladen werden.",
    },
  );
  return (await response.json()) as AgentMcpToolsResponse;
}

/**
 * Profil des Agenten (für andere Agents sichtbar).
 */
export async function getAgentMcpProfile(
  agentId: string,
): Promise<AgentMcpProfile> {
  const response = await client(
    `/api/agent-mcp/${encodeURIComponent(agentId)}/profile`,
    { fallback: "MCP-Profil konnte nicht gelesen werden." },
  );
  return (await response.json()) as AgentMcpProfile;
}

/**
 * Ein einzelnes Tool aufrufen. Liefert `{ content: [{ type: "text", text }] }`,
 * genau das MCP-Format — Codex-CLI und Anthropic Desktop parsen das direkt.
 */
export async function callAgentMcpTool(
  agentId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<AgentMcpToolResult> {
  const response = await client(
    `/api/agent-mcp/${encodeURIComponent(agentId)}/tools/${encodeURIComponent(toolName)}`,
    {
      method: "POST",
      body: { args },
      fallback: `MCP-Tool ${toolName} konnte nicht aufgerufen werden.`,
    },
  );
  return (await response.json()) as AgentMcpToolResult;
}

/* ------------------------------------------------------------------ browser-tab lifecycle (Stufe 1.2) */

export type AgentBrowserTab = {
  tabId: string;
  agentId: string;
  url: string | null;
  title: string | null;
  profileDir: string;
  openedAt: string;
  closedAt: string | null;
};

export type AgentBrowserAction =
  | { kind: "navigate"; url: string }
  | { kind: "click"; selector: string }
  | { kind: "type"; selector: string; text: string; submit?: boolean }
  | { kind: "scroll"; x: number; y: number }
  | { kind: "back" }
  | { kind: "forward" }
  | { kind: "reload" };

export type AgentBrowserActionResult = {
  ok: boolean;
  url: string | null;
  title: string | null;
  screenshot: string | null;
  error?: string;
  stub?: boolean;
};

export async function openAgentBrowserTab(
  agentId: string,
): Promise<{ tab: AgentBrowserTab; stub: boolean }> {
  const response = await client(
    `/api/agent-mcp/${encodeURIComponent(agentId)}/browser/open`,
    {
      method: "POST",
      body: {},
      fallback: "Browser-Tab konnte nicht geöffnet werden.",
    },
  );
  return (await response.json()) as { tab: AgentBrowserTab; stub: boolean };
}

export async function closeAgentBrowserTab(
  agentId: string,
): Promise<{ closedTabId: string | null; stub: boolean }> {
  const response = await client(
    `/api/agent-mcp/${encodeURIComponent(agentId)}/browser/close`,
    {
      method: "POST",
      body: {},
      fallback: "Browser-Tab konnte nicht geschlossen werden.",
    },
  );
  return (await response.json()) as {
    closedTabId: string | null;
    stub: boolean;
  };
}

export async function runAgentBrowserAction(
  agentId: string,
  action: AgentBrowserAction,
): Promise<AgentBrowserActionResult> {
  const response = await client(
    `/api/agent-mcp/${encodeURIComponent(agentId)}/browser/action`,
    {
      method: "POST",
      body: { action },
      fallback: "Browser-Aktion konnte nicht ausgeführt werden.",
    },
  );
  return (await response.json()) as AgentBrowserActionResult;
}

export async function getAgentBrowserScreenshot(
  agentId: string,
): Promise<AgentBrowserActionResult> {
  const response = await client(
    `/api/agent-mcp/${encodeURIComponent(agentId)}/browser/screenshot`,
    { fallback: "Screenshot konnte nicht geladen werden." },
  );
  return (await response.json()) as AgentBrowserActionResult;
}

export async function listAgentBrowserTabs(
  agentId: string,
): Promise<{ tabs: AgentBrowserTab[] }> {
  const response = await client(
    `/api/agent-mcp/${encodeURIComponent(agentId)}/browser/tabs`,
    { fallback: "Browser-Tabs konnten nicht geladen werden." },
  );
  return (await response.json()) as { tabs: AgentBrowserTab[] };
}

/* ------------------------------------------------------------------ CLI live stream (Stufe 1.3) */

export type CliProvider = "codex" | "claude" | "antigravity";

export type CliRunMeta = {
  runId: string;
  agentId: string;
  provider: CliProvider;
  model: string;
  prompt: string;
  startedAt: number;
  finishedAt: number | null;
  status: "running" | "done" | "error" | "aborted";
  fullText: string;
  error: string | null;
  usage: { input: number; output: number } | null;
};

export type CliDelta = {
  text?: string;
  error?: string;
  usage?: { input: number; output: number };
};

export type CliStreamEvent =
  | { kind: "meta"; meta: CliRunMeta | null }
  | { kind: "delta"; delta: CliDelta }
  | { kind: "end"; meta: CliRunMeta }
  | { kind: "error"; error: string };

/**
 * SSE-Stream eines CLI-Runs öffnen. Liefert ein AsyncIterable, das jedes
 * Event des Servers (meta/delta/end/error) liefert, sobald es ankommt.
 *
 * Der Server akzeptiert sowohl `runId` (Re-Subscribe) als auch die
 * `provider/model/prompt`-Argumente (frischer Run). Wir beides in einem
 * Aufruf, je nachdem was der Caller hat.
 */
export async function* streamAgentCli(
  agentId: string,
  body: {
    provider?: CliProvider;
    model?: string;
    prompt?: string;
    allowWrite?: boolean;
    runId?: string;
  },
  options: { signal?: AbortSignal } = {},
): AsyncGenerator<CliStreamEvent> {
  const res = await fetch(`/api/agent-mcp/${encodeURIComponent(agentId)}/cli/stream`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `CLI-Stream fehlgeschlagen (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // SSE: Events sind durch "\n\n" getrennt. Wir parsen Feld für Feld.
  let currentEvent: string | null = null;
  let currentData: string[] = [];
  const flush = (): CliStreamEvent | null => {
    if (currentEvent === null) {
      currentData = [];
      return null;
    }
    const raw = currentData.join("\n");
    currentEvent = null;
    currentData = [];
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (currentEvent === "meta") {
      const obj = parsed as { meta: CliRunMeta | null };
      return { kind: "meta", meta: obj.meta };
    }
    if (currentEvent === "end") {
      return { kind: "end", meta: (parsed as { meta: CliRunMeta }).meta };
    }
    if (currentEvent === "error") {
      return { kind: "error", error: String((parsed as { error: string }).error ?? "Unbekannter Stream-Fehler.") };
    }
    if (currentEvent === "delta") {
      return { kind: "delta", delta: parsed as CliDelta };
    }
    return null;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        for (const line of block.split("\n")) {
          if (line.startsWith(":")) continue; // SSE-Kommentar/Heartbeat
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            currentData.push(line.slice(6));
          }
        }
        const ev = flush();
        if (ev) yield ev;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

export async function getLastAgentCliRun(
  agentId: string,
): Promise<{ ok: boolean; run?: CliRunMeta; error?: string }> {
  const res = await fetch(`/api/agent-mcp/${encodeURIComponent(agentId)}/cli/last`, {
    credentials: "include",
    cache: "no-store",
  });
  return (await res.json()) as { ok: boolean; run?: CliRunMeta; error?: string };
}

export async function abortAgentCliRun(
  agentId: string,
  runId: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/agent-mcp/${encodeURIComponent(agentId)}/cli/abort`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId }),
  });
  return (await res.json()) as { ok: boolean };
}
