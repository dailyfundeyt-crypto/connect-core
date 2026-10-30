import { z } from "zod";
import {
  type AccountIsolation,
  AccountIsolationSchema,
  type Checkpoint,
  CheckpointSchema,
  type CliAccount,
  CliAccountSchema,
  type CliKind,
  CliKindSchema,
  type ConductorConfig,
  ConductorConfigSchema,
  type ConductorEvent,
  ConductorEventSchema,
  type ConductorRuntimeStatus,
  ConductorRuntimeStatusSchema,
  type QuotaWindow,
  QuotaWindowSchema,
  type Transfer,
  TransferSchema,
  type UsageSample,
  UsageSampleSchema,
} from "./types";

/* ========================================================================== */
/* Canonical Conductor API Prefixes & Paths                                   */
/* ========================================================================== */

export const CONDUCTOR_API_PREFIXES = {
  usage: "/api/usage",
  conductor: "/api/conductor",
} as const;

export const CONDUCTOR_API_PATHS = {
  usageSummary: "/api/usage/summary",
  usageQuota: "/api/usage/quota",
  usageEvents: "/api/usage/events",
  conductorStatus: "/api/conductor/status",
  conductorKill: "/api/conductor/kill",
  conductorResume: "/api/conductor/resume",
  conductorHandoff: "/api/conductor/handoff/:taskId",
  conductorEvents: "/api/conductor/events",
} as const;

/* ========================================================================== */
/* Usage API Schemas & DTOs                                                   */
/* ========================================================================== */

export const USAGE_GROUP_BY_OPTIONS = ["agent", "cli", "account"] as const;
export const UsageGroupBySchema = z.enum(USAGE_GROUP_BY_OPTIONS);
export type UsageGroupBy = z.infer<typeof UsageGroupBySchema>;

export const USAGE_RANGE_OPTIONS = ["24h", "7d", "30d"] as const;
export const UsageRangeSchema = z.enum(USAGE_RANGE_OPTIONS);
export type UsageRange = z.infer<typeof UsageRangeSchema>;

export const UsageSummaryQuerySchema = z.object({
  groupBy: UsageGroupBySchema.default("cli"),
  range: UsageRangeSchema.default("24h"),
  accountId: z.string().optional(),
  agentId: z.string().optional(),
  cliKind: CliKindSchema.optional(),
});
export type UsageSummaryQuery = z.infer<typeof UsageSummaryQuerySchema>;

export const UsageSummaryItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  cliKind: CliKindSchema.optional(),
  agentId: z.string().optional(),
  accountId: z.string().optional(),
  isolation: AccountIsolationSchema.optional(),
  totalTokens: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative().optional(),
  reasoningTokens: z.number().int().nonnegative().optional(),
  runsCount: z.number().int().nonnegative(),
  durationSeconds: z.number().nonnegative(),
});
export type UsageSummaryItem = z.infer<typeof UsageSummaryItemSchema>;

export const UsageSummaryResponseSchema = z.object({
  success: z.boolean(),
  range: UsageRangeSchema,
  groupBy: UsageGroupBySchema,
  items: z.array(UsageSummaryItemSchema),
  totals: z.object({
    totalTokens: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cachedTokens: z.number().int().nonnegative().optional(),
    reasoningTokens: z.number().int().nonnegative().optional(),
    runsCount: z.number().int().nonnegative(),
    durationSeconds: z.number().nonnegative(),
  }),
});
export type UsageSummaryResponse = z.infer<typeof UsageSummaryResponseSchema>;

export const UsageQuotaQuerySchema = z.object({
  accountId: z.string().optional(),
  cliKind: CliKindSchema.optional(),
});
export type UsageQuotaQuery = z.infer<typeof UsageQuotaQuerySchema>;

export const UsageQuotaItemSchema = z.object({
  account: CliAccountSchema,
  windows: z.array(QuotaWindowSchema),
});
export type UsageQuotaItem = z.infer<typeof UsageQuotaItemSchema>;

export const UsageQuotaResponseSchema = z.object({
  success: z.boolean(),
  accounts: z.array(CliAccountSchema),
  windows: z.array(QuotaWindowSchema),
  items: z.array(UsageQuotaItemSchema).optional(),
});
export type UsageQuotaResponse = z.infer<typeof UsageQuotaResponseSchema>;

/* ========================================================================== */
/* Conductor API Schemas & DTOs                                               */
/* ========================================================================== */

export const ConductorTaskIdParamSchema = z.object({
  taskId: z.string().min(1),
});
export type ConductorTaskIdParam = z.infer<typeof ConductorTaskIdParamSchema>;

export const ConductorKillBodySchema = z.object({
  reason: z.string().optional(),
});
export type ConductorKillBody = z.infer<typeof ConductorKillBodySchema>;

export const ConductorResumeBodySchema = z.object({
  reason: z.string().optional(),
});
export type ConductorResumeBody = z.infer<typeof ConductorResumeBodySchema>;

export const ConductorHandoffBodySchema = z.object({
  targetRuntime: z.string().optional(),
  reason: z.string().optional(),
});
export type ConductorHandoffBody = z.infer<typeof ConductorHandoffBodySchema>;

export const ConductorStatusResponseSchema = z.object({
  success: z.boolean(),
  config: ConductorConfigSchema,
  runtimes: z.array(ConductorRuntimeStatusSchema),
  activeTransfers: z.array(TransferSchema),
  recentEvents: z.array(ConductorEventSchema),
  isPaused: z.boolean(),
  activeKillSwitch: z.boolean(),
});
export type ConductorStatusResponse = z.infer<
  typeof ConductorStatusResponseSchema
>;

export const ConductorKillResponseSchema = z.object({
  success: z.boolean(),
  killSwitch: z.boolean(),
  message: z.string(),
  timestamp: z.string(),
});
export type ConductorKillResponse = z.infer<typeof ConductorKillResponseSchema>;

export const ConductorResumeResponseSchema = z.object({
  success: z.boolean(),
  killSwitch: z.boolean(),
  message: z.string(),
  timestamp: z.string(),
});
export type ConductorResumeResponse = z.infer<
  typeof ConductorResumeResponseSchema
>;

export const ConductorHandoffResponseSchema = z.object({
  success: z.boolean(),
  taskId: z.string(),
  transfer: TransferSchema,
  checkpoint: CheckpointSchema.optional(),
  message: z.string(),
});
export type ConductorHandoffResponse = z.infer<
  typeof ConductorHandoffResponseSchema
>;

/* ========================================================================== */
/* SSE Real-Time Event Contracts                                              */
/* ========================================================================== */

export const UsageUpdatedSseEventSchema = z.object({
  type: z.literal("usage.updated"),
  data: z.object({
    accountId: z.string().optional(),
    cliKind: CliKindSchema.optional(),
    sample: UsageSampleSchema.optional(),
    quotaWindow: QuotaWindowSchema.optional(),
    timestamp: z.string(),
  }),
});
export type UsageUpdatedSseEvent = z.infer<typeof UsageUpdatedSseEventSchema>;

export const ConductorEventSseEventSchema = z.object({
  type: z.literal("conductor.event"),
  data: ConductorEventSchema,
});
export type ConductorEventSseEvent = z.infer<
  typeof ConductorEventSseEventSchema
>;

export const ConductorSseMessageSchema = z.discriminatedUnion("type", [
  UsageUpdatedSseEventSchema,
  ConductorEventSseEventSchema,
]);
export type ConductorSseMessage = z.infer<typeof ConductorSseMessageSchema>;
