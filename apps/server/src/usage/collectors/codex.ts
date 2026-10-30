import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { QuotaWindow, UsageSample } from "../../contracts/conductor/types";
import { CursorStore } from "./cursor-store";

export interface CodexParsedLineResult {
  sample?: UsageSample;
  quotaWindows: QuotaWindow[];
}

export interface CodexDiscoveryHome {
  homePath: string;
  accountId: string;
  agentId?: string | null;
  label?: string;
  planType?: string | null;
}

/**
 * Computes deterministic sample ID from file and byte offset.
 */
function makeSampleId(sourceFile: string, offset: number): string {
  const hash = createHash("sha256")
    .update(`${sourceFile}:${offset}`)
    .digest("hex")
    .slice(0, 16);
  return `sample_codex_${hash}`;
}

/**
 * Discovers all Codex home directories across:
 * 1. Global host home (~/.codex)
 * 2. Connect accounts (%LOCALAPPDATA%\ConnectAgents\accounts\codex\*)
 * 3. Per-agent homes (%LOCALAPPDATA%\ConnectAgents\agent_*\codex-home and wizard22-codex-*)
 */
export function discoverCodexHomes(options?: {
  connectAgentsDir?: string;
  userHomeDir?: string;
}): CodexDiscoveryHome[] {
  const results: CodexDiscoveryHome[] = [];
  const homeDir = options?.userHomeDir ?? os.homedir();
  const connectAgents =
    options?.connectAgentsDir ??
    process.env.CONNECT_AGENTS_DIR ??
    path.join(
      process.env.LOCALAPPDATA ?? path.join(homeDir, "AppData", "Local"),
      "ConnectAgents"
    );

  // 1. Host default Codex home
  const hostCodex = path.join(homeDir, ".codex");
  if (fs.existsSync(hostCodex)) {
    results.push({
      homePath: hostCodex,
      accountId: "acc_codex_orig",
      agentId: null,
      label: "Codex Original (Host)",
      planType: "go",
    });
  }

  if (fs.existsSync(connectAgents)) {
    // 2. Accounts folder (accounts/codex/*)
    const accountsCodexDir = path.join(connectAgents, "accounts", "codex");
    if (fs.existsSync(accountsCodexDir)) {
      try {
        const entries = fs.readdirSync(accountsCodexDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const accountFolderName = entry.name;
          const accountFolderPath = path.join(accountsCodexDir, accountFolderName);

          let accountId = "acc_codex_" + accountFolderName;
          let label = `Codex ${accountFolderName}`;
          let planType = "go";

          if (accountFolderName === "codex-original") {
            accountId = "acc_codex_orig";
            label = "Codex Original (Host)";
            planType = "go";
          } else if (accountFolderName === "codex-instanz-2") {
            accountId = "acc_codex_inst2";
            label = "Codex Instanz 2";
            planType = "pro";
          } else if (accountFolderName === "codex-68171865") {
            accountId = "acc_codex_681";
            label = "Codex 68171865";
            planType = "go";
          }

          // Check if codex-home subfolder exists or if it's directly in folder
          const subHome = path.join(accountFolderPath, "codex-home");
          const effectiveHome = fs.existsSync(subHome) ? subHome : accountFolderPath;

          results.push({
            homePath: effectiveHome,
            accountId,
            agentId: null,
            label,
            planType,
          });
        }
      } catch {
        // Ignore read errors
      }
    }

    // 3. Per-Agent folders (agent_* or wizard22-codex-*)
    try {
      const entries = fs.readdirSync(connectAgents, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const agentFolderName = entry.name;
        const codexHome = path.join(connectAgents, agentFolderName, "codex-home");

        if (fs.existsSync(codexHome)) {
          results.push({
            homePath: codexHome,
            accountId: `acc_codex_${agentFolderName}`,
            agentId: agentFolderName,
            label: `Codex Agent (${agentFolderName})`,
            planType: "go",
          });
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  return results;
}

/**
 * Recursively locates rollout-*.jsonl files inside a Codex home directory.
 */
export function findCodexRolloutFiles(codexHomePath: string): string[] {
  const files: string[] = [];
  const sessionsDir = path.join(codexHomePath, "sessions");
  if (!fs.existsSync(sessionsDir)) return files;

  function scan(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full);
        } else if (
          entry.isFile() &&
          entry.name.startsWith("rollout-") &&
          entry.name.endsWith(".jsonl")
        ) {
          files.push(full);
        }
      }
    } catch {
      // Ignore directory read errors
    }
  }

  scan(sessionsDir);
  return files;
}

/**
 * Extracts a session ID from the rollout filename or file content.
 */
export function extractCodexSessionId(filePath: string): string {
  const base = path.basename(filePath, ".jsonl");
  // Patterns like rollout-2026-09-16T20-01-19-01a0ab61-5bfa-7d72-832c-52a26ebcde61
  const match = base.match(/^rollout-.*?([0-9a-fA-F-]{36})$/);
  if (match) {
    return match[1];
  }
  return base;
}

/**
 * Parses a single line from a Codex rollout-*.jsonl file.
 * Returns a UsageSample and any QuotaWindow updates if the line contains a token_count event.
 */
export function parseCodexRolloutLine(
  line: string,
  context: {
    filePath: string;
    offset: number;
    accountId: string;
    agentId?: string | null;
    defaultPlanType?: string | null;
  }
): CodexParsedLineResult | null {
  if (!line || !line.includes("token_count")) {
    return null;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  if (
    parsed?.type !== "event_msg" ||
    parsed?.payload?.type !== "token_count" ||
    !parsed?.payload?.info?.total_token_usage
  ) {
    return null;
  }

  const { info, rate_limits } = parsed.payload;
  const totalUsage = info.total_token_usage ?? {};
  const timestamp = parsed.timestamp ?? new Date().toISOString();
  const sessionId = extractCodexSessionId(context.filePath);

  const inputTokens = Number(totalUsage.input_tokens) || 0;
  const cachedTokens =
    Number(totalUsage.cached_input_tokens ?? totalUsage.cache_read_input_tokens) || 0;
  const outputTokens = Number(totalUsage.output_tokens) || 0;
  const reasoningTokens = Number(totalUsage.reasoning_output_tokens) || 0;
  const totalTokens =
    Number(totalUsage.total_tokens) ||
    inputTokens + cachedTokens + outputTokens + reasoningTokens;

  const sample: UsageSample = {
    id: makeSampleId(context.filePath, context.offset),
    agentId: context.agentId ?? null,
    cliKind: "codex",
    accountId: context.accountId,
    sessionId,
    ts: timestamp,
    inputTokens,
    cachedTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    source: "jsonl",
    rawRef: `${path.basename(context.filePath)}:${context.offset}`,
    sourceFile: context.filePath,
    offset: context.offset,
  };

  const quotaWindows: QuotaWindow[] = [];

  if (rate_limits) {
    const limitIdBase = rate_limits.limit_id || "codex";
    const planType = rate_limits.plan_type || context.defaultPlanType || "go";

    if (rate_limits.primary && typeof rate_limits.primary.used_percent === "number") {
      quotaWindows.push({
        id: `qw_codex_${context.accountId}_primary`,
        accountId: context.accountId,
        limitId: `${limitIdBase}_rate_limit_${planType}_primary`,
        windowKind: "primary",
        windowMinutes: Number(rate_limits.primary.window_minutes) || 43200, // 30 Tage
        usedPercent: Number(rate_limits.primary.used_percent),
        resetsAt: rate_limits.primary.resets_at ?? null, // epoch seconds
        confidence: "exact",
        observedAt: timestamp,
        planType,
      });
    }

    if (rate_limits.secondary && typeof rate_limits.secondary.used_percent === "number") {
      quotaWindows.push({
        id: `qw_codex_${context.accountId}_secondary`,
        accountId: context.accountId,
        limitId: `${limitIdBase}_rate_limit_${planType}_secondary`,
        windowKind: "secondary",
        windowMinutes: Number(rate_limits.secondary.window_minutes) || 1440,
        usedPercent: Number(rate_limits.secondary.used_percent),
        resetsAt: rate_limits.secondary.resets_at ?? null,
        confidence: "exact",
        observedAt: timestamp,
        planType,
      });
    }
  }

  return { sample, quotaWindows };
}

/**
 * Runs a collection pass across all discovered or supplied Codex homes.
 */
export async function collectCodexUsage(options?: {
  homes?: CodexDiscoveryHome[];
  cursorStore?: CursorStore;
  connectAgentsDir?: string;
  userHomeDir?: string;
}): Promise<{
  samples: UsageSample[];
  quotaWindows: QuotaWindow[];
  filesProcessed: number;
}> {
  const cursorStore = options?.cursorStore ?? new CursorStore();
  const homes =
    options?.homes ??
    discoverCodexHomes({
      connectAgentsDir: options?.connectAgentsDir,
      userHomeDir: options?.userHomeDir,
    });

  const collectedSamples: UsageSample[] = [];
  const quotaMap = new Map<string, QuotaWindow>();
  let filesProcessed = 0;

  for (const home of homes) {
    const rolloutFiles = findCodexRolloutFiles(home.homePath);
    for (const file of rolloutFiles) {
      filesProcessed++;
      const { lines } = await cursorStore.readNewLines(file);
      for (const { line, offset } of lines) {
        const result = parseCodexRolloutLine(line, {
          filePath: file,
          offset,
          accountId: home.accountId,
          agentId: home.agentId,
          defaultPlanType: home.planType,
        });

        if (result) {
          if (result.sample) {
            collectedSamples.push(result.sample);
          }
          for (const qw of result.quotaWindows) {
            const key = `${qw.accountId}:${qw.windowKind}`;
            quotaMap.set(key, qw);
          }
        }
      }
    }
  }

  return {
    samples: collectedSamples,
    quotaWindows: Array.from(quotaMap.values()),
    filesProcessed,
  };
}
