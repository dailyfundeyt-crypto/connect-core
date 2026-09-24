/**
 * Global Model Provider — Plan 047 / CURSOR-PROMPT-model-one-two.
 *
 * Model Two = Hermes (local background)
 * Model One = External (invisible Terminal CLI or API-Key HTTP)
 *
 * Chat UI stays messenger-only; CLIs/sandboxes never show a TUI.
 */

export type ModelProviderKind = "hermes" | "external";
export type ExternalPath = "terminal" | "api_key";

export type ModelProviderPrefs = {
  /** Model Two = hermes, Model One = external */
  provider: ModelProviderKind;
  /** Only used when provider === "external" */
  externalPath: ExternalPath;
  /**
   * Which API flavor when externalPath === "api_key".
   * Manus features activate only when a Manus key is stored.
   */
  apiFlavor: "manus" | "openai" | "other";
  /**
   * Which terminal flavor when externalPath === "terminal".
   * Codex/ZGPT via cli-bridge; manus-cli reserved for future.
   */
  terminalFlavor: "codex" | "chatgpt" | "manus-cli";
};

const KEY = "connect.model-provider";
const EVENT = "connect-model-provider-changed";

const DEFAULTS: ModelProviderPrefs = {
  provider: "external",
  externalPath: "api_key",
  apiFlavor: "manus",
  terminalFlavor: "chatgpt",
};

function read(): ModelProviderPrefs {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ModelProviderPrefs>;
    return normalize(parsed);
  } catch {
    return { ...DEFAULTS };
  }
}

function write(prefs: ModelProviderPrefs) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event(EVENT));
}

function normalize(raw: Partial<ModelProviderPrefs> | undefined): ModelProviderPrefs {
  const provider: ModelProviderKind =
    raw?.provider === "hermes" || raw?.provider === "external"
      ? raw.provider
      : DEFAULTS.provider;
  const externalPath: ExternalPath =
    raw?.externalPath === "terminal" || raw?.externalPath === "api_key"
      ? raw.externalPath
      : DEFAULTS.externalPath;
  const apiFlavor =
    raw?.apiFlavor === "manus" ||
    raw?.apiFlavor === "openai" ||
    raw?.apiFlavor === "other"
      ? raw.apiFlavor
      : DEFAULTS.apiFlavor;
  const terminalFlavor =
    raw?.terminalFlavor === "codex" ||
    raw?.terminalFlavor === "chatgpt" ||
    raw?.terminalFlavor === "manus-cli"
      ? raw.terminalFlavor
      : DEFAULTS.terminalFlavor;
  return { provider, externalPath, apiFlavor, terminalFlavor };
}

export function getModelProviderPrefs(): ModelProviderPrefs {
  return read();
}

export function setModelProviderPrefs(
  patch: Partial<ModelProviderPrefs>,
): ModelProviderPrefs {
  const next = normalize({ ...read(), ...patch });
  write(next);
  return next;
}

export function subscribeModelProvider(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export const PROVIDER_LABELS: Record<ModelProviderKind, string> = {
  hermes: "Model Two · Hermes",
  external: "Model One · External",
};

export const PROVIDER_HINTS: Record<ModelProviderKind, string> = {
  hermes:
    "Local Provider — Connect/Hermes im Hintergrund. Chat + Upload, kein Agent-TUI.",
  external:
    "External Provider — Terminal (unsichtbar) oder API-Key. Voller Agent im Hintergrund.",
};

export const PATH_LABELS: Record<ExternalPath, string> = {
  terminal: "Terminal",
  api_key: "API-Key",
};

export const PATH_HINTS: Record<ExternalPath, string> = {
  terminal:
    "Unsichtbares CLI (Codex / ZGPT / browser-use). Nutzt Desktop\\Codex Sandboxen wenn vorhanden.",
  api_key:
    "HTTP-APIs. Manus-Features nur mit gesetztem Manus-API-Key (open.manus.ai).",
};

/** True when chat should leave Hermes/CopilotKit and use Model One. */
export function usesExternalModelProvider(): boolean {
  return getModelProviderPrefs().provider === "external";
}
