/**
 * browser-use Sidecar-Wrapper (Stufe 3) — Server-seitige Anbindung an
 * den lokalen browser-use Python-Service.
 *
 * browser-use ist ein Open-Source-Browser-Use-Agent
 * (https://github.com/browser-use/browser-use). Wir starten ihn als
 * Sidecar auf Port 8765 (konfigurierbar via BROWSER_USE_URL) und
 * delegieren Browser-Tasks dorthin.
 *
 * API (eigener Wrapper, kein offizielles Protokoll):
 *   POST {url}/navigate   { "url": "..." }       → { ok, title }
 *   POST {url}/task       { "prompt": "...", "allow_write": bool }
 *      → { ok, result, steps[] }
 *
 * Diese Datei kapselt die HTTP-Aufrufe und liefert eine saubere
 * String-Antwort für den MCP-Stream.
 */

const DEFAULT_URL = "http://127.0.0.1:8765";
const TASK_TIMEOUT_MS = 5 * 60 * 1_000; // 5 min — Browser-Tasks dauern

function getBaseUrl(): string {
  return (process.env.BROWSER_USE_URL || DEFAULT_URL).replace(/\/+$/, "");
}

async function postJson<T>(
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`browser-use ${path} HTTP ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Navigiert den Sidecar-Browser zu einer URL.
 * Wird vor dem eigentlichen Task aufgerufen, falls startUrl gesetzt ist.
 */
export async function navigateBrowserUse(url: string): Promise<void> {
  try {
    await postJson<{ ok: boolean; title?: string }>(
      "/navigate",
      { url },
      30_000,
    );
  } catch (err) {
    throw new Error(
      `browser-use navigate fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

type TaskResponse = {
  ok: boolean;
  result?: string;
  steps?: Array<{ action: string; thought?: string; result?: string }>;
  error?: string;
};

/**
 * Führt einen Browser-Use-Task aus.
 * Gibt die finale Antwort (oder die letzten Steps wenn kein finaler Text)
 * als formatierten String zurück.
 */
export async function runBrowserUse(input: {
  agentId: string;
  prompt: string;
  allowWrite: boolean;
}): Promise<string> {
  try {
    const payload = await postJson<TaskResponse>(
      "/task",
      {
        prompt: input.prompt,
        allow_write: input.allowWrite,
        agent_id: input.agentId,
      },
      TASK_TIMEOUT_MS,
    );
    if (!payload.ok) {
      return `[Browser-Use-Engine]\n\nTask fehlgeschlagen: ${payload.error || "unbekannter Fehler"}\n\n${input.prompt}`;
    }
    let out = `[Browser-Use-Engine]\n\n`;
    if (payload.steps && payload.steps.length > 0) {
      out += `Steps (${payload.steps.length}):\n`;
      for (const step of payload.steps) {
        const thought = step.thought ? `  → ${step.thought}\n` : "";
        const result = step.result ? `  ✓ ${step.result}\n` : "";
        out += `- ${step.action}\n${thought}${result}`;
      }
      out += "\n";
    }
    out += payload.result?.trim() || "(keine finale Antwort erhalten)";
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `[Browser-Use-Engine]\n\nSidecar nicht erreichbar (${getBaseUrl()}). Browser-Use-Sidecar starten: 'browser-use --port 8765'.\n\n${input.prompt}\n\nFehler: ${msg}`;
  }
}
