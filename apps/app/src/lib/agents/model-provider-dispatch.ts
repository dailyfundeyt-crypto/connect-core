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
    return {
      ok: false,
      summary:
        "Kein Manus-API-Key. Unter Settings → Model Provider (API-Key) einen Manus-Key speichern. Ohne Key keine Manus-Cloud-Features (task.create / Mail Manus).",
    };
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

/** Should this agent skip Hermes AG-UI for the current Model Provider? */
export function shouldUseModelRouter(agentId: string | undefined): boolean {
  if (!agentId) return false;
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
