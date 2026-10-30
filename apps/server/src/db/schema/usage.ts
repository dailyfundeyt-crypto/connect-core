import { sql } from "drizzle-orm";
import {
  bigint,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/**
 * 0160: cli_accounts
 * Registry of CLI accounts across local and per-agent homes.
 * Isolation: 'per_agent' (Codex, Claude) vs 'shared' (Antigravity, Gemini, Hermes, Freebuff).
 */
export const cliAccounts = pgTable(
  "cli_accounts",
  {
    id: text("id").primaryKey(),
    cliKind: text("cli_kind").notNull(),
    label: text("label").notNull(),
    homePath: text("home_path").notNull(),
    isolation: text("isolation").notNull().default("per_agent"), // 'per_agent' | 'shared'
    planType: text("plan_type"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("cli_accounts_cli_kind_idx").on(table.cliKind),
    index("cli_accounts_isolation_idx").on(table.isolation),
  ]
);

/**
 * 0161: cli_usage_samples
 * Individual usage snapshots collected from jsonl rollout/event logs, stdout hooks, or runtime counters.
 * Idempotence is guaranteed by UNIQUE(source_file, offset).
 */
export const cliUsageSamples = pgTable(
  "cli_usage_samples",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id"),
    cliKind: text("cli_kind").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => cliAccounts.id, { onDelete: "cascade" }),
    sessionId: text("session_id"),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    source: text("source").notNull().default("jsonl"), // 'jsonl' | 'stdout' | 'runtime'
    rawRef: text("raw_ref"),
    sourceFile: text("source_file"),
    offset: bigint("offset", { mode: "number" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("cli_usage_samples_source_offset_unique").on(
      table.sourceFile,
      table.offset
    ),
    index("cli_usage_samples_account_id_idx").on(table.accountId),
    index("cli_usage_samples_agent_id_idx").on(table.agentId),
    index("cli_usage_samples_ts_idx").on(table.ts),
    index("cli_usage_samples_cli_kind_idx").on(table.cliKind),
  ]
);

/**
 * 0162: cli_quota_windows
 * High-confidence quota window tracking.
 * Codex: exact rate limits with epoch resets_at.
 * Claude: estimated rolling 5h heuristic window.
 */
export const cliQuotaWindows = pgTable(
  "cli_quota_windows",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => cliAccounts.id, { onDelete: "cascade" }),
    limitId: text("limit_id").notNull(),
    windowKind: text("window_kind").notNull(), // 'primary' | 'secondary' | 'heuristic_5h' | 'daily'
    windowMinutes: integer("window_minutes").notNull(),
    usedPercent: doublePrecision("used_percent").notNull(),
    resetsAt: text("resets_at"), // epoch seconds string/number or ISO timestamp string
    confidence: text("confidence").notNull(), // 'exact' | 'estimated'
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    planType: text("plan_type"),
  },
  (table) => [
    index("cli_quota_windows_account_limit_idx").on(
      table.accountId,
      table.limitId
    ),
    index("cli_quota_windows_observed_at_idx").on(table.observedAt),
  ]
);

export type DbCliAccount = typeof cliAccounts.$inferSelect;
export type NewDbCliAccount = typeof cliAccounts.$inferInsert;
export type DbCliUsageSample = typeof cliUsageSamples.$inferSelect;
export type NewDbCliUsageSample = typeof cliUsageSamples.$inferInsert;
export type DbCliQuotaWindow = typeof cliQuotaWindows.$inferSelect;
export type NewDbCliQuotaWindow = typeof cliQuotaWindows.$inferInsert;
