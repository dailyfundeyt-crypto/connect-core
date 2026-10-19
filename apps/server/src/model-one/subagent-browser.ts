/**
 * Model One Subagent: Browser
 *
 * Steuerung von:
 *  - Manus: über https://manus.im/app (Web-Login) + Chrome-Extension
 *  - Perplexity Computer Use: https://www.perplexity.ai/computer
 *
 * Phase 1 Scope: Beide Wrapper existieren als Funktion. Manus-Steuerung
 * läuft über die Manus-Web-API (manus.im/dashboard), Perplexity über
 * die Perplexity-Computer-Use-API. Wenn der User keine Credentials
 * hinterlegt hat, geben wir eine klare Fehlermeldung zurück.
 *
 * Die eigentliche Browser-Automation macht Antigravity selbst (siehe
 * cli-model.ts Kommentar: "Antigravity hat ein eingebautes Browser-Tool").
 * Dieser Subagent ist daher vorerst ein dünner Wrapper, der die Aufrufe
 * an die richtige Plattform leitet und das Usage-Tracking bedient.
 */
import { runCli } from "../agent-hub/cli-model";
import { trackBrowserCall } from "./engine";

export type BrowserTask = {
  kind: "manus" | "perplexity";
  instruction: string;
  startUrl?: string;
};

export type BrowserResult = { ok: true; kind: "manus" | "perplexity" | "antigravity"; output: string } | { ok: false; error: string };

/**
 * Steuert den Browser-Subagenten. Wenn der User Antigravity als Engine
 * hat (Standard), delegieren wir an Antigravity's eingebautes Browser-Tool
 * — das ist die zuverlässigste Variante, weil Antigravity das Browser-
 * Use-Handling schon eingebaut hat. Manus und Perplexity sind Fallbacks
 * für User, die explizit eine dieser Plattformen nutzen wollen.
 */
export async function runBrowserSubagent(task: BrowserTask, agentId: string, signal?: AbortSignal): Promise<BrowserResult> {
  trackBrowserCall();
  // Phase 1: wir nutzen Antigravity für alles Browser-bezogene. Manus/Perplexity
  // kommen in Phase 2 als explizite User-Wahl dazu.
  const prompt = task.startUrl
    ? `Öffne ${task.startUrl} und dann: ${task.instruction}`
    : task.instruction;
  let output = "";
  try {
    for await (const event of runCli({ kind: "antigravity", model: "auto", agentId, prompt, allowWrite: true, ...(signal ? { signal } : {}) })) {
      if (event.text) output += event.text;
      if (event.error && event.fatal) {
        return { ok: false, error: event.error };
      }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!output) return { ok: false, error: "Browser-Subagent hat keine Antwort geliefert." };
  return { ok: true, kind: "antigravity", output };
}
