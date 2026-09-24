/**
 * Global API keys (Settings → API-Keys).
 * Per-agent keys override these when set.
 */

import {
  type AgentApiKeyKind,
  maskApiKey,
  subscribeAgentApiKeys,
} from "@/lib/agents/agent-api-keys";

const GLOBAL_KEY = "connect.global-api-keys";
const EVENT = "connect-agent-api-keys-changed";

export type GlobalApiKeys = {
  manus: string;
  browserUse: string;
  elevenLabs: string;
  zielAi: string;
};

const EMPTY: GlobalApiKeys = {
  manus: "",
  browserUse: "",
  elevenLabs: "",
  zielAi: "",
};

function read(): GlobalApiKeys {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(GLOBAL_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<GlobalApiKeys>;
    return {
      manus: typeof parsed.manus === "string" ? parsed.manus : "",
      browserUse: typeof parsed.browserUse === "string" ? parsed.browserUse : "",
      elevenLabs: typeof parsed.elevenLabs === "string" ? parsed.elevenLabs : "",
      zielAi: typeof parsed.zielAi === "string" ? parsed.zielAi : "",
    };
  } catch {
    return { ...EMPTY };
  }
}

function write(next: GlobalApiKeys) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GLOBAL_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

export function getGlobalApiKeys(): GlobalApiKeys {
  return read();
}

export function setGlobalApiKey(
  kind: Exclude<AgentApiKeyKind, "codex">,
  value: string,
): GlobalApiKeys {
  const next = { ...read(), [kind]: value.trim() };
  write(next);
  return next;
}

export function clearGlobalApiKey(
  kind: Exclude<AgentApiKeyKind, "codex">,
): GlobalApiKeys {
  return setGlobalApiKey(kind, "");
}

/**
 * One-shot seed of global Manus key from Vite env (dev / local .env.local).
 * Does not overwrite a key the user already saved in Settings.
 */
export function seedGlobalManusFromEnv(): void {
  if (typeof window === "undefined") return;
  try {
    const fromEnv = (
      import.meta as ImportMeta & { env?: Record<string, string> }
    ).env?.VITE_MANUS_API_KEY?.trim();
    if (!fromEnv) return;
    if (read().manus.trim()) return;
    write({ ...read(), manus: fromEnv });
  } catch {
    /* ignore */
  }
}

export { maskApiKey, subscribeAgentApiKeys as subscribeGlobalApiKeys };
