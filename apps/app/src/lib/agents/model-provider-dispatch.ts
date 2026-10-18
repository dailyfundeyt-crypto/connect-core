/**
 * Chat → background provider router (Plan 047 / CURSOR-PROMPT-model-one-two).
 * Messenger UI only — Terminal/API/Hermes never show an ops console.
 */

import { getAgentManusApiKey } from "@/lib/agents/agent-api-keys";
import { runManusApiTurn } from "@/lib/agents/manus-api";
import {
  getModelProviderPrefs,
  usesExternalModelProvider,
} from "@/lib/agents/model-provider";
import { runZgptCliTurn } from "@/lib/agents/zgpt-cli";
import { agentUsesExternalShell } from "@/lib/agents/agent-shell";
import { getAgentModelFamily } from "@/lib/agents/agent-models";

export type ModelTurnResult = {
  ok: boolean;
  summary: string;
  /** Caller should fall through to CopilotKit / Hermes. */
  useHermes?: boolean;
  needsDesktop?: boolean;
  openedUrl?: string;
};

/**
 * Route one composer turn from Settings → Model Provider.
 * Model Two always → Hermes. Model One → Terminal or API-Key.
 */
export async function dispatchModelTurn(input: {
  agentId: string;
  text: string;
  agentName?: string;
  fileHints?: string[];
}): Promise<ModelTurnResult> {
  const prefs = getModelProviderPrefs();

  // Hermes-Agent (Familie "connect"): immer Hermes/Connect-API, egal was global eingestellt ist.
  // Vorher landeten Hermes-Agenten bei globalem "Model One" im Codex-Terminal und waren nicht bedienbar.
  if (getAgentModelFamily(input.agentId) === "connect") {
    return { ok: true, useHermes: true, summary: "" };
  }

  // Model Two — Hermes (local background). Global setting wins over agent family.
  if (prefs.provider === "hermes") {
    return {
      ok: true,
      useHermes: true,
      summary: "",
    };
  }

  // Model One — External
  if (prefs.externalPath === "api_key") {
    if (prefs.apiFlavor === "manus") {
      return runManusApiPath(input);
    }
    // openai / other — OpenAI-compatible via cli-bridge (invisible)
    const result = await runZgptCliTurn({
      agentId: input.agentId,
      text: buildPrompt(input),
      agentName: input.agentName,
      fileHints: input.fileHints,
    });
    return { ok: result.ok, summary: result.summary };
  }

  // Terminal path — headless CLI (Codex Sandboxen / ZGPT / Manus-as-CLI)
  if (prefs.terminalFlavor === "manus-cli") {
    // Manus via terminal path still needs the API key (Cloud Manus, not a local agent).
    return runManusApiPath(input);
  }

  // Prefer Desktop Invoke-Codex when Connect Desktop exposes it; else cli-bridge.
  const headless = await tryHeadlessCodex(input);
  if (headless) return headless;

  const result = await runZgptCliTurn({
    agentId: input.agentId,
    text: buildPrompt(input),
    agentName: input.agentName,
    fileHints: input.fileHints,
  });
  return { ok: result.ok, summary: result.summary };
}

async function runManusApiPath(input: {
  agentId: string;
  text: string;
  fileHints?: string[];
}): Promise<ModelTurnResult> {
  const key = getAgentManusApiKey(input.agentId);
  if (!key) {
    // No Manus API key — silently fall through to the local headless CLI path
    // (Codex / Antigravity / Claude). The user did not opt into Manus Cloud;
    // we should not block their normal chat with a key-prompt error.
    const headless = await tryHeadlessCodex(input);
    if (headless) return headless;
    const result = await runZgptCliTurn({
      agentId: input.agentId,
      text: buildPrompt(input),
      agentName: input.agentName,
      fileHints: input.fileHints,
    });
    return { ok: result.ok, summary: result.summary };
  }
  const result = await runManusApiTurn({
    agentId: input.agentId,
    text: buildPrompt(input),
  });
  return {
    ok: result.ok,
    summary: result.summary,
    openedUrl: result.taskUrl,
  };
}

/** Ask Connect Desktop / server to run Invoke-Codex.ps1 headless (CreateNoWindow). */
async function tryHeadlessCodex(input: {
  agentId: string;
  text: string;
  fileHints?: string[];
}): Promise<ModelTurnResult | null> {
  try {
    const res = await fetch("/api/connect/model-chat", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "external",
        path: "terminal",
        text: buildPrompt(input),
        files: input.fileHints ?? [],
        agentId: input.agentId,
        flavor: getModelProviderPrefs().terminalFlavor,
      }),
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      text?: string;
      useCliBridge?: boolean;
      skipped?: boolean;
    } | null;
    // Server says fall through to client cli-bridge
    if (body?.useCliBridge || body?.skipped) return null;
    if (!res.ok || !body?.text) return null;
    return { ok: body.ok !== false, summary: body.text };
  } catch {
    return null;
  }
}

function buildPrompt(input: {
  text: string;
  fileHints?: string[];
}): string {
  const trimmed = input.text.trim();
  if (!input.fileHints?.length) return trimmed;
  return `${trimmed}\n\n[Dateien]\n${input.fileHints.map((f) => `- ${f}`).join("\n")}`;
}

/**
 * Web-Task-Heuristik (Stufe 2.1 / Option 3: Antigravity-Only).
 *
 * Wenn der Composer-Text nach Browser/Web klingt, soll die UI den User auf
 * Antigravity hinweisen: das ist der einzige lokale CLI mit eingebautem
 * Browser-Tool. Codex/Claude kämpfen auf Windows gegen die Sandbox (`Create-
 * ProcessWithLogonW 1385`) und brauchen einen Python-Sidecar, der nicht
 * zuverlässig startet.
 *
 * Die Liste ist absichtlich breit — ein false-positive (UI zeigt einen
 * Hinweis) ist harmlos, ein false-negative (User klickt sich durch die
 * Sandbox-Fehler) ist die Hölle.
 */
const WEB_TASK_KEYWORDS = [
  // Deutsch: Browser-Aktionen
  "öffne", "offne", "navigiere", "klicke", "screenshot", "lade",
  "besuche", "geh auf", "surfe", "screenshot", "browser",
  "webseite", "webseite", "web-search", "such im web", "im internet",
  "scrape", "formular", "einloggen", "anmeldung im browser",
  // Englisch
  "open url", "browse", "navigate to", "click on", "visit",
  "go to", "fetch url", "screenshot", "login to", "log in to",
  "sign in to", "scrape", "form submission", "web page",
  // Direkte URLs
  "http://", "https://",
];

export function looksLikeWebTask(text: string): boolean {
  const lower = text.toLowerCase();
  return WEB_TASK_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Sollte die UI für diesen Text einen Antigravity-Hinweis zeigen?
 *
 * Ja, wenn der User einen Web-Task gestellt hat UND der aktuelle Agent
 * NICHT auf Antigravity läuft. Codex/Claude bekommen dann den Tipp, dass
 * Antigravity die bessere Wahl wäre.
 */
export function shouldSuggestAntigravity(agentProvider: string | null | undefined, text: string): boolean {
  if (!looksLikeWebTask(text)) return false;
  return agentProvider !== "antigravity-cli";
}

/** Kurze Begründung für den UI-Hinweis. */
export const ANTIGRAVITY_WEB_HINT =
  "Für Web-Tasks (öffnen, klicken, Screenshots) ist Antigravity besser — der hat ein Browser-Tool eingebaut und kämpft nicht mit der Windows-Sandbox.";

/** Should this agent skip Hermes AG-UI for the current Model Provider? */
export function shouldUseModelRouter(agentId: string | undefined): boolean {
  if (!agentId) return false;
  // Hermes-Agenten gehen direkt an Hermes (CopilotKit), nie in den Model-One-Router.
  if (getAgentModelFamily(agentId) === "connect") return false;
  if (usesExternalModelProvider()) return true;
  // Model Two: always Hermes path (useHermes) — still enter router so we don't hit shells.
  return true;
}

/** Manus-only UI (Mail Manus, task.create) — only when key present + path allows. */
export function manusFeaturesEnabled(agentId?: string): boolean {
  const prefs = getModelProviderPrefs();
  if (prefs.provider !== "external") return false;
  // API-Key Manus, or Terminal Manus-CLI both need the key for cloud features.
  const wantsManus =
    (prefs.externalPath === "api_key" && prefs.apiFlavor === "manus") ||
    (prefs.externalPath === "terminal" && prefs.terminalFlavor === "manus-cli");
  if (!wantsManus) return false;
  if (agentId) return Boolean(getAgentManusApiKey(agentId));
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem("connect.global-api-keys");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { manus?: string };
    return Boolean(parsed.manus?.trim());
  } catch {
    return false;
  }
}

export function familyForModelProvider():
  | "connect"
  | "manus"
  | "chatgpt" {
  const prefs = getModelProviderPrefs();
  if (prefs.provider === "hermes") return "connect";
  if (
    (prefs.externalPath === "api_key" && prefs.apiFlavor === "manus") ||
    (prefs.externalPath === "terminal" && prefs.terminalFlavor === "manus-cli")
  ) {
    return "manus";
  }
  return "chatgpt";
}

export function describeActiveProvider(): string {
  const prefs = getModelProviderPrefs();
  if (prefs.provider === "hermes") return "Model Two · Hermes";
  if (prefs.externalPath === "api_key") {
    return prefs.apiFlavor === "manus"
      ? "Model One · API-Key (Manus)"
      : "Model One · API-Key";
  }
  return `Model One · Terminal (${prefs.terminalFlavor})`;
}

export function peekFamily(agentId: string) {
  return getAgentModelFamily(agentId);
}

/** @deprecated shells no longer override Model Two */
export function legacyShellWouldRun(agentId: string): boolean {
  return agentUsesExternalShell(agentId);
}
