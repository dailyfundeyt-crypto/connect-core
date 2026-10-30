/**
 * Connect Desktop Scheduler (Lane 6).
 *
 * Verwaltet den Hintergrund-Scheduler für:
 * 1. desktop_routines (Cron & Once)
 * 2. desktop_planned_searches (Geplante Recherchen & Suchen)
 * 3. desktop_todos (Erinnerungen via Notch-Karte & Windows-Toast)
 *
 * Sicherheits- und Betriebsregeln:
 * - Ausführung NUR wenn Host online (`host_online = true`)
 * - Nachholen-Policy („run_once“ | „skip“ | „run_all“) bei Wiederverbindung
 * - Kill-Switch Respektierung (< 300ms Abbruch)
 * - Standard-Zeitzone: Europe/Berlin
 */

import { randomUUID } from "node:crypto";
import { eq, and, lte, or, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  desktopRoutines,
  desktopRoutineRuns,
  desktopPlannedSearches,
  desktopTodos,
  desktopSchedulerState,
  type DesktopRoutineRecord,
  type DesktopPlannedSearchRecord,
  type DesktopTodoRecord,
} from "../db/schema/desktop-routines";
import {
  type DesktopAction,
  type ActionResultParams,
  type NotchCardShowParams,
  type ToastShowParams,
} from "../../../../packages/shared/src/desktop/contracts";
import {
  DEFAULT_TIMEZONE,
  calculateNextRun,
  type CatchUpPolicy,
  type ScheduleType,
} from "./routines";
import { formatNotchCardForTodo, formatToastForTodo } from "./todos";
import { DesktopBridge } from "./bridge";

export type ActionDispatcher = (
  action: DesktopAction,
  context?: { routineId?: string; plannedSearchId?: string },
) => Promise<ActionResultParams>;

export type NotchCardDispatcher = (params: NotchCardShowParams) => Promise<boolean>;
export type ToastDispatcher = (params: ToastShowParams) => Promise<boolean>;

export interface SchedulerOptions {
  database?: Database;
  bridge?: DesktopBridge;
  timezone?: string;
  tickIntervalMs?: number;
  actionDispatcher?: ActionDispatcher;
  notchCardDispatcher?: NotchCardDispatcher;
  toastDispatcher?: ToastDispatcher;
}

export interface TickResult {
  timestamp: string;
  hostOnline: boolean;
  killSwitchActive: boolean;
  executedRoutinesCount: number;
  missedRoutinesHandled: number;
  executedSearchesCount: number;
  remindersSentCount: number;
  errors: string[];
}

export class DesktopScheduler {
  private db?: Database;
  private bridge?: DesktopBridge;
  private timezone: string;
  private tickIntervalMs: number;
  private timer?: NodeJS.Timeout;

  // Runtime State (wird auch in DB persistiert)
  private isHostOnline = false;
  private isKillSwitchActive = false;
  private actionDispatcher: ActionDispatcher;
  private notchCardDispatcher: NotchCardDispatcher;
  private toastDispatcher: ToastDispatcher;

  constructor(options: SchedulerOptions = {}) {
    this.db = options.database;
    this.bridge = options.bridge;
    this.timezone = options.timezone || DEFAULT_TIMEZONE;
    this.tickIntervalMs = options.tickIntervalMs || 5000;

    // Standard-Dispatcher leitet an DesktopBridge oder Simulierter Host weiter
    this.actionDispatcher =
      options.actionDispatcher ||
      (async (action: DesktopAction) => {
        if (this.bridge) {
          return this.bridge.executeAction(action);
        }
        return {
          actionId: action.id || `act-${randomUUID()}`,
          status: "success",
          executionDurationMs: 10,
          targetDescription: action.targetDescription,
        };
      });

    this.notchCardDispatcher =
      options.notchCardDispatcher ||
      (async (card: NotchCardShowParams) => {
        if (this.bridge) {
          return this.bridge.showCard(card);
        }
        return true;
      });

    this.toastDispatcher =
      options.toastDispatcher ||
      (async (toast: ToastShowParams) => {
        if (this.bridge) {
          return this.bridge.showToast(toast);
        }
        return true;
      });
  }

  public setDatabase(db: Database): void {
    this.db = db;
  }

  public setBridge(bridge: DesktopBridge): void {
    this.bridge = bridge;
  }

  public setHostOnline(online: boolean): void {
    this.isHostOnline = online;
    if (this.db) {
      this.db
        .update(desktopSchedulerState)
        .set({
          hostOnline: online,
          lastHeartbeatAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(desktopSchedulerState.id, "singleton"))
        .catch(() => {});
    }
  }

  public getHostOnline(): boolean {
    return this.isHostOnline;
  }

  public setKillSwitch(active: boolean): void {
    this.isKillSwitchActive = active;
    if (this.db) {
      this.db
        .update(desktopSchedulerState)
        .set({
          killSwitchActive: active,
          updatedAt: new Date(),
        })
        .where(eq(desktopSchedulerState.id, "singleton"))
        .catch(() => {});
    }
  }

  public getKillSwitch(): boolean {
    return this.isKillSwitchActive;
  }

  /**
   * Startet die Scheduler-Tick-Schleife.
   */
  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        console.error("[DesktopScheduler] Tick error:", err);
      });
    }, this.tickIntervalMs);
  }

  /**
   * Stoppt die Scheduler-Tick-Schleife.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Einzelner Scheduler-Durchlauf (Tick).
   * Kann manuell aufgerufen werden (z. B. in Tests).
   */
  public async tick(currentTime = new Date()): Promise<TickResult> {
    const result: TickResult = {
      timestamp: currentTime.toISOString(),
      hostOnline: this.isHostOnline,
      killSwitchActive: this.isKillSwitchActive,
      executedRoutinesCount: 0,
      missedRoutinesHandled: 0,
      executedSearchesCount: 0,
      remindersSentCount: 0,
      errors: [],
    };

    if (!this.db) {
      result.errors.push("No database connected");
      return result;
    }

    // Scheduler-State aktualisieren
    try {
      await this.db
        .insert(desktopSchedulerState)
        .values({
          id: "singleton",
          hostOnline: this.isHostOnline,
          killSwitchActive: this.isKillSwitchActive,
          lastTickAt: currentTime,
          timezone: this.timezone,
        })
        .onConflictDoUpdate({
          target: desktopSchedulerState.id,
          set: {
            hostOnline: this.isHostOnline,
            killSwitchActive: this.isKillSwitchActive,
            lastTickAt: currentTime,
            updatedAt: new Date(),
          },
        });
    } catch {
      // Ignoriere Fehler bei State-Update
    }

    // 1. Kill-Switch Überprüfung (< 300ms)
    if (this.isKillSwitchActive) {
      return result;
    }

    // 2. Host-Online Überprüfung
    // Ausführung nur wenn Host online, sonst nachholen-Policy bei Wiederverbindung!
    if (!this.isHostOnline) {
      return result;
    }

    // 3. Routinen abarbeiten
    try {
      const dueRoutines = await this.db
        .select()
        .from(desktopRoutines)
        .where(
          and(
            eq(desktopRoutines.enabled, true),
            or(
              // Cron: nextRunAt <= now
              and(
                eq(desktopRoutines.scheduleType, "cron"),
                lte(desktopRoutines.nextRunAt, currentTime),
              ),
              // Once: triggerAt <= now und noch nicht ausgeführt
              and(
                eq(desktopRoutines.scheduleType, "once"),
                lte(desktopRoutines.triggerAt, currentTime),
                isNull(desktopRoutines.lastRunAt),
              ),
            ),
          ),
        );

      for (const routine of dueRoutines) {
        if (this.isKillSwitchActive) break;

        // Double-check Fälligkeit
        const isDue =
          (routine.scheduleType === "cron" &&
            routine.nextRunAt &&
            routine.nextRunAt.getTime() <= currentTime.getTime()) ||
          (routine.scheduleType === "once" &&
            routine.triggerAt &&
            routine.triggerAt.getTime() <= currentTime.getTime() &&
            !routine.lastRunAt);
        if (!isDue) continue;

        const isCatchUp = routine.lastRunAt
          ? currentTime.getTime() - (routine.nextRunAt?.getTime() ?? 0) > 60000
          : false;

        // Prüfe Nachholen-Policy
        const policy: CatchUpPolicy = (routine.catchUpPolicy as CatchUpPolicy) || "run_once";
        if (isCatchUp && policy === "skip") {
          result.missedRoutinesHandled++;
          // Überspringen: Nächsten Zeitpunkt berechnen
          const nextRun = calculateNextRun(
            routine.cronExpression,
            routine.scheduleType as ScheduleType,
            routine.triggerAt,
            currentTime,
            this.timezone,
          );
          await this.db
            .update(desktopRoutines)
            .set({ nextRunAt: nextRun, updatedAt: new Date() })
            .where(eq(desktopRoutines.id, routine.id));
          continue;
        }

        // Führe Routine aus
        await this.executeRoutine(routine, isCatchUp ? "catch_up" : "scheduled", currentTime);
        result.executedRoutinesCount++;
        if (isCatchUp) result.missedRoutinesHandled++;
      }
    } catch (err: any) {
      result.errors.push(`Routines error: ${err.message || String(err)}`);
    }

    // 4. Geplante Suchen abarbeiten
    try {
      const dueSearches = await this.db
        .select()
        .from(desktopPlannedSearches)
        .where(
          and(
            eq(desktopPlannedSearches.status, "pending"),
            lte(desktopPlannedSearches.scheduledTime, currentTime),
          ),
        );

      for (const search of dueSearches) {
        if (this.isKillSwitchActive) break;
        if (search.scheduledTime && search.scheduledTime.getTime() > currentTime.getTime()) continue;
        await this.executePlannedSearch(search, currentTime);
        result.executedSearchesCount++;
      }
    } catch (err: any) {
      result.errors.push(`Planned search error: ${err.message || String(err)}`);
    }

    // 5. Todos & Erinnerungen abarbeiten
    try {
      const dueTodos = await this.db
        .select()
        .from(desktopTodos)
        .where(
          and(
            eq(desktopTodos.completed, false),
            eq(desktopTodos.reminderSent, false),
            or(
              lte(desktopTodos.reminderTime, currentTime),
              and(isNull(desktopTodos.reminderTime), lte(desktopTodos.dueTime, currentTime)),
            ),
          ),
        );

      for (const todo of dueTodos) {
        if (this.isKillSwitchActive) break;
        const targetTime = todo.reminderTime || todo.dueTime;
        if (targetTime && targetTime.getTime() > currentTime.getTime()) continue;
        await this.dispatchTodoReminder(todo);
        result.remindersSentCount++;
      }
    } catch (err: any) {
      result.errors.push(`Reminders error: ${err.message || String(err)}`);
    }

    return result;
  }

  /**
   * Führt eine Routine aus und protokolliert in desktop_routine_runs.
   */
  private async executeRoutine(
    routine: DesktopRoutineRecord,
    triggerType: "scheduled" | "manual" | "catch_up",
    now: Date,
  ): Promise<void> {
    if (!this.db) return;

    const runId = `run-${randomUUID()}`;
    const startedAt = new Date();
    const executionLog: Record<string, unknown>[] = [];
    let status: "success" | "failed" | "killswitch_aborted" = "success";
    let errorMessage: string | undefined;

    // Initialer Run-Eintrag
    await this.db.insert(desktopRoutineRuns).values({
      id: runId,
      routineId: routine.id,
      status: "running",
      triggerType,
      startedAt,
    });

    const actions = (routine.actions as DesktopAction[]) || [];

    for (const action of actions) {
      if (this.isKillSwitchActive) {
        status = "killswitch_aborted";
        errorMessage = "Abgebrochen durch Not-Aus (Kill-Switch)";
        executionLog.push({ action: action.type, status: "killswitch_aborted" });
        break;
      }

      try {
        const actionResult = await this.actionDispatcher(action, { routineId: routine.id });
        executionLog.push({
          action: action.type,
          status: actionResult.status,
          targetDescription: action.targetDescription,
          durationMs: actionResult.executionDurationMs,
        });
        if (actionResult.status === "failed") {
          status = "failed";
          errorMessage = actionResult.error || "Aktion fehlgeschlagen";
        }
      } catch (err: any) {
        status = "failed";
        errorMessage = err.message || String(err);
        executionLog.push({ action: action.type, status: "failed", error: errorMessage });
      }
    }

    // Run-Eintrag finalisieren
    await this.db
      .update(desktopRoutineRuns)
      .set({
        status,
        finishedAt: new Date(),
        error: errorMessage ?? null,
        executionLog,
      })
      .where(eq(desktopRoutineRuns.id, runId));

    // Routine aktualisieren
    const scheduleType = routine.scheduleType as ScheduleType;
    let nextRun: Date | null = null;
    let enabled = routine.enabled;

    if (scheduleType === "once") {
      enabled = false; // Einmalige Routine deaktivieren
    } else {
      nextRun = calculateNextRun(
        routine.cronExpression,
        scheduleType,
        routine.triggerAt,
        now,
        this.timezone,
      );
    }

    await this.db
      .update(desktopRoutines)
      .set({
        lastRunAt: now,
        nextRunAt: nextRun,
        enabled,
        updatedAt: new Date(),
      })
      .where(eq(desktopRoutines.id, routine.id));
  }

  /**
   * Führt eine geplante Suche aus.
   */
  private async executePlannedSearch(
    search: DesktopPlannedSearchRecord,
    now: Date,
  ): Promise<void> {
    if (!this.db) return;

    await this.db
      .update(desktopPlannedSearches)
      .set({ status: "executing", updatedAt: new Date() })
      .where(eq(desktopPlannedSearches.id, search.id));

    const actions = (search.actions as DesktopAction[]) || [];
    let success = true;
    let error: string | undefined;

    for (const action of actions) {
      if (this.isKillSwitchActive) {
        success = false;
        error = "Not-Aus";
        break;
      }
      try {
        await this.actionDispatcher(action, { plannedSearchId: search.id });
      } catch (err: any) {
        success = false;
        error = err.message || String(err);
      }
    }

    await this.db
      .update(desktopPlannedSearches)
      .set({
        status: success ? "completed" : "failed",
        executedAt: now,
        resultSummary: success ? `Suche nach "${search.query}" geöffnet.` : undefined,
        error: error ?? null,
        updatedAt: new Date(),
      })
      .where(eq(desktopPlannedSearches.id, search.id));
  }

  /**
   * Sendet eine Todo-Erinnerung per Notch-Karte und/oder Windows-Toast.
   */
  private async dispatchTodoReminder(todo: DesktopTodoRecord): Promise<void> {
    if (!this.db) return;

    const channel = todo.reminderChannel || "both";

    if (channel === "notch_card" || channel === "both") {
      const card = formatNotchCardForTodo(todo);
      await this.notchCardDispatcher(card);
    }

    if (channel === "toast" || channel === "both") {
      const toast = formatToastForTodo(todo);
      await this.toastDispatcher(toast);
    }

    await this.db
      .update(desktopTodos)
      .set({
        reminderSent: true,
        updatedAt: new Date(),
      })
      .where(eq(desktopTodos.id, todo.id));
  }
}
