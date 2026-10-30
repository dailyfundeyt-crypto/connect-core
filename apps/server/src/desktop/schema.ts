/**
 * Connect Desktop Database Schema (Lane 5).
 * Tables:
 *   - desktop_sessions (0190)
 *   - desktop_intents (0191)
 *   - desktop_action_queue (0192)
 *   - desktop_bridge_auth (0193)
 *   - desktop_agent_capabilities (0194)
 */

import { boolean, doublePrecision, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { jsonb } from "../db/schema/json";

export const desktopSessions = pgTable("desktop_sessions", {
  id: text("id").primaryKey(),
  sessionType: text("session_type").notNull(),
  status: text("status").notNull().default("active"),
  metadata: jsonb("metadata").notNull().default({}),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const desktopIntents = pgTable("desktop_intents", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => desktopSessions.id, { onDelete: "set null" }),
  rawInput: text("raw_input").notNull(),
  intentType: text("intent_type").notNull(), // 'local_action' | 'agent_task' | 'schedule' | 'answer'
  confidence: doublePrecision("confidence").notNull().default(1.0),
  suggestedAction: jsonb("suggested_action"),
  agentTask: jsonb("agent_task"),
  schedule: jsonb("schedule"),
  explanation: text("explanation"),
  modelUsed: text("model_used").notNull().default("local_heuristic"),
  classifiedAt: timestamp("classified_at", { withTimezone: true }).notNull().defaultNow(),
});

export const desktopActionQueue = pgTable("desktop_action_queue", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => desktopSessions.id, { onDelete: "set null" }),
  agentId: text("agent_id"),
  actionType: text("action_type").notNull(),
  riskLevel: text("risk_level").notNull().default("act"),
  payload: jsonb("payload").notNull().default({}),
  status: text("status").notNull().default("pending"),
  resultData: jsonb("result_data"),
  errorMessage: text("error_message"),
  executionDurationMs: doublePrecision("execution_duration_ms"),
  requiresConfirmation: boolean("requires_confirmation").notNull().default(false),
  confirmationToken: text("confirmation_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  executedAt: timestamp("executed_at", { withTimezone: true }),
});

export const desktopBridgeAuth = pgTable("desktop_bridge_auth", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  clientName: text("client_name").notNull().default("connect-desktop-host"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const desktopAgentCapabilities = pgTable("desktop_agent_capabilities", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  capability: text("capability").notNull(),
  allowed: boolean("allowed").notNull().default(true),
  constraints: jsonb("constraints").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
