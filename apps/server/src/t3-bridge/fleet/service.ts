/**
 * T3-Bridge — Flotten-Service (Lane A36).
 *
 * EIGENTÜMER: A36.
 *
 * Der Service ist die einzige Stelle, die aus den Bausteinen der anderen
 * Lanes eine Flotten-Ansicht macht:
 *
 *  - A07 (Workspaces) → der Arbeitsordner je Agent
 *  - A08 (Scheduler)  → Zustand, Warteschlangenposition, Limits
 *  - A09 (Monitor)    → PC-Last (CPU, RAM, Platte, CLI-Prozesse)
 *  - A17 (Usage)      → Tokens und Kosten von heute
 *  - A31 (Avatar)     → das Maskottchen je Agent
 *
 * Und der einzige Ort, der Agenten **anlegt** — die Massen-Anlage aus dem
 * Ideen-Backlog.
 *
 * Zwei Grundsätze:
 *
 *  1. **Nichts wird ohne Bestätigung angelegt.** `createFromIdeas` legt ohne
 *     `confirm: true` nichts an und liefert stattdessen eine Vorschau. Die
 *     Oberfläche nutzt genau diese Vorschau für ihren Dialog.
 *  2. **Der Service kennt keine HTTP-Sprache.** Er nimmt Werte entgegen und
 *     gibt Werte zurück. Die Routen (`routes.ts`) übersetzen nur.
 *
 * Alle Abhängigkeiten sind **injizierbar**, damit die Tests ohne Datenbank,
 * ohne Scheduler und ohne Dateisystem laufen.
 */

import { randomAvatar } from "../../agent-avatar/defaults";
import type { AgentActor, AgentProfile, CreateAgentInput } from "../../agents/profile-types";
import type { AgentProfileStore } from "../../agents/profile-store";
import {
  DEFAULT_SCHEDULER_LIMITS,
  type AvatarColor,
  type AvatarShape,
  type FleetAgentState,
} from "../contracts";
import type { DetailedResourceMetrics } from "../monitor/types";
import type { AgentWorkspace } from "../workspaces/types";

import { dedupeIdeas } from "./backlog-parser";
import {
  type FleetAgentRow,
  type FleetBatchCreated,
  type FleetBatchFailed,
  type FleetBatchRequest,
  type FleetBatchResult,
  type FleetIdea,
  type FleetLoad,
  type FleetOverview,
  type FleetSummary,
} from "./types";

/* ---------------------------------------------------------------------------------------- *
 * Schnittstellen (injizierbar)
 * ---------------------------------------------------------------------------------------- */

/** Was der Service über den Scheduler braucht. */
export type FleetSchedulerSource = {
  /** Die Zustände aller Agenten (A08). */
  getFleetStates(): FleetAgentState[];
  /** Die aktuellen Limits. */
  getLimits?(): typeof DEFAULT_SCHEDULER_LIMITS;
};

/** Was der Service über den Ressourcen-Monitor braucht (A09). */
export type FleetMetricsSource = {
  /** Die detaillierten Metriken der Maschine. */
  getDetailedMetrics(): DetailedResourceMetrics;
};

/** Was der Service über die Nutzung braucht (A17). */
export type FleetUsageSource = {
  /**
   * Tokens und Kosten je Agent für den heutigen Tag.
   *
   * Die Rückgabe ist eine Map, weil die Agenten, die heute nichts verbraucht
   * haben, dort schlicht fehlen — nicht mit `0` gefüllt werden müssen.
   */
  tokensTodayByAgent(): Promise<Map<string, { tokens: number; costUsd: number }>>;
};

/** Was der Service über die Arbeitsordner braucht (A07). */
export type FleetWorkspaceSource = {
  /** Alle registrierten Arbeitsordner. */
  list(): Promise<AgentWorkspace[]>;
  /**
   * Sorgt für den Arbeitsordner eines neuen Agenten.
   *
   * Gibt `null` zurück, wenn kein Ordner angelegt wurde (Flag aus, Fehler).
   */
  ensure(input: { agentId: string; agentName: string }): Promise<string | null>;
};

/** Was der Service über die Avatare braucht (A31). */
export type FleetAvatarSource = {
  /**
   * Vergibt einem neuen Agenten einen zufälligen Avatar.
   *
   * Gibt `null` zurück, wenn kein Avatar gesetzt werden konnte — der Agent
   * existiert dann trotzdem, nur eben ohne Maskottchen.
   */
  assignRandom(agentId: string): Promise<{ shape: string; color: string } | null>;
};

/** Wie ein Agent angelegt wird. */
export type FleetAgentCreator = (
  actor: AgentActor,
  input: CreateAgentInput,
) => Promise<{ id: string; name: string }>;

/** Die Optionen des Flotten-Service. */
export type FleetServiceOptions = {
  /** Die Agenten-Profile (Store). */
  agents?: AgentProfileStore;
  /** Wie ein Agent angelegt wird. Standard: über `agents.create`. */
  createAgent?: FleetAgentCreator;
  scheduler?: FleetSchedulerSource;
  metrics?: FleetMetricsSource;
  usage?: FleetUsageSource;
  workspaces?: FleetWorkspaceSource;
  avatars?: FleetAvatarSource;
  /** Die Uhr (Tests). */
  now?: () => Date;
  /** Der Zufall für die Avatare (Tests). */
  random?: () => number;
};

/* ---------------------------------------------------------------------------------------- *
 * Hilfsfunktionen
 * ---------------------------------------------------------------------------------------- */

/**
 * Der Tag, für den „Tokens von heute“ gezählt wird.
 *
 * Europe/Berlin, weil Stefan in Deutschland sitzt und die Tagesgrenze
 * dort fallen soll — nicht in UTC.
 */
export function todayInBerlin(now: Date): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Was ein Agent ohne Scheduler-Eintrag anzeigt.
 *
 * Ein Agent, der im Roster steht, aber nie gelaufen ist, ist kein Fehler —
 * er ist `idle`. Der Scheduler kennt nur Agenten, die schon eine Session
 * hatten.
 */
const EMPTY_STATE = {
  state: "idle",
  provider: "legacy",
  queuePosition: null,
  tokens: 0,
  costUsd: 0,
  lastActivityAt: null,
} as const;

/** Baut die Übersicht über alle Zustände. */
export function summarizeFleet(rows: readonly FleetAgentRow[]): FleetSummary {
  const summary: FleetSummary = {
    total: rows.length,
    running: 0,
    queued: 0,
    waitingApproval: 0,
    sleeping: 0,
    idle: 0,
    error: 0,
    tokensToday: 0,
    costTodayUsd: 0,
  };

  for (const row of rows) {
    switch (row.state) {
      case "running":
        summary.running += 1;
        break;
      case "queued":
        summary.queued += 1;
        break;
      case "waiting_approval":
        summary.waitingApproval += 1;
        break;
      case "sleeping":
        summary.sleeping += 1;
        break;
      case "error":
        summary.error += 1;
        break;
      case "idle":
      default:
        summary.idle += 1;
        break;
    }
    summary.tokensToday += row.tokensToday;
    summary.costTodayUsd += row.costTodayUsd;
  }

  summary.costTodayUsd = Number(summary.costTodayUsd.toFixed(6));
  return summary;
}

/** Die PC-Last, verkürzt aus den A09-Metriken. */
export function toFleetLoad(metrics: DetailedResourceMetrics): FleetLoad {
  return {
    cpuPercent: metrics.cpu.currentPercent,
    cpuAverage30sPercent: metrics.cpu.average30sPercent,
    ramFreeGb: metrics.ram.freeGb,
    ramTotalGb: metrics.ram.totalGb,
    diskFreeGb: metrics.disk.freeGb,
    cliProcessCount: metrics.cliProcesses.count,
    throttled: metrics.throttled,
    reason: metrics.reason ?? null,
  };
}

/* ---------------------------------------------------------------------------------------- *
 * Der Service
 * ---------------------------------------------------------------------------------------- */

export class FleetService {
  readonly #agents: AgentProfileStore | null;
  readonly #createAgent: FleetAgentCreator | null;
  readonly #scheduler: FleetSchedulerSource | null;
  readonly #metrics: FleetMetricsSource | null;
  readonly #usage: FleetUsageSource | null;
  readonly #workspaces: FleetWorkspaceSource | null;
  readonly #avatars: FleetAvatarSource | null;
  readonly #now: () => Date;
  readonly #random: () => number;

  constructor(options: FleetServiceOptions = {}) {
    this.#agents = options.agents ?? null;
    this.#createAgent = options.createAgent ?? null;
    this.#scheduler = options.scheduler ?? null;
    this.#metrics = options.metrics ?? null;
    this.#usage = options.usage ?? null;
    this.#workspaces = options.workspaces ?? null;
    this.#avatars = options.avatars ?? null;
    this.#now = options.now ?? (() => new Date());
    this.#random = options.random ?? Math.random;
  }

  /**
   * Die Flotten-Ansicht.
   *
   * Fehlt eine Quelle (kein Scheduler, kein Monitor, …), liefert die Ansicht
   * die entsprechenden Teile leer bzw. mit Nullwerten. Das ist Absicht: die
   * Ansicht soll auch ohne T3-Brücke etwas anzeigen, statt zu verschwinden.
   */
  async overview(actor: AgentActor): Promise<FleetOverview> {
    const profiles = this.#agents ? await this.#agents.list(actor) : [];

    const states = new Map<string, FleetAgentState>();
    if (this.#scheduler) {
      for (const state of this.#scheduler.getFleetStates()) {
        states.set(state.agentId, state);
      }
    }

    const usage = this.#usage ? await this.#usage.tokensTodayByAgent() : new Map();

    const workspaceByAgent = new Map<string, AgentWorkspace>();
    if (this.#workspaces) {
      try {
        for (const workspace of await this.#workspaces.list()) {
          workspaceByAgent.set(workspace.agentId, workspace);
        }
      } catch {
        // Kein Zugriff auf die Registry → die Spalte bleibt leer.
      }
    }

    const rows: FleetAgentRow[] = profiles.map((profile) =>
      this.#toRow(profile, states, usage, workspaceByAgent),
    );

    const metrics = this.#metrics?.getDetailedMetrics();
    const load: FleetLoad = metrics
      ? toFleetLoad(metrics)
      : {
          cpuPercent: 0,
          cpuAverage30sPercent: 0,
          ramFreeGb: 0,
          ramTotalGb: 0,
          diskFreeGb: 0,
          cliProcessCount: 0,
          throttled: false,
          reason: null,
        };

    return {
      agents: rows,
      summary: summarizeFleet(rows),
      limits: this.#scheduler?.getLimits?.() ?? DEFAULT_SCHEDULER_LIMITS,
      load,
      readAt: this.#now().toISOString(),
    };
  }

  /** Ein Agent als Zeile der Flotten-Ansicht. */
  #toRow(
    profile: AgentProfile,
    states: Map<string, FleetAgentState>,
    usage: Map<string, { tokens: number; costUsd: number }>,
    workspaceByAgent: Map<string, AgentWorkspace>,
  ): FleetAgentRow {
    const state = states.get(profile.id);
    const used = usage.get(profile.id);
    const workspace = workspaceByAgent.get(profile.id);

    return {
      agentId: profile.id,
      name: profile.name,
      title: profile.title,
      cli: profile.chosenCli ?? null,
      provider: state?.provider ?? EMPTY_STATE.provider,
      state: state?.state ?? EMPTY_STATE.state,
      queuePosition: state?.queuePosition ?? null,
      tokensToday: used?.tokens ?? state?.tokens ?? 0,
      costTodayUsd: used?.costUsd ?? state?.costUsd ?? 0,
      lastActivityAt: state?.lastActivityAt ?? null,
      workspacePath: workspace?.path ?? null,
      avatar: null,
      visibility: profile.visibility,
      canManage: true,
    };
  }

  /* -------------------------------------------------------------------------------------- *
   * Massen-Anlage
   * -------------------------------------------------------------------------------------- */

  /**
   * Die **Vorschau** — was angelegt würde, ohne etwas anzulegen.
   *
   * Die Oberfläche zeigt diese Liste im Bestätigungs-Dialog. Erst der
   * Klick auf „Anlegen“ ruft `createFromIdeas` mit `confirm: true` auf.
   */
  async preview(ideas: readonly FleetIdea[]): Promise<FleetIdea[]> {
    const { unique } = dedupeIdeas(ideas);
    return unique;
  }

  /**
   * Legt Agenten aus Ideen an.
   *
   * **Ohne `confirm: true` wird nichts angelegt.** Der Rückgabewert ist dann
   * eine leere Anlage — kein Fehler, aber auch kein Agent. Das ist die
   * Absicherung: die Vorschau allein genügt nicht, es braucht den Klick.
   */
  async createFromIdeas(
    actor: AgentActor,
    request: FleetBatchRequest,
  ): Promise<FleetBatchResult> {
    const createdAt = this.#now().toISOString();
    const requested = request.ideas?.length ?? 0;

    if (!request.confirm) {
      return { created: [], failed: [], requested, createdAt };
    }

    if (!this.#createAgent) {
      return {
        created: [],
        failed: (request.ideas ?? []).map((idea) => ({
          idea,
          reason: "Es gibt keine Möglichkeit, Agenten anzulegen (kein Agenten-Store verdrahtet).",
        })),
        requested,
        createdAt,
      };
    }

    const { unique, duplicates } = dedupeIdeas(request.ideas ?? []);
    const failed: FleetBatchFailed[] = duplicates.map((idea) => ({
      idea,
      reason: `Ein Agent mit dem Namen „${idea.name}“ steht schon in dieser Auswahl.`,
    }));

    const created: FleetBatchCreated[] = [];

    for (const idea of unique) {
      try {
        const agent = await this.#createAgent(actor, {
          name: idea.name,
          title: idea.title,
          roleDescription: idea.description,
          visibility: request.visibility ?? "private",
          chosenCli: idea.cli,
          role: idea.description,
          description: idea.description,
        });

        const workspacePath = this.#workspaces
          ? await this.#workspaces
              .ensure({ agentId: agent.id, agentName: agent.name })
              .catch(() => null)
          : null;

        const avatar = this.#avatars
          ? await this.#avatars.assignRandom(agent.id).catch(() => null)
          : null;

        created.push({
          idea,
          agentId: agent.id,
          name: agent.name,
          workspacePath,
          avatar: avatar
            ? {
                shape: avatar.shape as AvatarShape,
                color: avatar.color as AvatarColor,
              }
            : null,
        });
      } catch (error) {
        failed.push({
          idea,
          reason:
            error instanceof Error ? error.message : "Der Agent konnte nicht angelegt werden.",
        });
      }
    }

    return { created, failed, requested, createdAt };
  }

  /**
   * Vergibt einen zufälligen Avatar — ohne den Service von A31 zu brauchen.
   *
   * Wird benutzt, wenn kein Avatar-Store verdrahtet ist: der Wurf ist dann
   * nur eine Vorschau, aber der Agent bekommt trotzdem ein Maskottchen in
   * der Oberfläche.
   */
  randomAvatarDefaults(): { shape: string; color: string } {
    return randomAvatar({ random: this.#random, colorFromHash: true });
  }
}
