/**
 * Local Codex / OpenAI token usage for Connect.
 *
 * Tracks what *this app* spends through the Codex bridge (Bot-CLI ChatGPT/Cursor),
 * not OpenAI's account-wide dashboard. Budget is yours to set (e.g. 10 M).
 */

import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { connectWorkspaceKv } from "../db/schema";

export const CODEX_SETTINGS_KEY = "codex.settings";
export const CODEX_USAGE_KEY = "codex.usage";

export const DEFAULT_CODEX_BUDGET = 10_000_000;

export type CodexSettings = {
  /** Encrypted API key blob; never returned to the browser. */
  apiKeyCipher?: string;
  budgetTokens: number;
  baseUrl: string;
  model: string;
  /** When true, bridge prefers this key over CONNECT_CODEX_BRIDGE_TOKEN. */
  enabled: boolean;
};

export type CodexDayUsage = {
  tokens: number;
  prompt: number;
  completion: number;
  calls: number;
};

export type CodexUsageStore = {
  days: Record<string, CodexDayUsage>;
  totalTokens: number;
  peakDayTokens: number;
  peakDay: string | null;
};

export type CodexUsageDashboard = {
  totalTokens: number;
  peakDayTokens: number;
  peakDay: string | null;
  budgetTokens: number;
  remainingTokens: number;
  percentUsed: number;
  calls: number;
  /** YYYY-MM-DD → tokens, last ~370 days for the heatmap. */
  daily: { date: string; tokens: number }[];
  hasApiKey: boolean;
  baseUrl: string;
  model: string;
  enabled: boolean;
};

const defaultSettings = (): CodexSettings => ({
  budgetTokens: DEFAULT_CODEX_BUDGET,
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-5",
  enabled: true,
});

const emptyUsage = (): CodexUsageStore => ({
  days: {},
  totalTokens: 0,
  peakDayTokens: 0,
  peakDay: null,
});

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readKv(
  database: Database,
  key: string,
): Promise<unknown | null> {
  const [row] = await database
    .select()
    .from(connectWorkspaceKv)
    .where(eq(connectWorkspaceKv.key, key))
    .limit(1);
  return row?.value ?? null;
}

async function writeKv(
  database: Database,
  key: string,
  value: unknown,
): Promise<void> {
  const now = new Date();
  await database
    .insert(connectWorkspaceKv)
    .values({ key, value: value as Record<string, unknown>, updatedAt: now })
    .onConflictDoUpdate({
      target: connectWorkspaceKv.key,
      set: { value: value as Record<string, unknown>, updatedAt: now },
    });
}

export async function loadCodexSettings(
  database: Database,
): Promise<CodexSettings> {
  const raw = await readKv(database, CODEX_SETTINGS_KEY);
  if (!raw || typeof raw !== "object") return defaultSettings();
  const o = raw as Record<string, unknown>;
  const budget =
    typeof o.budgetTokens === "number" && o.budgetTokens > 0
      ? Math.floor(o.budgetTokens)
      : DEFAULT_CODEX_BUDGET;
  return {
    apiKeyCipher:
      typeof o.apiKeyCipher === "string" ? o.apiKeyCipher : undefined,
    budgetTokens: budget,
    baseUrl:
      typeof o.baseUrl === "string" && o.baseUrl.trim()
        ? o.baseUrl.trim().replace(/\/+$/, "")
        : defaultSettings().baseUrl,
    model:
      typeof o.model === "string" && o.model.trim()
        ? o.model.trim()
        : defaultSettings().model,
    enabled: o.enabled !== false,
  };
}

export async function saveCodexSettings(
  database: Database,
  next: CodexSettings,
): Promise<void> {
  await writeKv(database, CODEX_SETTINGS_KEY, {
    apiKeyCipher: next.apiKeyCipher,
    budgetTokens: next.budgetTokens,
    baseUrl: next.baseUrl,
    model: next.model,
    enabled: next.enabled,
  });
}

export async function loadCodexUsage(
  database: Database,
): Promise<CodexUsageStore> {
  const raw = await readKv(database, CODEX_USAGE_KEY);
  if (!raw || typeof raw !== "object") return emptyUsage();
  const o = raw as Record<string, unknown>;
  const days =
    o.days && typeof o.days === "object"
      ? (o.days as Record<string, CodexDayUsage>)
      : {};
  return {
    days,
    totalTokens:
      typeof o.totalTokens === "number" ? Math.max(0, o.totalTokens) : 0,
    peakDayTokens:
      typeof o.peakDayTokens === "number" ? Math.max(0, o.peakDayTokens) : 0,
    peakDay: typeof o.peakDay === "string" ? o.peakDay : null,
  };
}

export async function recordCodexUsage(
  database: Database,
  input: { prompt: number; completion: number; total?: number },
): Promise<CodexUsageStore> {
  const prompt = Math.max(0, Math.floor(input.prompt));
  const completion = Math.max(0, Math.floor(input.completion));
  const tokens =
    typeof input.total === "number" && input.total > 0
      ? Math.floor(input.total)
      : prompt + completion;
  if (tokens <= 0) return loadCodexUsage(database);

  const store = await loadCodexUsage(database);
  const day = todayUtc();
  const prev = store.days[day] ?? {
    tokens: 0,
    prompt: 0,
    completion: 0,
    calls: 0,
  };
  const nextDay: CodexDayUsage = {
    tokens: prev.tokens + tokens,
    prompt: prev.prompt + prompt,
    completion: prev.completion + completion,
    calls: prev.calls + 1,
  };
  store.days[day] = nextDay;
  store.totalTokens += tokens;
  if (nextDay.tokens >= store.peakDayTokens) {
    store.peakDayTokens = nextDay.tokens;
    store.peakDay = day;
  }
  await writeKv(database, CODEX_USAGE_KEY, store);
  return store;
}

export async function buildCodexDashboard(
  database: Database,
): Promise<CodexUsageDashboard> {
  const [settings, usage] = await Promise.all([
    loadCodexSettings(database),
    loadCodexUsage(database),
  ]);
  const calls = Object.values(usage.days).reduce((n, d) => n + (d.calls || 0), 0);
  const remaining = Math.max(0, settings.budgetTokens - usage.totalTokens);
  const percentUsed =
    settings.budgetTokens > 0
      ? Math.min(100, (usage.totalTokens / settings.budgetTokens) * 100)
      : 0;

  // Last 53 weeks ending today (heatmap).
  const daily: { date: string; tokens: number }[] = [];
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 53 * 7 + 1);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    daily.push({ date: key, tokens: usage.days[key]?.tokens ?? 0 });
  }

  return {
    totalTokens: usage.totalTokens,
    peakDayTokens: usage.peakDayTokens,
    peakDay: usage.peakDay,
    budgetTokens: settings.budgetTokens,
    remainingTokens: remaining,
    percentUsed,
    calls,
    daily,
    hasApiKey: Boolean(settings.apiKeyCipher),
    baseUrl: settings.baseUrl,
    model: settings.model,
    enabled: settings.enabled,
  };
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mio.`;
  }
  if (n >= 1_000) {
    return `${Math.round(n / 1000).toLocaleString("de-DE")} k`;
  }
  return n.toLocaleString("de-DE");
}
