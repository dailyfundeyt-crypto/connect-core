/**
 * Flotten-Client (Lane A36).
 *
 * EIGENTÜMER: A36.
 *
 * Der einzige Ort, an dem die Oberfläche mit dem Flotten-Backend spricht.
 * Es wird **nicht** über `@/lib/t3/client` gelaufen: der T3-Client (A21) ist
 * für die Sidecar-Endpunkte zuständig, die Flotte hat eigene Routen
 * (`/api/t3/fleet`) mit eigenen Nutzlasten.
 *
 * Zwei Aufgaben, die auseinandergehören und deshalb getrennt sind:
 *
 *  1. `fetchFleetOverview` — **lesen**. Darf jederzeit.
 *  2. `batchCreateAgents` — **schreiben**. Braucht `confirm: true`, sonst
 *     wird nichts angelegt. Diese Trennung ist die Absicherung: die
 *     Vorschau im Dialog ruft `previewIdeas` auf, und nur der Klick auf
 *     „Anlegen“ ruft `batchCreateAgents` mit `confirm: true`.
 */

import { client } from "@/lib/client";

/* ---------------------------------------------------------------------------------------- *
 * Typen (spiegeln `apps/server/src/t3-bridge/fleet/types.ts`)
 * ---------------------------------------------------------------------------------------- */

export const FLEET_CLI_IDS = [
  "antigravity",
  "codex",
  "claude",
  "hermes",
  "freebuff",
] as const;

export type FleetCliId = (typeof FLEET_CLI_IDS)[number];

export const FLEET_CLI_LABELS: Record<FleetCliId, string> = {
  antigravity: "Antigravity",
  codex: "Codex",
  claude: "Claude",
  hermes: "Hermes",
  freebuff: "Freebuff",
};

/** Der Laufzustand eines Agenten (A01 `AgentRuntimeState`). */
export type FleetAgentStateName =
  | "idle"
  | "queued"
  | "running"
  | "waiting_approval"
  | "sleeping"
  | "error";

export type FleetAgentRow = {
  agentId: string;
  name: string;
  title: string;
  cli: string | null;
  provider: string;
  state: FleetAgentStateName;
  queuePosition: number | null;
  tokensToday: number;
  costTodayUsd: number;
  lastActivityAt: string | null;
  workspacePath: string | null;
  avatar: { shape: string; color: string } | null;
  visibility: "public" | "private";
  canManage: boolean;
};

export type FleetLoad = {
  cpuPercent: number;
  cpuAverage30sPercent: number;
  ramFreeGb: number;
  ramTotalGb: number;
  diskFreeGb: number;
  cliProcessCount: number;
  throttled: boolean;
  reason: string | null;
};

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

export type FleetLimits = {
  maxConcurrentTurns: number;
  maxConcurrentPerProvider: number;
  queueTimeoutMinutes: number;
  idleSessionTimeoutMinutes: number;
  maxAwakeAgents: number;
};

export type FleetOverview = {
  agents: FleetAgentRow[];
  summary: FleetSummary;
  limits: FleetLimits;
  load: FleetLoad;
  readAt: string;
};

/** Eine Idee aus dem Backlog. */
export type FleetIdea = {
  id: string;
  title: string;
  cli: FleetCliId;
  name: string;
  description: string;
};

/** Eine Zeile, die der Parser nicht lesen konnte. */
export type FleetIdeaSkip = {
  line: number;
  text: string;
  reason: string;
};

export type FleetBatchCreated = {
  idea: FleetIdea;
  agentId: string;
  name: string;
  workspacePath: string | null;
  avatar: { shape: string; color: string } | null;
};

export type FleetBatchFailed = {
  idea: FleetIdea;
  reason: string;
};

export type FleetBatchResult = {
  created: FleetBatchCreated[];
  failed: FleetBatchFailed[];
  requested: number;
  createdAt: string;
};

/* ---------------------------------------------------------------------------------------- *
 * Die Aufrufe
 * ---------------------------------------------------------------------------------------- */

/** Die Basis-URL der Flotten-Routen. */
export const FLEET_BASE_PATH = "/api/t3/fleet";

/** Liest die Flotten-Ansicht. */
export async function fetchFleetOverview(): Promise<FleetOverview> {
  return client<FleetOverview>(FLEET_BASE_PATH, {
    unwrap: true,
    fallback: "Die Flotten-Ansicht konnte nicht geladen werden.",
  });
}

/**
 * Liest das Backlog und liefert die Vorschau.
 *
 * Der Pfad ist optional: ohne ihn liest der Server sein Standarddokument
 * (`docs/ideen/IDEEN-BACKLOG.md`).
 */
export async function previewIdeas(options?: {
  path?: string;
  markdown?: string;
}): Promise<{ ideas: FleetIdea[]; skipped: FleetIdeaSkip[]; count: number }> {
  return client<{ ideas: FleetIdea[]; skipped: FleetIdeaSkip[]; count: number }>(
    `${FLEET_BASE_PATH}/parse-backlog`,
    {
      method: "POST",
      unwrap: true,
      body: {
        ...(options?.path ? { path: options.path } : {}),
        ...(options?.markdown ? { markdown: options.markdown } : {}),
      },
      fallback: "Das Ideen-Backlog konnte nicht gelesen werden.",
    },
  );
}

/**
 * Legt Agenten an.
 *
 * `confirm: false` (der Standard) legt **nichts** an — der Server prüft das
 * genauso. Es gibt keine Möglichkeit, durch Weglassen des Flags Agenten
 * anzulegen.
 */
export async function batchCreateAgents(options: {
  ideas: FleetIdea[];
  confirm: boolean;
  visibility?: "public" | "private";
}): Promise<FleetBatchResult> {
  return client<FleetBatchResult>(`${FLEET_BASE_PATH}/batch-create`, {
    method: "POST",
    unwrap: true,
    body: {
      ideas: options.ideas,
      confirm: options.confirm,
      visibility: options.visibility ?? "private",
    },
    fallback: "Die Agenten konnten nicht angelegt werden.",
  });
}
