import { existsSync, readdirSync } from "node:fs";
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

export interface HermesInspection {
  homePath: string;
  exists: boolean;
  skillsCount: number;
  configFilesCount: number;
}

export interface HermesUsageCollection {
  account: CliAccount;
  inspection: HermesInspection;
  summary: RuntimeSummary;
  samples: UsageSample[];
  runtimeStatus: ConductorRuntimeStatus;
}

/**
 * Canonical shared account definition for Hermes CLI.
 * Strictly marked with isolation: 'shared'.
 */
export function getHermesAccount(customHome?: string): CliAccount {
  const homePath =
    customHome ||
    process.env.HERMES_HOME ||
    join(homedir(), ".hermes");

  return {
    id: "acc_hermes_default",
    cliKind: "hermes",
    label: "Hermes CLI (Shared)",
    homePath,
    isolation: "shared",
    planType: "api_key",
    createdAt: "2026-10-12T14:00:00Z",
  };
}

/**
 * Safe directory inspection of Hermes home (counts skills/config files).
 * Never reads or logs API keys or sensitive authorization tokens.
 */
export function inspectHermesHome(homePath?: string): HermesInspection {
  const targetHome = homePath || process.env.HERMES_HOME || join(homedir(), ".hermes");

  const result: HermesInspection = {
    homePath: targetHome,
    exists: false,
    skillsCount: 0,
    configFilesCount: 0,
  };

  if (!existsSync(targetHome)) {
    return result;
  }
  result.exists = true;

  try {
    const entries = readdirSync(targetHome);
    result.configFilesCount = entries.length;

    const skillsDir = join(targetHome, "skills");
    if (existsSync(skillsDir)) {
      result.skillsCount = readdirSync(skillsDir).length;
    }
  } catch {
    // Non-fatal directory listing error
  }

  return result;
}

export function getHermesRuntimeStatus(
  counter: RuntimeCounter = globalRuntimeCounter,
  customHome?: string
): ConductorRuntimeStatus {
  const account = getHermesAccount(customHome);
  const summary = counter.getSummary({ cliKind: "hermes" });

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
    runtimeId: "rt_hermes_01",
    cliKind: "hermes",
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
 * Main collector function for Hermes CLI.
 */
export function collectHermesUsage(
  counter: RuntimeCounter = globalRuntimeCounter,
  customHome?: string
): HermesUsageCollection {
  const account = getHermesAccount(customHome);
  const inspection = inspectHermesHome(account.homePath);
  const summary = counter.getSummary({ cliKind: "hermes" });
  const completed = counter.getCompletedRuns({ cliKind: "hermes", limit: 50 });
  const samples = completed.map((r) => counter.toUsageSample(r));
  const runtimeStatus = getHermesRuntimeStatus(counter, customHome);

  return {
    account,
    inspection,
    summary,
    samples,
    runtimeStatus,
  };
}
