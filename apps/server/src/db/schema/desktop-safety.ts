/**
 * Connect Desktop Safety, Permissions & Audit-Log Database Schema (Lane 7).
 *
 * Tables:
 *   - desktop_agent_permissions (0200)
 *   - desktop_action_log (0201)
 *   - desktop_confirmation_requests (0202)
 *   - desktop_rate_limits (0203)
 *   - desktop_killswitch_events (0204)
 */

import { boolean, doublePrecision, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { jsonb } from "./json";

/**
 * 0200: desktop_agent_permissions
 * Granular permissions per agent: none, read, act, destructive_with_confirm.
 * Includes allowlists for applications & domains and rate limiting.
 */
export const desktopAgentPermissions = pgTable("desktop_agent_permissions", {
  agentId: text("agent_id").primaryKey(),
  permissionLevel: text("permission_level").notNull().default("none"), // 'none' | 'read' | 'act' | 'destructive_with_confirm'
  allowedApps: jsonb("allowed_apps").notNull().default([]), // string[] e.g. ["notepad.exe", "helium.exe"]
  allowedDomains: jsonb("allowed_domains").notNull().default([]), // string[] e.g. ["youtube.com", "github.com"]
  rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(30),
  isBlocked: boolean("is_blocked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 0201: desktop_action_log
 * Immutable audit log of every desktop action executed or rejected.
 * Contains tamper-evident hash, duration, target description, and safety classification.
 * Strictly avoids recording passwords/secrets.
 */
export const desktopActionLog = pgTable("desktop_action_log", {
  id: text("id").primaryKey(),
  actionId: text("action_id").notNull(),
  sessionId: text("session_id"),
  agentId: text("agent_id"),
  actionType: text("action_type").notNull(),
  riskLevel: text("risk_level").notNull(), // 'read' | 'act' | 'destructive'
  targetDescription: text("target_description").notNull(),
  payload: jsonb("payload").notNull().default({}),
  status: text("status").notNull(), // 'success' | 'failed' | 'rejected' | 'killswitch_aborted'
  screenshotHash: text("screenshot_hash"),
  durationMs: integer("duration_ms").notNull().default(0),
  errorMessage: text("error_message"),
  isPasswordField: boolean("is_password_field").notNull().default(false),
  isElevatedWindow: boolean("is_elevated_window").notNull().default(false),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 0202: desktop_confirmation_requests
 * Human-in-the-loop confirmation requests for destructive actions.
 * Awaits user decision in the Connect Notch before execution.
 */
export const desktopConfirmationRequests = pgTable("desktop_confirmation_requests", {
  id: text("id").primaryKey(), // confirmationId
  actionId: text("action_id").notNull(),
  agentId: text("agent_id"),
  riskLevel: text("risk_level").notNull().default("destructive"),
  reason: text("reason").notNull(),
  actionSummary: text("action_summary").notNull(),
  details: jsonb("details").notNull().default({}),
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected' | 'timed_out' | 'killswitch_aborted'
  approved: boolean("approved"),
  responseReason: text("response_reason"),
  timeoutMs: integer("timeout_ms").notNull().default(15000),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

/**
 * 0203: desktop_rate_limits
 * Sliding window rate limit tracker per agent to prevent runaway loops.
 */
export const desktopRateLimits = pgTable("desktop_rate_limits", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  actionCount: integer("action_count").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 0204: desktop_killswitch_events
 * Audit record of all emergency killswitch activations.
 */
export const desktopKillswitchEvents = pgTable("desktop_killswitch_events", {
  id: text("id").primaryKey(),
  source: text("source").notNull(), // 'hotkey' | 'notch_ui' | 'api'
  reason: text("reason"),
  abortedActionsCount: integer("aborted_actions_count").notNull().default(0),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
});
