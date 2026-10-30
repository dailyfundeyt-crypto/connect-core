import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  CliAccountSchema,
  QuotaConfidenceSchema,
  QuotaWindowSchema,
  UsageSampleSchema,
} from "../src/contracts/conductor/types";
import {
  cliAccounts,
  cliQuotaWindows,
  cliUsageSamples,
} from "../src/db/schema/usage";
import {
  collectClaudeUsage,
  computeClaude5hQuotaWindow,
  discoverClaudeHomes,
  findClaudeProjectFiles,
  parseClaudeJsonlLine,
} from "../src/usage/collectors/claude";
import {
  collectCodexUsage,
  discoverCodexHomes,
  extractCodexSessionId,
  findCodexRolloutFiles,
  parseCodexRolloutLine,
} from "../src/usage/collectors/codex";
import { CursorStore } from "../src/usage/collectors/cursor-store";

describe("Lane 1: Usage Data Model & Codex/Claude Collectors", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lane1-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("1. Drizzle Schema (usage.ts)", () => {
    it("defines cli_accounts table with expected fields", () => {
      expect(cliAccounts).toBeDefined();
      expect(cliAccounts.id.name).toBe("id");
      expect(cliAccounts.cliKind.name).toBe("cli_kind");
      expect(cliAccounts.isolation.name).toBe("isolation");
      expect(cliAccounts.homePath.name).toBe("home_path");
    });

    it("defines cli_usage_samples table with expected fields", () => {
      expect(cliUsageSamples).toBeDefined();
      expect(cliUsageSamples.id.name).toBe("id");
      expect(cliUsageSamples.inputTokens.name).toBe("input_tokens");
      expect(cliUsageSamples.outputTokens.name).toBe("output_tokens");
      expect(cliUsageSamples.cachedTokens.name).toBe("cached_tokens");
      expect(cliUsageSamples.sourceFile.name).toBe("source_file");
      expect(cliUsageSamples.offset.name).toBe("offset");
    });

    it("defines cli_quota_windows table with expected fields", () => {
      expect(cliQuotaWindows).toBeDefined();
      expect(cliQuotaWindows.id.name).toBe("id");
      expect(cliQuotaWindows.windowKind.name).toBe("window_kind");
      expect(cliQuotaWindows.usedPercent.name).toBe("used_percent");
      expect(cliQuotaWindows.confidence.name).toBe("confidence");
      expect(cliQuotaWindows.resetsAt.name).toBe("resets_at");
    });
  });

  describe("2. CursorStore (Offset & Idempotency)", () => {
    it("tracks and persists byte offsets correctly", () => {
      const store = new CursorStore();
      const testFile = path.join(tmpDir, "test.jsonl");

      expect(store.getCursor(testFile)).toBe(0);
      expect(store.hasCursor(testFile)).toBe(false);

      store.setCursor(testFile, 1024);
      expect(store.getCursor(testFile)).toBe(1024);
      expect(store.hasCursor(testFile)).toBe(true);

      store.reset(testFile);
      expect(store.getCursor(testFile)).toBe(0);
    });

    it("initializes cursors from existing sample records", () => {
      const store = new CursorStore();
      const fileA = path.join(tmpDir, "fileA.jsonl");
      const fileB = path.join(tmpDir, "fileB.jsonl");

      store.initFromSamples([
        { sourceFile: fileA, offset: 100 },
        { sourceFile: fileA, offset: 350 },
        { sourceFile: fileA, offset: 200 },
        { sourceFile: fileB, offset: 50 },
      ]);

      expect(store.getCursor(fileA)).toBe(350);
      expect(store.getCursor(fileB)).toBe(50);
    });

    it("tails new lines incrementally and handles partial trailing lines", async () => {
      const store = new CursorStore();
      const testFile = path.join(tmpDir, "tail.jsonl");

      // Write two complete lines
      fs.writeFileSync(
        testFile,
        '{"line":1}\n{"line":2}\n',
        "utf-8"
      );

      const pass1 = await store.readNewLines(testFile);
      expect(pass1.lines).toHaveLength(2);
      expect(pass1.lines[0].line).toBe('{"line":1}');
      expect(pass1.lines[1].line).toBe('{"line":2}');
      expect(pass1.lines[0].offset).toBe(0);
      expect(pass1.newOffset).toBeGreaterThan(0);

      // Second read immediately: should return 0 new lines (idempotent)
      const pass2 = await store.readNewLines(testFile);
      expect(pass2.lines).toHaveLength(0);

      // Append one complete line and one incomplete trailing line
      fs.appendFileSync(testFile, '{"line":3}\n{"line":4-incomp', "utf-8");

      const pass3 = await store.readNewLines(testFile);
      expect(pass3.lines).toHaveLength(1);
      expect(pass3.lines[0].line).toBe('{"line":3}');

      // Complete line 4
      fs.appendFileSync(testFile, 'lete}\n', "utf-8");

      const pass4 = await store.readNewLines(testFile);
      expect(pass4.lines).toHaveLength(1);
      expect(pass4.lines[0].line).toBe('{"line":4-incomplete}');
    });

    it("resets cursor to 0 on file truncation or rotation", async () => {
      const store = new CursorStore();
      const testFile = path.join(tmpDir, "rotate.jsonl");

      fs.writeFileSync(testFile, "line1\nline2\nline3\n", "utf-8");
      await store.readNewLines(testFile);
      expect(store.getCursor(testFile)).toBeGreaterThan(10);

      // Truncate file (smaller than cursor)
      fs.writeFileSync(testFile, "new_line\n", "utf-8");
      const pass = await store.readNewLines(testFile);
      expect(pass.lines).toHaveLength(1);
      expect(pass.lines[0].line).toBe("new_line");
    });
  });

  describe("3. Codex Collector (rollout-*.jsonl, token_count, exact quota)", () => {
    const fixtureCodexLine = JSON.stringify({
      timestamp: "2026-10-22T19:30:00.000Z",
      ordinal: 42,
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 28400,
            cached_input_tokens: 18200,
            cache_write_input_tokens: 0,
            output_tokens: 1650,
            reasoning_output_tokens: 450,
            total_tokens: 30500,
          },
          last_token_usage: {
            input_tokens: 500,
            cached_input_tokens: 0,
            output_tokens: 50,
            total_tokens: 550,
          },
          model_context_window: 258400,
        },
        rate_limits: {
          limit_id: "codex",
          plan_type: "go",
          primary: {
            used_percent: 25.0,
            window_minutes: 43200,
            resets_at: 1794350000,
          },
          secondary: {
            used_percent: 5.0,
            window_minutes: 1440,
            resets_at: 1794100000,
          },
        },
      },
    });

    it("parses token_count line and extracts exact rate_limits", () => {
      const result = parseCodexRolloutLine(fixtureCodexLine, {
        filePath: "C:\\tmp\\rollout-2026-10-22T19-30-00-11112222-3333-4444-5555-666677778888.jsonl",
        offset: 1024,
        accountId: "acc_codex_orig",
        agentId: "agent_kunc_01",
      });

      expect(result).not.toBeNull();
      const sample = result!.sample;
      expect(sample).toBeDefined();

      // Validate against Zod schema from contracts
      expect(() => UsageSampleSchema.parse(sample)).not.toThrow();
      expect(sample!.cliKind).toBe("codex");
      expect(sample!.accountId).toBe("acc_codex_orig");
      expect(sample!.agentId).toBe("agent_kunc_01");
      expect(sample!.inputTokens).toBe(28400);
      expect(sample!.cachedTokens).toBe(18200);
      expect(sample!.outputTokens).toBe(1650);
      expect(sample!.reasoningTokens).toBe(450);
      expect(sample!.totalTokens).toBe(30500);
      expect(sample!.offset).toBe(1024);

      // Check QuotaWindows
      expect(result!.quotaWindows).toHaveLength(2);
      const primary = result!.quotaWindows.find((w) => w.windowKind === "primary");
      expect(primary).toBeDefined();
      expect(() => QuotaWindowSchema.parse(primary)).not.toThrow();
      expect(primary!.confidence).toBe("exact");
      expect(primary!.usedPercent).toBe(25.0);
      expect(primary!.resetsAt).toBe(1794350000);
      expect(primary!.windowMinutes).toBe(43200);

      const secondary = result!.quotaWindows.find((w) => w.windowKind === "secondary");
      expect(secondary).toBeDefined();
      expect(secondary!.usedPercent).toBe(5.0);
      expect(secondary!.resetsAt).toBe(1794100000);
    });

    it("extracts session UUID from rollout filename", () => {
      const p1 = "rollout-2026-09-16T20-01-19-01a0ab61-5bfa-7d72-832c-52a26ebcde61.jsonl";
      expect(extractCodexSessionId(p1)).toBe("01a0ab61-5bfa-7d72-832c-52a26ebcde61");
    });

    it("runs collectCodexUsage over a mock home structure", async () => {
      const mockHome = path.join(tmpDir, "codex-test-home");
      const sessionsDir = path.join(mockHome, "sessions", "2026", "10", "22");
      fs.mkdirSync(sessionsDir, { recursive: true });

      const rolloutFile = path.join(
        sessionsDir,
        "rollout-2026-10-22T19-30-00-11112222-3333-4444-5555-666677778888.jsonl"
      );
      fs.writeFileSync(rolloutFile, `${fixtureCodexLine}\n`, "utf-8");

      const cursorStore = new CursorStore();
      const res = await collectCodexUsage({
        homes: [
          {
            homePath: mockHome,
            accountId: "acc_codex_test",
            agentId: null,
            label: "Codex Test Account",
            planType: "go",
          },
        ],
        cursorStore,
      });

      expect(res.filesProcessed).toBe(1);
      expect(res.samples).toHaveLength(1);
      expect(res.quotaWindows).toHaveLength(2);
      expect(res.quotaWindows[0].confidence).toBe("exact");

      // Second run: no new lines
      const res2 = await collectCodexUsage({
        homes: [
          {
            homePath: mockHome,
            accountId: "acc_codex_test",
          },
        ],
        cursorStore,
      });
      expect(res2.samples).toHaveLength(0);
    });
  });

  describe("4. Claude Collector (projects/**/*.jsonl, 5h-Heuristik estimated)", () => {
    const fixtureClaudeLine = JSON.stringify({
      parentUuid: "e9c0061c-82df-47b2-ab0d-7496b29a3c55",
      type: "assistant",
      uuid: "6cd02c31-8235-4907-8cc0-831e41234d8d",
      timestamp: "2026-10-22T18:00:00.000Z",
      sessionId: "5d7eb608-5cef-4df8-b91a-6ebfd869e2e2",
      message: {
        role: "assistant",
        usage: {
          input_tokens: 15400,
          output_tokens: 2200,
          cache_read_input_tokens: 6100,
          cache_creation_input_tokens: 1200,
        },
      },
    });

    it("parses Claude message.usage line", () => {
      const sample = parseClaudeJsonlLine(fixtureClaudeLine, {
        filePath: "C:\\tmp\\projects\\proj1\\chat.jsonl",
        offset: 512,
        accountId: "acc_claude_primary",
        agentId: "agent_kunc_01",
      });

      expect(sample).not.toBeNull();
      expect(() => UsageSampleSchema.parse(sample)).not.toThrow();
      expect(sample!.cliKind).toBe("claude");
      expect(sample!.accountId).toBe("acc_claude_primary");
      expect(sample!.inputTokens).toBe(15400);
      expect(sample!.outputTokens).toBe(2200);
      expect(sample!.cachedTokens).toBe(6100);
      expect(sample!.totalTokens).toBe(15400 + 2200 + 6100 + 1200);
      expect(sample!.offset).toBe(512);
    });

    it("computes 5h rolling heuristic QuotaWindow with estimated confidence", () => {
      const refTime = new Date("2026-10-22T20:00:00.000Z");
      const sample1 = parseClaudeJsonlLine(fixtureClaudeLine, {
        filePath: "file1.jsonl",
        offset: 0,
        accountId: "acc_claude_primary",
      })!;
      // sample1 is at 18:00:00 (within 5h of 20:00:00)

      const qw = computeClaude5hQuotaWindow([sample1], "acc_claude_primary", {
        referenceTime: refTime,
        estimatedTokensPer5hCap: 100000,
      });

      expect(() => QuotaWindowSchema.parse(qw)).not.toThrow();
      expect(qw.confidence).toBe("estimated");
      expect(qw.windowKind).toBe("heuristic_5h");
      expect(qw.windowMinutes).toBe(300);
      // First activity was at 18:00:00, so reset is at 18:00:00 + 5h = 23:00:00
      expect(qw.resetsAt).toBe(new Date("2026-10-22T23:00:00.000Z").toISOString());
      expect(qw.usedPercent).toBeGreaterThan(0);
    });

    it("runs collectClaudeUsage over a mock projects structure", async () => {
      const mockHome = path.join(tmpDir, "claude-test-home");
      const projDir = path.join(mockHome, "projects", "mock-project");
      fs.mkdirSync(projDir, { recursive: true });

      const jsonlFile = path.join(projDir, "session.jsonl");
      fs.writeFileSync(jsonlFile, `${fixtureClaudeLine}\n`, "utf-8");

      const cursorStore = new CursorStore();
      const res = await collectClaudeUsage({
        homes: [
          {
            homePath: mockHome,
            accountId: "acc_claude_primary",
            agentId: "agent_primary",
            label: "Claude Standby",
            planType: "pro",
          },
        ],
        cursorStore,
        referenceTime: new Date("2026-10-22T20:00:00.000Z"),
      });

      expect(res.filesProcessed).toBe(1);
      expect(res.samples).toHaveLength(1);
      expect(res.quotaWindows).toHaveLength(1);
      expect(res.quotaWindows[0].confidence).toBe("estimated");
      expect(res.quotaWindows[0].windowKind).toBe("heuristic_5h");
    });
  });

  describe("5. Account Discovery", () => {
    it("discovers mock/real accounts adhering to CliAccountSchema", () => {
      const codexHomes = discoverCodexHomes();
      expect(codexHomes.length).toBeGreaterThan(0);
      for (const home of codexHomes) {
        expect(home.accountId).toBeDefined();
        expect(home.homePath).toBeDefined();
      }

      const claudeHomes = discoverClaudeHomes();
      expect(claudeHomes.length).toBeGreaterThan(0);
      expect(claudeHomes.some((h) => h.accountId === "acc_claude_primary")).toBe(true);
    });
  });
});
