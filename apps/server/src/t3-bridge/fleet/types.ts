/**
 * T3-Bridge — Flotten-Ansicht, 40-Agenten-Anlage & Ideen-Backlog (Lane A36).
 *
 * Typen für die Flotten-Übersicht und die Massen-Anlage von Agenten aus dem
 * Ideen-Backlog.
 *
 * EIGENTÜMER: A36.
 *
 * Diese Datei spiegelt die Verträge aus `apps/app/src/t3-bridge/contracts.ts`
 * (A01) — sie wird NICHT verändert. Was hier steht, ist die **Erweiterung**
 * für die Flotte: die A01-Verträge kennen `FleetAgentState` (Agent + Zustand
 * + Tokens + Warteschlange), aber nicht PC-Last, Arbeitsordner, Avatar oder
 * die Ideen-Zeilen des Backlogs.
 *
 * Wichtig für die Lesbarkeit: `FleetAgentRow` **enthält** ein
 * `FleetAgentState`-artiges Feld-Set. Die UI zeichnet zuerst die A01-Werte
 * (Zustand, Tokens, Warteschlange) und ergänzt dann die A36-Werte.
 */

import type {
  AgentRuntimeState,
  AvatarColor,
  AvatarShape,
  SchedulerLimits,
  T3ProviderId,
} from "../contracts";

export type {
  AgentRuntimeState,
  AvatarColor,
  AvatarShape,
  SchedulerLimits,
  T3ProviderId,
};

/* ---------------------------------------------------------------------------------------- *
 * CLI
 * ---------------------------------------------------------------------------------------- */

/**
 * Die CLIs, die Connect heute anbietet.
 *
 * Gespiegelt aus `apps/server/src/agents/agent-cli-mcp.ts` (`SUPPORTED_CLIS`),
 * ohne den Wert `workspace` — der ist keine CLI, sondern ein Modus. Die Liste
 * hier ist **additiv**: eine unbekannte CLI aus dem Backlog wird abgelehnt,
 * eine bekannte aus dieser Liste nicht.
 */
export const FLEET_CLI_IDS = [
  "antigravity",
  "codex",
  "claude",
  "hermes",
  "freebuff",
] as const;

export type FleetCliId = (typeof FLEET_CLI_IDS)[number];

export function isFleetCliId(value: unknown): value is FleetCliId {
  return (
    typeof value === "string" &&
    (FLEET_CLI_IDS as readonly string[]).includes(value)
  );
}

/** Anzeigename der CLI für die Oberfläche. */
export const FLEET_CLI_LABELS: Record<FleetCliId, string> = {
  antigravity: "Antigravity",
  codex: "Codex",
  claude: "Claude",
  hermes: "Hermes",
  freebuff: "Freebuff",
};

/* ---------------------------------------------------------------------------------------- *
 * Flotten-Übersicht
 * ---------------------------------------------------------------------------------------- */

/** Ein Agent in der Flotten-Ansicht. */
export type FleetAgentRow = {
  agentId: string;
  name: string;
  title: string;
  /** Die gewählte CLI (`agents.chosenCli`), null wenn keine gesetzt ist. */
  cli: string | null;
  /** Der T3-Treiber, über den der Agent läuft. */
  provider: T3ProviderId | "legacy" | "cloud";
  /** Der Laufzustand aus dem Scheduler (A08), auf den A01-Vertrag abgebildet. */
  state: AgentRuntimeState;
  /** Position in der Warteschlange, null wenn nicht wartend. */
  queuePosition: number | null;
  /** Tokens von heute (Summe über die letzten 24 Stunden / laufender Tag). */
  tokensToday: number;
  /** Kosten von heute in USD. */
  costTodayUsd: number;
  /** Letzte Aktivität (ISO), null wenn der Agent noch nie gelaufen ist. */
  lastActivityAt: string | null;
  /** Arbeitsordner des Agenten (A07), null wenn keiner existiert. */
  workspacePath: string | null;
  /** Maskottchen-Avatar (A31), null wenn keiner geladen werden konnte. */
  avatar: { shape: AvatarShape; color: AvatarColor } | null;
  /** Sichtbarkeit (öffentlich/privat). */
  visibility: "public" | "private";
  /** Darf die angemeldete Person diesen Agenten verwalten? */
  canManage: boolean;
};

/** Die PC-Last der Maschine (A09), verkürzt für die Anzeige. */
export type FleetLoad = {
  /** Aktuelle CPU-Auslastung in Prozent. */
  cpuPercent: number;
  /** Gleitender 30-Sekunden-Durchschnitt der CPU in Prozent. */
  cpuAverage30sPercent: number;
  /** Freier Arbeitsspeicher in GB. */
  ramFreeGb: number;
  /** Gesamter Arbeitsspeicher in GB. */
  ramTotalGb: number;
  /** Freier Speicherplatz auf dem Systemlaufwerk in GB. */
  diskFreeGb: number;
  /** Anzahl laufender CLI-Prozesse. */
  cliProcessCount: number;
  /** Drosselt der Monitor gerade (dann startet kein neuer Turn)? */
  throttled: boolean;
  /** Deutsche Begründung der Drosselung, falls aktiv. */
  reason: string | null;
};

/** Die Summen oben über der Tabelle. */
export type FleetSummary = {
  total: number;
  running: number;
  queued: number;
  waitingApproval: number;
  sleeping: number;
  idle: number;
  error: number;
  tokensToday: number;
  costTodayUsd: number;
};

/** Die vollständige Flotten-Ansicht. */
export type FleetOverview = {
  agents: FleetAgentRow[];
  summary: FleetSummary;
  limits: SchedulerLimits;
  load: FleetLoad;
  /** Zeitpunkt der Messung (ISO). */
  readAt: string;
};

/* ---------------------------------------------------------------------------------------- *
 * Ideen-Backlog
 * ---------------------------------------------------------------------------------------- */

/**
 * Eine Zeile aus `docs/ideen/IDEEN-BACKLOG.md`.
 *
 * Eine Zeile = eine Idee = ein Agent. Das Format ist bewusst schlicht, damit
 * Stefan das Dokument in einem Texteditor pflegen kann:
 *
 * ```text
 * | I1 | Nutzung & Limits aus T3 | codex | Nova Limits | Baut die Nutzungsansicht |
 * ```
 *
 * Die Reihenfolge der Spalten ist: `ID | Idee | CLI | Agentenname | Kurzbeschreibung`.
 * `CLI`, `Agentenname` und `Kurzbeschreibung` dürfen fehlen — dann werden sie
 * abgeleitet (CLI: `codex`, Name: aus der Idee, Beschreibung: die Idee selbst).
 */
export type FleetIdea = {
  /** Die Ideen-ID, z. B. `I1`. Leer, wenn die Zeile keine ID hat. */
  id: string;
  /** Die Idee selbst (Kurzform). */
  title: string;
  /** Die CLI, auf der der Agent laufen soll. */
  cli: FleetCliId;
  /** Der Name des Agenten. */
  name: string;
  /** Die Rolle des Agenten (Arbeitsanweisung). */
  description: string;
};

/** Das geparste Backlog. */
export type FleetIdeaBook = {
  /** Der Rohtext, aus dem geparst wurde. */
  markdown: string;
  /** Die geparsten Ideen in Dokumentreihenfolge. */
  ideas: FleetIdea[];
  /** Zeilen, die nicht als Idee gelesen werden konnten. */
  skipped: { line: number; text: string; reason: string }[];
};

/* ---------------------------------------------------------------------------------------- *
 * Massen-Anlage
 * ---------------------------------------------------------------------------------------- */

/** Die Anfrage der Massen-Anlage. */
export type FleetBatchRequest = {
  /** Die Ideen, die angelegt werden sollen. */
  ideas: FleetIdea[];
  /**
   * Die Bestätigung.
   *
   * **Pflicht.** Ohne `confirm: true` wird nichts angelegt — die Vorschau in
   * der Oberfläche ist die einzige Vorstufe, und das Anlegen passiert erst
   * nach einem Klick.
   */
  confirm?: boolean;
  /** Sichtbarkeit der neuen Agenten (Standard: privat). */
  visibility?: "public" | "private";
};

/** Ein erfolgreich angelegter Agent. */
export type FleetBatchCreated = {
  /** Die Idee, aus der der Agent entstanden ist. */
  idea: FleetIdea;
  /** Die ID des neuen Agenten. */
  agentId: string;
  /** Der Name des Agenten. */
  name: string;
  /** Der Arbeitsordner, falls angelegt. */
  workspacePath: string | null;
  /** Der gewürfelte Avatar, falls gesetzt. */
  avatar: { shape: AvatarShape; color: AvatarColor } | null;
};

/** Eine Zeile, die nicht angelegt werden konnte. */
export type FleetBatchFailed = {
  idea: FleetIdea;
  reason: string;
};

/** Das Ergebnis der Massen-Anlage. */
export type FleetBatchResult = {
  created: FleetBatchCreated[];
  failed: FleetBatchFailed[];
  /** Anzahl der übergebenen Ideen. */
  requested: number;
  /** Wann die Anlage lief (ISO). */
  createdAt: string;
};
