import { existsSync, readdirSync, readFileSync } from "node:fs";
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

export interface FreebuffInspection {
  homePath: string;
  exists: boolean;
  serversCount: number;
  configFilesCount: number;
}

export interface FreebuffUsageCollection {
  account: CliAccount;
  inspection: FreebuffInspection;
  summary: RuntimeSummary;
  samples: UsageSample[];
  runtimeStatus: ConductorRuntimeStatus;
}

/**
 * Canonical shared account definition for Freebuff CLI.
 * Strictly marked with isolation: 'shared'.
 */
export function getFreebuffAccount(customHome?: string): CliAccount {
  const homePath =
    customHome ||
    process.env.FREEBUFF_HOME ||
    join(homedir(), ".freebuff");

  return {
    id: "acc_freebuff_default",
    cliKind: "freebuff",
    label: "Freebuff CLI (Shared)",
    homePath,
    isolation: "shared",
    planType: "free",
    createdAt: "2026-10-12T14:00:00Z",
  };
}

/**
 * Safe directory inspection of Freebuff home.
 * Only checks server counts or schema structure, never reads secret tokens.
 */
export function inspectFreebuffHome(homePath?: string): FreebuffInspection {
  const targetHome = homePath || process.env.FREEBUFF_HOME || join(homedir(), ".freebuff");

  const result: FreebuffInspection = {
    homePath: targetHome,
    exists: false,
    serversCount: 0,
    configFilesCount: 0,
  };

  if (!existsSync(targetHome)) {
    return result;
  }
  result.exists = true;

  try {
    const entries = readdirSync(targetHome);
    result.configFilesCount = entries.length;

    // Check config.json or servers.json (keys only, no secret values)
    const configFile = join(targetHome, "config.json");
    if (existsSync(configFile)) {
      try {
        const raw = readFileSync(configFile, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.servers)) {
          result.serversCount = parsed.servers.length;
        } else if (parsed?.servers && typeof parsed.servers === "object") {
          result.serversCount = Object.keys(parsed.servers).length;
        }
      } catch {
        // ignore JSON issues
      }
    }
  } catch {
    // Non-fatal directory listing error
  }

  return result;
}

export function getFreebuffRuntimeStatus(
  counter: RuntimeCounter = globalRuntimeCounter,
  customHome?: string
): ConductorRuntimeStatus {
  const account = getFreebuffAccount(customHome);
  const summary = counter.getSummary({ cliKind: "freebuff" });

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
    runtimeId: "rt_freebuff_01",
    cliKind: "freebuff",
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
 * Main collector function for Freebuff CLI.
 */
export function collectFreebuffUsage(
  counter: RuntimeCounter = globalRuntimeCounter,
  customHome?: string
): FreebuffUsageCollection {
  const account = getFreebuffAccount(customHome);
  const inspection = inspectFreebuffHome(account.homePath);
  const summary = counter.getSummary({ cliKind: "freebuff" });
  const completed = counter.getCompletedRuns({ cliKind: "freebuff", limit: 50 });
  const samples = completed.map((r) => counter.toUsageSample(r));
  const runtimeStatus = getFreebuffRuntimeStatus(counter, customHome);

  return {
    account,
    inspection,
    summary,
    samples,
    runtimeStatus,
  };
}
