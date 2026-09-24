/**
 * ZGPT (ChatGPT) background CLI — invisible terminal for Model One.
 *
 * Connect chat + files go to `/api/cli-bridge` (Codex/ChatGPT bridge).
 * The user never sees a terminal; they only sign in to ZGPT once (Codex key /
 * plan). Same idea as Manus Open API: full agent in the background, including
 * browser-use and sandbox when the bridge supports tools.
 */

import { tryClient } from "@/lib/client";
import { resolveAgentCodexApiKey } from "@/lib/agents/agent-api-keys";
import { getAgentShell } from "@/lib/agents/agent-shell";
import {
  ensureZgptProfileForAgent,
  getZgptProfile,
} from "@/lib/agents/zgpt-profiles";

export type ZgptTurnResult = {
  ok: boolean;
  summary: string;
  mode?: string;
};

/**
 * One chat turn against the background ZGPT CLI. Terminal stays hidden.
 */
export async function runZgptCliTurn(input: {
  agentId: string;
  text: string;
  agentName?: string;
  /** Optional attachment paths / names already uploaded — appended to prompt. */
  fileHints?: string[];
}): Promise<ZgptTurnResult> {
  const trimmed = input.text.trim();
  if (!trimmed) {
    return { ok: false, summary: "Leere Nachricht — nichts an ZGPT gesendet." };
  }

  const shell = getAgentShell(input.agentId);
  const profile =
    getZgptProfile(shell.zgptProfileId) ??
    ensureZgptProfileForAgent(input.agentId, input.agentName);

  const fileBlock =
    input.fileHints && input.fileHints.length > 0
      ? `\n\n[Angehängte Dateien]\n${input.fileHints.map((f) => `- ${f}`).join("\n")}`
      : "";

  const command = [
    `[Connect · ZGPT-Profil „${profile.label}“ · unsichtbares CLI]`,
    `Du bist der Hintergrund-Agent für diesen Connect-Bot.`,
    `Nutze Browser Use / Sandbox wenn nötig — der Nutzer sieht nur den Connect-Chat.`,
    "",
    trimmed + fileBlock,
  ].join("\n");

  const agentApiKey = resolveAgentCodexApiKey(input.agentId);

  try {
    const response = await tryClient("/api/cli-bridge/run", {
      method: "POST",
      body: {
        target: "chatgpt",
        command,
        ...(agentApiKey ? { apiKey: agentApiKey } : {}),
      },
      fallback: "ZGPT-CLI-Bridge nicht erreichbar",
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      text?: string;
      mode?: string;
    } | null;

    if (!response.ok || !payload?.text?.trim()) {
      return {
        ok: false,
        summary:
          payload?.text?.trim() ||
          `ZGPT-CLI fehlgeschlagen (HTTP ${response.status}). Unter Settings → API-Keys / Codex anmelden (einmalig).`,
      };
    }

    return {
      ok: payload.ok !== false,
      summary: payload.text.trim(),
      mode: payload.mode,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "ZGPT-CLI-Netzwerkfehler";
    return {
      ok: false,
      summary: `ZGPT-CLI: ${message}. Connect Desktop / Codex-Bridge prüfen — Terminal bleibt unsichtbar.`,
    };
  }
}
