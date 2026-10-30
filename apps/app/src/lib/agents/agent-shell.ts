/**
 * Bot shells (Plan 044) — Manus / ZGPT / Claude / Grok are not Hermes API bots.
 *
 * Production: Hermes (Connect API) or Manus (Open API).
 * Manus is always cloud API — no local browser / mail as primary.
 * Beta shells (ZGPT, Claude, Grok) keep Lokal/Cloud residency.
 */

import type { AgentModelFamily } from "@/lib/agents/agent-models";
import { getAgentModelFamily } from "@/lib/agents/agent-models";
import {
  CLI_TARGET_TO_T3_PROVIDER,
  getT3Flag,
  type T3ProviderId,
} from "@/lib/t3/contracts";

export type AgentResidency = "local" | "cloud";

export type AgentDelivery =
  | "hermes"
  | "manus-api"
  | "manus-browser"
  | "manus-mail"
  | "chatgpt-app"
  | "chatgpt-web"
  | "claude-web"
  | "claude-app"
  | "grok-app";

export type AgentShell = {
  residency: AgentResidency;
  delivery: AgentDelivery;
  /** Per-bot ZGPT / Codex sandbox profile id on this PC */
  zgptProfileId: string;
  /** Official web URL for browser shells (beta) */
  embedUrl: string;
};

const KEY = "connect.agent-shells";
const EVENT = "connect-agent-shells-changed";

/** Families that never call the Connect/Hermes AG-UI API. */
export const SHELL_FAMILIES: readonly AgentModelFamily[] = [
  "manus",
  "chatgpt",
  "claude",
  "grok",
] as const;

export const RESIDENCY_LABELS: Record<AgentResidency, string> = {
  local: "Lokal (PC)",
  cloud: "Cloud",
};

export const RESIDENCY_HINTS: Record<
  AgentModelFamily | "default",
  Record<AgentResidency, string>
> = {
  default: {
    local: "Desktop / Chrome-Profil auf diesem PC",
    cloud: "Remote ohne dauerhaftes Desktop",
  },
  antigravity: {
    local: "Antigravity CLI (agy) — lokaler Prozess & Browser Use",
    cloud: "Antigravity Cloud / Remote",
  },
  manus: {
    local: "Nicht genutzt — Manus läuft immer über die Open API",
    cloud: "Manus Open API — Chat in Connect, Ausführung bei Manus",
  },
  chatgpt: {
    local:
      "Unsichtbares ZGPT/Codex-CLI (Profil pro Bot) — Browser Use & Sandbox im Hintergrund",
    cloud: "ChatGPT-Webprofil — nur Fallback; Primary ist Terminal-Pfad",
  },
  claude: {
    local: "Claude-Desktop / lokales Profil — Text wird injiziert",
    cloud: "Claude.ai im Browser-Profil",
  },
  grok: {
    local: "Grok-App / lokale Instanz — Text wird injiziert",
    cloud: "Grok im Browser",
  },
  cloud: {
    local: "Nicht genutzt — Cloud-Agents laufen beim Anbieter",
    cloud: "Muse-Inbox, Grok Bot per Webhook oder OpenAI-kompatible API",
  },
  connect: {
    local: "Hermes / Connect-API",
    cloud: "Hermes / Connect-API",
  },
  cursor: {
    local: "Cursor / Connect-API",
    cloud: "Cursor / Connect-API",
  },
  lovable: {
    local: "Lovable",
    cloud: "Lovable",
  },
  qwen: {
    local: "Qwen Cloud-Computer",
    cloud: "Qwen Cloud-Computer",
  },
};

const DEFAULT_EMBED: Partial<Record<AgentModelFamily, string>> = {
  manus: "https://manus.im",
  chatgpt: "https://chatgpt.com",
  claude: "https://claude.ai",
  grok: "https://grok.x.ai",
};

type Store = Record<string, AgentShell>;

function readStore(): Store {
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

function writeStore(store: Store) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(EVENT));
}

function deliveryFor(
  family: AgentModelFamily,
  residency: AgentResidency,
): AgentDelivery {
  if (family === "manus") {
    // Production Manus is always Open API (ignore legacy browser/mail).
    return "manus-api";
  }
  if (family === "chatgpt") {
    return residency === "cloud" ? "chatgpt-web" : "chatgpt-app";
  }
  if (family === "claude") {
    return residency === "cloud" ? "claude-web" : "claude-app";
  }
  if (family === "grok") return "grok-app";
  return "hermes";
}

function defaultsFor(
  agentId: string,
  family: AgentModelFamily,
  residency: AgentResidency = family === "manus" ? "cloud" : "local",
): AgentShell {
  const resolved: AgentResidency = family === "manus" ? "cloud" : residency;
  return {
    residency: resolved,
    delivery: deliveryFor(family, resolved),
    zgptProfileId: agentId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "bot",
    embedUrl: DEFAULT_EMBED[family] ?? "",
  };
}

export function isShellFamily(
  family: AgentModelFamily | undefined,
): boolean {
  return Boolean(family && SHELL_FAMILIES.includes(family));
}

/** True when this bot must not call copilotkit.runAgent / Hermes. */
export function agentUsesExternalShell(agentId: string | undefined): boolean {
  if (!agentId) return false;
  return isShellFamily(getAgentModelFamily(agentId));
}

/* ---------------------------------------------------------------------------------------- *
 * T3-Laufweg (A38)
 * ---------------------------------------------------------------------------------------- */

/**
 * Die Felder, aus denen sich das CLI-Ziel eines Agenten ergibt.
 *
 * `engine.kind` hat Vorrang vor `chosenCli` — dieselbe Regel wie in `agent-cli-turn.ts`, weil es
 * dieselbe Frage beantwortet: Welche CLI fährt dieser Bot?
 */
export type AgentEngineSource = {
  engine?: { kind?: string; model?: string; allowWrite?: boolean } | null;
  chosenCli?: string | null;
} | null
  | undefined;

/**
 * Die Engine-Kinds, die eine echte CLI sind.
 *
 * `browser_profile`, `browser_use` und `manus` sind keine CLI-Prozesse — für sie gibt es weder
 * einen T3-Treiber noch einen lokalen Prozess.
 */
const ENGINE_KIND_TO_CLI: Record<string, string> = {
  antigravity: "antigravity",
  chatgpt: "chatgpt",
  claude: "claude",
  codex: "codex",
  cursor: "cursor",
  freebuff: "freebuff",
  grok: "grok",
};

/**
 * Das CLI-Ziel dieses Agenten — als Ziel-Id, wie sie die Kataloge kennen.
 *
 * `null`, wenn der Agent keine CLI fährt (Browser-Profil, Manus, unbekannte Engine).
 */
export function resolveAgentCliTarget(
  source: AgentEngineSource,
): string | null {
  const kind = source?.engine?.kind?.trim().toLowerCase();
  if (kind && ENGINE_KIND_TO_CLI[kind]) return ENGINE_KIND_TO_CLI[kind];
  const chosen = source?.chosenCli?.trim().toLowerCase();
  if (chosen && CLI_TARGET_TO_T3_PROVIDER[chosen]) return chosen;
  return null;
}

/**
 * Der T3-Treiber dieses Agenten — oder `null`, wenn er über die alte Engine läuft.
 *
 * `manus` und `lovable` haben keinen T3-Treiber (Vertrag A01: `"legacy"`). Sie bleiben deshalb
 * auf dem alten Weg; genau das ist der Punkt des Tauschs.
 */
export function resolveAgentT3Provider(
  source: AgentEngineSource,
): T3ProviderId | null {
  const target = resolveAgentCliTarget(source);
  if (!target) return null;
  const provider = CLI_TARGET_TO_T3_PROVIDER[target];
  if (!provider || provider === "legacy") return null;
  return provider;
}

/**
 * Ob die T3-Brücke im Browser überhaupt freigeschaltet ist.
 *
 * `bridge` schaltet die Brücke als Ganzes frei, `cliSwap` den Tausch der CLI-Auswahl. Beide
 * schalten dasselbe Routing frei; per A01 sind beide standardmäßig AUS, also bleibt alles beim
 * alten. Für den Chat (A22) zählt die Brücke, für die Auswahl der Tausch — deshalb diese eine
 * Frage an zwei Orten.
 */
export function isT3RuntimeEnabled(): boolean {
  return getT3Flag("bridge") || getT3Flag("cliSwap");
}

/**
 * Ob dieser Agent über die T3-Engine läuft.
 *
 * NUR hinter dem Flag. `bridge` schaltet die Brücke als Ganzes frei, `cliSwap` den Tausch der
 * CLI-Auswahl — beide schalten dasselbe Routing frei, und beide sind per A01 standardmäßig AUS.
 */
export function agentUsesT3Engine(source: AgentEngineSource): boolean {
  if (!isT3RuntimeEnabled()) return false;
  return resolveAgentT3Provider(source) !== null;
}

/**
 * Der Laufweg dieses Agenten — dieselbe Frage, die die Route `/$agentId` stellt.
 *
 * `cloud` gewinnt immer: ein Cloud-Agent (Muse) läuft beim Anbieter, nicht über eine CLI, und
 * darf nie still über eine CLI antworten. Danach `t3` — entweder weil der Server es so meldet
 * (A37) oder weil der Agent eine Engine mit T3-Treiber hat und der Tausch eingeschaltet ist.
 * Alles andere ist `cli` und bleibt unangetastet.
 */
export function resolveAgentRuntimeKind(input: {
  /** Was der Server meldet: `"cli"`, `"cloud"` oder `"t3"`. */
  serverRuntime?: string | null;
  /** Das Profil des Agenten (Engine, gewählte CLI). */
  profile?: AgentEngineSource;
}): "cli" | "cloud" | "t3" {
  const server = input.serverRuntime?.trim().toLowerCase();
  if (server === "cloud") return "cloud";
  /*
   * `t3` gibt es nur, wenn die Brücke freigeschaltet ist.
   *
   * Der Server darf sie melden, solange der Schalter aus ist — der Client schaltet dann trotzdem
   * nicht um, sonst gäbe es zwei Wege in denselben Zustand und der alte Chat wäre nicht mehr
   * reproduzierbar. Der Chat (A22) braucht die Brücke ohnehin: `T3AgentChat` zeigt ohne sie nur
   * seinen „deaktiviert"-Hinweis.
   */
  if (server === "t3") return getT3Flag("bridge") ? "t3" : "cli";
  if (getT3Flag("bridge") && agentUsesT3Engine(input.profile)) return "t3";
  return "cli";
}

export function getAgentShell(agentId: string): AgentShell {
  const family = getAgentModelFamily(agentId);
  const saved = readStore()[agentId];
  if (!saved) return defaultsFor(agentId, family);
  const residency: AgentResidency =
    family === "manus"
      ? "cloud"
      : saved.residency === "cloud"
        ? "cloud"
        : "local";
  return {
    ...defaultsFor(agentId, family, residency),
    ...saved,
    residency,
    delivery: deliveryFor(family, residency),
    zgptProfileId:
      typeof saved.zgptProfileId === "string" && saved.zgptProfileId.trim()
        ? saved.zgptProfileId.trim()
        : defaultsFor(agentId, family).zgptProfileId,
    embedUrl:
      typeof saved.embedUrl === "string" && saved.embedUrl.trim()
        ? saved.embedUrl.trim()
        : (DEFAULT_EMBED[family] ?? ""),
  };
}

export function setAgentShell(
  agentId: string,
  patch: Partial<AgentShell>,
): AgentShell {
  const family = getAgentModelFamily(agentId);
  const current = getAgentShell(agentId);
  let residency: AgentResidency =
    patch.residency === "cloud" || patch.residency === "local"
      ? patch.residency
      : current.residency;
  if (family === "manus") residency = "cloud";
  const next: AgentShell = {
    ...current,
    ...patch,
    residency,
    delivery: deliveryFor(family, residency),
    zgptProfileId:
      typeof patch.zgptProfileId === "string"
        ? patch.zgptProfileId.trim() || current.zgptProfileId
        : current.zgptProfileId,
    embedUrl:
      typeof patch.embedUrl === "string"
        ? patch.embedUrl.trim() || current.embedUrl
        : current.embedUrl,
  };
  const store = readStore();
  store[agentId] = next;
  writeStore(store);
  return next;
}

/** After create / family change — lock shell defaults for this family. */
export function provisionAgentShell(
  agentId: string,
  family: AgentModelFamily,
  residency: AgentResidency = family === "manus" ? "cloud" : "local",
): AgentShell {
  const next = defaultsFor(agentId, family, residency);
  const store = readStore();
  store[agentId] = next;
  writeStore(store);
  return next;
}

export function subscribeAgentShells(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function familyBrandLabel(family: AgentModelFamily): string {
  switch (family) {
    case "manus":
      return "Manus";
    case "chatgpt":
      return "ZGPT";
    case "claude":
      return "Claude";
    case "grok":
      return "Grok";
    case "cursor":
      return "Cursor";
    case "lovable":
      return "Lovable";
    case "qwen":
      return "Qwen";
    default:
      return "Hermes";
  }
}

export function familyBrandTone(family: AgentModelFamily): string {
  switch (family) {
    case "manus":
      return "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30";
    case "chatgpt":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "claude":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30";
    case "grok":
      return "bg-zinc-500/15 text-zinc-800 dark:text-zinc-200 border-zinc-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
