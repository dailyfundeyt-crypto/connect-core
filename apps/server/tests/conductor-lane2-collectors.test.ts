import { describe, expect, it, beforeEach } from "bun:test";
import { join } from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import {
  CliAccountSchema,
  ConductorRuntimeStatusSchema,
  UsageSampleSchema,
} from "../src/contracts/conductor/types";
import {
  classifyFailure,
  extractResetTime,
  isAuthError,
  isNetworkError,
  isQuotaError,
} from "../src/usage/collectors/failure-patterns";
import {
  getAccountIsolationForCli,
  globalRuntimeCounter,
  isSharedCliKind,
  RuntimeCounter,
  terminalUsageHook,
} from "../src/usage/collectors/runtime-counter";
import {
  collectAntigravityUsage,
  getAntigravityAccount,
  getAntigravityRuntimeStatus,
  inspectAntigravityHome,
} from "../src/usage/collectors/antigravity";
import {
  collectGeminiUsage,
  getGeminiAccount,
  getGeminiRuntimeStatus,
  parseGeminiTelemetryFile,
} from "../src/usage/collectors/gemini";
import {
  collectHermesUsage,
  getHermesAccount,
  getHermesRuntimeStatus,
  inspectHermesHome,
} from "../src/usage/collectors/hermes";
import {
  collectFreebuffUsage,
  getFreebuffAccount,
  getFreebuffRuntimeStatus,
  inspectFreebuffHome,
} from "../src/usage/collectors/freebuff";

describe("Lane 2: Non-Codex/Claude Collectors & Failure Patterns", () => {
  /* ======================================================================== */
  /* 1. Failure Patterns Classification                                       */
  /* ======================================================================== */
  describe("1. Failure Patterns (failure-patterns.ts)", () => {
    it("classifies Codex quota errors correctly", () => {
      const inputs = [
        "Error: rate_limit_reached_type triggered for account",
        "OpenAI API error: You have reached your current usage limit.",
        "Error: rate_limit_exceeded: please wait before issuing more tokens",
        "HTTP error 429 Too Many Requests from api.openai.com",
        "API response status: 429",
      ];
      for (const text of inputs) {
        const res = classifyFailure("codex", text);
        expect(res.failureClass).toBe("quota");
        expect(isQuotaError("codex", text)).toBe(true);
      }
    });

    it("classifies Codex auth errors correctly", () => {
      const inputs = [
        "HTTP 401 Unauthorized",
        "status: 401",
        "Error: Please log in to continue with Codex",
        "Authentication failed: invalid_api_key",
        "Codex token expired, please sign in again",
      ];
      for (const text of inputs) {
        const res = classifyFailure("codex", text);
        expect(res.failureClass).toBe("auth");
        expect(isAuthError("codex", text)).toBe(true);
      }
    });

    it("classifies Codex network and task errors correctly", () => {
      expect(classifyFailure("codex", "fetch failed: ECONNREFUSED 127.0.0.1:443").failureClass).toBe("network");
      expect(classifyFailure("codex", "request ETIMEDOUT to api.openai.com").failureClass).toBe("network");
      expect(isNetworkError("codex", "socket hang up")).toBe(true);

      expect(classifyFailure("codex", "SyntaxError: Unexpected token '<'").failureClass).toBe("task");
      expect(classifyFailure("codex", "command failed with exit code 1", 1).failureClass).toBe("task");
      expect(classifyFailure("codex", "tests failed: 3 failed of 10", 1).failureClass).toBe("task");
    });

    it("classifies Claude quota errors and extracts reset timestamps", () => {
      const textIso = "Error: usage limit reached … resets at 2026-10-22T23:30:00Z";
      const resIso = classifyFailure("claude", textIso);
      expect(resIso.failureClass).toBe("quota");
      expect(resIso.resetsAt).toBe("2026-10-22T23:30:00.000Z");
      expect(resIso.resetsAtEpochSec).toBeGreaterThan(0);

      const textRel = "Error: usage limit reached resets in 45m";
      const resRel = classifyFailure("claude", textRel);
      expect(resRel.failureClass).toBe("quota");
      expect(resRel.suggestedCooldownMin).toBe(45);

      const textRate = "API rate_limit_error: exceeded your current quota";
      expect(classifyFailure("claude", textRate).failureClass).toBe("quota");

      const textOverload = "HTTP 529: overloaded_error at api.anthropic.com";
      expect(classifyFailure("claude", textOverload).failureClass).toBe("quota");
    });

    it("classifies Claude auth, network, and task errors", () => {
      expect(classifyFailure("claude", "authentication_error: invalid_api_key").failureClass).toBe("auth");
      expect(classifyFailure("claude", "Please run `claude login` to authenticate").failureClass).toBe("auth");
      expect(classifyFailure("claude", "HTTP 401 Unauthorized").failureClass).toBe("auth");

      expect(classifyFailure("claude", "failed to reach api.anthropic.com: ECONNRESET").failureClass).toBe("network");
      expect(classifyFailure("claude", "tool use failed: command timed out", 1).failureClass).toBe("task");
    });

    it("classifies Gemini 429 RESOURCE_EXHAUSTED and auth errors", () => {
      const quota1 = "GoogleGenAIError: 429 RESOURCE_EXHAUSTED";
      expect(classifyFailure("gemini", quota1).failureClass).toBe("quota");

      const quota2 = "Quota exceeded for quota metric 'GenerateContentRequests' per-minute";
      expect(classifyFailure("gemini", quota2).failureClass).toBe("quota");

      const quota3 = "Resource has been exhausted (e.g. check quota)";
      expect(classifyFailure("gemini", quota3).failureClass).toBe("quota");

      const auth1 = "401 UNAUTHENTICATED: API key not valid";
      expect(classifyFailure("gemini", auth1).failureClass).toBe("auth");

      const auth2 = "Please log in with Google to use Gemini CLI";
      expect(classifyFailure("gemini", auth2).failureClass).toBe("auth");

      const net1 = "503 UNAVAILABLE: deadline exceeded";
      expect(classifyFailure("gemini", net1).failureClass).toBe("network");
    });

    it("classifies Antigravity quota and auth errors", () => {
      expect(classifyFailure("antigravity", "Error: 429 RESOURCE_EXHAUSTED from backend").failureClass).toBe("quota");
      expect(classifyFailure("antigravity", "Daily quota limit reached for account").failureClass).toBe("quota");
      expect(classifyFailure("antigravity", "401 unauthenticated: session expired").failureClass).toBe("auth");
      expect(classifyFailure("antigravity", "login required: please sign in").failureClass).toBe("auth");
      expect(classifyFailure("antigravity", "daemon connection refused, offline").failureClass).toBe("network");
    });

    it("classifies Hermes and Freebuff errors", () => {
      expect(classifyFailure("hermes", "rate_limit_exceeded (HTTP 429)").failureClass).toBe("quota");
      expect(classifyFailure("hermes", "401 Unauthorized: invalid api key").failureClass).toBe("auth");
      expect(classifyFailure("freebuff", "429 quota exceeded on gateway").failureClass).toBe("quota");
      expect(classifyFailure("freebuff", "401 unauthorized: invalid credentials").failureClass).toBe("auth");
    });

    it("extracts various reset formats via extractResetTime", () => {
      const epoch = extractResetTime("resets_at: 1793200000");
      expect(epoch).not.toBeNull();
      expect(epoch?.resetsAtEpochSec).toBe(1793200000);

      const iso = extractResetTime("Quota resets at 2026-10-22T23:00:00Z please wait");
      expect(iso).not.toBeNull();
      expect(iso?.resetsAtIso).toBe("2026-10-22T23:00:00.000Z");

      const hours = extractResetTime("Rate limit resets in 2 hours");
      expect(hours?.delayMinutes).toBe(120);

      const invalid = extractResetTime("Just normal output");
      expect(invalid).toBeNull();
    });

    it("falls back to unknown for unclassified error exit codes", () => {
      const res = classifyFailure("codex", "Finished with unexpected state", 137);
      expect(res.failureClass).toBe("unknown");
    });
  });

  /* ======================================================================== */
  /* 2. Runtime Counter & Terminal Activity Tracking                          */
  /* ======================================================================== */
  describe("2. Runtime Activity Counter (runtime-counter.ts)", () => {
    let counter: RuntimeCounter;

    beforeEach(() => {
      counter = new RuntimeCounter();
      counter.reset();
    });

    it("marks isolation='shared' for Antigravity, Gemini, Hermes, Freebuff", () => {
      expect(isSharedCliKind("antigravity")).toBe(true);
      expect(isSharedCliKind("gemini")).toBe(true);
      expect(isSharedCliKind("gemini-cli")).toBe(true);
      expect(isSharedCliKind("hermes")).toBe(true);
      expect(isSharedCliKind("freebuff")).toBe(true);

      expect(isSharedCliKind("codex")).toBe(false);
      expect(isSharedCliKind("claude")).toBe(false);

      expect(getAccountIsolationForCli("antigravity")).toBe("shared");
      expect(getAccountIsolationForCli("gemini")).toBe("shared");
      expect(getAccountIsolationForCli("codex")).toBe("per_agent");
      expect(getAccountIsolationForCli("claude")).toBe("per_agent");
    });

    it("tracks start, chunks, and exit of a terminal session", () => {
      const run = counter.startRun("agent_001", "antigravity");
      expect(run.status).toBe("running");
      expect(run.isolation).toBe("shared");
      expect(run.accountId).toBe("acc_agy_default");
      expect(counter.getActiveRuns().length).toBe(1);

      // Record chunk
      counter.recordChunk("agent_001", "Starting task execution...\n");
      counter.recordChunk("agent_001", "Error: 429 RESOURCE_EXHAUSTED\n");

      // Live classification detected quota error
      const active = counter.getActiveRuns()[0];
      expect(active.failureClassification?.failureClass).toBe("quota");

      // Exit process
      const finished = counter.endRun("agent_001", 1, "Exit due to 429 quota");
      expect(finished).not.toBeNull();
      expect(finished?.status).toBe("crashed");
      expect(finished?.failureClassification?.failureClass).toBe("quota");
      expect(finished?.durationSeconds).toBeGreaterThanOrEqual(1);

      expect(counter.getActiveRuns().length).toBe(0);
      expect(counter.getCompletedRuns().length).toBe(1);
    });

    it("generates schema-compliant UsageSample with source='runtime'", () => {
      const run = counter.startRun("agent_002", "hermes");
      const finished = counter.endRun("agent_002", 0);
      expect(finished).not.toBeNull();

      const sample = counter.toUsageSample(finished!);
      expect(() => UsageSampleSchema.parse(sample)).not.toThrow();
      expect(sample.source).toBe("runtime");
      expect(sample.cliKind).toBe("hermes");
      expect(sample.totalTokens).toBe(0);
      expect(sample.rawRef).toContain("runtime:");
    });

    it("aggregates summary metrics across multiple runs", () => {
      // Run 1: OK
      counter.startRun("agent_test", "freebuff");
      counter.endRun("agent_test", 0);

      // Run 2: Quota error
      counter.startRun("agent_test", "freebuff");
      counter.recordChunk("agent_test", "429 Too Many Requests");
      counter.endRun("agent_test", 1);

      // Run 3: Auth error
      counter.startRun("agent_test", "freebuff");
      counter.recordChunk("agent_test", "401 Unauthorized");
      counter.endRun("agent_test", 1);

      const summary = counter.getSummary({ cliKind: "freebuff" });
      expect(summary.runsCount).toBe(3);
      expect(summary.isolation).toBe("shared");
      expect(summary.durationSeconds).toBeGreaterThanOrEqual(3);
      expect(summary.byFailureClass.quota).toBe(1);
      expect(summary.byFailureClass.auth).toBe(1);
      expect(summary.failuresCount).toBe(2);
    });

    it("supports the terminalUsageHook interface cleanly", () => {
      globalRuntimeCounter.reset();

      const runId = terminalUsageHook.onStart("agent_hook_1", "gemini");
      expect(runId).toBeDefined();

      terminalUsageHook.onData("agent_hook_1", "gemini", "Running analysis...\n");
      const record = terminalUsageHook.onExit("agent_hook_1", "gemini", 0);

      expect(record?.status).toBe("completed");
      expect(record?.cliKind).toBe("gemini");
      expect(record?.isolation).toBe("shared");
    });
  });

  /* ======================================================================== */
  /* 3. Antigravity Collector (antigravity.ts)                                */
  /* ======================================================================== */
  describe("3. Antigravity Collector (antigravity.ts)", () => {
    it("returns valid shared account adhering to CliAccountSchema", () => {
      const acc = getAntigravityAccount();
      expect(() => CliAccountSchema.parse(acc)).not.toThrow();
      expect(acc.isolation).toBe("shared");
      expect(acc.cliKind).toBe("antigravity");
      expect(acc.id).toBe("acc_agy_default");
    });

    it("safely inspects directory and returns inspection metrics", () => {
      const tempDir = join(tmpdir(), `agy_test_${Date.now()}`);
      mkdirSync(join(tempDir, "conversations"), { recursive: true });
      writeFileSync(join(tempDir, "conversations", "conv_1.pb"), "mock_pb");
      writeFileSync(join(tempDir, "conversations", "conv_2.pb"), "mock_pb");
      writeFileSync(join(tempDir, "daemon.log"), "daemon started\n");

      const inspection = inspectAntigravityHome(tempDir);
      expect(inspection.exists).toBe(true);
      expect(inspection.conversationsCount).toBe(2);
      expect(inspection.daemonLogExists).toBe(true);
      expect(inspection.lastConversationAt).toBeDefined();

      rmSync(tempDir, { recursive: true, force: true });
    });

    it("collects complete Antigravity usage bundle with ConductorRuntimeStatus", () => {
      const counter = new RuntimeCounter();
      counter.startRun("agent_agy_01", "antigravity");
      counter.endRun("agent_agy_01", 0);

      const bundle = collectAntigravityUsage(counter);
      expect(() => CliAccountSchema.parse(bundle.account)).not.toThrow();
      expect(() => ConductorRuntimeStatusSchema.parse(bundle.runtimeStatus)).not.toThrow();
      expect(bundle.account.isolation).toBe("shared");
      expect(bundle.summary.runsCount).toBe(1);
      expect(bundle.samples.length).toBe(1);
    });
  });

  /* ======================================================================== */
  /* 4. Gemini Collector & Telemetry (gemini.ts)                              */
  /* ======================================================================== */
  describe("4. Gemini Collector (gemini.ts)", () => {
    it("returns valid shared account for Gemini", () => {
      const acc = getGeminiAccount();
      expect(() => CliAccountSchema.parse(acc)).not.toThrow();
      expect(acc.isolation).toBe("shared");
      expect(acc.cliKind).toBe("gemini");
      expect(acc.id).toBe("acc_gemini_default");
    });

    it("parses JSON array telemetry outfiles", () => {
      const tempTelemetry = join(tmpdir(), `gemini_telemetry_${Date.now()}.json`);
      const payload = [
        {
          timestamp: "2026-10-22T20:00:00Z",
          session_id: "sess_gem_01",
          model: "gemini-1.5-pro",
          prompt_tokens: 1500,
          candidates_tokens: 350,
          cached_tokens: 500,
          total_tokens: 1850,
          status_code: 200,
        },
        {
          timestamp: "2026-10-22T20:10:00Z",
          session_id: "sess_gem_02",
          prompt_tokens: 800,
          candidates_tokens: 200,
          total_tokens: 1000,
          status_code: 429,
          error: "RESOURCE_EXHAUSTED",
        },
      ];
      writeFileSync(tempTelemetry, JSON.stringify(payload, null, 2), "utf8");

      const entries = parseGeminiTelemetryFile(tempTelemetry);
      expect(entries.length).toBe(2);
      expect(entries[0].promptTokens).toBe(1500);
      expect(entries[0].candidatesTokens).toBe(350);
      expect(entries[0].totalTokens).toBe(1850);
      expect(entries[1].statusCode).toBe(429);

      rmSync(tempTelemetry, { force: true });
    });

    it("parses JSON Lines (JSONL) telemetry outfiles", () => {
      const tempTelemetry = join(tmpdir(), `gemini_telemetry_${Date.now()}.jsonl`);
      const lines = [
        JSON.stringify({
          ts: "2026-10-22T19:00:00Z",
          sessionId: "gem_jsonl_1",
          input_tokens: 400,
          output_tokens: 120,
        }),
        JSON.stringify({
          ts: "2026-10-22T19:05:00Z",
          sessionId: "gem_jsonl_2",
          input_tokens: 600,
          output_tokens: 250,
        }),
      ].join("\n");
      writeFileSync(tempTelemetry, lines, "utf8");

      const entries = parseGeminiTelemetryFile(tempTelemetry);
      expect(entries.length).toBe(2);
      expect(entries[0].promptTokens).toBe(400);
      expect(entries[0].candidatesTokens).toBe(120);
      expect(entries[0].totalTokens).toBe(520);

      rmSync(tempTelemetry, { force: true });
    });

    it("falls back gracefully to runtime counter when telemetry file is absent", () => {
      const counter = new RuntimeCounter();
      counter.startRun("agent_gem_test", "gemini");
      counter.endRun("agent_gem_test", 0);

      const fakeHome = join(tmpdir(), `non_existent_gemini_${Date.now()}`);
      const bundle = collectGeminiUsage(counter, fakeHome);

      expect(bundle.telemetry.outfileConfigured).toBe(false);
      expect(bundle.summary.runsCount).toBe(1);
      expect(bundle.samples.length).toBe(1);
      expect(bundle.samples[0].source).toBe("runtime");
      expect(() => ConductorRuntimeStatusSchema.parse(bundle.runtimeStatus)).not.toThrow();
    });
  });

  /* ======================================================================== */
  /* 5. Hermes & Freebuff Collectors (hermes.ts, freebuff.ts)                 */
  /* ======================================================================== */
  describe("5. Hermes & Freebuff Collectors", () => {
    it("validates Hermes collector and shared account", () => {
      const acc = getHermesAccount();
      expect(() => CliAccountSchema.parse(acc)).not.toThrow();
      expect(acc.isolation).toBe("shared");
      expect(acc.cliKind).toBe("hermes");

      const counter = new RuntimeCounter();
      counter.startRun("agent_hermes", "hermes");
      counter.endRun("agent_hermes", 0);

      const bundle = collectHermesUsage(counter);
      expect(bundle.account.isolation).toBe("shared");
      expect(bundle.summary.runsCount).toBe(1);
      expect(bundle.samples[0].source).toBe("runtime");
      expect(() => ConductorRuntimeStatusSchema.parse(bundle.runtimeStatus)).not.toThrow();
    });

    it("validates Freebuff collector and shared account", () => {
      const acc = getFreebuffAccount();
      expect(() => CliAccountSchema.parse(acc)).not.toThrow();
      expect(acc.isolation).toBe("shared");
      expect(acc.cliKind).toBe("freebuff");

      const counter = new RuntimeCounter();
      counter.startRun("agent_freebuff", "freebuff");
      counter.endRun("agent_freebuff", 0);

      const bundle = collectFreebuffUsage(counter);
      expect(bundle.account.isolation).toBe("shared");
      expect(bundle.summary.runsCount).toBe(1);
      expect(bundle.samples[0].source).toBe("runtime");
      expect(() => ConductorRuntimeStatusSchema.parse(bundle.runtimeStatus)).not.toThrow();
    });
  });
});
