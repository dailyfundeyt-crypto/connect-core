import {
  type Checkpoint,
  type CliAccount,
  type ConductorConfig,
  type ConductorEvent,
  type ConductorRuntimeStatus,
  type QuotaWindow,
  type Transfer,
  type UsageSample,
  computeTransferKey,
} from "./types";
import type { UsageSummaryResponse } from "./api";

/* ========================================================================== */
/* Mock Accounts (per-agent vs shared isolation)                              */
/* ========================================================================== */

export const mockCliAccounts: CliAccount[] = [
  {
    id: "acc_codex_orig",
    cliKind: "codex",
    label: "Codex Original (Host)",
    homePath: "C:\\Users\\Kunc GmbH\\AppData\\Local\\ConnectAgents\\accounts\\codex\\codex-original",
    isolation: "per_agent",
    planType: "go",
    createdAt: "2026-10-15T08:00:00Z",
  },
  {
    id: "acc_codex_inst2",
    cliKind: "codex",
    label: "Codex Instanz 2",
    homePath: "C:\\Users\\Kunc GmbH\\AppData\\Local\\ConnectAgents\\accounts\\codex\\codex-instanz-2",
    isolation: "per_agent",
    planType: "pro",
    createdAt: "2026-10-16T09:00:00Z",
  },
  {
    id: "acc_codex_681",
    cliKind: "codex",
    label: "Codex 68171865",
    homePath: "C:\\Users\\Kunc GmbH\\AppData\\Local\\ConnectAgents\\accounts\\codex\\codex-68171865",
    isolation: "per_agent",
    planType: "go",
    createdAt: "2026-10-18T10:00:00Z",
  },
  {
    id: "acc_claude_primary",
    cliKind: "claude",
    label: "Claude Code Standby",
    homePath: "C:\\Users\\Kunc GmbH\\AppData\\Local\\ConnectAgents\\agent_primary\\claude-config",
    isolation: "per_agent",
    planType: "pro",
    createdAt: "2026-10-15T08:00:00Z",
  },
  {
    id: "acc_agy_default",
    cliKind: "antigravity",
    label: "Antigravity Global (Shared)",
    homePath: "C:\\Users\\Kunc GmbH\\.gemini\\antigravity",
    isolation: "shared",
    planType: "internal",
    createdAt: "2026-10-10T12:00:00Z",
  },
  {
    id: "acc_gemini_default",
    cliKind: "gemini",
    label: "Gemini CLI Global (Shared)",
    homePath: "C:\\Users\\Kunc GmbH\\.gemini",
    isolation: "shared",
    planType: "free",
    createdAt: "2026-10-10T12:00:00Z",
  },
  {
    id: "acc_hermes_default",
    cliKind: "hermes",
    label: "Hermes CLI (Shared)",
    homePath: "C:\\Users\\Kunc GmbH\\.hermes",
    isolation: "shared",
    planType: "api_key",
    createdAt: "2026-10-12T14:00:00Z",
  },
  {
    id: "acc_freebuff_default",
    cliKind: "freebuff",
    label: "Freebuff CLI (Shared)",
    homePath: "C:\\Users\\Kunc GmbH\\.freebuff",
    isolation: "shared",
    planType: "free",
    createdAt: "2026-10-12T14:00:00Z",
  },
];

/* ========================================================================== */
/* Mock Quota Windows (Exact vs Estimated)                                    */
/* ========================================================================== */

export const mockQuotaWindows: QuotaWindow[] = [
  {
    id: "qw_codex_01",
    accountId: "acc_codex_orig",
    limitId: "codex_rate_limit_go_primary",
    windowKind: "primary",
    windowMinutes: 43200, // 30 Tage
    usedPercent: 25.0,
    resetsAt: 1793200000,
    confidence: "exact",
    observedAt: "2026-10-22T20:00:00Z",
    planType: "go",
  },
  {
    id: "qw_codex_02",
    accountId: "acc_codex_inst2",
    limitId: "codex_rate_limit_pro_primary",
    windowKind: "primary",
    windowMinutes: 43200,
    usedPercent: 12.5,
    resetsAt: 1793500000,
    confidence: "exact",
    observedAt: "2026-10-22T20:00:00Z",
    planType: "pro",
  },
  {
    id: "qw_claude_01",
    accountId: "acc_claude_primary",
    limitId: "claude_5h_rolling_window",
    windowKind: "heuristic_5h",
    windowMinutes: 300,
    usedPercent: 35.0,
    resetsAt: "2026-10-22T23:30:00Z",
    confidence: "estimated",
    observedAt: "2026-10-22T20:00:00Z",
    planType: "pro",
  },
];

/* ========================================================================== */
/* Mock Usage Samples                                                         */
/* ========================================================================== */

export const mockUsageSamples: UsageSample[] = [
  {
    id: "sample_001",
    agentId: "agent_kunc_01",
    cliKind: "codex",
    accountId: "acc_codex_orig",
    sessionId: "sess_rollout_8819",
    ts: "2026-10-22T18:30:00Z",
    inputTokens: 12450,
    cachedTokens: 8200,
    outputTokens: 1820,
    reasoningTokens: 640,
    totalTokens: 14270,
    source: "jsonl",
    rawRef: "rollout-2026-10-22.jsonl:1048576",
    sourceFile: "rollout-2026-10-22.jsonl",
    offset: 1048576,
  },
  {
    id: "sample_002",
    agentId: "agent_kunc_01",
    cliKind: "claude",
    accountId: "acc_claude_primary",
    sessionId: "sess_claude_9912",
    ts: "2026-10-22T19:00:00Z",
    inputTokens: 8900,
    cachedTokens: 3100,
    outputTokens: 950,
    reasoningTokens: 0,
    totalTokens: 9850,
    source: "jsonl",
    rawRef: "project_task.jsonl:524288",
    sourceFile: "project_task.jsonl",
    offset: 524288,
  },
  {
    id: "sample_003",
    agentId: "agent_kunc_02",
    cliKind: "antigravity",
    accountId: "acc_agy_default",
    sessionId: "sess_agy_4411",
    ts: "2026-10-22T19:15:00Z",
    inputTokens: 0,
    cachedTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    source: "runtime",
    rawRef: "runtime:turn_42",
  },
];

/* ========================================================================== */
/* Mock Conductor Configuration (Strict paidApiFallback: false)               */
/* ========================================================================== */

export const mockConductorConfig: ConductorConfig = {
  enabled: true,
  killSwitch: false,
  primary: "codex",
  standby: "claude",
  cooldownMin: 30,
  pollSec: 300,
  initialPollSec: 20,
  maxHandoffsPerTask: 3,
  paidApiFallback: false,
  updatedAt: "2026-10-22T18:00:00Z",
};

/* ========================================================================== */
/* Mock Runtime Statuses                                                      */
/* ========================================================================== */

export const mockRuntimeStatuses: ConductorRuntimeStatus[] = [
  {
    runtimeId: "rt_codex_01",
    cliKind: "codex",
    accountId: "acc_codex_orig",
    state: "available",
    lastFailureClass: null,
    cooldownUntil: null,
    lastProbeAt: "2026-10-22T20:15:00Z",
    consecutiveFailures: 0,
    activeClaimsCount: 1,
    updatedAt: "2026-10-22T20:15:00Z",
  },
  {
    runtimeId: "rt_claude_01",
    cliKind: "claude",
    accountId: "acc_claude_primary",
    state: "available",
    lastFailureClass: null,
    cooldownUntil: null,
    lastProbeAt: "2026-10-22T20:15:00Z",
    consecutiveFailures: 0,
    activeClaimsCount: 0,
    updatedAt: "2026-10-22T20:15:00Z",
  },
  {
    runtimeId: "rt_agy_01",
    cliKind: "antigravity",
    accountId: "acc_agy_default",
    state: "available",
    lastFailureClass: null,
    cooldownUntil: null,
    lastProbeAt: "2026-10-22T20:10:00Z",
    consecutiveFailures: 0,
    activeClaimsCount: 0,
    updatedAt: "2026-10-22T20:10:00Z",
  },
];

/* ========================================================================== */
/* Mock Checkpoints & Transfers                                               */
/* ========================================================================== */

export const mockCheckpoint: Checkpoint = {
  id: "cp_test_001",
  swarmTaskId: "task_test_9001",
  fromRuntime: "codex",
  summary: "Analyzed dataset schema and drafted migration plan before quota hit.",
  filesTouched: [
    "apps/server/src/db/schema/usage.ts",
    "apps/server/drizzle/0160_cli_accounts.sql",
  ],
  nextSteps: "Run drizzle generate and apply migration, then seed accounts.",
  createdAt: "2026-10-22T20:00:00Z",
};

export const mockTransfer: Transfer = {
  id: "tr_test_001",
  swarmTaskId: "task_test_9001",
  transferKey: computeTransferKey(
    "task_test_9001",
    "codex",
    "claude",
    "cp_test_001"
  ),
  fromRuntime: "codex",
  toRuntime: "claude",
  checkpointId: "cp_test_001",
  reason: "Codex rate limit reached (primary 100%). Failover to standby Claude.",
  status: "completed",
  createdAt: "2026-10-22T20:00:05Z",
};

/* ========================================================================== */
/* Mock Conductor Events                                                      */
/* ========================================================================== */

export const mockConductorEvents: ConductorEvent[] = [
  {
    id: "evt_001",
    taskId: "task_test_9001",
    eventType: "handoff_triggered",
    severity: "warn",
    message: "Quota exceeded on Codex primary. Transferring task to standby Claude.",
    payload: {
      from: "codex",
      to: "claude",
      transferKey: mockTransfer.transferKey,
    },
    createdAt: "2026-10-22T20:00:01Z",
  },
  {
    id: "evt_002",
    taskId: "task_test_9001",
    eventType: "checkpoint_saved",
    severity: "info",
    message: "Checkpoint cp_test_001 persisted successfully.",
    payload: {
      checkpointId: "cp_test_001",
      filesTouchedCount: 2,
    },
    createdAt: "2026-10-22T20:00:03Z",
  },
  {
    id: "evt_003",
    taskId: "task_test_9001",
    eventType: "transfer_completed",
    severity: "info",
    message: "Claude claimed task_test_9001 with checkpoint context.",
    payload: {
      claimedBy: "claude",
    },
    createdAt: "2026-10-22T20:00:10Z",
  },
];

/* ========================================================================== */
/* Mock Usage Summary Response                                                */
/* ========================================================================== */

export const mockUsageSummaryResponse: UsageSummaryResponse = {
  success: true,
  range: "24h",
  groupBy: "cli",
  items: [
    {
      key: "codex",
      label: "OpenAI Codex CLI",
      cliKind: "codex",
      isolation: "per_agent",
      totalTokens: 14270,
      inputTokens: 12450,
      outputTokens: 1820,
      cachedTokens: 8200,
      reasoningTokens: 640,
      runsCount: 4,
      durationSeconds: 320,
    },
    {
      key: "claude",
      label: "Anthropic Claude Code CLI",
      cliKind: "claude",
      isolation: "per_agent",
      totalTokens: 9850,
      inputTokens: 8900,
      outputTokens: 950,
      cachedTokens: 3100,
      reasoningTokens: 0,
      runsCount: 2,
      durationSeconds: 185,
    },
    {
      key: "antigravity",
      label: "Google Antigravity CLI",
      cliKind: "antigravity",
      isolation: "shared",
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      runsCount: 6,
      durationSeconds: 740,
    },
  ],
  totals: {
    totalTokens: 24120,
    inputTokens: 21350,
    outputTokens: 2770,
    cachedTokens: 11300,
    reasoningTokens: 640,
    runsCount: 12,
    durationSeconds: 1245,
  },
};
