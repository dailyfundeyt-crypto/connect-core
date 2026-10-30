/**
 * Desktop Routines, Scheduler & Todos Schema (Lane 6).
 *
 * Tabellen für:
 * 1. desktop_routines: Geplante & wiederkehrende Desktop-Routinen (Cron, Once, Natürliche Sprache, Nachholen-Policy)
 * 2. desktop_routine_runs: Historie und Logs der Ausführungen
 * 3. desktop_todos: Aufgaben mit Uhrzeit, App-/URL-Verknüpfung und Erinnerungen (Notch/Toast)
 * 4. desktop_planned_searches: Geplante Suchen (Amazon, YouTube, etc.)
 * 5. desktop_scheduler_state: Zustand des Schedulers, Host-Online-Status, Kill-Switch, Zeitzone
 */

import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { jsonb } from "./json";
import type { DesktopAction } from "../../../../../packages/shared/src/desktop/contracts";

/**
 * 1. Desktop Routines Table.
 * Unterstützt cron und once, natürliche Sprache und Ausführung nur bei Online-Host.
 */
export const desktopRoutines = pgTable(
  "desktop_routines",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    cronExpression: text("cron_expression").notNull(),
    scheduleType: text("schedule_type").notNull().default("cron"), // 'cron' | 'once'
    triggerAt: timestamp("trigger_at", { withTimezone: true }),
    naturalLanguagePrompt: text("natural_language_prompt"),
    enabled: boolean("enabled").notNull().default(true),
    actions: jsonb("actions").$type<DesktopAction[]>().notNull().default([]),
    targetAgentId: text("target_agent_id"),
    catchUpPolicy: text("catch_up_policy").notNull().default("run_once"), // 'run_once' | 'skip' | 'run_all'
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("desktop_routines_enabled_next_run_idx").on(table.enabled, table.nextRunAt),
  ]
);

/**
 * 2. Desktop Routine Runs Table.
 * Protokolliert jede Ausführung einer Routine mit Status, Log und Dauer.
 */
export const desktopRoutineRuns = pgTable(
  "desktop_routine_runs",
  {
    id: text("id").primaryKey(),
    routineId: text("routine_id")
      .notNull()
      .references(() => desktopRoutines.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'killswitch_aborted'
    triggerType: text("trigger_type").notNull().default("scheduled"), // 'scheduled' | 'manual' | 'catch_up'
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    executionLog: jsonb("execution_log").$type<Record<string, unknown>[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("desktop_routine_runs_routine_id_idx").on(table.routineId),
    index("desktop_routine_runs_status_idx").on(table.status),
  ]
);

/**
 * 3. Desktop Todos Table.
 * Aufgaben mit Fälligkeitszeit, URL/App-Bindung und Benachrichtigungen.
 */
export const desktopTodos = pgTable(
  "desktop_todos",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    dueTime: timestamp("due_time", { withTimezone: true }),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    associatedUrl: text("associated_url"),
    associatedApp: text("associated_app"),
    reminderSent: boolean("reminder_sent").notNull().default(false),
    reminderTime: timestamp("reminder_time", { withTimezone: true }),
    reminderChannel: text("reminder_channel").notNull().default("both"), // 'notch_card' | 'toast' | 'both'
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("desktop_todos_due_time_completed_idx").on(table.completed, table.dueTime),
    index("desktop_todos_reminder_idx").on(table.completed, table.reminderSent, table.reminderTime),
  ]
);

/**
 * 4. Desktop Planned Searches Table.
 * Geplante Suchen auf Amazon, YouTube, Google oder in Helium.
 */
export const desktopPlannedSearches = pgTable(
  "desktop_planned_searches",
  {
    id: text("id").primaryKey(),
    query: text("query").notNull(),
    targetPlatform: text("target_platform").notNull().default("web"), // 'amazon' | 'youtube' | 'google' | 'helium' | 'web'
    targetUrl: text("target_url"),
    scheduledTime: timestamp("scheduled_time", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"), // 'pending' | 'executing' | 'completed' | 'failed' | 'canceled'
    preferHelium: boolean("prefer_helium").notNull().default(true),
    actions: jsonb("actions").$type<DesktopAction[]>().notNull().default([]),
    routineId: text("routine_id").references(() => desktopRoutines.id, { onDelete: "set null" }),
    resultSummary: text("result_summary"),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("desktop_planned_searches_status_sched_idx").on(table.status, table.scheduledTime),
  ]
);

/**
 * 5. Desktop Scheduler State Table.
 * Hält den aktuellen Zustand des Desktop-Schedulers (Host-Online-Status, Heartbeat, Kill-Switch).
 */
export const desktopSchedulerState = pgTable("desktop_scheduler_state", {
  id: text("id").primaryKey().default("singleton"),
  hostOnline: boolean("host_online").notNull().default(false),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  lastTickAt: timestamp("last_tick_at", { withTimezone: true }),
  schedulerStatus: text("scheduler_status").notNull().default("running"), // 'running' | 'paused' | 'stopped'
  killSwitchActive: boolean("kill_switch_active").notNull().default(false),
  timezone: text("timezone").notNull().default("Europe/Berlin"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DesktopRoutineRecord = typeof desktopRoutines.$inferSelect;
export type DesktopRoutineInsert = typeof desktopRoutines.$inferInsert;

export type DesktopRoutineRunRecord = typeof desktopRoutineRuns.$inferSelect;
export type DesktopRoutineRunInsert = typeof desktopRoutineRuns.$inferInsert;

export type DesktopTodoRecord = typeof desktopTodos.$inferSelect;
export type DesktopTodoInsert = typeof desktopTodos.$inferInsert;

export type DesktopPlannedSearchRecord = typeof desktopPlannedSearches.$inferSelect;
export type DesktopPlannedSearchInsert = typeof desktopPlannedSearches.$inferInsert;

export type DesktopSchedulerStateRecord = typeof desktopSchedulerState.$inferSelect;
export type DesktopSchedulerStateInsert = typeof desktopSchedulerState.$inferInsert;
