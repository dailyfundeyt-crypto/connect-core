import { existsSync, readdirSync, statSync } from "node:fs";
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

export interface AntigravityInspection {
  homePath: string;
  exists: boolean;
  conversationsCount: number;
  lastConversationAt: string | null;
  brainArtifactsCount: number;
  daemonLogExists: boolean;
  daemonLastModified: string | null;
}

export interface AntigravityUsageCollection {
  account: CliAccount;
  inspection: AntigravityInspection;
  summary: RuntimeSummary;
  samples: UsageSample[];
  runtimeStatus: ConductorRuntimeStatus;
}

/**
 * Canonical shared account definition for Google Antigravity CLI.
 * Marked with isolation: 'shared'.
 */
export function getAntigravityAccount(customHome?: string): CliAccount {
  const homePath =
    customHome ||
    process.env.ANTIGRAVITY_HOME ||
    join(homedir(), ".gemini", "antigravity");

  return {
    id: "acc_agy_default",
    cliKind: "antigravity",
    label: "Antigravity Global (Shared)",
    homePath,
    isolation: "shared",
    planType: "internal",
    createdAt: "2026-10-10T12:00:00Z",
  };
}

/**
 * Read-only inspection of Antigravity local workspace/brain directories.
 * Strictly avoids reading credentials or sensitive authorization tokens.
 */
export function inspectAntigravityHome(homePath?: string): AntigravityInspection {
  const targetHome =
    homePath ||
    process.env.ANTIGRAVITY_HOME ||
    join(homedir(), ".gemini", "antigravity");

  const result: AntigravityInspection = {
    homePath: targetHome,
    exists: false,
    conversationsCount: 0,
    lastConversationAt: null,
    brainArtifactsCount: 0,
    daemonLogExists: false,
    daemonLastModified: null,
  };

  if (!existsSync(targetHome)) {
    return result;
  }
  result.exists = true;

  try {
    // 1. Inspect conversations directory
    const convPath = join(targetHome, "conversations");
    if (existsSync(convPath)) {
      const entries = readdirSync(convPath);
      result.conversationsCount = entries.length;
      let newestMs = 0;
      for (const entry of entries.slice(-50)) {
        try {
          const st = statSync(join(convPath, entry));
          if (st.mtimeMs > newestMs) {
            newestMs = st.mtimeMs;
          }
        } catch {
          // ignore
        }
      }
      if (newestMs > 0) {
        result.lastConversationAt = new Date(newestMs).toISOString();
      }
    }

    // 2. Inspect brain directory
    const brainPath = join(targetHome, "brain");
    if (existsSync(brainPath)) {
      const brainEntries = readdirSync(brainPath);
      result.brainArtifactsCount = brainEntries.length;
    }

    // 3. Inspect daemon logs if present
    const daemonLog = join(targetHome, "daemon.log");
    if (existsSync(daemonLog)) {
      result.daemonLogExists = true;
      try {
        const st = statSync(daemonLog);
        result.daemonLastModified = new Date(st.mtimeMs).toISOString();
      } catch {
        // ignore
      }
    }
  } catch {
    // Non-fatal if folder permissions or locks prevent listing
  }

  return result;
}

/**
 * Returns runtime status for the Antigravity shared runtime.
 */
export function getAntigravityRuntimeStatus(
  counter: RuntimeCounter = globalRuntimeCounter,
  customHome?: string
): ConductorRuntimeStatus {
  const account = getAntigravityAccount(customHome);
  const summary = counter.getSummary({ cliKind: "antigravity" });

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
    runtimeId: "rt_agy_01",
    cliKind: "antigravity",
    accountId: account.id,
    state,
    lastFailureClass,
    cooldownUntil: state === "cooldown" ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null,
    lastProbeAt: new Date().toISOString(),
    consecutiveFailures: summary.failuresCount,
    activeClaimsCount: summary.activeRunsCount,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Main collector function for Antigravity.
 * Combines home folder inspection with runtime counter activity.
 */
export function collectAntigravityUsage(
  counter: RuntimeCounter = globalRuntimeCounter,
  customHome?: string
): AntigravityUsageCollection {
  const account = getAntigravityAccount(customHome);
  const inspection = inspectAntigravityHome(account.homePath);
  const summary = counter.getSummary({ cliKind: "antigravity" });
  const completed = counter.getCompletedRuns({ cliKind: "antigravity", limit: 50 });
  const samples = completed.map((r) => counter.toUsageSample(r));
  const runtimeStatus = getAntigravityRuntimeStatus(counter, customHome);

  return {
    account,
    inspection,
    summary,
    samples,
    runtimeStatus,
  };
}
