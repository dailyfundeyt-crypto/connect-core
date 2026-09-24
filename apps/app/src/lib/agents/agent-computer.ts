/**
 * Per-agent computer runtime — quieter Chrome profile by default,
 * full sandbox only when needed. See Plan/043, Plan/049, Plan/052.
 *
 * Always available:
 * Chrome-Profil | PC (Ubuntu-Docker) | Manus Cloud | Default / Azure / Oracle Cloud | Smartphone
 *
 * Default Cloud, Azure Cloud, and Oracle Cloud are one Anchor remote-box
 * (no third control plane, no Oracle account). Oracle = boxSize large (~24 GB).
 * Manus Cloud = Open API + Voll-Chrome Lab on task_url (kein Anchor-CDP).
 * Smartphone = real Android via ADB + scrcpy.
 */

export type AgentComputerRuntime =
  | "chrome"
  | "local"
  | "manus"
  | "cloud"
  | "phone";

/** Capacity hint when runtime is a sandbox (local or Anchor cloud). */
export type AgentBoxSize = "small" | "medium" | "large";

/**
 * Label on the Anchor remote-box. Same `/api/anchor/sessions` path.
 * `oracle` forces the ~24 GB tier (`boxSize: large`).
 */
export type AnchorCloudTarget = "default" | "azure" | "oracle";

export type AgentComputerPrefs = {
  runtime: AgentComputerRuntime;
  boxSize: AgentBoxSize;
  /** Watch pane follows this runtime (observe without taking the wheel). */
  watch: boolean;
  /** Which Anchor label when runtime is "cloud". Unset + large → oracle; else Azure. */
  cloudTarget?: AnchorCloudTarget;
};

/** Values in the Cloud · Smartphone picker. */
export type SandboxPickerValue =
  | "default-cloud"
  | "azure-cloud"
  | "oracle-cloud"
  | "manus"
  | "local"
  | "phone"
  | "chrome";

const KEY = "connect.agent.computer";
const LEGACY_MODE_KEY = "connect.agent-browser-mode";
const EVENT = "connect-agent-computer-changed";

type Store = Record<string, AgentComputerPrefs>;

const DEFAULTS: AgentComputerPrefs = {
  runtime: "chrome",
  boxSize: "small",
  watch: true,
};

export const RUNTIME_LABELS: Record<AgentComputerRuntime, string> = {
  chrome: "Chrome Browser",
  local: "PC (Ubuntu-Docker)",
  manus: "Manus Cloud",
  cloud: "Azure Cloud",
  phone: "Smartphone",
};

export const RUNTIME_HINTS: Record<AgentComputerRuntime, string> = {
  chrome: "Host-Chrome · eigenes Profil",
  local: "Ubuntu-Docker auf dem PC",
  manus: "Manus · task_url Lab",
  cloud: "Ganzer PC · Anchor",
  phone: "Android · ADB + scrcpy",
};

export const ANCHOR_CLOUD_LABELS: Record<AnchorCloudTarget, string> = {
  default: "Default Cloud",
  azure: "Azure Cloud",
  oracle: "Oracle Cloud",
};

/** Same hint style as the other missing-key rows. Option stays visible. */
export const ANCHOR_CLOUD_KEY_HINT =
  "Noch kein Anchor-Key — unter Agent → API-Keys hinterlegen.";

export const MANUS_CLOUD_KEY_HINT =
  "Noch kein Manus-Key — unter Agent → API-Keys hinterlegen.";

/** Oracle tier on the Anchor remote-box. Not a separate Oracle API. */
export const ORACLE_CLOUD_GIB = 24;

/** Caller wording for cloud picker copy. */
export const CLOUD_SANDBOX_COPY =
  "Bevorzugte Sandbox ist Manus, aber Azure hat mehr Features — nicht nur Chrome-Sandbox, sondern ein ganzer PC.";

export const BOX_LABELS: Record<AgentBoxSize, string> = {
  small: "Klein (~2–4 GB)",
  medium: "Mittel (~8 GB)",
  large: `Groß / Oracle (~${ORACLE_CLOUD_GIB} GB)`,
};

/** Always listed. `needs` only greys the row when that key is missing. */
export const SANDBOX_PICKER_OPTIONS: readonly {
  value: SandboxPickerValue;
  label: string;
  needs: "anchor" | "manus" | null;
}[] = [
  { value: "default-cloud", label: ANCHOR_CLOUD_LABELS.default, needs: "anchor" },
  { value: "azure-cloud", label: ANCHOR_CLOUD_LABELS.azure, needs: "anchor" },
  { value: "oracle-cloud", label: ANCHOR_CLOUD_LABELS.oracle, needs: "anchor" },
  { value: "manus", label: RUNTIME_LABELS.manus, needs: "manus" },
  { value: "local", label: RUNTIME_LABELS.local, needs: null },
  { value: "phone", label: RUNTIME_LABELS.phone, needs: null },
  { value: "chrome", label: RUNTIME_LABELS.chrome, needs: null },
];

export function boxSizeForAnchorTarget(
  target: AnchorCloudTarget,
): AgentBoxSize {
  if (target === "oracle") return "large";
  if (target === "default") return "small";
  return "medium";
}

/**
 * Anchor label for a cloud runtime.
 * Explicit target wins. A stored large box with no target is the old Oracle tier.
 * Anything else on the Anchor path stays Azure (Plan 049).
 */
export function anchorTargetForPrefs(
  prefs: Pick<AgentComputerPrefs, "boxSize" | "cloudTarget">,
): AnchorCloudTarget {
  if (
    prefs.cloudTarget === "default" ||
    prefs.cloudTarget === "azure" ||
    prefs.cloudTarget === "oracle"
  ) {
    return prefs.cloudTarget;
  }
  return prefs.boxSize === "large" ? "oracle" : "azure";
}

export function computerDisplayLabel(
  prefs: Pick<AgentComputerPrefs, "runtime" | "boxSize" | "cloudTarget">,
): string {
  if (prefs.runtime === "cloud") {
    return ANCHOR_CLOUD_LABELS[anchorTargetForPrefs(prefs)];
  }
  return RUNTIME_LABELS[prefs.runtime];
}

export function pickerValueForPrefs(
  prefs: Pick<AgentComputerPrefs, "runtime" | "boxSize" | "cloudTarget">,
): SandboxPickerValue {
  if (prefs.runtime === "manus") return "manus";
  if (prefs.runtime === "local") return "local";
  if (prefs.runtime === "phone") return "phone";
  if (prefs.runtime === "chrome") return "chrome";
  const target = anchorTargetForPrefs(prefs);
  if (target === "default") return "default-cloud";
  if (target === "oracle") return "oracle-cloud";
  return "azure-cloud";
}

export function prefsPatchForPicker(
  value: SandboxPickerValue,
): Partial<AgentComputerPrefs> {
  switch (value) {
    case "default-cloud":
      return { runtime: "cloud", cloudTarget: "default", boxSize: "small" };
    case "azure-cloud":
      return { runtime: "cloud", cloudTarget: "azure", boxSize: "medium" };
    case "oracle-cloud":
      return { runtime: "cloud", cloudTarget: "oracle", boxSize: "large" };
    case "manus":
      return { runtime: "manus" };
    case "local":
      return { runtime: "local" };
    case "phone":
      return { runtime: "phone" };
    case "chrome":
      return { runtime: "chrome" };
  }
}

/** Body for the existing Anchor session create. Oracle is `boxSize: large`. */
export function anchorSessionBody(
  prefs: Pick<AgentComputerPrefs, "boxSize" | "cloudTarget">,
): { session: { initial_url: string }; boxSize: AgentBoxSize } {
  const target = anchorTargetForPrefs(prefs);
  return {
    session: { initial_url: "about:blank" },
    boxSize: boxSizeForAnchorTarget(target),
  };
}

export function anchorStartMessage(target: AnchorCloudTarget): string {
  if (target === "oracle") {
    return `Oracle Cloud startet (~${ORACLE_CLOUD_GIB} GB)…`;
  }
  if (target === "default") return "Default Cloud startet (Anchor Remote-Box)…";
  return "Azure Cloud startet über Anchor…";
}

export function anchorRunningMessage(target: AnchorCloudTarget): string {
  if (target === "oracle") {
    return `Oracle Cloud läuft (~${ORACLE_CLOUD_GIB} GB, Anchor Remote-Box).`;
  }
  if (target === "default") return "Default Cloud läuft (Anchor Remote-Box).";
  return "Azure Cloud läuft (Anchor).";
}

/** Box sizes offered for a runtime. Oracle (~24 GB) is the Anchor large tier. */
export function boxSizesForRuntime(
  runtime: AgentComputerRuntime,
): readonly AgentBoxSize[] {
  if (runtime === "cloud") return ["small", "medium", "large"];
  if (runtime === "local") return ["small", "medium"];
  return [];
}

export function coerceBoxSizeForRuntime(
  runtime: AgentComputerRuntime,
  boxSize: AgentBoxSize,
): AgentBoxSize {
  const allowed = boxSizesForRuntime(runtime);
  if (allowed.length === 0) return "small";
  if (allowed.includes(boxSize)) return boxSize;
  return allowed[allowed.length - 1] ?? "small";
}

function readAll(): Store {
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

function writeAll(map: Store) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(EVENT));
  try {
    const legacyRaw = window.localStorage.getItem(LEGACY_MODE_KEY);
    const legacy = legacyRaw
      ? (JSON.parse(legacyRaw) as Record<string, string>)
      : {};
    for (const [id, prefs] of Object.entries(map)) {
      if (prefs.runtime === "local" || prefs.runtime === "cloud") {
        legacy[id] = prefs.runtime;
      } else {
        delete legacy[id];
      }
    }
    window.localStorage.setItem(LEGACY_MODE_KEY, JSON.stringify(legacy));
    window.dispatchEvent(new Event("connect-agent-browser-changed"));
  } catch {
    /* ignore */
  }
}

function readLegacyRuntime(agentId: string): AgentComputerRuntime | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_MODE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    const v = parsed[agentId];
    if (v === "local" || v === "cloud" || v === "manus") return v;
  } catch {
    /* ignore */
  }
  return null;
}

function isRuntime(v: unknown): v is AgentComputerRuntime {
  return (
    v === "local" ||
    v === "cloud" ||
    v === "chrome" ||
    v === "phone" ||
    v === "manus"
  );
}

function isAnchorTarget(v: unknown): v is AnchorCloudTarget {
  return v === "default" || v === "azure" || v === "oracle";
}

function normalize(
  raw: Partial<AgentComputerPrefs> | undefined,
): AgentComputerPrefs {
  const runtime = isRuntime(raw?.runtime) ? raw.runtime : DEFAULTS.runtime;
  const requested: AgentBoxSize =
    raw?.boxSize === "medium" ||
    raw?.boxSize === "large" ||
    raw?.boxSize === "small"
      ? raw.boxSize
      : DEFAULTS.boxSize;
  const cloudTarget = isAnchorTarget(raw?.cloudTarget)
    ? raw.cloudTarget
    : undefined;
  return {
    runtime,
    boxSize: coerceBoxSizeForRuntime(runtime, requested),
    watch: typeof raw?.watch === "boolean" ? raw.watch : DEFAULTS.watch,
    ...(cloudTarget ? { cloudTarget } : {}),
  };
}

export function getAgentComputerPrefs(agentId: string): AgentComputerPrefs {
  const stored = readAll()[agentId];
  if (stored) return normalize(stored);
  const legacy = readLegacyRuntime(agentId);
  if (legacy) return normalize({ runtime: legacy });
  return { ...DEFAULTS };
}

export function setAgentComputerPrefs(
  agentId: string,
  patch: Partial<AgentComputerPrefs>,
): AgentComputerPrefs {
  const current = getAgentComputerPrefs(agentId);
  let runtime = patch.runtime ?? current.runtime;
  let boxSize = patch.boxSize ?? current.boxSize;
  let cloudTarget = patch.cloudTarget ?? current.cloudTarget;
  const leavesAnchor =
    patch.runtime === "local" ||
    patch.runtime === "chrome" ||
    patch.runtime === "phone" ||
    patch.runtime === "manus";
  // Large / Oracle stays on the Anchor remote-box (not local Docker or Manus).
  if (!leavesAnchor && (patch.cloudTarget === "oracle" || patch.boxSize === "large")) {
    runtime = "cloud";
    boxSize = "large";
    cloudTarget = "oracle";
  } else if (patch.cloudTarget === "default") {
    runtime = "cloud";
    boxSize = "small";
    cloudTarget = "default";
  } else if (patch.cloudTarget === "azure") {
    runtime = "cloud";
    boxSize =
      patch.boxSize === "small" || patch.boxSize === "medium"
        ? patch.boxSize
        : "medium";
    cloudTarget = "azure";
  } else if (
    runtime === "cloud" &&
    patch.cloudTarget === undefined &&
    (patch.boxSize === "small" || patch.boxSize === "medium")
  ) {
    cloudTarget = patch.boxSize === "small" ? "default" : "azure";
  }
  const next = normalize({
    ...current,
    ...patch,
    runtime,
    boxSize,
    cloudTarget,
  });
  const all = readAll();
  all[agentId] = next;
  writeAll(all);
  return next;
}

export function subscribeAgentComputer(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  window.addEventListener("connect-agent-browser-changed", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
    window.removeEventListener("connect-agent-browser-changed", handler);
  };
}

/** Relative profile segment for host Chrome --user-data-dir. */
export function agentChromeProfileSegment(agentId: string): string {
  const safe = agentId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "agent";
  return `agents/${safe}`;
}

/**
 * Dedicated Manus browser profile per bot — never shared with the general
 * Chrome profile or other bots (one Manus login per email).
 */
export function agentManusChromeProfileSegment(agentId: string): string {
  return `${agentChromeProfileSegment(agentId)}/manus`;
}

/** Preferred cloud runtime when picking between Manus and Azure. */
export function preferredCloudRuntime(hasManusKey: boolean): "manus" | "cloud" {
  return hasManusKey ? "manus" : "cloud";
}
