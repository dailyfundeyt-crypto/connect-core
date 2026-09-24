/**
 * Bot shells (Plan 044) — Manus / ZGPT / Claude / Grok are not Hermes API bots.
 *
 * Production: Hermes (Connect API) or Manus (Open API).
 * Manus is always cloud API — no local browser / mail as primary.
 * Beta shells (ZGPT, Claude, Grok) keep Lokal/Cloud residency.
 */

import type { AgentModelFamily } from "@/lib/agents/agent-models";
import { getAgentModelFamily } from "@/lib/agents/agent-models";

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
