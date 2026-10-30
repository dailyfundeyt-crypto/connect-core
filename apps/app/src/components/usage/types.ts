/**
 * Types for Usage & Quota Monitoring (Lane 5)
 * Aligned with apps/server/src/contracts/conductor/
 */

export type CliKind =
  | "codex"
  | "claude"
  | "antigravity"
  | "gemini"
  | "gemini-cli"
  | "hermes"
  | "freebuff";

export type AccountIsolation = "per_agent" | "shared";

export type QuotaConfidence = "exact" | "estimated";

export type QuotaWindowKind = "primary" | "secondary" | "heuristic_5h" | "daily";

export interface CliAccount {
  id: string;
  cliKind: CliKind;
  label: string;
  homePath: string;
  isolation: AccountIsolation;
  planType?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface QuotaWindow {
  id?: string;
  accountId: string;
  limitId: string;
  windowKind: QuotaWindowKind;
  windowMinutes: number;
  usedPercent: number;
  resetsAt?: number | string | null;
  confidence: QuotaConfidence;
  observedAt: string;
  planType?: string | null;
}

export type UsageGroupBy = "agent" | "cli" | "account";
export type UsageRange = "24h" | "7d" | "30d";

export interface UsageSummaryItem {
  key: string;
  label: string;
  cliKind?: CliKind;
  agentId?: string;
  accountId?: string;
  isolation?: AccountIsolation;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  runsCount: number;
  durationSeconds: number;
}

export interface UsageSummaryTotals {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  runsCount: number;
  durationSeconds: number;
}

export interface UsageSummaryResponse {
  success: boolean;
  range: UsageRange;
  groupBy: UsageGroupBy;
  items: UsageSummaryItem[];
  totals: UsageSummaryTotals;
}

export interface TimeSeriesPoint {
  timestamp: string;
  formattedTime: string;
  codexTokens: number;
  claudeTokens: number;
  otherTokens: number;
  totalTokens: number;
}
