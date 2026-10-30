/**
 * T3-Bridge — gemeinsame Verträge (Server-Seite).
 *
 * EIGENTÜMER: A01. Alle anderen Agenten (A02–A40) lesen diese Datei, ändern sie aber NICHT.
 * Eine Änderung an einem Typ hier braucht eine Ankündigung im Bericht an den betroffenen Besitzer.
 *
 * Zweck: Connect behält sein Design, T3 liefert die Engine. Diese Datei beschreibt die
 * schmale Brücke zwischen beiden: welche Laufzeiten es gibt, welche Events der T3-Server
 * liefert, wie sie in Connects Chat-Format übersetzt werden und welche Routen es dafür gibt.
 *
 * Grundsätze (aus PLAN.md / T3-INTEGRATION-UEBERSICHT.md):
 *  - Keine Zod-/valibot-Abhängigkeit: reine TypeScript-Typen + schmale Guards.
 *  - Keine Secrets in diesen Typen. Tokens laufen serverseitig (A10).
 *  - Jede neue Fähigkeit ist hinter einem Feature-Flag (siehe T3_FEATURE_FLAGS).
 *  - Vorwärtskompatibel: unbekannte Event-Typen werden ignoriert, nicht als Fehler geworfen.
 */

/* ---------------------------------------------------------------------------------------- *
 * Feature-Flags
 * ---------------------------------------------------------------------------------------- */

/**
 * Die T3-Flags. Achtung: `packages/contracts/src/flags.ts` (FLAGS_V06) gehört einem anderen
 * Besitzer und wird hier NICHT angefasst. Die T3-Flags leben vorerst in dieser Datei und
 * werden über `CONNECT_FLAGS_T3` (Server, kommagetrennt) bzw. `window.__CONNECT_FLAGS_T3`
 * (Frontend) gesetzt. Wunsch an A37: Mount der Routen nur bei gesetztem Flag.
 */
export const T3_FEATURE_FLAGS = {
  /** Die ganze Brücke (Sidecar, RPC, Threads, Streaming). Ohne dieses Flag bleibt Connect unverändert. */
  bridge: false,
  /** CLI-Auswahl tauscht die Engine von `cli-bridge` auf T3. Aus = alter Weg. */
  cliSwap: false,
  /** Modus „Agents – T3 Code" (iframe, Level 5) wird ausgeblendet. Dateien bleiben erhalten. */
  hideAgentsMode: false,
  /** Automatischer Kontextwechsel alle 100.000 Tokens (I5). */
  contextRotation: false,
  /** Cua-Maschinen (Backend + Einstellungen + Computer-Tab). */
  cuaMachines: false,
  /** Öffentliche Token-Summen auf dem Firmenprofil. */
  companyPublicUsage: false,
  /** Maskottchen-Avatare (Grok-Bot-Stil). */
  mascot: false,
} as const;

export type T3FeatureFlagName = keyof typeof T3_FEATURE_FLAGS;

export const T3_FLAG_NAMES: readonly T3FeatureFlagName[] = Object.keys(
  T3_FEATURE_FLAGS,
) as T3FeatureFlagName[];

/** Umgebungsvariable, mit der die Flags serverseitig gesetzt werden. */
export const T3_FLAGS_ENV_VAR = "CONNECT_FLAGS_T3";

/**
 * Liest ein T3-Flag. Reihenfolge: Runtime-Injektion (Frontend) → Umgebung → Default.
 *
 * `all`/`true` schaltet alles ein, `no-<name>`/`-<name>` schaltet eines aus.
 *
 * REIHENFOLGE (A01): Der Ausschluss wird ZUERST geprueft. Vorher stand
 * `all`/`true` davor, wodurch `CONNECT_FLAGS_T3=all,no-mascot` das Flag
 * `mascot` trotzdem aktiviert hat — der Ausschluss war wirkungslos.
 * Eine gezielte Abschaltung muss immer stärker sein als die Pauschale Aktivierung.
 */
export function getT3Flag(name: T3FeatureFlagName): boolean {
  const globalFlags = (globalThis as {
    __CONNECT_FLAGS_T3?: Partial<Record<T3FeatureFlagName, unknown>>;
  }).__CONNECT_FLAGS_T3;
  const runtimeValue = globalFlags?.[name];
  if (typeof runtimeValue === "boolean") return runtimeValue;

  const env = process.env?.[T3_FLAGS_ENV_VAR];
  if (env) {
    const entries = env
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const lower = name.toLowerCase();
    // 1. Ausschluss zuerst — er schlägt jede Aktivierung.
    if (entries.includes(`no-${lower}`) || entries.includes(`-${lower}`)) return false;
    // 2. Pauschale Aktivierung.
    if (entries.includes("all") || entries.includes("true")) return true;
    // 3. Einzelaktivierung.
    if (entries.includes(lower)) return true;
  }

  return T3_FEATURE_FLAGS[name];
}

/**
 * Liefert den aktuellen Stand aller T3-Flags — für `GET /api/t3/flags`.
 *
 * Der Browser kann `CONNECT_FLAGS_T3` nicht lesen. Ohne diesen Snapshot
 * bleibt `window.__CONNECT_FLAGS_T3` leer, und jede T3-Oberfläche fällt
 * auf die kompilierten Defaults (alles aus) zurück.
 */
export function allT3Flags(): Record<T3FeatureFlagName, boolean> {
  const flags = {} as Record<T3FeatureFlagName, boolean>;
  for (const name of T3_FLAG_NAMES) {
    flags[name] = getT3Flag(name);
  }
  return flags;
}

/* ---------------------------------------------------------------------------------------- *
 * Laufzeit und Provider
 * ---------------------------------------------------------------------------------------- */

/**
 * Wie ein Agent ausgeführt wird.
 *
 *  - `cli`   → Connect-eigener Weg (`cli-bridge` / shell-dispatch). Default, Bestand.
 *  - `cloud` → Cloud-Agent (Muse/Grok-Webhook/OpenAI). Bleibt unverändert.
 *  - `t3`    → T3-Engine über die Brücke. Neu.
 *
 * Regel wie bei Cloud: KEIN Fallback. Ein `t3`-Agent ohne erreichbaren Sidecar meldet
 * den Fehler, er fällt nicht auf `cli` zurück.
 */
export type AgentRuntime = "cli" | "cloud" | "t3";

export const AGENT_RUNTIMES: readonly AgentRuntime[] = ["cli", "cloud", "t3"];

export function isAgentRuntime(value: unknown): value is AgentRuntime {
  return (
    typeof value === "string" &&
    (AGENT_RUNTIMES as readonly string[]).includes(value)
  );
}

/**
 * T3-Treiber-Ids.
 *
 * Quelle: `apps/server/src/provider/builtInDrivers.ts` (BUILT_IN_DRIVERS) und die
 * `ProviderDriverKind.make(...)`-Konstanten der einzelnen Treiber im Hermes-Fork:
 * codex, claudeAgent, cursor, grok, hermes, freebuff, opencode, antigravity, pi, muse.
 * `acpRegistry` ist der generische ACP-Treiber (stdio).
 */
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

export function isT3ProviderId(value: unknown): value is T3ProviderId {
  return (
    typeof value === "string" &&
    (T3_PROVIDER_IDS as readonly string[]).includes(value)
  );
}

/**
 * Anzeigename je Treiber. Bewusst als konstante Liste, damit Server und Client
 * dieselben Labels rendern (A23 baut die CLI-Auswahl daraus).
 */
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
 *
 * Basis: `apps/app/src/lib/agents/agent-cli.ts` (CLI_TARGETS: antigravity, manus, codex,
 * chatgpt, claude, grok, cursor, lovable, freebuff).
 *  - ChatGPT läuft bei Connect über dieselbe Codex-Bridge → T3-Treiber `codex`.
 *  - Manus, Lovable und ZGPT haben keinen T3-Treiber → bleiben auf dem alten Weg.
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

/** True, wenn dieses Connect-CLI-Ziel über T3 laufen kann. */
export function t3ProviderForCliTarget(target: string): T3ProviderId | "legacy" {
  return CLI_TARGET_TO_T3_PROVIDER[target] ?? "legacy";
}

/**
 * Installations-/Login-Status eines T3-Treibers.
 * A04 liest diesen Status aus dem Sidecar (Cache 30 s).
 */
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
  /** CLI auf diesem Rechner gefunden? */
  installed: boolean;
  /** Angemeldet? (Nur lesen — die Brücke löst nie einen Login aus.) */
  authenticated: boolean | null;
  version: string | null;
  /** Verfügbare Modelle, wenn der Treiber sie meldet. */
  models: string[];
  /** Grund, warum der Treiber nicht nutzbar ist (für den Tooltip im Selector). */
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
  /** Contract-Version des T3-Servers, gegen die die Brücke gebaut wurde. */
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
 * Thread-Zuordnung
 * ---------------------------------------------------------------------------------------- */

/**
 * Zuordnung Connect-Agent ↔ T3-Thread.
 *
 * Connect-Agent  =  ein dauerhaftes Gespräch (Idee I5).
 * Connect-Channel =  Ablage des Gesprächs.
 * T3-Thread      =  die tatsächliche Engine-Konversation.
 *
 * `generation` zählt die Kontextfenster: bei jeder Rotation (A15) steigt sie, der Thread
 * ändert die Id, das sichtbare Chat bleibt für den Nutzer dasselbe.
 */
export type T3ThreadMap = {
  agentId: string;
  channelId: string | null;
  /** Aktueller T3-Thread. */
  t3ThreadId: string;
  /** Anzahl abgeschlossener Kontextfenster. */
  generation: number;
  /** T3-Projekt = Arbeitsordner des Agenten. */
  projectId: string | null;
  /** Arbeitsordner (Pfad) für CLI-Prozesse. */
  cwd: string | null;
  provider: T3ProviderId;
  model: string | null;
  /** Erstellt / zuletzt benutzt (ISO). */
  createdAt: string;
  updatedAt: string;
};

/* ---------------------------------------------------------------------------------------- *
 * Chat-Events (Übersetzungsschicht)
 * ---------------------------------------------------------------------------------------- */

/** Rolle einer Nachricht im Connect-Chat. */
export type ConnectChatRole = "user" | "assistant" | "system";

/**
 * Status eines Chat-Items. Angelehnt an die Cloud-Agent-Status (sending/sent/waiting/…),
 * damit der vorhandene Chat-Status wiederverwendet werden kann.
 */
export type ConnectChatItemStatus =
  | "queued"
  | "running"
  | "done"
  | "error"
  | "cancelled"
  | "waiting";

/** Ein Tool-Schritt (Befehl, Dateiänderung, Suche) als Chat-Zeile. */
export type ConnectChatToolItem = {
  kind: "tool";
  id: string;
  /** Kurzlabel für die Tool-Zeile, z. B. `Bash`, `Read`, `Edit`. */
  label: string;
  title: string;
  status: ConnectChatItemStatus;
  /** Ausgabe in Kurzform; lange Ausgabe über `command_output.delta`. */
  output?: string;
  startedAt?: string;
  endedAt?: string;
};

/** Freigabe-/Rückfrage-Karte (Datei schreiben, Befehl ausführen). */
export type ConnectChatApprovalItem = {
  kind: "approval";
  id: string;
  requestId: string;
  /** T3-RuntimeRequest-Art: `command` | `file_write` | `user_input` | … */
  requestKind: string;
  title: string;
  detail?: string;
  /** Was genau freigegeben werden soll (Befehl, Pfad, Frage). */
  prompt: string;
  options: { id: string; label: string; decision: "allow" | "deny" | "allow_always" }[];
  status: ConnectChatItemStatus;
  blocking: boolean;
};

/** Kontextwechsel (alle 100.000 Tokens) als sichtbare Trennlinie. */
export type ConnectChatContextSwitchItem = {
  kind: "context_switch";
  id: string;
  /** Tokens, bei denen umgeschaltet wurde. */
  tokensAtSwitch: number;
  /** Zusammenfassung des Sub-Agenten (sichtbar + editierbar). */
  summary: string;
  /** Alter Thread bleibt lesbar. */
  previousThreadId: string;
  newThreadId: string;
  createdAt: string;
};

/** Plan-Fortschritt aus T3 (`plan.updated`). */
export type ConnectChatPlanItem = {
  kind: "plan";
  id: string;
  steps: { id: string; label: string; status: ConnectChatItemStatus }[];
};

/** Sub-Agenten-Status (`subagent.updated`). */
export type ConnectChatSubagentItem = {
  kind: "subagent";
  id: string;
  name: string;
  status: ConnectChatItemStatus;
};

/** Reine Textnachricht (live gestreamt). */
export type ConnectChatTextItem = {
  kind: "text";
  id: string;
  role: ConnectChatRole;
  text: string;
  status: ConnectChatItemStatus;
  /** Bei Text-Deltas: Anteil, der gerade hinzugekommen ist. */
  delta?: string;
};

/** Fehlerzeile am Ende eines Turns. */
export type ConnectChatErrorItem = {
  kind: "error";
  id: string;
  message: string;
  /** Fehlerklasse aus T3 (`OrchestrationV2ProviderFailureClass`). */
  failureClass?: string;
  retryable?: boolean;
};

/** Terminales Turn-Ereignis. */
export type ConnectChatTurnEndItem = {
  kind: "turn_end";
  id: string;
  status: "completed" | "failed" | "cancelled" | "interrupted";
  /** Umschaltungen dieses Turns (Neustart, Retry). */
  attempts?: number;
  durationMs?: number;
  usage?: ConnectChatUsage;
};

/** Token-/Kosten-Zahlen eines Turns. */
export type ConnectChatUsage = {
  uncachedInputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  costUsd?: number;
  cacheSavingsUsd?: number;
};

/** Ein Baustein des Connect-Chats. */
export type ConnectChatItem =
  | ConnectChatTextItem
  | ConnectChatToolItem
  | ConnectChatApprovalItem
  | ConnectChatContextSwitchItem
  | ConnectChatPlanItem
  | ConnectChatSubagentItem
  | ConnectChatErrorItem
  | ConnectChatTurnEndItem;

/**
 * Das Format, in dem die Übersetzungsschicht (A06) T3-Events in Connect-Chat-Events
 * überführt. A12 streamt diese Events, A22 rendert sie.
 */
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

/**
 * Mapping-Tabelle: T3-Event → ConnectChatEvent.
 * A06 implementiert sie, A01 legt sie fest. `turn.terminal` ist in T3 kein eigenes
 * Domain-Event, sondern wird aus dem Run-Status abgeleitet — siehe `T3_EVENT_TO_CONNECT`.
 */
export const T3_EVENT_TO_CONNECT: Readonly<
  Record<string, ConnectChatEventType>
> = {
  "message.updated": "text_delta",
  "turn_item.updated": "tool",
  "command_output.delta": "tool",
  "runtime_request.updated": "approval",
  "plan.updated": "plan",
  "subagent.updated": "subagent",
  "turn.terminal": "turn_end",
  "context-handoff.updated": "context_switch",
  "context-transfer.created": "context_switch",
  "provider-turn.updated": "usage",
};

/* ---------------------------------------------------------------------------------------- *
 * Nachrichten / Threads
 * ---------------------------------------------------------------------------------------- */

export type T3MessageRequest = {
  agentId: string;
  text: string;
  /** Id der Nutzernachricht im Connect-Chat (für Status-Zuordnung). */
  clientMessageId: string;
  /** Anhänge (A18), als T3-Attachment-Referenzen. */
  attachmentIds?: string[];
  /** Optional: Modell überschreiben (sonst Agent-Default). */
  model?: string;
  /** Optional: Provider überschreiben (sonst Agent-Default). */
  provider?: T3ProviderId;
};

export type T3MessageResponse = {
  /** Id des T3-Threads, in dem der Turn läuft. */
  threadId: string;
  turnId: string | null;
  /** Kontextfenster-Generation (ändert sich bei Rotation). */
  generation: number;
  status: ConnectChatItemStatus;
  /** Für Fehler: kurze Meldung. */
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
  /** Tokens im aktuellen Fenster (für die Rotationsanzeige). */
  tokens: number;
};

/* ---------------------------------------------------------------------------------------- *
 * Steuerung: Stopp, Nachsteuern, Freigaben
 * ---------------------------------------------------------------------------------------- */

export type T3ControlAction = "interrupt" | "steer" | "queue";

export type T3ControlRequest = {
  agentId: string;
  action: T3ControlAction;
  /** Bei `steer`: der Nachsteuer-Text. */
  text?: string;
};

export type T3ControlResponse = {
  ok: boolean;
  /** `false`, wenn der Provider die Aktion nicht kann. */
  supported: boolean;
  reason?: string;
};

/** Antwort auf eine Freigabe-/Rückfrage-Karte. */
export type T3ApprovalDecision = "allow" | "deny" | "allow_always";

/**
 * Freigabe-Entscheidung auf der Leitung (T3 `RuntimeRequestDecision`).
 *
 * Der T3-Server akzeptiert ausschließlich diese fünf Werte; der Connect-Vertrag nutzt die
 * drei sprechenden (`allow` / `deny` / `allow_always`). Die Übersetzung ist bewusst hier
 * zentral, damit A06/A13 keine zweite Wahrheit bauen.
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
 * Beim Zurückschreiben entscheidet die ursprüngliche T3-Option, nicht diese Rückübersetzung.
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
  /** Optionaler Freitext an den Agenten. */
  feedback?: string;
  /** Optionale Antworten auf eine Nutzerfrage (T3 `ProviderUserInputAnswers`). */
  answers?: Record<string, string>;
};

export type T3ApprovalResponse = {
  ok: boolean;
  error?: string;
};

/**
 * Fähigkeiten einer Session/Thread (aus T3 `OrchestrationV2*Capabilities`).
 * A13 fragt sie ab, um UI-Knöpfe (Stopp, Nachsteuern) nur zu zeigen, wenn sie funktionieren.
 */
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
 * Usage-Ledger
 * ---------------------------------------------------------------------------------------- */

/**
 * Eine Zeile im Connect-Usage-Ledger.
 *
 * T3 rechnet nach Provider/Modell, NICHT pro Connect-Agent. Für „pro Agent" und „pro Firma"
 * braucht Connect ein eigenes Ledger (A17), das die Token-Zahlen aus den T3-Turn-Events
 * (ClaudeTurnTokenUsage, CodexTurnTokenUsage, ACP usage_update) mit Agent/Firma speichert.
 */
export type UsageLedgerRow = {
  id: string;
  agentId: string | null;
  companyId: string | null;
  provider: T3ProviderId | "legacy" | "cloud";
  model: string;
  /** Ungecachte Eingabetokens. */
  inputTokens: number;
  /** Gelesene Cache-Tokens (billig). */
  cachedInputTokens: number;
  /** Neu geschriebene Cache-Tokens. */
  cacheCreationTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  costUsd: number;
  cacheSavingsUsd: number;
  /** Id des T3-Turns, aus dem die Zeile stammt. */
  turnId: string | null;
  /** Tag (YYYY-MM-DD) für die Aggregation. */
  day: string;
  createdAt: string;
};

/** Metrik, die angezeigt wird. */
export type UsageMetric = "cost" | "tokens" | "limits";

/** Gruppierung der Auswertung. */
export type UsageGroupBy = "agent" | "cli" | "model" | "company" | "day";

export type UsageQuery = {
  metric: UsageMetric;
  /** Zeitraum in Tagen (7 / 30 / 90 / 365). */
  windowDays: number;
  groupBy: UsageGroupBy;
  /** Optionale Filter. */
  agentId?: string;
  companyId?: string;
  provider?: T3ProviderId;
  model?: string;
  /** IANA-Zeitzone für Tages-Buckets. */
  timeZone?: string;
};

export type UsageBucket = {
  /** Gruppierungsschlüssel (Agent-Id, Firmen-Id, Modellname, Tag …). */
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
  /** Anzahl der Turns. */
  turns: number;
};

export type UsageResponse = {
  metric: UsageMetric;
  windowDays: number;
  groupBy: UsageGroupBy;
  buckets: UsageBucket[];
  totals: UsageBucket;
  /** Provider-Limits (Codex/Claude/Antigravity/Cursor), sofern der Sidecar sie meldet. */
  limits: T3ProviderLimit[];
  readAt: string;
};

/** Ein Limitfenster eines Anbieters (aus T3 `ServerProviderUsageWindow`). */
export type T3ProviderLimit = {
  provider: T3ProviderId;
  /** `session` | `weekly` | `monthly` | `other`. */
  kind: "session" | "weekly" | "monthly" | "other";
  label: string;
  usedPercent: number;
  resetsAt: string | null;
};

/* ---------------------------------------------------------------------------------------- *
 * Firmenprofil: öffentliche Summen
 * ---------------------------------------------------------------------------------------- */

/**
 * Was das öffentliche Firmenprofil zeigen darf.
 *
 * Datenschutz: NUR Summen. Keine Prompts, keine Antworten, keine Dateinamen, keine Keys,
 * keine Agentennamen-Details. Serverseitiger Filter, fester Feldsatz, eigener Endpoint.
 */
export type CompanyPublicUsage = {
  companyId: string;
  /** Zeitraum in Tagen. */
  windowDays: number;
  totalTokens: number;
  /** Kosten nur, wenn die Firma `showCost` aktiv hat. */
  costUsd?: number;
  /** Anteil je CLI (nur Provider-Kategorie, keine Agenten-Details). */
  byProvider: { provider: string; tokens: number; costUsd?: number }[];
  /** Zeitstempel der letzten Aggregation (Cache granularity: stündlich). */
  computedAt: string;
};

/** Einstellungen der Firma zur öffentlichen Anzeige. */
export type CompanyUsageSettings = {
  companyId: string;
  /** Öffentlich anzeigen (Opt-out). */
  public: boolean;
  /** Kosten in $ anzeigen. */
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
  /** Eigentümer: `null` = gemeinsame Standardmaschine, sonst Besitzer-Agent/-Nutzer. */
  owner: string | null;
  kind: MachineKind;
  name: string;
  status: MachineStatus;
  /** Die gemeinsame lokale Maschine, die alle Bots teilen. */
  sharedDefault: boolean;
  /** Referenz auf die Cua-Maschine (z. B. `cua sb:dev` / Host-Id). */
  cuaRef: string | null;
  /** Bildschirmformat für die Vorschau. */
  width?: number;
  height?: number;
  /** Letzte Aktivität (ISO). */
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MachineListResponse = {
  machines: Machine[];
  /** Die aktuell geteilte Standardmaschine. */
  sharedDefaultId: string | null;
};

/* ---------------------------------------------------------------------------------------- *
 * Avatare (Maskottchen)
 * ---------------------------------------------------------------------------------------- */

/**
 * Formen des Maskottchens. Aus dem Grok-Bot-Set (MIT, © Jérémy Perret) übernommen und
 * analytisch ergänzt (Raute, Stern, Blume, Kürbis …).
 */
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

/** Farben des Maskottchens. Orange ist der Standard. */
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

/** Gesichtsausdruck (optional, 16 Ausdrücke der Engine). */
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

export function isAvatarShape(value: unknown): value is AvatarShape {
  return (
    typeof value === "string" &&
    (AVATAR_SHAPES as readonly string[]).includes(value)
  );
}

export function isAvatarColor(value: unknown): value is AvatarColor {
  return (
    typeof value === "string" &&
    (AVATAR_COLORS as readonly string[]).includes(value)
  );
}

/* ---------------------------------------------------------------------------------------- *
 * Scheduler / Last / Kontext / Token-Sparen
 * ---------------------------------------------------------------------------------------- */

/** Grenzen des Schedulers (A08). */
export type SchedulerLimits = {
  /** Maximal gleichzeitig laufende Turns (gesamt). */
  maxConcurrentTurns: number;
  /** Maximal gleichzeitig laufende Turns je Provider. */
  maxConcurrentPerProvider: number;
  /** Wie lange ein Turn maximal in der Warteschlange bleibt (Minuten). */
  queueTimeoutMinutes: number;
  /** Leerlaufzeit in Minuten, nach der eine Session gestoppt wird. */
  idleSessionTimeoutMinutes: number;
  /** Anzahl der Agenten, die gleichzeitig „wach" sind (RAM). */
  maxAwakeAgents: number;
};

/** Startwerte (Vorschlag Stefan: 4–6 gleichzeitig). */
export const DEFAULT_SCHEDULER_LIMITS: SchedulerLimits = {
  maxConcurrentTurns: 5,
  maxConcurrentPerProvider: 3,
  queueTimeoutMinutes: 120,
  idleSessionTimeoutMinutes: 15,
  maxAwakeAgents: 8,
};

/** Zustand eines Agenten in der Flotte (A36). */
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
  /** Position in der Warteschlange (null, wenn nicht wartend). */
  queuePosition: number | null;
  tokens: number;
  costUsd: number;
  lastActivityAt: string | null;
};

/** Grenzen des Ressourcen-Monitors (A09). */
export type ResourceLimits = {
  /** Ab hier wird kein neuer Turn gestartet. */
  maxCpuPercent: number;
  /** Ab hier wird kein neuer Turn gestartet (Freier RAM in GB). */
  minFreeRamGb: number;
  /** Ab hier wird kein neuer Turn gestartet (Freie Platte in GB). */
  minFreeDiskGb: number;
};

export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxCpuPercent: 85,
  minFreeRamGb: 4,
  minFreeDiskGb: 20,
};

export type ResourceSnapshot = {
  cpuPercent: number;
  freeRamGb: number;
  freeDiskGb: number;
  /** True, wenn gerade kein neuer Turn gestartet werden darf. */
  throttled: boolean;
  reason?: string;
  at: string;
};

/**
 * Kontext-Politik: automatischer Wechsel des Kontextfensters (Idee I5).
 */
export type ContextPolicy = {
  /** Schwelle in Tokens. Stefan: 100.000. */
  thresholdTokens: number;
  /** Modell des Komprimierungs-Sub-Agenten (gleicher Provider/Standard). */
  summarizerModel: string | null;
  /** Zusammenfassung im Chat sichtbar? (Empfehlung: ja). */
  showSummary: boolean;
  /** Vorherige Threads lesbar behalten? */
  keepOldThreadsReadable: boolean;
};

export const DEFAULT_CONTEXT_POLICY: ContextPolicy = {
  thresholdTokens: 100_000,
  summarizerModel: null,
  showSummary: true,
  keepOldThreadsReadable: true,
};

/**
 * Token-Spar-Politik (A14). T3 drosselt selbst (Coalescer, LiveStreamBudget);
 * Connect hält nur den sichtbaren Chat live.
 */
export type TokenSavingPolicy = {
  /** Nur der sichtbare Chat bekommt Live-Text. */
  liveStreamOnlyVisibleChat: boolean;
  /** Coalescing-Fenster in Millisekunden. */
  coalesceMs: number;
  /** Maximales Live-Budget pro Turn in Tokens. */
  liveBudgetTokens: number;
  /** Tool-Ausgaben standardmäßig einklappen. */
  collapseToolOutput: boolean;
};

export const DEFAULT_TOKEN_SAVING_POLICY: TokenSavingPolicy = {
  liveStreamOnlyVisibleChat: true,
  coalesceMs: 80,
  liveBudgetTokens: 2000,
  collapseToolOutput: true,
};

/* ---------------------------------------------------------------------------------------- *
 * Routen
 * ---------------------------------------------------------------------------------------- */

/**
 * Alle Routen der Brücke. Der Pfade sind **relativ** zum Mount-Punkt, den A37 setzt.
 * A37 setzt den Mount auf `/api` (damit `/api/t3/...` entsteht).
 */
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

/**
 * Statusantwort des Sidecars (A02/A03).
 */
export type T3StatusResponse = {
  /** Läuft der Sidecar? */
  running: boolean;
  /** Port des Sidecars (Standard 3773). */
  port: number | null;
  /** Version des T3-Servers. */
  version: string | null;
  /** Contract-Version der T3-RPC-Schicht — wird gepinnt und geprüft. */
  contractVersion: number | null;
  /** Stimmt die Contract-Version mit der erwarteten überein? */
  contractCompatible: boolean;
  /** Liste der Provider mit Status. */
  providers: T3ProviderStatus[];
  /** Eigene T3-Home (Connect nutzt ein eigenes, niemals Stefans `~/.t3-hermes`). */
  home: string | null;
  /** Standardfehlertext für die UI. */
  message?: string;
};

/* ---------------------------------------------------------------------------------------- *
 * Sidecar-Konfiguration
 * ---------------------------------------------------------------------------------------- */

/**
 * Konfiguration des T3-Sidecars (A02).
 *
 * Regeln: nur Loopback, eigenes T3-Home unter `%LOCALAPPDATA%\ConnectAgents\t3-home`.
 * Der Sidecar darf niemals Stefans Desktop-Home überschreiben.
 */
export const T3_SIDECAR_DEFAULTS = {
  /** Loopback-Standardport von T3. */
  port: 3773,
  /** Nur auf 127.0.0.1 binden. */
  host: "127.0.0.1",
  /** Zuständige Umgebungsvariable des Sidecars (T3-Home). */
  homeEnvVar: "T3CODE_HOME",
  /** Runtime-Datei, in der T3 den laufenden Server protokolliert. */
  runtimeFile: "userdata/server-runtime.json",
  /** Logdatei des Sidecars. */
  logFile: "logs/t3-sidecar.log",
} as const;

export type T3SidecarConfig = {
  port: number;
  host: string;
  /** Absoluter Pfad zum eigenen T3-Home. */
  home: string;
  /** Executable/ Kommando zum Starten des T3-Servers. */
  command: string[];
  args: string[];
  /** Logdatei. */
  logFile: string;
};
