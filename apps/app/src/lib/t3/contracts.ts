/**
 * T3-Bridge — gemeinsame Verträge (Frontend-Seite).
 *
 * EIGENTÜMER: A01. Alle anderen Agenten (A21–A40) lesen diese Datei, ändern sie aber NICHT.
 *
 * Diese Datei ist bewusst eigenständig (kein Import aus `apps/server/src/`): die App
 * hat keinen Pfad-Alias auf den Server. Sie spiegelt die Server-Verträge aus
 * `apps/server/src/t3-bridge/contracts.ts` und ist die einzige Quelle für Typen,
 * die im Browser landen.
 *
 * Wichtig: Hier stehen KEINE Geheimnisse. Bridge-Token, API-Keys und CLI-Credentials
 * bleiben serverseitig (A10).
 */

/* ---------------------------------------------------------------------------------------- *
 * Feature-Flags
 * ---------------------------------------------------------------------------------------- */

export const T3_FEATURE_FLAGS = {
  bridge: false,
  cliSwap: false,
  hideAgentsMode: false,
  contextRotation: false,
  cuaMachines: false,
  companyPublicUsage: false,
  mascot: false,
} as const;

export type T3FeatureFlagName = keyof typeof T3_FEATURE_FLAGS;

/**
 * Liest ein T3-Flag im Browser.
 *
 * Der Server liefert den Stand per `GET /api/t3/flags`. `loadRuntimeFlags()`
 * schreibt die Antwort nach `window.__CONNECT_FLAGS_T3`, bevor React das
 * erste Mal zeichnet. Bis dahin (und wenn der Server nicht erreichbar ist)
 * gelten die kompilierten Defaults — alles aus, altes Verhalten.
 */
export function getT3Flag(name: T3FeatureFlagName): boolean {
  if (typeof window === "undefined") return T3_FEATURE_FLAGS[name];
  const runtimeFlags = (window as typeof window & {
    __CONNECT_FLAGS_T3?: Partial<Record<T3FeatureFlagName, unknown>>;
  }).__CONNECT_FLAGS_T3;
  const value = runtimeFlags?.[name];
  if (typeof value === "boolean") return value;
  return T3_FEATURE_FLAGS[name];
}

/* ---------------------------------------------------------------------------------------- *
 * Laufzeit und Provider
 * ---------------------------------------------------------------------------------------- */

export type AgentRuntime = "cli" | "cloud" | "t3";

export const AGENT_RUNTIMES: readonly AgentRuntime[] = ["cli", "cloud", "t3"];

export function isAgentRuntime(value: unknown): value is AgentRuntime {
  return (
    typeof value === "string" &&
    (AGENT_RUNTIMES as readonly string[]).includes(value)
  );
}

export type T3ProviderId =
  | "codex"
  | "claudeAgent"
  | "cursor"
  | "grok"
  | "hermes"
  | "freebuff"
  | "opencode"
  | "antigravity"
  | "pi"
  | "muse"
  | "acpRegistry";

export const T3_PROVIDER_IDS: readonly T3ProviderId[] = [
  "codex",
  "claudeAgent",
  "cursor",
  "grok",
  "hermes",
  "freebuff",
  "opencode",
  "antigravity",
  "pi",
  "muse",
  "acpRegistry",
];

export const T3_PROVIDER_LABELS: Record<T3ProviderId, string> = {
  codex: "Codex",
  claudeAgent: "Claude",
  cursor: "Cursor",
  grok: "Grok",
  hermes: "Hermes",
  freebuff: "Freebuff",
  opencode: "OpenCode",
  antigravity: "Antigravity",
  pi: "Pi",
  muse: "Muse",
  acpRegistry: "ACP",
};

/**
 * Mapping Connect-CLI-Ziele → T3-Treiber.
 * `legacy` = kein T3-Treiber, bleibt auf dem alten Weg (Manus, Lovable, ZGPT).
 */
export const CLI_TARGET_TO_T3_PROVIDER: Record<string, T3ProviderId | "legacy"> = {
  antigravity: "antigravity",
  codex: "codex",
  chatgpt: "codex",
  claude: "claudeAgent",
  grok: "grok",
  cursor: "cursor",
  freebuff: "freebuff",
  manus: "legacy",
  lovable: "legacy",
};

/**
 * Anmelde-Zustand eines Treibers, wie T3 ihn meldet (`ServerProviderAuthStatus`).
 * `unknown` = T3 konnte es nicht ermitteln; die UI darf das nicht als „ausgeloggt" zeigen.
 */
export type T3ProviderAuthState = "authenticated" | "unauthenticated" | "unknown";

/**
 * Nutzbarkeit eines Eintrags in der CLI-Auswahl.
 *
 *  - `available`   → nutzbar (installiert, eingeloggt soweit T3 es weiß)
 *  - `unavailable` → nicht nutzbar (fehlt, deaktiviert, Fehler, unbekannt)
 *  - `legacy`      → kein T3-Treiber; Connect bleibt auf dem alten Weg
 */
export type T3ProviderAvailabilityState = "available" | "unavailable" | "legacy";

export type T3ProviderStatus = {
  provider: T3ProviderId;
  installed: boolean;
  authenticated: boolean | null;
  version: string | null;
  models: string[];
  reason?: string;
  /* --- Erweiterung 29.10.2026: A01s offene Wünsche, additiv und optional ------------------ */
  /**
   * Rohe Treiber-Id aus T3 (z. B. `codex`, `acpRegistry`, `quantumAgent`).
   * Nötig, weil `provider` nur die Ids kennt, die dieser Vertrag schon unterstützt.
   */
  driver?: string;
  /** Instanz-Id des Treibers; unterscheidet mehrere ACP-Agenten derselben Treiber-Id. */
  instanceId?: string | null;
  /** Anzeigename der Zeile (bei ACP-Agenten der Agentenname, sonst wie `T3_PROVIDER_LABELS`). */
  displayName?: string;
  /**
   * Nutzbarkeit für die CLI-Auswahl. Fehlt das Feld, gilt der alte Rückschluss
   * `installed && authenticated !== false`.
   */
  availability?: T3ProviderAvailabilityState;
  /** Dreiwertiger Anmelde-Zustand; `null` = nicht gelesen. */
  auth?: T3ProviderAuthState | null;
  /** Limit-Fenster; nur wenn T3 sie ohnehin meldet (keine zusätzliche Abfrage). */
  limits?: T3ProviderLimit[];
  /** Vom Hermes-Fork ergänzter Treiber (Hermes, Freebuff …). */
  fork?: boolean;
};

export type T3ProviderListResponse = {
  providers: T3ProviderStatus[];
  serverContractVersion: number | null;
  fetchedAt: string;
  /**
   * Treiber, die der T3-Server meldet, die dieser Vertrag aber (noch) nicht kennt.
   * Sie stehen bewusst nicht in `providers` (`provider` ist dort ein geschlossener Typ),
   * werden aber benannt, damit die CLI-Auswahl sie als „noch nicht unterstützt“ zeigen kann.
   */
  unknownDrivers?: string[];
};

/* ---------------------------------------------------------------------------------------- *
 * Chat-Events
 * ---------------------------------------------------------------------------------------- */

export type ConnectChatRole = "user" | "assistant" | "system";

export type ConnectChatItemStatus =
  | "queued"
  | "running"
  | "done"
  | "error"
  | "cancelled"
  | "waiting";

export type ConnectChatToolItem = {
  kind: "tool";
  id: string;
  label: string;
  title: string;
  status: ConnectChatItemStatus;
  output?: string;
  startedAt?: string;
  endedAt?: string;
};

export type ConnectChatApprovalItem = {
  kind: "approval";
  id: string;
  requestId: string;
  requestKind: string;
  title: string;
  detail?: string;
  prompt: string;
  options: {
    id: string;
    label: string;
    decision: "allow" | "deny" | "allow_always";
  }[];
  status: ConnectChatItemStatus;
  blocking: boolean;
};

export type ConnectChatContextSwitchItem = {
  kind: "context_switch";
  id: string;
  tokensAtSwitch: number;
  summary: string;
  previousThreadId: string;
  newThreadId: string;
  createdAt: string;
};

export type ConnectChatPlanItem = {
  kind: "plan";
  id: string;
  steps: { id: string; label: string; status: ConnectChatItemStatus }[];
};

export type ConnectChatSubagentItem = {
  kind: "subagent";
  id: string;
  name: string;
  status: ConnectChatItemStatus;
};

export type ConnectChatTextItem = {
  kind: "text";
  id: string;
  role: ConnectChatRole;
  text: string;
  status: ConnectChatItemStatus;
  delta?: string;
};

export type ConnectChatErrorItem = {
  kind: "error";
  id: string;
  message: string;
  failureClass?: string;
  retryable?: boolean;
};

export type ConnectChatUsage = {
  uncachedInputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  costUsd?: number;
  cacheSavingsUsd?: number;
};

export type ConnectChatTurnEndItem = {
  kind: "turn_end";
  id: string;
  status: "completed" | "failed" | "cancelled" | "interrupted";
  attempts?: number;
  durationMs?: number;
  usage?: ConnectChatUsage;
};

export type ConnectChatItem =
  | ConnectChatTextItem
  | ConnectChatToolItem
  | ConnectChatApprovalItem
  | ConnectChatContextSwitchItem
  | ConnectChatPlanItem
  | ConnectChatSubagentItem
  | ConnectChatErrorItem
  | ConnectChatTurnEndItem;

export type ConnectChatEvent =
  | { type: "text_delta"; itemId: string; delta: string }
  | { type: "text_done"; itemId: string; text: string }
  | { type: "tool"; item: ConnectChatToolItem }
  | { type: "approval"; item: ConnectChatApprovalItem }
  | { type: "context_switch"; item: ConnectChatContextSwitchItem }
  | { type: "plan"; item: ConnectChatPlanItem }
  | { type: "subagent"; item: ConnectChatSubagentItem }
  | { type: "error"; item: ConnectChatErrorItem }
  | { type: "turn_end"; item: ConnectChatTurnEndItem }
  | { type: "usage"; usage: ConnectChatUsage; turnId: string | null }
  | { type: "keepalive"; at: string };

export type ConnectChatEventType = ConnectChatEvent["type"];

export function isConnectChatEvent(value: unknown): value is ConnectChatEvent {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "text_delta" ||
    type === "text_done" ||
    type === "tool" ||
    type === "approval" ||
    type === "context_switch" ||
    type === "plan" ||
    type === "subagent" ||
    type === "error" ||
    type === "turn_end" ||
    type === "usage" ||
    type === "keepalive"
  );
}

/* ---------------------------------------------------------------------------------------- *
 * Nachrichten / Threads / Steuerung
 * ---------------------------------------------------------------------------------------- */

export type T3MessageRequest = {
  agentId: string;
  text: string;
  clientMessageId: string;
  attachmentIds?: string[];
  model?: string;
  provider?: T3ProviderId;
};

export type T3MessageResponse = {
  threadId: string;
  turnId: string | null;
  generation: number;
  status: ConnectChatItemStatus;
  error?: string;
};

export type T3ThreadSnapshot = {
  threadId: string;
  generation: number;
  title: string;
  provider: T3ProviderId;
  model: string | null;
  items: ConnectChatItem[];
  updatedAt: string;
  tokens: number;
};

export type T3ControlAction = "interrupt" | "steer" | "queue";

export type T3ControlRequest = {
  agentId: string;
  action: T3ControlAction;
  text?: string;
};

export type T3ControlResponse = {
  ok: boolean;
  supported: boolean;
  reason?: string;
};

export type T3ApprovalDecision = "allow" | "deny" | "allow_always";

/**
 * Freigabe-Entscheidung auf der Leitung (T3 `RuntimeRequestDecision`).
 *
 * Der T3-Server akzeptiert ausschließlich diese fünf Werte; der Connect-Vertrag nutzt die
 * drei sprechenden (`allow` / `deny` / `allow_always`). Die Übersetzung ist bewusst zentral
 * im Vertrag, damit A06/A13 keine zweite Wahrheit bauen.
 */
export type T3ApprovalDecisionWire =
  | "accept"
  | "acceptForSession"
  | "acceptAlways"
  | "decline"
  | "cancel";

export const T3_APPROVAL_DECISION_TO_WIRE: Record<T3ApprovalDecision, T3ApprovalDecisionWire> = {
  allow: "accept",
  deny: "decline",
  allow_always: "acceptAlways",
};

/** Connect-Entscheidung → T3-Wert (verlustfrei, für den Weg zur Engine). */
export function toT3ApprovalDecisionWire(decision: T3ApprovalDecision): T3ApprovalDecisionWire {
  return T3_APPROVAL_DECISION_TO_WIRE[decision];
}

/**
 * T3-Wert → Connect-Entscheidung (für die Anzeige der Karte).
 *
 * Verlustbehaftet: `acceptForSession` und `acceptAlways` fallen beide auf `allow_always`,
 * `cancel` fällt auf `deny` — die drei Connect-Knöpfe kennen keine feinere Unterscheidung.
 */
export function fromT3ApprovalDecisionWire(decision: T3ApprovalDecisionWire): T3ApprovalDecision {
  switch (decision) {
    case "accept":
      return "allow";
    case "acceptForSession":
    case "acceptAlways":
      return "allow_always";
    case "decline":
    case "cancel":
      return "deny";
  }
}

export type T3ApprovalRequest = {
  agentId: string;
  requestId: string;
  decision: T3ApprovalDecision;
  feedback?: string;
  answers?: Record<string, string>;
};

export type T3ApprovalResponse = {
  ok: boolean;
  error?: string;
};

export type T3Capabilities = {
  canInterrupt: boolean;
  canSteer: boolean;
  canApprove: boolean;
  canRollback: boolean;
  canFork: boolean;
  canPlan: boolean;
  canSubagent: boolean;
  canContextTransfer: boolean;
};

/* ---------------------------------------------------------------------------------------- *
 * Usage
 * ---------------------------------------------------------------------------------------- */

export type UsageMetric = "cost" | "tokens" | "limits";
export type UsageGroupBy = "agent" | "cli" | "model" | "company" | "day";

export type UsageQuery = {
  metric: UsageMetric;
  windowDays: number;
  groupBy: UsageGroupBy;
  agentId?: string;
  companyId?: string;
  provider?: T3ProviderId;
  model?: string;
  timeZone?: string;
};

export type UsageBucket = {
  key: string;
  label: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  costUsd: number;
  cacheSavingsUsd: number;
  turns: number;
};

export type UsageResponse = {
  metric: UsageMetric;
  windowDays: number;
  groupBy: UsageGroupBy;
  buckets: UsageBucket[];
  totals: UsageBucket;
  limits: T3ProviderLimit[];
  readAt: string;
};

export type T3ProviderLimit = {
  provider: T3ProviderId;
  kind: "session" | "weekly" | "monthly" | "other";
  label: string;
  usedPercent: number;
  resetsAt: string | null;
};

/* ---------------------------------------------------------------------------------------- *
 * Firmenprofil: öffentliche Summen
 * ---------------------------------------------------------------------------------------- */

export type CompanyPublicUsage = {
  companyId: string;
  windowDays: number;
  totalTokens: number;
  costUsd?: number;
  byProvider: { provider: string; tokens: number; costUsd?: number }[];
  computedAt: string;
};

export type CompanyUsageSettings = {
  companyId: string;
  public: boolean;
  showCost: boolean;
};

/* ---------------------------------------------------------------------------------------- *
 * Maschinen (Cua)
 * ---------------------------------------------------------------------------------------- */

export type MachineKind = "local" | "sandbox";
export type MachineStatus =
  | "sleeping"
  | "starting"
  | "running"
  | "stopped"
  | "error";

export type Machine = {
  id: string;
  owner: string | null;
  kind: MachineKind;
  name: string;
  status: MachineStatus;
  sharedDefault: boolean;
  cuaRef: string | null;
  width?: number;
  height?: number;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MachineListResponse = {
  machines: Machine[];
  sharedDefaultId: string | null;
};

/* ---------------------------------------------------------------------------------------- *
 * Avatare
 * ---------------------------------------------------------------------------------------- */

export type AvatarShape =
  | "circle"
  | "pebble"
  | "squircle"
  | "capsule"
  | "triangle"
  | "hexagon"
  | "cloud"
  | "drop"
  | "diamond"
  | "star"
  | "flower"
  | "pumpkin";

export const AVATAR_SHAPES: readonly AvatarShape[] = [
  "circle",
  "pebble",
  "squircle",
  "capsule",
  "triangle",
  "hexagon",
  "cloud",
  "drop",
  "diamond",
  "star",
  "flower",
  "pumpkin",
];

export type AvatarColor =
  | "white"
  | "ink"
  | "brown"
  | "red"
  | "orange"
  | "amber"
  | "green"
  | "turquoise"
  | "blue"
  | "violet"
  | "pink"
  | "gray"
  | "cream";

export const AVATAR_COLORS: readonly AvatarColor[] = [
  "white",
  "ink",
  "brown",
  "red",
  "orange",
  "amber",
  "green",
  "turquoise",
  "blue",
  "violet",
  "pink",
  "gray",
  "cream",
];

export const AVATAR_DEFAULT_COLOR: AvatarColor = "orange";

export type AvatarExpression =
  | "neutral"
  | "happy"
  | "thinking"
  | "wink"
  | "wide"
  | "alert"
  | "sleep"
  | "surprised";

export type AgentAvatar = {
  agentId: string;
  shape: AvatarShape;
  color: AvatarColor;
  expression?: AvatarExpression;
  updatedAt: string;
};

/* ---------------------------------------------------------------------------------------- *
 * Flotte / Scheduler
 * ---------------------------------------------------------------------------------------- */

export type AgentRuntimeState =
  | "idle"
  | "queued"
  | "running"
  | "waiting_approval"
  | "sleeping"
  | "error";

export type FleetAgentState = {
  agentId: string;
  name: string;
  state: AgentRuntimeState;
  provider: T3ProviderId | "legacy" | "cloud";
  queuePosition: number | null;
  tokens: number;
  costUsd: number;
  lastActivityAt: string | null;
};

export type SchedulerLimits = {
  maxConcurrentTurns: number;
  maxConcurrentPerProvider: number;
  queueTimeoutMinutes: number;
  idleSessionTimeoutMinutes: number;
  maxAwakeAgents: number;
};

export const DEFAULT_SCHEDULER_LIMITS: SchedulerLimits = {
  maxConcurrentTurns: 5,
  maxConcurrentPerProvider: 3,
  queueTimeoutMinutes: 120,
  idleSessionTimeoutMinutes: 15,
  maxAwakeAgents: 8,
};

/* ---------------------------------------------------------------------------------------- *
 * Status
 * ---------------------------------------------------------------------------------------- */

export type T3StatusResponse = {
  running: boolean;
  port: number | null;
  version: string | null;
  contractVersion: number | null;
  contractCompatible: boolean;
  providers: T3ProviderStatus[];
  home: string | null;
  message?: string;
};

/* ---------------------------------------------------------------------------------------- *
 * Routen (Pfade relativ zum Mount `/api`)
 * ---------------------------------------------------------------------------------------- */

export const T3_ROUTES = {
  status: "/t3/status",
  providers: "/t3/providers",
  threadMap: "/t3/thread-map",
  messages: "/t3-agents/:agentId/messages",
  stream: "/t3-agents/:agentId/stream",
  control: "/t3-agents/:agentId/control",
  approvals: "/t3-agents/:agentId/approvals",
  threadSnapshot: "/t3-agents/:agentId/thread",
  usage: "/usage/t3",
  usagePublic: "/companies/:companyId/public-usage",
  machines: "/machines",
  machine: "/machines/:machineId",
  agentAvatar: "/agents/:agentId/avatar",
  fleet: "/t3/fleet",
} as const;

export type T3RouteKey = keyof typeof T3_ROUTES;
