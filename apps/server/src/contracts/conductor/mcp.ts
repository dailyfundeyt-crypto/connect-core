import { z } from "zod";
import {
  ConductorConfigSchema,
  ConductorEventSchema,
  ConductorRuntimeStatusSchema,
  TransferSchema,
  CheckpointSchema,
  CliAccountSchema,
  QuotaWindowSchema,
  CliKindSchema,
} from "./types";
import {
  UsageGroupBySchema,
  UsageRangeSchema,
  UsageSummaryItemSchema,
} from "./api";

/* ========================================================================== */
/* Canonical Conductor MCP Tool Names                                         */
/* ========================================================================== */

export const CONDUCTOR_MCP_TOOLS = {
  usageGet: "usage.get",
  conductorStatus: "conductor.status",
  conductorHandoff: "conductor.handoff",
  conductorKill: "conductor.kill",
} as const;

export type ConductorMcpToolName =
  (typeof CONDUCTOR_MCP_TOOLS)[keyof typeof CONDUCTOR_MCP_TOOLS];

/* ========================================================================== */
/* Canonical Conductor MCP Grant Scopes (Grants 0090, Audit 0091)             */
/* ========================================================================== */

export const CONDUCTOR_GRANT_SCOPES = [
  "usage:read",
  "conductor:control",
] as const;

export type ConductorGrantScope = (typeof CONDUCTOR_GRANT_SCOPES)[number];

export const ScopeUsageRead: ConductorGrantScope = "usage:read";
export const ScopeConductorControl: ConductorGrantScope = "conductor:control";

/* ========================================================================== */
/* Tool 1: usage.get                                                          */
/* ========================================================================== */

export const UsageGetInputSchema = z.object({
  groupBy: UsageGroupBySchema.optional().default("cli"),
  range: UsageRangeSchema.optional().default("24h"),
  accountId: z.string().optional(),
  cliKind: CliKindSchema.optional(),
});
export type UsageGetInput = z.infer<typeof UsageGetInputSchema>;

export const UsageGetOutputSchema = z.object({
  success: z.boolean(),
  range: UsageRangeSchema,
  groupBy: UsageGroupBySchema,
  items: z.array(UsageSummaryItemSchema),
  accounts: z.array(CliAccountSchema).optional(),
  quotaWindows: z.array(QuotaWindowSchema).optional(),
  totals: z.object({
    totalTokens: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    runsCount: z.number().int().nonnegative(),
    durationSeconds: z.number().nonnegative(),
  }),
});
export type UsageGetOutput = z.infer<typeof UsageGetOutputSchema>;

/* ========================================================================== */
/* Tool 2: conductor.status                                                   */
/* ========================================================================== */

export const ConductorStatusInputSchema = z.object({
  includeEvents: z.boolean().optional().default(true),
  limitEvents: z.number().int().min(1).max(100).optional().default(20),
});
export type ConductorStatusInput = z.infer<typeof ConductorStatusInputSchema>;

export const ConductorStatusOutputSchema = z.object({
  success: z.boolean(),
  config: ConductorConfigSchema,
  runtimes: z.array(ConductorRuntimeStatusSchema),
  activeTransfers: z.array(TransferSchema),
  recentEvents: z.array(ConductorEventSchema),
  isPaused: z.boolean(),
  activeKillSwitch: z.boolean(),
  timestamp: z.string(),
});
export type ConductorStatusOutput = z.infer<typeof ConductorStatusOutputSchema>;

/* ========================================================================== */
/* Tool 3: conductor.handoff                                                  */
/* ========================================================================== */

export const ConductorHandoffInputSchema = z.object({
  taskId: z.string().min(1),
  targetRuntime: z.string().optional(),
  reason: z.string().optional().default("Manual MCP handoff requested"),
});
export type ConductorHandoffInput = z.infer<typeof ConductorHandoffInputSchema>;

export const ConductorHandoffOutputSchema = z.object({
  success: z.boolean(),
  taskId: z.string(),
  transfer: TransferSchema,
  checkpoint: CheckpointSchema.optional(),
  message: z.string(),
  timestamp: z.string(),
});
export type ConductorHandoffOutput = z.infer<
  typeof ConductorHandoffOutputSchema
>;

/* ========================================================================== */
/* Tool 4: conductor.kill                                                     */
/* ========================================================================== */

export const ConductorKillInputSchema = z.object({
  enabled: z.boolean().describe("true to engage kill switch, false to resume"),
  reason: z.string().optional(),
});
export type ConductorKillInput = z.infer<typeof ConductorKillInputSchema>;

export const ConductorKillOutputSchema = z.object({
  success: z.boolean(),
  killSwitch: z.boolean(),
  message: z.string(),
  timestamp: z.string(),
});
export type ConductorKillOutput = z.infer<typeof ConductorKillOutputSchema>;
