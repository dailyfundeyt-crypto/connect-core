/**
 * Per-agent chat model preference.
 *
 * Model pools are locked when an agent is created (or when its family/CLI is
 * changed): Manus only sees Manus models, ChatGPT only OpenAI, Cursor a wide
 * Cursor catalog, and Connect agents get every option.
 */

import {
  type CliTarget,
  setAgentCliDefault,
} from "@/lib/agents/agent-cli";

export type AgentModelId =
  | "auto"
  | "agy-default"
  | "agy-pro"
  | "agy-fast";

export type AgentModelFamily =
  | "antigravity"
  | "connect";

export type AgentModelOption = {
  id: AgentModelId;
  label: string;
  provider: string;
};

export const AGENT_MODELS: AgentModelOption[] = [
  { id: "auto", label: "Auto", provider: "Connect" },
  { id: "agy-default", label: "Antigravity Default", provider: "Antigravity" },
  { id: "agy-pro", label: "Antigravity Pro", provider: "Antigravity" },
  { id: "agy-fast", label: "Antigravity Fast", provider: "Antigravity" },
];

/** Full catalog — Connect agents can pick any of these. */
export const CONNECT_MODEL_IDS: AgentModelId[] = AGENT_MODELS.map((m) => m.id);

export const MODEL_POOLS: Record<AgentModelFamily, AgentModelId[]> = {
  antigravity: ["auto", "agy-default", "agy-pro", "agy-fast"],
  connect: ["auto"],
};

export type ModelFamilyMeta = {
  id: AgentModelFamily;
  label: string;
  hint: string;
  /** Experimental — shown under Beta in create/settings. */
  beta?: boolean;
};

/**
 * Two production tiers + Beta:
 *   Model One  — Antigravity CLI (agy, lokal) | Manus API (cloud) | ZGPT Terminal
 *   Model Two  — Hermes (lokal)
 * Global Settings → Model Provider is the chat router (Plan 047).
 */
export const MODEL_FAMILIES: ModelFamilyMeta[] = [
  {
    id: "antigravity",
    label: "Model One · Antigravity",
    hint: "External · CLI — Browser-Use, Sandbox, Login via Google",
  },
  {
    id: "connect",
    label: "Model Two · Hermes",
    hint: "Local Provider — Connect-API / AG-UI",
  },
];

/** Stable production: Model One (Manus/ZGPT) + Model Two (Hermes). */
export const PRIMARY_MODEL_FAMILIES: ModelFamilyMeta[] = MODEL_FAMILIES.filter(
  (f) => !f.beta,
);

/** Experimental families. */
export const BETA_MODEL_FAMILIES: ModelFamilyMeta[] = MODEL_FAMILIES.filter(
  (f) => f.beta,
);

export function isBetaModelFamily(id: AgentModelFamily): boolean {
  return MODEL_FAMILIES.find((f) => f.id === id)?.beta === true;
}

const FAMILY_DEFAULT_MODEL: Record<AgentModelFamily, AgentModelId> = {
  antigravity: "agy-default",
  connect: "auto",
};

const FAMILY_TO_CLI: Partial<Record<AgentModelFamily, CliTarget>> = {
  antigravity: "antigravity",
};

const CLI_TO_FAMILY: Record<CliTarget, AgentModelFamily> = {
  antigravity: "antigravity",
};

const MODEL_KEY = "connect.agent-models";
const FAMILY_KEY = "connect.agent-model-families";

type ModelStore = Record<string, AgentModelId>;
type FamilyStore = Record<string, AgentModelFamily>;

function readModels(): ModelStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MODEL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ModelStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeModels(store: ModelStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MODEL_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event("connect-agent-models-changed"));
}

function readFamilies(): FamilyStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FAMILY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as FamilyStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeFamilies(store: FamilyStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FAMILY_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event("connect-agent-models-changed"));
}

function isModelId(value: string | undefined): value is AgentModelId {
  return AGENT_MODELS.some((m) => m.id === value);
}

function isFamily(value: string | undefined): value is AgentModelFamily {
  return MODEL_FAMILIES.some((f) => f.id === value);
}

/** Resolve family: explicit store → Connect (full catalog). */
export function getAgentModelFamily(agentId: string | undefined): AgentModelFamily {
  if (!agentId) return "connect";
  const saved = readFamilies()[agentId];
  if (isFamily(saved)) return saved;
  return "connect";
}

export function setAgentModelFamily(
  agentId: string,
  family: AgentModelFamily,
  options?: { syncCli?: boolean; resetModel?: boolean },
): AgentModelFamily {
  if (!agentId) return "connect";
  const store = readFamilies();
  store[agentId] = family;
  writeFamilies(store);

  if (options?.syncCli !== false) {
    const cli = FAMILY_TO_CLI[family];
    if (cli) setAgentCliDefault(agentId, cli);
  }

  if (options?.resetModel !== false) {
    const allowed = MODEL_POOLS[family];
    const current = readModels()[agentId];
    if (!current || !allowed.includes(current)) {
      setAgentModel(agentId, FAMILY_DEFAULT_MODEL[family]);
    }
  }

  return family;
}

/** Models this agent may pick in the composer. */
export function getAgentModelOptions(
  agentId: string | undefined,
): AgentModelOption[] {
  const family = getAgentModelFamily(agentId);
  const allowed = new Set(MODEL_POOLS[family]);
  return AGENT_MODELS.filter((m) => allowed.has(m.id));
}

export function getAgentModel(agentId: string | undefined): AgentModelId {
  if (!agentId) return "auto";
  const family = getAgentModelFamily(agentId);
  const allowed = MODEL_POOLS[family];
  const value = readModels()[agentId];
  if (isModelId(value) && allowed.includes(value)) return value;
  return FAMILY_DEFAULT_MODEL[family];
}

export function setAgentModel(
  agentId: string,
  modelId: AgentModelId,
): AgentModelId {
  if (!agentId) return "auto";
  const allowed = MODEL_POOLS[getAgentModelFamily(agentId)];
  const next = allowed.includes(modelId)
    ? modelId
    : FAMILY_DEFAULT_MODEL[getAgentModelFamily(agentId)];
  const store = readModels();
  store[agentId] = next;
  writeModels(store);
  return next;
}

/** Apply family + default model when an agent is first created. */
export function provisionAgentModels(
  agentId: string,
  family: AgentModelFamily,
): void {
  setAgentModelFamily(agentId, family, { syncCli: true, resetModel: true });
  setAgentModel(agentId, FAMILY_DEFAULT_MODEL[family]);
}

/** Keep family in sync when the CLI target tabs change. */
export function syncModelFamilyFromCli(
  agentId: string,
  target: CliTarget,
): void {
  setAgentModelFamily(agentId, CLI_TO_FAMILY[target], {
    syncCli: false,
    resetModel: true,
  });
}

export function subscribeAgentModels(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("connect-agent-models-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("connect-agent-models-changed", handler);
    window.removeEventListener("storage", handler);
  };
}

export function modelLabel(id: AgentModelId): string {
  return AGENT_MODELS.find((m) => m.id === id)?.label ?? "Auto";
}

export function familyLabel(id: AgentModelFamily): string {
  return MODEL_FAMILIES.find((f) => f.id === id)?.label ?? "Model Two · Hermes";
}
