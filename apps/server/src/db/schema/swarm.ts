/**
 * Swarm-Controller Database Schema (Phase E Schritt 20 / Agent B).
 *
 * Tabellen zur persistenten Speicherung der Swarm-Aufgaben und -Ergebnisse in Postgres 5544.
 * Ermöglicht Wiederaufnahme von Aufgaben nach Server-Neustart.
 */

import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { jsonb } from "./json";

export const swarmTasks = pgTable("swarm_tasks", {
  id: text("id").primaryKey(),
  runId: text("run_id"),
  agentId: text("agent_id").notNull().default("auto"),
  title: text("title").notNull(),
  action: text("action").notNull(),
  params: jsonb("params").notNull(),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("queued"),
  assignedWorkerId: text("assigned_worker_id"),
  assignedProfileDir: text("assigned_profile_dir"),
  assignedCdpPort: integer("assigned_cdp_port"),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(2),
  recoveredFromCrash: boolean("recovered_from_crash").notNull().default(false),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
});

export const swarmResults = pgTable("swarm_results", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => swarmTasks.id, { onDelete: "cascade" }),
  runId: text("run_id"),
  agentId: text("agent_id").notNull(),
  agentName: text("agent_name"),
  action: text("action").notNull(),
  ok: boolean("ok").notNull(),
  url: text("url"),
  title: text("title"),
  output: text("output"),
  error: text("error"),
  screenshotRef: text("screenshot_ref"),
  durationMs: integer("duration_ms").notNull().default(0),
  retries: integer("retries").notNull().default(0),
  recoveredFromCrash: boolean("recovered_from_crash").notNull().default(false),
  systemMetrics: jsonb("system_metrics"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
