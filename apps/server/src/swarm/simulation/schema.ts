import { boolean, index, integer, numeric, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { jsonb } from "../../db/schema/json";

export const simRuns = pgTable(
  "sim_runs",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    status: text("status").notNull().default("pending"),
    engine: text("engine").notNull().default("native"),
    seed: jsonb("seed").notNull().default({}),
    budgetTokens: integer("budget_tokens").notNull().default(50000),
    usedTokens: integer("used_tokens").notNull().default(0),
    maxTicks: integer("max_ticks").notNull().default(10),
    currentTick: integer("current_tick").notNull().default(0),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sim_runs_status_idx").on(table.status),
    index("sim_runs_engine_idx").on(table.engine),
    index("sim_runs_created_idx").on(table.createdAt),
  ]
);

export const simEntities = pgTable(
  "sim_entities",
  {
    runId: text("run_id").notNull().references(() => simRuns.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    attributes: jsonb("attributes").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.id] }),
    index("sim_entities_run_idx").on(table.runId),
    index("sim_entities_type_idx").on(table.type),
  ]
);

export const simRelations = pgTable(
  "sim_relations",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull().references(() => simRuns.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    target: text("target").notNull(),
    type: text("type").notNull(),
    weight: numeric("weight", { precision: 6, scale: 3 }).notNull().default("1.000"),
    attributes: jsonb("attributes").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sim_relations_run_idx").on(table.runId),
    index("sim_relations_source_idx").on(table.runId, table.source),
    index("sim_relations_target_idx").on(table.runId, table.target),
  ]
);

export const simTicks = pgTable(
  "sim_ticks",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull().references(() => simRuns.id, { onDelete: "cascade" }),
    tick: integer("tick").notNull(),
    event: text("event"),
    stateSummary: jsonb("state_summary").notNull().default({}),
    decisions: jsonb("decisions").notNull().default([]),
    metrics: jsonb("metrics").notNull().default({}),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sim_ticks_run_tick_idx").on(table.runId, table.tick),
  ]
);

export const simInjections = pgTable(
  "sim_injections",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull().references(() => simRuns.id, { onDelete: "cascade" }),
    tick: integer("tick"),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    applied: boolean("applied").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sim_injections_run_idx").on(table.runId),
  ]
);

export const simReports = pgTable(
  "sim_reports",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull().references(() => simRuns.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    recommendations: jsonb("recommendations").notNull().default([]),
    projections: jsonb("projections").notNull().default({}),
    markdown: text("markdown"),
    privacy: text("privacy").notNull().default("private"),
    disclaimer: text("disclaimer").notNull().default("Simulation, keine Prognosegarantie"),
    councilSessionId: text("council_session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sim_reports_run_idx").on(table.runId),
    index("sim_reports_created_idx").on(table.createdAt),
  ]
);

export type SimRunDbRow = typeof simRuns.$inferSelect;
export type SimEntityDbRow = typeof simEntities.$inferSelect;
export type SimRelationDbRow = typeof simRelations.$inferSelect;
export type SimTickDbRow = typeof simTicks.$inferSelect;
export type SimInjectionDbRow = typeof simInjections.$inferSelect;
export type SimReportDbRow = typeof simReports.$inferSelect;
