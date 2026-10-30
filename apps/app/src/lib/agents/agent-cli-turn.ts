/**
 * Chat-Turn gegen die CLI, die für den Bot gespeichert ist (Helium-Schritt `chatcli`).
 *
 * VORHER lief der Chat nie über diese CLI: `dispatchModelTurn` entschied allein nach dem globalen
 * Model-Provider (localStorage) und schickte den Text an `/api/connect/model-chat` (Invoke-Codex.ps1)
 * oder, als Fallback, an `/api/cli-bridge/run` mit `target: "chatgpt"` — einen zentralen Codex-Proxy,
 * der weder den Bot noch dessen Konto kennt. Der CLI-Tab desselben Bots fuhr dagegen die PTY-Sitzung
 * der Agenten-CLI (`/api/terminal/:id/ws`). Ergebnis: zwei verschiedene Engines für ein Fenster.
 *
 * JETZT ist der Server die Quelle der Wahrheit. `POST /api/agent-mcp/:agentId/cli/stream` löst ohne
 * `provider` die CLI des Agenten auf (`lookupAgentEngineCli`, dieselbe Funktion, die auch die PTY
 * benutzt). Deshalb schicken wir hier bewusst *keinen* Provider — dann kann Chat und CLI-Tab nicht
 * mehr auseinanderlaufen, auch wenn die Wahl später im Seitenfenster geändert wird.
 */

import { streamAgentCli } from "@/lib/agents/agent-mcp-client";

/** Engines, die kein CLI-Prozess sind — für sie gibt es hier nichts zu starten. */
const NON_CLI_ENGINE_KINDS = new Set([
  "browser_profile",
  "browser_use",
  "built-in",
  "manus",
]);

export type AgentCliKind = "codex" | "claude" | "antigravity" | "freebuff" | "gemini";

const REAL_CLI_KINDS: ReadonlySet<string> = new Set<AgentCliKind>([
  "codex",
  "claude",
  "antigravity",
  "freebuff",
  "gemini",
]);

/** Die CLI-Arten, die `runCli` auf dem Server tatsächlich starten kann. */
export function isAgentCliKind(value: string | null | undefined): value is AgentCliKind {
  return typeof value === "string" && REAL_CLI_KINDS.has(value.trim());
}

/** Nur die Profilfelder, die diese Entscheidung braucht. */
export type AgentCliSource = {
  engine?: { kind?: string; model?: string; allowWrite?: boolean } | null;
  chosenCli?: string | null;
} | null;

/**
 * Welche CLI der Chat für diesen Bot nehmen soll — dieselbe, die sein CLI-Tab zeigt.
 *
 * `engine.kind` hat Vorrang vor `chosen_cli`, weil dort die explizite Wahl im Seitenfenster steht.
 * Browser-/Manus-Kinds sind keine CLI-Prozesse; für sie bleibt `null`, und der Aufrufer fällt auf
 * seinen bisherigen Weg zurück (Hermes oder Model-One) statt eine CLI zu starten, die es nicht gibt.
 */
export function resolveAgentChatCli(
  profile: AgentCliSource | undefined,
): { cli: AgentCliKind; model: string; allowWrite: boolean } | null {
  if (!profile) return null;
  const engineKind = profile.engine?.kind;
  if (isAgentCliKind(engineKind)) {
    return {
      cli: engineKind,
      model: profile.engine?.model?.trim() || "auto",
      allowWrite: profile.engine?.allowWrite === true,
    };
  }
  if (NON_CLI_ENGINE_KINDS.has(engineKind?.trim() ?? "")) return null;
  if (isAgentCliKind(profile.chosenCli)) {
    return { cli: profile.chosenCli, model: "auto", allowWrite: false };
  }
  return null;
}

export type AgentCliTurnResult = {
  ok: boolean;
  summary: string;
};

/**
 * Ein Chat-Turn gegen die CLI des Bots, mit Live-Stream und Zusammenfassung.
 *
 * Der Server bricht ab, wenn nichts kommt; `summary` ist in dem Fall die Fehlermeldung, damit der
 * Chat wie bei jedem anderen Provider eine sichtbare Antwort bekommt statt zu hängen.
 */
export async function runAgentCliTurn(input: {
  agentId: string;
  text: string;
  agentName?: string;
  fileHints?: string[];
  cli: AgentCliKind;
  /** Unified-session provider, when the current channel selected one. */
  provider?: AgentCliKind;
  model: string;
  allowWrite: boolean;
}): Promise<AgentCliTurnResult> {
  const trimmed = input.text.trim();
  if (!trimmed) {
    return { ok: false, summary: "Leere Nachricht — nichts an die CLI gesendet." };
  }

  // Freebuff ist eine reine interaktive TUI (xterm.js + ConPTY im CLI-Reiter)
  // und hat keinen Headless-Chat-Modus. Wir weisen den Nutzer direkt auf den CLI-Tab hin.
  if (input.cli === "freebuff") {
    return {
      ok: true,
      summary: "Freebuff ist als interaktives Terminal (TUI) konzipiert. Bitte wechsle oben auf den Reiter **CLI**, um direkt im Freebuff-Terminal interaktiv zu chatten und Code zu bearbeiten.",
    };
  }

  const fileBlock =
    input.fileHints && input.fileHints.length > 0
      ? `\n\n[Angehängte Dateien]\n${input.fileHints.map((f) => `- ${f}`).join("\n")}`
      : "";

  const prompt = [
    input.agentName
      ? `Du bist „${input.agentName}“, der Agent in Connect. Antworte auf Deutsch, wenn nicht anders verlangt.`
      : "Du bist ein Agent in Connect.",
    "",
    trimmed + fileBlock,
  ].join("\n");

  let fullText = "";
  let failure: string | null = null;

  try {
    for await (const event of streamAgentCli(input.agentId, {
      // A unified channel has an explicit, server-persisted provider. Passing
      // it keeps the headless chat run on the same provider as its PTY.
      provider: input.provider ?? input.cli,
      model: input.model,
      prompt,
      allowWrite: input.allowWrite,
    })) {
      if (event.kind === "delta") {
        if (event.delta.error) failure = event.delta.error;
        if (event.delta.text) fullText += event.delta.text;
      } else if (event.kind === "error") {
        failure = event.error;
      } else if (event.kind === "end") {
        if (event.meta?.error) failure = event.meta.error;
        // `fullText` des Servers nur als Fallback: der Server zählt dort auch den
        // `notice`-Hinweis mit, den der Client bewusst nicht in die Antwort schreibt.
        if (!fullText.trim() && event.meta?.fullText) fullText = event.meta.fullText;
      }
      // `notice` ist ein Status-Hinweis der CLI ("Antigravity bereit — 20 Browser-Tools")
      // und gehört nicht in die Antwort des Agenten — deshalb wird er hier verworfen.
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      summary: `CLI ${input.cli}: ${message || "keine Antwort erhalten"}. Terminal-Tab prüfen oder CLI neu starten.`,
    };
  }

  const text = fullText.trim();
  if (!text) {
    return {
      ok: false,
      summary: failure
        ? `CLI ${input.cli}: ${failure}`
        : `CLI ${input.cli} hat keine Antwort geliefert — im Terminal-Tab prüfen, ob die CLI angemeldet ist.`,
    };
  }
  return { ok: true, summary: text };
}
