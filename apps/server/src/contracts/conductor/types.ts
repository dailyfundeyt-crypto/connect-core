import { createHash } from "node:crypto";
import { z } from "zod";

/* ========================================================================== */
/* CLI Kinds & Account Isolation                                              */
/* ========================================================================== */

export const CLI_KINDS = [
  "codex",
  "claude",
  "antigravity",
  "gemini",
  "gemini-cli",
  "hermes",
  "freebuff",
] as const;
export const CliKindSchema = z.enum(CLI_KINDS);
export type CliKind = z.infer<typeof CliKindSchema>;

/** Managed CLI kinds natively supervised by Connect CLI-Manager */
export const MANAGED_CLI_KINDS = [
  "antigravity",
  "freebuff",
  "claude",
  "codex",
  "hermes",
] as const;
export const ManagedCliKindSchema = z.enum(MANAGED_CLI_KINDS);
export type ManagedCliKind = z.infer<typeof ManagedCliKindSchema>;

/** Account Isolation: per-agent (Codex, Claude) vs shared (Antigravity, Gemini, Hermes, Freebuff) */
export const ACCOUNT_ISOLATIONS = ["per_agent", "shared"] as const;
export const AccountIsolationSchema = z.enum(ACCOUNT_ISOLATIONS);
export type AccountIsolation = z.infer<typeof AccountIsolationSchema>;

/* ========================================================================== */
/* CLI Accounts                                                               */
/* ========================================================================== */

export const CliAccountSchema = z.object({
  id: z.string(),
  cliKind: CliKindSchema,
  label: z.string(),
  homePath: z.string(),
  isolation: AccountIsolationSchema,
  planType: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
export type CliAccount = z.infer<typeof CliAccountSchema>;

/* ========================================================================== */
/* Usage Samples & Tokens                                                     */
/* ========================================================================== */

export const USAGE_SAMPLE_SOURCES = ["jsonl", "stdout", "runtime"] as const;
export const UsageSampleSourceSchema = z.enum(USAGE_SAMPLE_SOURCES);
export type UsageSampleSource = z.infer<typeof UsageSampleSourceSchema>;

export const UsageSampleSchema = z.object({
  id: z.string(),
  agentId: z.string().nullable().optional(),
  cliKind: CliKindSchema,
  accountId: z.string(),
  sessionId: z.string().nullable().optional(),
  ts: z.string(),
  inputTokens: z.number().int().nonnegative().default(0),
  cachedTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  reasoningTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
  source: UsageSampleSourceSchema,
  rawRef: z.string().nullable().optional(),
  sourceFile: z.string().nullable().optional(),
  offset: z.number().int().nonnegative().nullable().optional(),
  createdAt: z.string().optional(),
});
export type UsageSample = z.infer<typeof UsageSampleSchema>;

/* ========================================================================== */
/* Quota Windows & Confidence                                                 */
/* ========================================================================== */

export const QUOTA_CONFIDENCES = ["exact", "estimated"] as const;
export const QuotaConfidenceSchema = z.enum(QUOTA_CONFIDENCES);
export type QuotaConfidence = z.infer<typeof QuotaConfidenceSchema>;

export const QUOTA_WINDOW_KINDS = [
  "primary",
  "secondary",
  "heuristic_5h",
  "daily",
] as const;
export const QuotaWindowKindSchema = z.enum(QUOTA_WINDOW_KINDS);
export type QuotaWindowKind = z.infer<typeof QuotaWindowKindSchema>;

export const QuotaWindowSchema = z.object({
  id: z.string().optional(),
  accountId: z.string(),
  limitId: z.string(),
  windowKind: QuotaWindowKindSchema,
  windowMinutes: z.number().int().positive(),
  usedPercent: z.number().min(0).max(100),
  resetsAt: z.union([z.number(), z.string()]).nullable().optional(),
  confidence: QuotaConfidenceSchema,
  observedAt: z.string(),
  planType: z.string().nullable().optional(),
});
export type QuotaWindow = z.infer<typeof QuotaWindowSchema>;

/* ========================================================================== */
/* Conductor Failure Classification & Runtime State                           */
/* ========================================================================== */

export const FAILURE_CLASSES = [
  "quota",
  "auth",
  "network",
  "task",
  "unknown",
] as const;
export const FailureClassSchema = z.enum(FAILURE_CLASSES);
export type FailureClass = z.infer<typeof FailureClassSchema>;

export const RUNTIME_STATES = [
  "available",
  "cooldown",
  "unavailable",
  "auth_error",
  "paused",
] as const;
export const RuntimeStateSchema = z.enum(RUNTIME_STATES);
export type RuntimeState = z.infer<typeof RuntimeStateSchema>;

export const ConductorRuntimeStatusSchema = z.object({
  runtimeId: z.string(),
  cliKind: CliKindSchema,
  accountId: z.string(),
  state: RuntimeStateSchema,
  lastFailureClass: FailureClassSchema.nullable().optional(),
  cooldownUntil: z.string().nullable().optional(),
  lastProbeAt: z.string().nullable().optional(),
  consecutiveFailures: z.number().int().nonnegative().optional().default(0),
  activeClaimsCount: z.number().int().nonnegative().optional().default(0),
  updatedAt: z.string().optional(),
});
export type ConductorRuntimeStatus = z.infer<typeof ConductorRuntimeStatusSchema>;

/* ========================================================================== */
/* Conductor Configuration (Strictly enforces paidApiFallback: false)         */
/* ========================================================================== */

export const ConductorConfigSchema = z.object({
  enabled: z.boolean().default(true),
  killSwitch: z.boolean().default(false),
  primary: CliKindSchema.default("codex"),
  standby: CliKindSchema.default("claude"),
  cooldownMin: z.number().int().positive().default(30),
  pollSec: z.number().int().positive().default(300),
  initialPollSec: z.number().int().positive().default(20),
  maxHandoffsPerTask: z.number().int().positive().default(3),
  /**
   * Hard constraint: Paid-API fallback is strictly disallowed.
   * Enforced as a TypeScript & Zod literal `false`.
   */
  paidApiFallback: z.literal(false),
  updatedAt: z.string().optional(),
});
export type ConductorConfig = z.infer<typeof ConductorConfigSchema>;

export const DEFAULT_CONDUCTOR_CONFIG: ConductorConfig = {
  enabled: true,
  killSwitch: false,
  primary: "codex",
  standby: "claude",
  cooldownMin: 30,
  pollSec: 300,
  initialPollSec: 20,
  maxHandoffsPerTask: 3,
  paidApiFallback: false,
};

/* ========================================================================== */
/* Checkpoints & Transfers (Single-Owner Handoff Protocol)                    */
/* ========================================================================== */

export const CheckpointSchema = z.object({
  id: z.string(),
  swarmTaskId: z.string(),
  fromRuntime: z.string(),
  summary: z.string(),
  filesTouched: z.array(z.string()).default([]),
  nextSteps: z.string(),
  createdAt: z.string(),
});
export type Checkpoint = z.infer<typeof CheckpointSchema>;

export const TRANSFER_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "failed",
] as const;
export const TransferStatusSchema = z.enum(TRANSFER_STATUSES);
export type TransferStatus = z.infer<typeof TransferStatusSchema>;

export const TransferSchema = z.object({
  id: z.string(),
  swarmTaskId: z.string(),
  transferKey: z.string(),
  fromRuntime: z.string(),
  toRuntime: z.string(),
  checkpointId: z.string().nullable().optional(),
  reason: z.string(),
  status: TransferStatusSchema.default("pending"),
  createdAt: z.string(),
});
export type Transfer = z.infer<typeof TransferSchema>;

/**
 * Computes deterministic unique SHA-256 transfer deduplication key.
 * transfer_key = sha256(taskId | fromRuntime | toRuntime | checkpointId)
 */
export function computeTransferKey(
  taskId: string,
  fromRuntime: string,
  toRuntime: string,
  checkpointId: string
): string {
  return createHash("sha256")
    .update(`${taskId}|${fromRuntime}|${toRuntime}|${checkpointId}`)
    .digest("hex");
}

/* ========================================================================== */
/* Conductor Events (Audit & Alert Log)                                       */
/* ========================================================================== */

export const CONDUCTOR_EVENT_SEVERITIES = [
  "info",
  "warn",
  "error",
  "critical",
] as const;
export const ConductorEventSeveritySchema = z.enum(CONDUCTOR_EVENT_SEVERITIES);
export type ConductorEventSeverity = z.infer<
  typeof ConductorEventSeveritySchema
>;

export const ConductorEventSchema = z.object({
  id: z.string(),
  taskId: z.string().nullable().optional(),
  eventType: z.string(),
  severity: ConductorEventSeveritySchema,
  message: z.string(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
});
export type ConductorEvent = z.infer<typeof ConductorEventSchema>;
