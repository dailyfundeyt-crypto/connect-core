/**
 * Per-agent API keys (Manus, Browser / Anchor, ElevenLabs, Ziel AI, Codex).
 * Stored locally so each coworker can burn its own quota.
 */

export type AgentApiKeyKind =
  | "manus"
  | "browserUse"
  | "elevenLabs"
  | "zielAi"
  | "codex";

export type AgentApiKeys = {
  /** Manus Open API key (header: x-manus-api-key) — https://open.manus.ai/docs */
  manus: string;
  /** Anchor Browser / Browser Use cloud key (header: anchor-api-key). */
  browserUse: string;
  elevenLabs: string;
  /** External Ziel AI endpoint key when the agent uses an outside API. */
  zielAi: string;
  /** Optional Codex/OpenAI key when this bot does not use the global Settings key. */
  codex: string;
};

/** Whether Bot-CLI Codex/ChatGPT/Cursor uses Settings → Usage or this bot's own key. */
export type AgentCodexKeySource = "global" | "own";

const KEY = "connect.agent-api-keys";
const CODEX_SOURCE_KEY = "connect.agent-codex-key-source";
const EVENT = "connect-agent-api-keys-changed";

type Store = Record<string, Partial<AgentApiKeys>>;
type CodexSourceStore = Record<string, AgentCodexKeySource>;

const EMPTY: AgentApiKeys = {
  manus: "",
  browserUse: "",
  elevenLabs: "",
  zielAi: "",
  codex: "",
};

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

function readCodexSources(): CodexSourceStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CODEX_SOURCE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CodexSourceStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCodexSources(store: CodexSourceStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CODEX_SOURCE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(EVENT));
}

export function getAgentApiKeys(agentId: string): AgentApiKeys {
  const row = read()[agentId] ?? {};
  return {
    manus: typeof row.manus === "string" ? row.manus : "",
    browserUse: typeof row.browserUse === "string" ? row.browserUse : "",
    elevenLabs: typeof row.elevenLabs === "string" ? row.elevenLabs : "",
    zielAi: typeof row.zielAi === "string" ? row.zielAi : "",
    codex: typeof row.codex === "string" ? row.codex : "",
  };
}

export function setAgentApiKey(
  agentId: string,
  kind: AgentApiKeyKind,
  value: string,
): AgentApiKeys {
  const store = read();
  const next = {
    ...getAgentApiKeys(agentId),
    [kind]: value.trim(),
  };
  store[agentId] = next;
  write(store);
  return next;
}

export function clearAgentApiKey(
  agentId: string,
  kind: AgentApiKeyKind,
): AgentApiKeys {
  return setAgentApiKey(agentId, kind, "");
}

export function getAgentCodexKeySource(agentId: string): AgentCodexKeySource {
  return readCodexSources()[agentId] === "own" ? "own" : "global";
}

export function setAgentCodexKeySource(
  agentId: string,
  source: AgentCodexKeySource,
): AgentCodexKeySource {
  const store = readCodexSources();
  store[agentId] = source === "own" ? "own" : "global";
  writeCodexSources(store);
  return store[agentId];
}

/**
 * Key to send with Bot-CLI Codex bridge calls.
 * `undefined` = use the encrypted global key on the server (Settings → Usage).
 */
export function resolveAgentCodexApiKey(agentId: string): string | undefined {
  if (getAgentCodexKeySource(agentId) !== "own") return undefined;
  const own = getAgentApiKeys(agentId).codex.trim();
  return own || undefined;
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function subscribeAgentApiKeys(cb: () => void) {
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export const AGENT_API_KEY_META: {
  id: Exclude<AgentApiKeyKind, "codex">;
  label: string;
  hint: string;
  placeholder: string;
}[] = [
  {
    id: "manus",
    label: "Manus API (Model One)",
    hint: "Model One · API-Key — Open-API von manus.im. Mit Key: task.create, Mail Manus, voller Agent. Ohne Key: Manus-Features aus. Docs: open.manus.ai/docs",
    placeholder: "sk-… Manus API Key",
  },
  {
    id: "browserUse",
    label: "Browser Use (Anchor)",
    hint: "Eigener Cloud-Browser-Key — app.anchorbrowser.io/api-keys. Jeder Agent verbraucht nur seinen Quota.",
    placeholder: "sk-…",
  },
  {
    id: "elevenLabs",
    label: "ElevenLabs",
    hint: "Eigener TTS-Key für Telefonate dieses Agents — spart den globalen Ring.",
    placeholder: "sk_…",
  },
  {
    id: "zielAi",
    label: "Ziel AI",
    hint: "Externer API-Key, wenn dieser Agent eine Ziel-AI-API aufruft.",
    placeholder: "ziel_…",
  },
];

/** Resolve Manus key: agent override → Settings global. */
export function getAgentManusApiKey(agentId: string): string {
  const own = getAgentApiKeys(agentId).manus.trim();
  if (own) return own;
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("connect.global-api-keys");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { manus?: unknown };
    return typeof parsed.manus === "string" ? parsed.manus.trim() : "";
  } catch {
    return "";
  }
}

/** Convenience: agent ElevenLabs key, or empty if unset (caller may fall back). */
export function getAgentElevenLabsKey(agentId: string): string {
  return getAgentApiKeys(agentId).elevenLabs.trim();
}

/** Convenience: agent Browser Use / Anchor key. */
export function getAgentBrowserUseKey(agentId: string): string {
  return getAgentApiKeys(agentId).browserUse.trim();
}

/** Convenience: agent Ziel AI key for external calls. */
export function getAgentZielAiKey(agentId: string): string {
  return getAgentApiKeys(agentId).zielAi.trim();
}
