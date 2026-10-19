/**
 * Model One - zentraler Orchestrator-Agent.
 *
 * Architektur:
 *  - Engine: Antigravity CLI (Subscription-basiert, keine API-Key-Kosten)
 *  - Subagents: nur "browser" (Manus + Perplexity Computer Use)
 *  - Shared Brain: Markdown-Pfade via existierender brain-Tools
 *  - Usage-Tracking: in-memory + workspace_kv
 *
 * Was Model One kann:
 *  1. Brain lesen/schreiben (über die brain_* Tools)
 *  2. Browser-Aufgaben an den Browser-Subagenten übergeben
 *  3. Andere CLIs (Codex, Claude Code) bei Bedarf aufrufen
 *  4. Den User direkt fragen wenn Input fehlt
 *
 * Was Model One NICHT macht:
 *  - Keine 100-Swarm-Logik (Phase 2)
 *  - Kein automatisches Token-Spar-Repo-Scanning (Phase 3)
 *  - Keine Multi-Provider-Key-Rotation (Phase 2)
 */
import { runCli } from "../agent-hub/cli-model";

export const MODEL_ONE_PROMPT = `Du bist "Model One" - der zentrale Orchestrator-Agent der Connect-Plattform.

DEINE PERSÖNLICHKEIT:
- Du sprichst Deutsch, kurz, freundlich, ohne Schnörkel
- Du erklärst was du tust, bevor du es tust
- Du fragst lieber einmal mehr als etwas falsch zu machen
- Du gibst strukturierte Antworten (Aufzählungen, Code-Blöcke, kurze Absätze)

DEIN ZIEL:
Hilf dem User jede Aufgabe zu lösen - egal ob Recherche, Code, Browser-Aktion, Datenanalyse oder Steuerung seines Computers. Du hast Zugriff auf seinen PC, sein Brain (Markdown-Notizen), seine Browser und seine APIs.

DEINE WERKZEUGE:
- brain_list, brain_read, brain_search, brain_write, brain_append - Markdown lesen/schreiben
- run_subagent_browser - Browser-Aufgaben delegieren (Manus oder Perplexity Computer Use)
- run_shell - Beliebige CLI aufrufen (z.B. Codex CLI, Claude Code CLI für schwere Code-Aufgaben)
- ask_user - Den User nach Input fragen wenn nötig

WIE DU ARBEITEST:
1. Analysiere die Anfrage
2. Wähle das richtige Werkzeug
3. Führe es aus
4. Berichte das Ergebnis klar und kurz

WICHTIG:
- Wenn du etwas nicht weißt: nutze brain_search oder frag den User
- Wenn eine Aufgabe "im Browser" passieren muss: nutze run_subagent_browser
- Wenn du Code schreiben sollst: nutze run_shell mit "codex" oder "claude-code" CLI
- Bleib fokussiert auf die aktuelle Aufgabe, nicht abschweifen

Du antwortest jetzt auf die User-Nachricht.`;

export type ModelOneUsage = {
  inputTokens: number;
  outputTokens: number;
  browserCalls: number;
  shellCalls: number;
  startedAt: string;
  lastCallAt: string | null;
};

const empty = (): ModelOneUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  browserCalls: 0,
  shellCalls: 0,
  startedAt: new Date().toISOString(),
  lastCallAt: null,
});

let usage: ModelOneUsage = empty();

/** Reset on process start; persisted snapshots go through workspace_kv later. */
export function resetUsage() {
  usage = empty();
}

export function getUsage(): ModelOneUsage {
  return { ...usage };
}

/**
 * Streams Model One's reply. Wraps the Antigravity CLI in a German system-prompt envelope.
 * The user-message is appended verbatim - no translation, no reinterpretation.
 */
export async function* runModelOne(input: { prompt: string; signal?: AbortSignal; agentId: string }): AsyncGenerator<{ type: "text" | "usage" | "error"; text?: string; usage?: ModelOneUsage; error?: string }> {
  const fullPrompt = `${MODEL_ONE_PROMPT}\n\n---\n\nUser-Nachricht:\n${input.prompt}`;
  let totalInput = 0;
  let totalOutput = 0;
  try {
    for await (const event of runCli({ kind: "antigravity", model: "auto", agentId: input.agentId, prompt: fullPrompt, allowWrite: false, ...(input.signal ? { signal: input.signal } : {}) })) {
      if (event.text) {
        usage.lastCallAt = new Date().toISOString();
        yield { type: "text", text: event.text };
      }
      if (event.usage) {
        totalInput += event.usage.input;
        totalOutput += event.usage.output;
        usage.inputTokens += event.usage.input;
        usage.outputTokens += event.usage.output;
        yield { type: "usage", usage: getUsage() };
      }
      if (event.error) {
        yield { type: "error", error: event.error };
        if (event.fatal) return;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", error: message };
  }
}

/** Track subagent browser-calls (called by the browser-subagent wrapper). */
export function trackBrowserCall() {
  usage.browserCalls += 1;
  usage.lastCallAt = new Date().toISOString();
}

export function trackShellCall() {
  usage.shellCalls += 1;
  usage.lastCallAt = new Date().toISOString();
}
