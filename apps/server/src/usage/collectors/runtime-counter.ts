import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type {
  AccountIsolation,
  CliKind,
  FailureClass,
  UsageSample,
} from "../../contracts/conductor/types";
import {
  classifyFailure,
  type FailureClassificationResult,
} from "./failure-patterns";

/* ========================================================================== */
/* Types & Interfaces                                                         */
/* ========================================================================== */

export type RunStatus = "running" | "completed" | "crashed" | "stopped";

export interface RuntimeRunRecord {
  runId: string;
  agentId: string;
  cliKind: CliKind;
  accountId: string;
  isolation: AccountIsolation;
  startedAtMs: number;
  startedAt: string;
  endedAtMs: number | null;
  endedAt: string | null;
  durationSeconds: number;
  status: RunStatus;
  exitCode: number | null;
  error?: string | null;
  failureClassification?: FailureClassificationResult | null;
  outputTail: string;
}

export interface RuntimeSummary {
  cliKind?: CliKind;
  agentId?: string;
  accountId?: string;
  isolation: AccountIsolation;
  runsCount: number;
  durationSeconds: number;
  activeRunsCount: number;
  lastRunAt: string | null;
  failuresCount: number;
  byFailureClass: Record<FailureClass, number>;
}

export interface TerminalStartOptions {
  accountId?: string;
  isolation?: AccountIsolation;
  sessionId?: string;
  customEnv?: Record<string, string>;
}

/* ========================================================================== */
/* Default Shared Accounts Registry                                           */
/* ========================================================================== */

export const DEFAULT_SHARED_ACCOUNTS: Record<
  string,
  { id: string; label: string; defaultPath: string }
> = {
  antigravity: {
    id: "acc_agy_default",
    label: "Antigravity Global (Shared)",
    defaultPath: join(homedir(), ".gemini", "antigravity"),
  },
  gemini: {
    id: "acc_gemini_default",
    label: "Gemini CLI Global (Shared)",
    defaultPath: join(homedir(), ".gemini"),
  },
  "gemini-cli": {
    id: "acc_gemini_default",
    label: "Gemini CLI Global (Shared)",
    defaultPath: join(homedir(), ".gemini"),
  },
  hermes: {
    id: "acc_hermes_default",
    label: "Hermes CLI (Shared)",
    defaultPath: join(homedir(), ".hermes"),
  },
  freebuff: {
    id: "acc_freebuff_default",
    label: "Freebuff CLI (Shared)",
    defaultPath: join(homedir(), ".freebuff"),
  },
};

/**
 * Returns whether the CLI kind is shared by default
 */
export function isSharedCliKind(cliKind: string): boolean {
  const norm = cliKind.toLowerCase().trim();
  return norm !== "codex" && norm !== "claude";
}

/**
 * Returns canonical AccountIsolation for a CLI
 */
export function getAccountIsolationForCli(cliKind: string): AccountIsolation {
  return isSharedCliKind(cliKind) ? "shared" : "per_agent";
}

/**
 * Resolves accountId for CLI kind
 */
export function resolveAccountId(cliKind: string, overrideId?: string): string {
  if (overrideId) return overrideId;
  const norm = cliKind.toLowerCase().trim();
  const def = DEFAULT_SHARED_ACCOUNTS[norm];
  if (def) return def.id;
  return `acc_${norm}_shared`;
}

/* ========================================================================== */
/* Runtime Counter Store                                                      */
/* ========================================================================== */

const MAX_COMPLETED_RUNS = 1000;
const MAX_OUTPUT_TAIL_CHARS = 4096;

export class RuntimeCounter {
  private activeRuns: Map<string, RuntimeRunRecord> = new Map();
  // Index of active runs by agentId -> runId
  private agentActiveMap: Map<string, string> = new Map();
  private completedRuns: RuntimeRunRecord[] = [];
  private persistenceFilePath: string | null = null;
  private persistDebounceTimer: NodeJS.Timeout | null = null;

  constructor(persistencePath?: string) {
    if (persistencePath) {
      this.persistenceFilePath = persistencePath;
    } else {
      const localAppData = process.env.LOCALAPPDATA;
      if (localAppData) {
        this.persistenceFilePath = join(
          localAppData,
          "ConnectAgents",
          "runtime-usage-events.json"
        );
      }
    }
    this.loadFromDisk();
  }

  /**
   * Records the start of a terminal session
   */
  public startRun(
    agentId: string,
    cliKindRaw: string,
    options?: TerminalStartOptions
  ): RuntimeRunRecord {
    const cliKind = (cliKindRaw.toLowerCase().trim() || "antigravity") as CliKind;
    const isolation =
      options?.isolation ?? getAccountIsolationForCli(cliKind);
    const accountId = resolveAccountId(cliKind, options?.accountId);
    const runId = options?.sessionId || `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const nowMs = Date.now();
    const startedAt = new Date(nowMs).toISOString();

    // Check if an existing run is open for this agent and terminate it gracefully
    const existingRunId = this.agentActiveMap.get(agentId);
    if (existingRunId && this.activeRuns.has(existingRunId)) {
      this.endRun(agentId, 0, "Superseded by new terminal session");
    }

    const record: RuntimeRunRecord = {
      runId,
      agentId,
      cliKind,
      accountId,
      isolation,
      startedAtMs: nowMs,
      startedAt,
      endedAtMs: null,
      endedAt: null,
      durationSeconds: 0,
      status: "running",
      exitCode: null,
      error: null,
      failureClassification: null,
      outputTail: "",
    };

    this.activeRuns.set(runId, record);
    this.agentActiveMap.set(agentId, runId);
    this.schedulePersistence();

    return record;
  }

  /**
   * Appends stdout/stderr chunks to the active run's output tail and checks for live failure patterns
   */
  public recordChunk(agentId: string, text: string): void {
    const runId = this.agentActiveMap.get(agentId);
    if (!runId) return;

    const run = this.activeRuns.get(runId);
    if (!run) return;

    run.outputTail = (run.outputTail + text).slice(-MAX_OUTPUT_TAIL_CHARS);

    // Live classification of errors in stdout (e.g. 429 quota, auth error)
    const classification = classifyFailure(run.cliKind, run.outputTail);
    if (
      classification.failureClass !== "unknown" &&
      (!run.failureClassification ||
        run.failureClassification.failureClass === "unknown")
    ) {
      run.failureClassification = classification;
    }
  }

  /**
   * Records the completion or termination of a terminal session
   */
  public endRun(
    agentId: string,
    exitCode: number | null,
    error?: string | null,
    samples?: any
  ): RuntimeRunRecord | null {
    const runId = this.agentActiveMap.get(agentId);
    if (!runId) return null;

    const run = this.activeRuns.get(runId);
    if (!run) {
      this.agentActiveMap.delete(agentId);
      return null;
    }

    const nowMs = Date.now();
    run.endedAtMs = nowMs;
    run.endedAt = new Date(nowMs).toISOString();
    run.durationSeconds = Math.max(
      1,
      Math.round((nowMs - run.startedAtMs) / 1000)
    );
    run.exitCode = exitCode;
    run.error = error ?? null;

    // Final failure classification
    const combinedLog = `${run.outputTail}\n${error ?? ""}`;
    const classification = classifyFailure(run.cliKind, combinedLog, exitCode);
    run.failureClassification = classification;

    if (exitCode === 0 && !error) {
      run.status = "completed";
    } else if (exitCode === -1 || error) {
      run.status = "crashed";
    } else {
      run.status = "stopped";
    }

    this.activeRuns.delete(runId);
    this.agentActiveMap.delete(agentId);

    // Add to completed runs list
    this.completedRuns.unshift(run);
    if (this.completedRuns.length > MAX_COMPLETED_RUNS) {
      this.completedRuns.pop();
    }

    this.schedulePersistence();
    return run;
  }

  /**
   * Converts a run record into a Conductor UsageSample
   */
  public toUsageSample(run: RuntimeRunRecord): UsageSample {
    return {
      id: `sample_runtime_${run.runId}`,
      agentId: run.agentId,
      cliKind: run.cliKind,
      accountId: run.accountId,
      sessionId: run.runId,
      ts: run.endedAt ?? run.startedAt,
      inputTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      source: "runtime",
      rawRef: `runtime:${run.runId}:duration_${run.durationSeconds}s`,
    };
  }

  /**
   * Aggregates runtime summary metrics for a given filter
   */
  public getSummary(filter?: {
    agentId?: string;
    cliKind?: CliKind;
    accountId?: string;
    sinceMs?: number;
  }): RuntimeSummary {
    const all = [...this.activeRuns.values(), ...this.completedRuns];
    const targetCliKind = filter?.cliKind;
    const isolation: AccountIsolation = targetCliKind
      ? getAccountIsolationForCli(targetCliKind)
      : "shared";

    let runsCount = 0;
    let durationSeconds = 0;
    let activeRunsCount = 0;
    let lastRunAt: string | null = null;
    let failuresCount = 0;
    const byFailureClass: Record<FailureClass, number> = {
      quota: 0,
      auth: 0,
      network: 0,
      task: 0,
      unknown: 0,
    };

    for (const run of all) {
      if (filter?.agentId && run.agentId !== filter.agentId) continue;
      if (filter?.cliKind && run.cliKind !== filter.cliKind) continue;
      if (filter?.accountId && run.accountId !== filter.accountId) continue;
      if (filter?.sinceMs && run.startedAtMs < filter.sinceMs) continue;

      runsCount++;
      durationSeconds += run.durationSeconds;

      if (run.status === "running") {
        activeRunsCount++;
      }

      if (!lastRunAt || run.startedAt > lastRunAt) {
        lastRunAt = run.startedAt;
      }

      if (run.failureClassification && run.status !== "completed") {
        failuresCount++;
        const fc = run.failureClassification.failureClass;
        byFailureClass[fc] = (byFailureClass[fc] || 0) + 1;
      }
    }

    return {
      cliKind: filter?.cliKind,
      agentId: filter?.agentId,
      accountId: filter?.accountId,
      isolation,
      runsCount,
      durationSeconds,
      activeRunsCount,
      lastRunAt,
      failuresCount,
      byFailureClass,
    };
  }

  /**
   * Retrieves all completed runs matching optional filter
   */
  public getCompletedRuns(filter?: {
    agentId?: string;
    cliKind?: CliKind;
    accountId?: string;
    limit?: number;
  }): RuntimeRunRecord[] {
    let result = this.completedRuns;
    if (filter?.agentId) {
      result = result.filter((r) => r.agentId === filter.agentId);
    }
    if (filter?.cliKind) {
      result = result.filter((r) => r.cliKind === filter.cliKind);
    }
    if (filter?.accountId) {
      result = result.filter((r) => r.accountId === filter.accountId);
    }
    if (filter?.limit && filter.limit > 0) {
      result = result.slice(0, filter.limit);
    }
    return result;
  }

  /**
   * Retrieves all currently active runs
   */
  public getActiveRuns(): RuntimeRunRecord[] {
    return Array.from(this.activeRuns.values());
  }

  /**
   * Retrieves recent usage samples
   */
  public getRecentSamples(limit = 50): UsageSample[] {
    return this.completedRuns
      .slice(0, limit)
      .map((run) => this.toUsageSample(run));
  }

  /**
   * Clears state (useful for tests)
   */
  public reset(): void {
    this.activeRuns.clear();
    this.agentActiveMap.clear();
    this.completedRuns = [];
    if (this.persistDebounceTimer) {
      clearTimeout(this.persistDebounceTimer);
      this.persistDebounceTimer = null;
    }
  }

  /* ---------- Persistence ---------- */

  private schedulePersistence(): void {
    if (!this.persistenceFilePath) return;
    if (this.persistDebounceTimer) return;

    this.persistDebounceTimer = setTimeout(() => {
      this.persistDebounceTimer = null;
      this.saveToDisk();
    }, 1000);
  }

  private saveToDisk(): void {
    if (!this.persistenceFilePath) return;
    try {
      const dir = join(this.persistenceFilePath, "..");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const data = {
        savedAt: new Date().toISOString(),
        completedRuns: this.completedRuns.slice(0, 200),
      };
      writeFileSync(this.persistenceFilePath, JSON.stringify(data, null, 2), "utf8");
    } catch {
      // Gracefully ignore file write errors
    }
  }

  private loadFromDisk(): void {
    if (!this.persistenceFilePath || !existsSync(this.persistenceFilePath)) {
      return;
    }
    try {
      const content = readFileSync(this.persistenceFilePath, "utf8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed?.completedRuns)) {
        this.completedRuns = parsed.completedRuns;
      }
    } catch {
      // Gracefully ignore corrupt file
    }
  }
}

/** Global singleton instance */
export const globalRuntimeCounter = new RuntimeCounter();

/* ========================================================================== */
/* Terminal Usage Hook Interface for agent-terminal-manager.ts                */
/* ========================================================================== */

/**
 * Standardized hook ready to be plugged into agent-terminal-manager.ts.
 */
export const terminalUsageHook = {
  /**
   * Called when a process is spawned
   */
  onStart(
    agentId: string,
    cliKind: string,
    options?: TerminalStartOptions
  ): string {
    const run = globalRuntimeCounter.startRun(agentId, cliKind, options);
    return run.runId;
  },

  /**
   * Called on every stdout/stderr chunk
   */
  onData(agentId: string, _cliKind: string, text: string): void {
    globalRuntimeCounter.recordChunk(agentId, text);
  },

  /**
   * Called on process exit or crash
   */
  onExit(
    agentId: string,
    _cliKind: string,
    code: number | null,
    error?: string
  ): RuntimeRunRecord | null {
    return globalRuntimeCounter.endRun(agentId, code, error);
  },
};
