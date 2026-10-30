/**
 * T3 Code client for the Agents area.
 *
 * The Connect server discovers the local T3 server and mints pairing links; the
 * browser only embeds T3's own web app. Nothing here talks to T3 directly, so
 * the same code works in the packaged app and on localhost:3101.
 */

export type T3AgentsStatus = {
  running: boolean;
  url: string | null;
  host: string | null;
  port: number | null;
  version: string | null;
  since: string | null;
  cli: string | null;
  message?: string;
};

export type T3PairResult = { ok: boolean; url?: string; error?: string };

/** Last origin the Agents area showed, so the header can name it before the probe returns. */
export const T3_LAST_ORIGIN_KEY = "connect.agents.t3.origin";
/** Set once a pairing link was loaded; a hint, not proof (T3 may expire the session). */
export const T3_PAIRED_KEY = "connect.agents.t3.paired";

/**
 * T3's session cookie is bound to the *hostname* it was set on, so the hint is
 * stored per origin. Embedding `127.0.0.1:3773` after pairing on `localhost:3773`
 * is a different cookie jar and needs its own link.
 */
function pairedKey(origin: string | null): string | null {
  if (!origin) return null;
  try {
    return `${T3_PAIRED_KEY}:${new URL(origin).host}`;
  } catch {
    return `${T3_PAIRED_KEY}:${origin}`;
  }
}

export function readStoredT3Origin(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(T3_LAST_ORIGIN_KEY);
  } catch {
    return null;
  }
}

export function rememberT3Origin(origin: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (origin) window.localStorage.setItem(T3_LAST_ORIGIN_KEY, origin);
    else window.localStorage.removeItem(T3_LAST_ORIGIN_KEY);
  } catch {
    /* ignore */
  }
}

export function hasPairedT3(origin: string | null): boolean {
  if (typeof window === "undefined") return false;
  const key = pairedKey(origin);
  if (!key) return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function markT3Paired(paired: boolean, origin: string | null) {
  if (typeof window === "undefined") return;
  const key = pairedKey(origin);
  if (!key) return;
  try {
    if (paired) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export async function fetchT3AgentsStatus(
  signal?: AbortSignal,
): Promise<T3AgentsStatus> {
  try {
    const response = await fetch("/api/connect/agents/t3", {
      credentials: "include",
      signal,
    });
    if (!response.ok) {
      return {
        running: false,
        url: null,
        host: null,
        port: null,
        version: null,
        since: null,
        cli: null,
        message: `Status nicht abrufbar (HTTP ${response.status}).`,
      };
    }
    return (await response.json()) as T3AgentsStatus;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return {
      running: false,
      url: null,
      host: null,
      port: null,
      version: null,
      since: null,
      cli: null,
      message: "Connect-Server nicht erreichbar.",
    };
  }
}

export async function createT3PairingLink(): Promise<T3PairResult> {
  try {
    const response = await fetch("/api/connect/agents/t3/pair", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const body = (await response.json().catch(() => null)) as T3PairResult | null;
    if (!response.ok || !body?.ok) {
      return {
        ok: false,
        error:
          body?.error?.trim() ||
          `Pairing fehlgeschlagen (HTTP ${response.status}).`,
      };
    }
    return body;
  } catch {
    return { ok: false, error: "Connect-Server nicht erreichbar." };
  }
}

export const T3_REPO_URL = "https://github.com/pingdotgg/t3code";
