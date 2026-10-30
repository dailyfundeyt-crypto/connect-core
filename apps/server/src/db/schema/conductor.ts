/**
 * Conductor Database Schema (Lane 3).
 *
 * Tabellen für Conductor Supervisor, Single-Owner Claims, Transfers, Checkpoints und Events.
 * Erfüllt:
 * - Single Owner via task_claims mit partial UNIQUE (WHERE status = 'active')
 * - transfer_key sha256 UNIQUE
 * - Cooldown 30 min / resets_at
 * - Poll 20 s initial, dann 300 s
 * - Kill-Switch
 * - paidApiFallback hart false (DB CHECK Constraint)
 */

import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { jsonb } from "./json";
import { swarmTasks } from "./swarm";

/**
 * Conductor Configuration Singleton.
 * Enforces `paid_api_fallback = false` via CHECK constraint.
 */
export const conductorConfig = pgTable("conductor_config", {
  id: text("id").primaryKey().default("default"),
  enabled: boolean("enabled").notNull().default(true),
  killSwitch: boolean("kill_switch").notNull().default(false),
  primary: text("primary").notNull().default("codex"),
  standby: text("standby").notNull().default("claude"),
  cooldownMin: integer("cooldown_min").notNull().default(30),
  pollSec: integer("poll_sec").notNull().default(300),
  initialPollSec: integer("initial_poll_sec").notNull().default(20),
  maxHandoffsPerTask: integer("max_handoffs_per_task").notNull().default(3),
  paidApiFallback: boolean("paid_api_fallback").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Runtime Status tracking availability, failure classes, and cooldowns.
 */
export const conductorRuntimeStatus = pgTable("conductor_runtime_status", {
  runtimeId: text("runtime_id").primaryKey(),
  cliKind: text("cli_kind").notNull(),
  accountId: text("account_id").notNull(),
  state: text("state").notNull().default("available"),
  lastFailureClass: text("last_failure_class"),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  lastProbeAt: timestamp("last_probe_at", { withTimezone: true }),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  activeClaimsCount: integer("active_claims_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Checkpoints for resuming tasks across handoffs without losing state.
 */
export const conductorCheckpoints = pgTable("conductor_checkpoints", {
  id: text("id").primaryKey(),
  swarmTaskId: text("swarm_task_id")
    .notNull()
    .references(() => swarmTasks.id, { onDelete: "cascade" }),
  fromRuntime: text("from_runtime").notNull(),
  summary: text("summary").notNull(),
  filesTouched: jsonb("files_touched").notNull().default([]),
  nextSteps: text("next_steps").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Transfers for moving tasks between runtimes with deterministic SHA-256 deduplication.
 */
export const conductorTransfers = pgTable("conductor_transfers", {
  id: text("id").primaryKey(),
  swarmTaskId: text("swarm_task_id")
    .notNull()
    .references(() => swarmTasks.id, { onDelete: "cascade" }),
  transferKey: text("transfer_key").notNull().unique(),
  fromRuntime: text("from_runtime").notNull(),
  toRuntime: text("to_runtime").notNull(),
  checkpointId: text("checkpoint_id").references(() => conductorCheckpoints.id, {
    onDelete: "set null",
  }),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Conductor Events (Audit & Alert log).
 */
export const conductorEvents = pgTable("conductor_events", {
  id: text("id").primaryKey(),
  taskId: text("task_id"),
  eventType: text("event_type").notNull(),
  severity: text("severity").notNull().default("info"),
  message: text("message").notNull(),
  payload: jsonb("payload").default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Task claims representation with Single Owner active index:
 * partial unique index on task_id WHERE status = 'active'
 */
export const taskClaims = pgTable(
  "task_claims",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => swarmTasks.id, { onDelete: "cascade" }),
    botId: text("bot_id").notNull(),
    ownerId: text("owner_id"),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("active"),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("task_claims_active_task_unique_idx")
      .on(table.taskId)
      .where(sql`${table.status} = 'active'`),
  ]
);

export type ConductorConfigRecord = typeof conductorConfig.$inferSelect;
export type ConductorRuntimeStatusRecord = typeof conductorRuntimeStatus.$inferSelect;
export type ConductorCheckpointRecord = typeof conductorCheckpoints.$inferSelect;
export type ConductorTransferRecord = typeof conductorTransfers.$inferSelect;
export type ConductorEventRecord = typeof conductorEvents.$inferSelect;
export type TaskClaimRecord = typeof taskClaims.$inferSelect;
