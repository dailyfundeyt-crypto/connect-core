/**
 * Typdefinitionen für die volle T3-Nutzungsansicht (Lane A24).
 */
import type {
  T3ProviderId,
  T3ProviderLimit,
  UsageBucket,
  UsageGroupBy,
  UsageMetric,
  UsageQuery,
  UsageResponse,
} from "@/lib/t3/contracts";

export type UsageViewMetric = "cost" | "tokens" | "limits";
export type UsageWindowDays = 7 | 30 | 90;
export type UsageTableGroupBy = "agent" | "cli" | "model" | "day";

export interface UsageViewPreferences {
  metric: UsageViewMetric;
  windowDays: UsageWindowDays;
  groupBy: UsageTableGroupBy;
}

export interface MetricOption {
  value: UsageViewMetric;
  label: string;
  description: string;
}

export interface WindowOption {
  days: UsageWindowDays;
  label: string;
}

export interface GroupByOption {
  value: UsageTableGroupBy;
  label: string;
}

export const METRIC_OPTIONS: readonly MetricOption[] = [
  { value: "tokens", label: "Tokens", description: "Token-Verbrauch (Prompt, Cache & Completion)" },
  { value: "cost", label: "Cost", description: "Geschätzte API-Kosten in USD" },
  { value: "limits", label: "Limits", description: "Echtzeit-Quotas und Provider-Limits" },
] as const;

export const WINDOW_OPTIONS: readonly WindowOption[] = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

export const GROUP_BY_OPTIONS: readonly GroupByOption[] = [
  { value: "agent", label: "Pro Agent" },
  { value: "cli", label: "Pro CLI" },
  { value: "model", label: "Pro Modell" },
] as const;

export const DEFAULT_USAGE_PREFERENCES: UsageViewPreferences = {
  metric: "tokens",
  windowDays: 30,
  groupBy: "agent",
};

export type {
  T3ProviderId,
  T3ProviderLimit,
  UsageBucket,
  UsageGroupBy,
  UsageMetric,
  UsageQuery,
  UsageResponse,
};
