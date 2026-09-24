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
  | "gpt-5"
  | "gpt-5-mini"
  | "gpt-4.1"
  | "o3"
  | "o4-mini"
  | "claude-sonnet"
  | "claude-opus"
  | "claude-haiku"
  | "grok"
  | "grok-2"
  | "gemini"
  | "gemini-2.5-pro"
  | "cursor-composer"
  | "cursor-fast"
  | "cursor-thinking"
  | "manus"
  | "manus-1.5"
  | "lovable"
  | "lovable-fast"
  | "qwen"
  | "qwen-plus"
  | "qwen-max";

export type AgentModelFamily =
  | "connect"
  | "manus"
  | "chatgpt"
  | "claude"
  | "grok"
  | "cursor"
  | "lovable"
  | "qwen";

export type AgentModelOption = {
  id: AgentModelId;
  label: string;
  provider: string;
};

export const AGENT_MODELS: AgentModelOption[] = [
  { id: "auto", label: "Auto", provider: "Connect" },
  { id: "gpt-5", label: "GPT-5", provider: "ChatGPT" },
  { id: "gpt-5-mini", label: "GPT-5 Mini", provider: "ChatGPT" },
  { id: "gpt-4.1", label: "GPT-4.1", provider: "ChatGPT" },
  { id: "o3", label: "o3", provider: "ChatGPT" },
  { id: "o4-mini", label: "o4-mini", provider: "ChatGPT" },
  { id: "claude-sonnet", label: "Sonnet 4", provider: "Claude" },
  { id: "claude-opus", label: "Opus 4", provider: "Claude" },
  { id: "claude-haiku", label: "Haiku", provider: "Claude" },
  { id: "grok", label: "Grok 3", provider: "xAI" },
  { id: "grok-2", label: "Grok 2", provider: "xAI" },
  { id: "gemini", label: "Gemini", provider: "Google" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google" },
  { id: "cursor-composer", label: "Composer", provider: "Cursor" },
  { id: "cursor-fast", label: "Cursor Fast", provider: "Cursor" },
  { id: "cursor-thinking", label: "Cursor Thinking", provider: "Cursor" },
  { id: "manus", label: "Manus", provider: "Manus" },
  { id: "manus-1.5", label: "Manus 1.5", provider: "Manus" },
  { id: "lovable", label: "Lovable", provider: "Lovable" },
  { id: "lovable-fast", label: "Lovable Fast", provider: "Lovable" },
  { id: "qwen", label: "Qwen", provider: "Alibaba" },
  { id: "qwen-plus", label: "Qwen Plus", provider: "Alibaba" },
  { id: "qwen-max", label: "Qwen Max", provider: "Alibaba" },
];

/** Full catalog — Connect agents can pick any of these. */
export const CONNECT_MODEL_IDS: AgentModelId[] = AGENT_MODELS.map((m) => m.id);

export const MODEL_POOLS: Record<AgentModelFamily, AgentModelId[]> = {
  connect: CONNECT_MODEL_IDS,
  manus: ["auto", "manus", "manus-1.5"],
  chatgpt: ["auto", "gpt-5", "gpt-5-mini", "gpt-4.1", "o3", "o4-mini"],
  claude: ["auto", "claude-sonnet", "claude-opus", "claude-haiku"],
  grok: ["auto", "grok", "grok-2"],
  cursor: [
    "auto",
    "cursor-composer",
    "cursor-fast",
    "cursor-thinking",
    "gpt-5",
    "claude-sonnet",
    "claude-opus",
    "gemini-2.5-pro",
  ],
  lovable: ["auto", "lovable", "lovable-fast"],
  qwen: ["auto", "qwen", "qwen-plus", "qwen-max"],
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
 *   Model One  — external (Manus API / ZGPT Terminal)
 *   Model Two  — Hermes (local Connect API)
 * Global Settings → Model Provider is the chat router (Plan 047).
 */
export const MODEL_FAMILIES: ModelFamilyMeta[] = [
  {
    id: "manus",
    label: "Model One · Manus",
    hint: "External · API-Key — Manus Open API (mehr Features mit Key)",
  },
  {
    id: "chatgpt",
    label: "Model One · ZGPT",
    hint: "External · unsichtbares Terminal (CLI) — Browser Use & Sandbox",
  },
  {
    id: "connect",
    label: "Model Two · Hermes",
    hint: "Local Provider — Connect-API / AG-UI",
  },
  {
    id: "claude",
    label: "Claude",
    hint: "Beta — Anthropic",
    beta: true,
  },
  {
    id: "grok",
    label: "Grok",
    hint: "Beta — xAI",
    beta: true,
  },
  {
    id: "cursor",
    label: "Cursor",
    hint: "Beta — Cursor Composer / Routing",
    beta: true,
  },
  {
    id: "lovable",
    label: "Lovable",
    hint: "Beta — Lovable",
    beta: true,
  },
  {
    id: "qwen",
    label: "Qwen",
    hint: "Beta — Cloud-Computer Runtime",
    beta: true,
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
  connect: "auto",
  manus: "manus",
  chatgpt: "gpt-5",
  claude: "claude-sonnet",
  grok: "grok",
  cursor: "cursor-composer",
  lovable: "lovable",
  qwen: "qwen",
};

const FAMILY_TO_CLI: Partial<Record<AgentModelFamily, CliTarget>> = {
  manus: "manus",
  chatgpt: "chatgpt",
  claude: "claude",
  grok: "grok",
  cursor: "cursor",
  lovable: "lovable",
};

const CLI_TO_FAMILY: Record<CliTarget, AgentModelFamily> = {
  manus: "manus",
  codex: "chatgpt",
  chatgpt: "chatgpt",
  claude: "claude",
  grok: "grok",
  cursor: "cursor",
  lovable: "lovable",
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
