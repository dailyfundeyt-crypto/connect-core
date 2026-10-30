import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  CliAccount,
  ConductorRuntimeStatus,
  UsageSample,
} from "../../contracts/conductor/types";
import {
  globalRuntimeCounter,
  RuntimeCounter,
  type RuntimeSummary,
} from "./runtime-counter";
import { classifyFailure } from "./failure-patterns";

/* ========================================================================== */
/* Types & Interfaces                                                         */
/* ========================================================================== */

export interface GeminiTelemetryEntry {
  timestamp?: string;
  sessionId?: string;
  model?: string;
  promptTokens?: number;
  candidatesTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  statusCode?: number;
  errorMessage?: string;
  raw?: Record<string, unknown>;
}

export interface GeminiTelemetryInspection {
  outfileConfigured: boolean;
  outfilePath: string | null;
  entriesCount: number;
  totalPromptTokens: number;
  totalCandidatesTokens: number;
  totalTokens: number;
  hasErrors: boolean;
  lastEntryAt: string | null;
}

export interface GeminiUsageCollection {
  account: CliAccount;
  telemetry: GeminiTelemetryInspection;
  summary: RuntimeSummary;
  samples: UsageSample[];
  runtimeStatus: ConductorRuntimeStatus;
}

/* ========================================================================== */
/* Account Definition                                                         */
/* ========================================================================== */

/**
 * Canonical shared account for Gemini CLI.
 * Marked with isolation: 'shared'.
 */
export function getGeminiAccount(customHome?: string): CliAccount {
  const homePath =
    customHome ||
    process.env.GEMINI_HOME ||
    join(homedir(), ".gemini");

  return {
    id: "acc_gemini_default",
    cliKind: "gemini",
    label: "Gemini CLI Global (Shared)",
    homePath,
    isolation: "shared",
    planType: "free",
    createdAt: "2026-10-10T12:00:00Z",
  };
}

/* ========================================================================== */
/* Telemetry Outfile Parser                                                   */
/* ========================================================================== */

/**
 * Discovers any configured or default telemetry outfile for Gemini CLI.
 */
export function findGeminiTelemetryOutfile(homePath?: string): string | null {
  // 1. Explicit environment variable
  if (process.env.GEMINI_TELEMETRY_OUTFILE) {
    const envPath = process.env.GEMINI_TELEMETRY_OUTFILE.trim();
    if (existsSync(envPath)) return envPath;
  }

  const targetHome = homePath || process.env.GEMINI_HOME || join(homedir(), ".gemini");

  // 2. Check settings.json in target home
  const settingsFile = join(targetHome, "settings.json");
  if (existsSync(settingsFile)) {
    try {
      const raw = readFileSync(settingsFile, "utf8");
      const parsed = JSON.parse(raw);
      const configuredPath =
        parsed?.telemetry?.outfile ||
        parsed?.telemetry_outfile ||
        parsed?.telemetryOutfile;
      if (typeof configuredPath === "string" && existsSync(configuredPath)) {
        return configuredPath;
      }
    } catch {
      // ignore JSON parse issues
    }
  }

  // 3. Common standard filenames in .gemini directory
  const candidates = [
    join(targetHome, "telemetry.jsonl"),
    join(targetHome, "telemetry.json"),
    join(targetHome, "telemetry.log"),
    join(targetHome, "gemini_telemetry.jsonl"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Parses a Gemini telemetry file (supporting both JSON array and JSONL lines).
 */
export function parseGeminiTelemetryFile(filePath: string): GeminiTelemetryEntry[] {
  if (!existsSync(filePath)) return [];

  const results: GeminiTelemetryEntry[] = [];
  try {
    const content = readFileSync(filePath, "utf8").trim();
    if (!content) return results;

    // Check if JSON array
    if (content.startsWith("[") && content.endsWith("]")) {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const entry = normalizeTelemetryRecord(item);
          if (entry) results.push(entry);
        }
      }
      return results;
    }

    // JSON Lines (one JSON object per line)
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      try {
        const item = JSON.parse(trimmed);
        const entry = normalizeTelemetryRecord(item);
        if (entry) results.push(entry);
      } catch {
        // Skip malformed individual line
      }
    }
  } catch {
    // Non-fatal if telemetry file is locked or unreadable
  }

  return results;
}

function normalizeTelemetryRecord(
  raw: Record<string, unknown>
): GeminiTelemetryEntry | null {
  if (!raw || typeof raw !== "object") return null;

  const promptTokens =
    Number(raw.prompt_tokens ?? raw.promptTokens ?? raw.input_tokens ?? 0) || 0;
  const candidatesTokens =
    Number(raw.candidates_tokens ?? raw.candidatesTokens ?? raw.output_tokens ?? 0) || 0;
  const cachedTokens =
    Number(raw.cached_tokens ?? raw.cachedTokens ?? raw.cached_content_token_count ?? 0) || 0;
  const totalTokens =
    Number(raw.total_tokens ?? raw.totalTokens ?? (promptTokens + candidatesTokens)) || 0;

  const durationMs =
    Number(raw.latency_ms ?? raw.duration_ms ?? raw.durationMs ?? 0) || 0;
  const statusCode =
    Number(raw.status_code ?? raw.statusCode ?? raw.http_status ?? 200) || 200;

  const timestamp =
    typeof raw.timestamp === "string"
      ? raw.timestamp
      : typeof raw.ts === "string"
      ? raw.ts
      : new Date().toISOString();

  const errorMessage =
    typeof raw.error === "string"
      ? raw.error
      : typeof raw.error_message === "string"
      ? raw.error_message
      : undefined;

  return {
    timestamp,
    sessionId: (raw.session_id as string) || (raw.sessionId as string) || undefined,
    model: (raw.model as string) || undefined,
    promptTokens,
    candidatesTokens,
    cachedTokens,
    totalTokens,
    durationMs,
    statusCode,
    errorMessage,
    raw,
  };
}

/**
 * Inspects telemetry outfile and summarizes token usage if present.
 */
export function inspectGeminiTelemetry(homePath?: string): {
  inspection: GeminiTelemetryInspection;
  samples: UsageSample[];
} {
  const outfilePath = findGeminiTelemetryOutfile(homePath);
  const account = getGeminiAccount(homePath);

  if (!outfilePath) {
    return {
      inspection: {
        outfileConfigured: false,
        outfilePath: null,
        entriesCount: 0,
        totalPromptTokens: 0,
        totalCandidatesTokens: 0,
        totalTokens: 0,
        hasErrors: false,
        lastEntryAt: null,
      },
      samples: [],
    };
  }

  const entries = parseGeminiTelemetryFile(outfilePath);
  let totalPromptTokens = 0;
  let totalCandidatesTokens = 0;
  let totalTokens = 0;
  let hasErrors = false;
  let lastEntryAt: string | null = null;

  const samples: UsageSample[] = [];

  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx];
    totalPromptTokens += entry.promptTokens || 0;
    totalCandidatesTokens += entry.candidatesTokens || 0;
    totalTokens += entry.totalTokens || 0;

    if (entry.statusCode && entry.statusCode >= 400) {
      hasErrors = true;
    }

    if (entry.timestamp && (!lastEntryAt || entry.timestamp > lastEntryAt)) {
      lastEntryAt = entry.timestamp;
    }

    // Convert to UsageSample
    samples.push({
      id: `sample_gemini_telemetry_${idx}`,
      agentId: null,
      cliKind: "gemini",
      accountId: account.id,
      sessionId: entry.sessionId || `telemetry_${idx}`,
      ts: entry.timestamp || new Date().toISOString(),
      inputTokens: entry.promptTokens || 0,
      cachedTokens: entry.cachedTokens || 0,
      outputTokens: entry.candidatesTokens || 0,
      reasoningTokens: 0,
      totalTokens: entry.totalTokens || 0,
      source: "jsonl",
      rawRef: `${outfilePath}:${idx}`,
    });
  }

  return {
    inspection: {
      outfileConfigured: true,
      outfilePath,
      entriesCount: entries.length,
      totalPromptTokens,
      totalCandidatesTokens,
      totalTokens,
      hasErrors,
      lastEntryAt,
    },
    samples: samples.slice(-50), // keep latest 50
  };
}

/* ========================================================================== */
/* Runtime Status & Main Collector                                            */
/* ========================================================================== */

export function getGeminiRuntimeStatus(
  counter: RuntimeCounter = globalRuntimeCounter,
  customHome?: string
): ConductorRuntimeStatus {
  const account = getGeminiAccount(customHome);
  const summary = counter.getSummary({ cliKind: "gemini" });

  let state: "available" | "cooldown" | "unavailable" | "auth_error" = "available";
  let lastFailureClass = null;

  if (summary.byFailureClass.auth > 0) {
    state = "auth_error";
    lastFailureClass = "auth" as const;
  } else if (summary.byFailureClass.quota > 0) {
    state = "cooldown";
    lastFailureClass = "quota" as const;
  }

  return {
    runtimeId: "rt_gemini_01",
    cliKind: "gemini",
    accountId: account.id,
    state,
    lastFailureClass,
    cooldownUntil:
      state === "cooldown"
        ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
        : null,
    lastProbeAt: new Date().toISOString(),
    consecutiveFailures: summary.failuresCount,
    activeClaimsCount: summary.activeRunsCount,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Main collector function for Gemini CLI.
 * Merges telemetry outfile inspection (if available) with terminal runtime counter.
 */
export function collectGeminiUsage(
  counter: RuntimeCounter = globalRuntimeCounter,
  customHome?: string
): GeminiUsageCollection {
  const account = getGeminiAccount(customHome);
  const { inspection, samples: telemetrySamples } = inspectGeminiTelemetry(account.homePath);
  const summary = counter.getSummary({ cliKind: "gemini" });
  const completed = counter.getCompletedRuns({ cliKind: "gemini", limit: 50 });
  const runtimeSamples = completed.map((r) => counter.toUsageSample(r));

  // Merge samples: prefer telemetry samples if present, otherwise runtime samples
  const samples =
    telemetrySamples.length > 0
      ? telemetrySamples
      : runtimeSamples;

  const runtimeStatus = getGeminiRuntimeStatus(counter, customHome);

  return {
    account,
    telemetry: inspection,
    summary,
    samples,
    runtimeStatus,
  };
}
