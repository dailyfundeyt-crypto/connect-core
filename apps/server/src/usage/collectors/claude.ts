import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { QuotaWindow, UsageSample } from "../../contracts/conductor/types";
import { CursorStore } from "./cursor-store";

export interface ClaudeDiscoveryHome {
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
  return `sample_claude_${hash}`;
}

/**
 * Discovers Claude configuration directories across:
 * 1. Global host home (~/.claude)
 * 2. Connect accounts (%LOCALAPPDATA%\ConnectAgents\accounts\claude\*)
 * 3. Per-agent homes (%LOCALAPPDATA%\ConnectAgents\agent_*\claude-config and wizard22-claude-*)
 */
export function discoverClaudeHomes(options?: {
  connectAgentsDir?: string;
  userHomeDir?: string;
}): ClaudeDiscoveryHome[] {
  const results: ClaudeDiscoveryHome[] = [];
  const homeDir = options?.userHomeDir ?? os.homedir();
  const connectAgents =
    options?.connectAgentsDir ??
    process.env.CONNECT_AGENTS_DIR ??
    path.join(
      process.env.LOCALAPPDATA ?? path.join(homeDir, "AppData", "Local"),
      "ConnectAgents"
    );

  // 1. Host default Claude home
  const hostClaude = path.join(homeDir, ".claude");
  if (fs.existsSync(hostClaude)) {
    results.push({
      homePath: hostClaude,
      accountId: "acc_claude_host",
      agentId: null,
      label: "Claude Host (~/.claude)",
      planType: "pro",
    });
  }

  if (fs.existsSync(connectAgents)) {
    // 2. Accounts folder (accounts/claude/*)
    const accountsClaudeDir = path.join(connectAgents, "accounts", "claude");
    if (fs.existsSync(accountsClaudeDir)) {
      try {
        const entries = fs.readdirSync(accountsClaudeDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const folderName = entry.name;
          const folderPath = path.join(accountsClaudeDir, folderName);
          results.push({
            homePath: folderPath,
            accountId: `acc_claude_${folderName}`,
            agentId: null,
            label: `Claude ${folderName}`,
            planType: "pro",
          });
        }
      } catch {
        // Ignore read errors
      }
    }

    // 3. Per-Agent folders (agent_* or wizard22-claude-*)
    try {
      const entries = fs.readdirSync(connectAgents, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const agentFolderName = entry.name;
        const claudeHome = path.join(connectAgents, agentFolderName, "claude-config");

        if (fs.existsSync(claudeHome)) {
          let accountId = `acc_claude_${agentFolderName}`;
          let label = `Claude Agent (${agentFolderName})`;

          if (agentFolderName === "agent_primary") {
            accountId = "acc_claude_primary";
            label = "Claude Code Standby";
          }

          results.push({
            homePath: claudeHome,
            accountId,
            agentId: agentFolderName,
            label,
            planType: "pro",
          });
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  // Ensure default mock account is represented if agent_primary exists or fallback
  if (!results.some((r) => r.accountId === "acc_claude_primary")) {
    const primaryAgentPath = path.join(
      connectAgents,
      "agent_primary",
      "claude-config"
    );
    results.push({
      homePath: primaryAgentPath,
      accountId: "acc_claude_primary",
      agentId: "agent_primary",
      label: "Claude Code Standby",
      planType: "pro",
    });
  }

  return results;
}

/**
 * Recursively locates .jsonl files under projects/ in a Claude config directory.
 */
export function findClaudeProjectFiles(claudeConfigPath: string): string[] {
  const files: string[] = [];
  const projectsDir = path.join(claudeConfigPath, "projects");
  if (!fs.existsSync(projectsDir)) return files;

  function scan(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full);
        } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          files.push(full);
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  scan(projectsDir);
  return files;
}

/**
 * Parses a single line from a Claude project .jsonl file.
 */
export function parseClaudeJsonlLine(
  line: string,
  context: {
    filePath: string;
    offset: number;
    accountId: string;
    agentId?: string | null;
  }
): UsageSample | null {
  if (!line || !line.includes('"usage"')) {
    return null;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  const usage = parsed?.message?.usage;
  if (!usage) {
    return null;
  }

  const timestamp = parsed.timestamp ?? new Date().toISOString();
  const sessionId = parsed.sessionId ?? path.basename(context.filePath, ".jsonl");

  const inputTokens = Number(usage.input_tokens) || 0;
  const outputTokens = Number(usage.output_tokens) || 0;
  const cachedTokens = Number(usage.cache_read_input_tokens) || 0;
  const cacheCreationTokens = Number(usage.cache_creation_input_tokens) || 0;
  const reasoningTokens = 0;
  const totalTokens =
    Number(usage.total_tokens) ||
    inputTokens + outputTokens + cachedTokens + cacheCreationTokens;

  return {
    id: makeSampleId(context.filePath, context.offset),
    agentId: context.agentId ?? null,
    cliKind: "claude",
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
}

/**
 * Computes a rolling 5h heuristic QuotaWindow from a set of Claude usage samples.
 * Window duration: 300 minutes (5 hours).
 * Estimates reset time starting from the first activity within the current 5-hour window.
 */
export function computeClaude5hQuotaWindow(
  samples: UsageSample[],
  accountId: string,
  options?: {
    planType?: string | null;
    referenceTime?: Date;
    estimatedTokensPer5hCap?: number;
  }
): QuotaWindow {
  const refTime = options?.referenceTime ?? new Date();
  const fiveHoursMs = 5 * 60 * 60 * 1000;
  const windowStartThreshold = new Date(refTime.getTime() - fiveHoursMs);

  // Filter samples belonging to this account and within the rolling 5h window
  const relevantSamples = samples.filter((s) => {
    if (s.accountId !== accountId) return false;
    const sampleDate = new Date(s.ts);
    return sampleDate >= windowStartThreshold && sampleDate <= refTime;
  });

  relevantSamples.sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );

  let resetsAt: string = new Date(refTime.getTime() + fiveHoursMs).toISOString();
  let total5hTokens = 0;

  if (relevantSamples.length > 0) {
    const firstSampleTime = new Date(relevantSamples[0].ts).getTime();
    resetsAt = new Date(firstSampleTime + fiveHoursMs).toISOString();
    for (const s of relevantSamples) {
      total5hTokens += s.totalTokens;
    }
  }

  // Heuristic token capacity per 5h window (default 100k tokens for Pro plan)
  const cap = options?.estimatedTokensPer5hCap ?? 100000;
  let usedPercent = Math.min(100, Math.round((total5hTokens / cap) * 1000) / 10);
  if (relevantSamples.length > 0 && usedPercent === 0 && total5hTokens > 0) {
    usedPercent = 0.1;
  }

  return {
    id: `qw_claude_${accountId}_5h`,
    accountId,
    limitId: "claude_5h_rolling_window",
    windowKind: "heuristic_5h",
    windowMinutes: 300,
    usedPercent,
    resetsAt,
    confidence: "estimated",
    observedAt: refTime.toISOString(),
    planType: options?.planType ?? "pro",
  };
}

/**
 * Runs a collection pass across all discovered or supplied Claude homes.
 */
export async function collectClaudeUsage(options?: {
  homes?: ClaudeDiscoveryHome[];
  cursorStore?: CursorStore;
  connectAgentsDir?: string;
  userHomeDir?: string;
  referenceTime?: Date;
}): Promise<{
  samples: UsageSample[];
  quotaWindows: QuotaWindow[];
  filesProcessed: number;
}> {
  const cursorStore = options?.cursorStore ?? new CursorStore();
  const homes =
    options?.homes ??
    discoverClaudeHomes({
      connectAgentsDir: options?.connectAgentsDir,
      userHomeDir: options?.userHomeDir,
    });

  const collectedSamples: UsageSample[] = [];
  const quotaMap = new Map<string, QuotaWindow>();
  let filesProcessed = 0;

  for (const home of homes) {
    const projectFiles = findClaudeProjectFiles(home.homePath);
    const homeSamples: UsageSample[] = [];

    for (const file of projectFiles) {
      filesProcessed++;
      const { lines } = await cursorStore.readNewLines(file);
      for (const { line, offset } of lines) {
        const sample = parseClaudeJsonlLine(line, {
          filePath: file,
          offset,
          accountId: home.accountId,
          agentId: home.agentId,
        });

        if (sample) {
          collectedSamples.push(sample);
          homeSamples.push(sample);
        }
      }
    }

    const quotaWindow = computeClaude5hQuotaWindow(
      homeSamples,
      home.accountId,
      {
        planType: home.planType,
        referenceTime: options?.referenceTime,
      }
    );
    quotaMap.set(home.accountId, quotaWindow);
  }

  return {
    samples: collectedSamples,
    quotaWindows: Array.from(quotaMap.values()),
    filesProcessed,
  };
}
