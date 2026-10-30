import { describe, expect, it } from "bun:test";
import {
  CliAccountSchema,
  CliKindSchema,
  computeTransferKey,
  ConductorConfigSchema,
  ConductorEventSchema,
  ConductorRuntimeStatusSchema,
  DEFAULT_CONDUCTOR_CONFIG,
  FailureClassSchema,
  QuotaConfidenceSchema,
  QuotaWindowSchema,
  RuntimeStateSchema,
  TransferSchema,
  UsageSampleSchema,
} from "../src/contracts/conductor/types";
import {
  CONDUCTOR_API_PREFIXES,
  UsageSummaryResponseSchema,
  UsageQuotaResponseSchema,
  ConductorStatusResponseSchema,
} from "../src/contracts/conductor/api";
import {
  CONDUCTOR_GRANT_SCOPES,
  CONDUCTOR_MCP_TOOLS,
  ConductorHandoffInputSchema,
  ConductorKillInputSchema,
  ConductorStatusInputSchema,
  UsageGetInputSchema,
} from "../src/contracts/conductor/mcp";
import {
  mockCheckpoint,
  mockCliAccounts,
  mockConductorConfig,
  mockConductorEvents,
  mockQuotaWindows,
  mockRuntimeStatuses,
  mockTransfer,
  mockUsageSamples,
  mockUsageSummaryResponse,
} from "../src/contracts/conductor/mocks";
import { createUsageRouter } from "../src/routes/usage";
import { createConductorRouter } from "../src/routes/conductor";

describe("Conductor & Usage Contracts (Lane 0)", () => {
  describe("1. Type & Schema Validation", () => {
    it("validates all supported CliKind values", () => {
      const validKinds = [
        "codex",
        "claude",
        "antigravity",
        "gemini",
        "gemini-cli",
        "hermes",
        "freebuff",
      ];
      for (const kind of validKinds) {
        expect(CliKindSchema.safeParse(kind).success).toBe(true);
      }
      expect(CliKindSchema.safeParse("unknown-cli").success).toBe(false);
    });

    it("validates FailureClass values", () => {
      const validFailures = ["quota", "auth", "network", "task", "unknown"];
      for (const f of validFailures) {
        expect(FailureClassSchema.safeParse(f).success).toBe(true);
      }
      expect(FailureClassSchema.safeParse("hardware").success).toBe(false);
    });

    it("validates RuntimeState values", () => {
      const validStates = [
        "available",
        "cooldown",
        "unavailable",
        "auth_error",
        "paused",
      ];
      for (const s of validStates) {
        expect(RuntimeStateSchema.safeParse(s).success).toBe(true);
      }
      expect(RuntimeStateSchema.safeParse("crashed").success).toBe(false);
    });

    it("validates QuotaConfidence values", () => {
      expect(QuotaConfidenceSchema.safeParse("exact").success).toBe(true);
      expect(QuotaConfidenceSchema.safeParse("estimated").success).toBe(true);
      expect(QuotaConfidenceSchema.safeParse("rough").success).toBe(false);
    });

    it("enforces paidApiFallback: false literal in ConductorConfig", () => {
      // Default configuration must have paidApiFallback: false
      expect(DEFAULT_CONDUCTOR_CONFIG.paidApiFallback).toBe(false);
      expect(DEFAULT_CONDUCTOR_CONFIG.cooldownMin).toBe(30);
      expect(DEFAULT_CONDUCTOR_CONFIG.pollSec).toBe(300);
      expect(DEFAULT_CONDUCTOR_CONFIG.initialPollSec).toBe(20);

      const validConfig = ConductorConfigSchema.safeParse({
        enabled: true,
        killSwitch: false,
        primary: "codex",
        standby: "claude",
        cooldownMin: 30,
        pollSec: 300,
        initialPollSec: 20,
        maxHandoffsPerTask: 3,
        paidApiFallback: false,
      });
      expect(validConfig.success).toBe(true);

      // Attempting to set paidApiFallback to true MUST be rejected
      const invalidConfig = ConductorConfigSchema.safeParse({
        enabled: true,
        killSwitch: false,
        primary: "codex",
        standby: "claude",
        cooldownMin: 30,
        pollSec: 300,
        initialPollSec: 20,
        maxHandoffsPerTask: 3,
        paidApiFallback: true,
      });
      expect(invalidConfig.success).toBe(false);
    });

    it("computes deterministic SHA-256 transfer deduplication key", () => {
      const key1 = computeTransferKey(
        "task_100",
        "codex",
        "claude",
        "cp_555"
      );
      const key2 = computeTransferKey(
        "task_100",
        "codex",
        "claude",
        "cp_555"
      );
      const keyDiff = computeTransferKey(
        "task_100",
        "codex",
        "claude",
        "cp_556"
      );

      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64); // sha256 hex
      expect(key1).not.toBe(keyDiff);
    });
  });

  describe("2. Mock Data Completeness & Schema Adherence", () => {
    it("validates all mockCliAccounts", () => {
      expect(mockCliAccounts.length).toBeGreaterThanOrEqual(6);
      for (const account of mockCliAccounts) {
        expect(() => CliAccountSchema.parse(account)).not.toThrow();
      }
      const codexAccounts = mockCliAccounts.filter(
        (a) => a.cliKind === "codex"
      );
      expect(codexAccounts.length).toBeGreaterThanOrEqual(3);
      expect(codexAccounts.every((a) => a.isolation === "per_agent")).toBe(
        true
      );

      const agyAccount = mockCliAccounts.find(
        (a) => a.cliKind === "antigravity"
      );
      expect(agyAccount?.isolation).toBe("shared");
    });

    it("validates mockQuotaWindows (exact for Codex, estimated for Claude)", () => {
      for (const qw of mockQuotaWindows) {
        expect(() => QuotaWindowSchema.parse(qw)).not.toThrow();
      }
      const codexQuota = mockQuotaWindows.find(
        (qw) => qw.accountId === "acc_codex_orig"
      );
      expect(codexQuota?.confidence).toBe("exact");
      expect(codexQuota?.usedPercent).toBe(25);

      const claudeQuota = mockQuotaWindows.find(
        (qw) => qw.accountId === "acc_claude_primary"
      );
      expect(claudeQuota?.confidence).toBe("estimated");
    });

    it("validates mockUsageSamples", () => {
      for (const sample of mockUsageSamples) {
        expect(() => UsageSampleSchema.parse(sample)).not.toThrow();
      }
    });

    it("validates mockConductorConfig, Checkpoints, Transfers & Events", () => {
      expect(() => ConductorConfigSchema.parse(mockConductorConfig)).not.toThrow();
      expect(mockConductorConfig.paidApiFallback).toBe(false);
      expect(() => TransferSchema.parse(mockTransfer)).not.toThrow();
      expect(mockTransfer.transferKey).toHaveLength(64);
      for (const evt of mockConductorEvents) {
        expect(() => ConductorEventSchema.parse(evt)).not.toThrow();
      }
      for (const rt of mockRuntimeStatuses) {
        expect(() => ConductorRuntimeStatusSchema.parse(rt)).not.toThrow();
      }
    });

    it("validates mockUsageSummaryResponse", () => {
      expect(() =>
        UsageSummaryResponseSchema.parse(mockUsageSummaryResponse)
      ).not.toThrow();
      expect(mockUsageSummaryResponse.totals.totalTokens).toBe(24120);
    });
  });

  describe("3. MCP Tool Names & Grants (0090/0091 compatible)", () => {
    it("exposes canonical MCP tool names", () => {
      expect(CONDUCTOR_MCP_TOOLS.usageGet).toBe("usage.get");
      expect(CONDUCTOR_MCP_TOOLS.conductorStatus).toBe("conductor.status");
      expect(CONDUCTOR_MCP_TOOLS.conductorHandoff).toBe("conductor.handoff");
      expect(CONDUCTOR_MCP_TOOLS.conductorKill).toBe("conductor.kill");
    });

    it("exposes canonical MCP scopes", () => {
      expect(CONDUCTOR_GRANT_SCOPES).toContain("usage:read");
      expect(CONDUCTOR_GRANT_SCOPES).toContain("conductor:control");
    });

    it("validates MCP tool input schemas", () => {
      expect(
        UsageGetInputSchema.safeParse({ groupBy: "cli", range: "24h" }).success
      ).toBe(true);
      expect(
        ConductorStatusInputSchema.safeParse({ includeEvents: true }).success
      ).toBe(true);
      expect(
        ConductorHandoffInputSchema.safeParse({ taskId: "task_123" }).success
      ).toBe(true);
      expect(
        ConductorKillInputSchema.safeParse({ enabled: true, reason: "emergency" })
          .success
      ).toBe(true);
    });
  });

  describe("4. Router 501 Stubs", () => {
    const usageApp = createUsageRouter();
    const conductorApp = createConductorRouter();

    it("returns 501 for GET /summary", async () => {
      const res = await usageApp.request("/summary?range=24h&groupBy=cli");
      expect(res.status).toBe(501);
      const json = await res.json();
      expect(json.error).toBe("Not Implemented");
      expect(json.endpoint).toBe("/api/usage/summary");
      expect(json.query.range).toBe("24h");
    });

    it("returns 501 for GET /quota", async () => {
      const res = await usageApp.request("/quota");
      expect(res.status).toBe(501);
      const json = await res.json();
      expect(json.error).toBe("Not Implemented");
      expect(json.endpoint).toBe("/api/usage/quota");
    });

    it("returns 501 for GET /events", async () => {
      const res = await usageApp.request("/events");
      expect(res.status).toBe(501);
      const json = await res.json();
      expect(json.error).toBe("Not Implemented");
    });

    it("returns 501 for GET /status", async () => {
      const res = await conductorApp.request("/status");
      expect(res.status).toBe(501);
      const json = await res.json();
      expect(json.error).toBe("Not Implemented");
      expect(json.endpoint).toBe("/api/conductor/status");
    });

    it("returns 501 for POST /kill", async () => {
      const res = await conductorApp.request("/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Testing kill-switch stub" }),
      });
      expect(res.status).toBe(501);
      const json = await res.json();
      expect(json.error).toBe("Not Implemented");
      expect(json.body.reason).toBe("Testing kill-switch stub");
    });

    it("returns 501 for POST /resume", async () => {
      const res = await conductorApp.request("/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Testing resume stub" }),
      });
      expect(res.status).toBe(501);
      const json = await res.json();
      expect(json.error).toBe("Not Implemented");
    });

    it("returns 501 for POST /handoff/:taskId", async () => {
      const res = await conductorApp.request("/handoff/task_429", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRuntime: "claude",
          reason: "Simulated quota failover",
        }),
      });
      expect(res.status).toBe(501);
      const json = await res.json();
      expect(json.error).toBe("Not Implemented");
      expect(json.taskId).toBe("task_429");
      expect(json.body.targetRuntime).toBe("claude");
    });

    it("returns 501 for GET /events", async () => {
      const res = await conductorApp.request("/events");
      expect(res.status).toBe(501);
      const json = await res.json();
      expect(json.error).toBe("Not Implemented");
    });
  });
});
