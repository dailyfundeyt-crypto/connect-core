import { describe, expect, test } from "bun:test";
import {
  initialMockAccounts,
  initialMockConfig,
  initialMockEvents,
  initialMockQuotaWindows,
  initialMockTimeSeries,
  initialMockTransfers,
  initialMockUsageSummary,
} from "./mock-data";
import { formatDuration, formatTokens } from "@/components/usage/usage-table";

describe("Lane 5: Usage & Quota Data Models", () => {
  test("Codex account has exact quota window and 25% used_percent", () => {
    const codexAccount = initialMockAccounts.find((a) => a.id === "acc_codex_orig");
    expect(codexAccount).toBeDefined();
    expect(codexAccount?.cliKind).toBe("codex");
    expect(codexAccount?.isolation).toBe("per_agent");

    const codexQuota = initialMockQuotaWindows.find((q) => q.accountId === "acc_codex_orig");
    expect(codexQuota).toBeDefined();
    expect(codexQuota?.confidence).toBe("exact");
    expect(codexQuota?.usedPercent).toBe(25.0);
    expect(codexQuota?.windowMinutes).toBe(43200);
    expect(codexQuota?.resetsAt).toBeGreaterThan(0);
  });

  test("Claude account has estimated quota window and 5h rolling heuristic", () => {
    const claudeAccount = initialMockAccounts.find((a) => a.id === "acc_claude_primary");
    expect(claudeAccount).toBeDefined();
    expect(claudeAccount?.cliKind).toBe("claude");
    expect(claudeAccount?.isolation).toBe("per_agent");

    const claudeQuota = initialMockQuotaWindows.find((q) => q.accountId === "acc_claude_primary");
    expect(claudeQuota).toBeDefined();
    expect(claudeQuota?.confidence).toBe("estimated");
    expect(claudeQuota?.windowKind).toBe("heuristic_5h");
    expect(claudeQuota?.usedPercent).toBe(35.0);
  });

  test("Antigravity and Gemini CLI are flagged with shared isolation", () => {
    const agyAccount = initialMockAccounts.find((a) => a.cliKind === "antigravity");
    const geminiAccount = initialMockAccounts.find((a) => a.cliKind === "gemini");
    const hermesAccount = initialMockAccounts.find((a) => a.cliKind === "hermes");
    const freebuffAccount = initialMockAccounts.find((a) => a.cliKind === "freebuff");

    expect(agyAccount?.isolation).toBe("shared");
    expect(geminiAccount?.isolation).toBe("shared");
    expect(hermesAccount?.isolation).toBe("shared");
    expect(freebuffAccount?.isolation).toBe("shared");
  });

  test("Conductor configuration strictly enforces paidApiFallback: false", () => {
    expect(initialMockConfig.paidApiFallback).toBe(false);
    expect(initialMockConfig.primary).toBe("codex");
    expect(initialMockConfig.standby).toBe("claude");
    expect(initialMockConfig.cooldownMin).toBe(30);
    expect(initialMockConfig.pollSec).toBe(300);
    expect(initialMockConfig.initialPollSec).toBe(20);
    expect(initialMockConfig.maxHandoffsPerTask).toBe(3);
  });
});

describe("Lane 5: Formatting Utilities", () => {
  test("formatTokens formats token counts with k and M units", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(450)).toBe("450");
    expect(formatTokens(12450)).toBe("12.5k");
    expect(formatTokens(1500000)).toBe("1.5M");
    expect(formatTokens(undefined)).toBe("0");
  });

  test("formatDuration formats seconds into readable intervals", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(185)).toBe("3m 5s");
    expect(formatDuration(3665)).toBe("1h 1m");
  });
});

describe("Lane 5: Conductor Transfers & Events", () => {
  test("transfers contain valid deduplication key and status", () => {
    expect(initialMockTransfers.length).toBeGreaterThan(0);
    for (const tr of initialMockTransfers) {
      expect(tr.transferKey).toBeDefined();
      expect(tr.transferKey.length).toBeGreaterThan(16);
      expect(tr.fromRuntime).toBe("codex");
      expect(tr.toRuntime).toBe("claude");
      expect(tr.status).toBe("completed");
    }
  });

  test("events have recognized severity levels", () => {
    const validSeverities = new Set(["info", "warn", "error", "critical"]);
    for (const ev of initialMockEvents) {
      expect(validSeverities.has(ev.severity)).toBe(true);
      expect(ev.eventType).toBeDefined();
      expect(ev.createdAt).toBeDefined();
    }
  });
});

describe("Lane 5: Usage Summary & Time Series", () => {
  test("usage summary totals correspond to item sums", () => {
    const sumTotalTokens = initialMockUsageSummary.items.reduce(
      (acc, it) => acc + it.totalTokens,
      0
    );
    expect(initialMockUsageSummary.totals.totalTokens).toBe(sumTotalTokens);

    const sumInputTokens = initialMockUsageSummary.items.reduce(
      (acc, it) => acc + it.inputTokens,
      0
    );
    expect(initialMockUsageSummary.totals.inputTokens).toBe(sumInputTokens);

    const sumOutputTokens = initialMockUsageSummary.items.reduce(
      (acc, it) => acc + it.outputTokens,
      0
    );
    expect(initialMockUsageSummary.totals.outputTokens).toBe(sumOutputTokens);

    const sumRuns = initialMockUsageSummary.items.reduce(
      (acc, it) => acc + it.runsCount,
      0
    );
    expect(initialMockUsageSummary.totals.runsCount).toBe(sumRuns);
  });

  test("time series points have non-negative tokens and valid format", () => {
    expect(initialMockTimeSeries.length).toBeGreaterThan(0);
    for (const pt of initialMockTimeSeries) {
      expect(pt.totalTokens).toBe(pt.codexTokens + pt.claudeTokens + pt.otherTokens);
      expect(pt.formattedTime).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});
