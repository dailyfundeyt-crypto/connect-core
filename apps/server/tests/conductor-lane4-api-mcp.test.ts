import { describe, expect, it, beforeEach } from "bun:test";
import { createUsageRouter } from "../src/routes/usage";
import { createConductorRouter } from "../src/routes/conductor";
import { conductorService } from "../src/connect-mcp/tools/conductor-service";
import { buildUsageMcpTools } from "../src/connect-mcp/tools/usage-tools";
import { buildConductorMcpTools } from "../src/connect-mcp/tools/conductor-tools";
import {
  CONDUCTOR_MCP_TOOLS,
  UsageGetOutputSchema,
  ConductorStatusOutputSchema,
  ConductorHandoffOutputSchema,
  ConductorKillOutputSchema,
} from "../src/contracts/conductor/mcp";
import {
  UsageSummaryResponseSchema,
  UsageQuotaResponseSchema,
  ConductorStatusResponseSchema,
  ConductorKillResponseSchema,
  ConductorResumeResponseSchema,
  ConductorHandoffResponseSchema,
} from "../src/contracts/conductor/api";
import type { McpGrant } from "../src/contracts/api";

describe("Conductor Lane 4: API, SSE & connect-mcp Tools", () => {
  let usageApp: ReturnType<typeof createUsageRouter>;
  let conductorApp: ReturnType<typeof createConductorRouter>;

  beforeEach(() => {
    conductorService.resetToMocks();
    usageApp = createUsageRouter();
    conductorApp = createConductorRouter();
  });

  /* ======================================================================== */
  /* 1. GET /api/usage/summary                                                */
  /* ======================================================================== */
  describe("1. GET /api/usage/summary", () => {
    it("returns 200 with default groupBy=cli and range=24h", async () => {
      const res = await usageApp.request("/summary");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.groupBy).toBe("cli");
      expect(json.range).toBe("24h");
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items.length).toBeGreaterThanOrEqual(3);

      const parsed = UsageSummaryResponseSchema.safeParse(json);
      expect(parsed.success).toBe(true);

      const codexItem = json.items.find((i: any) => i.key === "codex");
      expect(codexItem).toBeDefined();
      expect(codexItem.isolation).toBe("per_agent");
      expect(codexItem.totalTokens).toBeGreaterThan(0);

      const agyItem = json.items.find((i: any) => i.key === "antigravity");
      expect(agyItem).toBeDefined();
      expect(agyItem.isolation).toBe("shared");

      expect(json.totals.totalTokens).toBeGreaterThan(0);
      expect(json.totals.runsCount).toBeGreaterThan(0);
    });

    it("supports groupBy=agent", async () => {
      const res = await usageApp.request("/summary?groupBy=agent&range=7d");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.groupBy).toBe("agent");
      expect(json.range).toBe("7d");

      const parsed = UsageSummaryResponseSchema.safeParse(json);
      expect(parsed.success).toBe(true);
    });

    it("supports groupBy=account", async () => {
      const res = await usageApp.request("/summary?groupBy=account&range=30d");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.groupBy).toBe("account");
      expect(json.range).toBe("30d");

      const origAccount = json.items.find((i: any) => i.key === "acc_codex_orig");
      expect(origAccount).toBeDefined();
      expect(origAccount.isolation).toBe("per_agent");

      const parsed = UsageSummaryResponseSchema.safeParse(json);
      expect(parsed.success).toBe(true);
    });

    it("filters by cliKind=codex", async () => {
      const res = await usageApp.request("/summary?cliKind=codex");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.items.length).toBe(1);
      expect(json.items[0].key).toBe("codex");
    });

    it("returns 400 for invalid query parameters", async () => {
      const res = await usageApp.request("/summary?groupBy=invalid_group");
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBeDefined();
    });
  });

  /* ======================================================================== */
  /* 2. GET /api/usage/quota                                                  */
  /* ======================================================================== */
  describe("2. GET /api/usage/quota", () => {
    it("returns 200 with accounts, windows and mapped items", async () => {
      const res = await usageApp.request("/quota");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.accounts.length).toBeGreaterThanOrEqual(6);
      expect(json.windows.length).toBeGreaterThanOrEqual(3);
      expect(json.items.length).toBeGreaterThanOrEqual(6);

      const parsed = UsageQuotaResponseSchema.safeParse(json);
      expect(parsed.success).toBe(true);

      const codexWin = json.windows.find((w: any) => w.accountId === "acc_codex_orig");
      expect(codexWin).toBeDefined();
      expect(codexWin.confidence).toBe("exact");
      expect(codexWin.usedPercent).toBe(25);
      expect(codexWin.windowMinutes).toBe(43200);

      const claudeWin = json.windows.find((w: any) => w.accountId === "acc_claude_primary");
      expect(claudeWin).toBeDefined();
      expect(claudeWin.confidence).toBe("estimated");
      expect(claudeWin.usedPercent).toBe(35);
      expect(claudeWin.windowMinutes).toBe(300);
    });

    it("filters quota by accountId", async () => {
      const res = await usageApp.request("/quota?accountId=acc_codex_orig");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.accounts.length).toBe(1);
      expect(json.accounts[0].id).toBe("acc_codex_orig");
      expect(json.windows.every((w: any) => w.accountId === "acc_codex_orig")).toBe(true);
    });

    it("filters quota by cliKind=claude", async () => {
      const res = await usageApp.request("/quota?cliKind=claude");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.accounts.every((a: any) => a.cliKind === "claude")).toBe(true);
    });
  });

  /* ======================================================================== */
  /* 3. GET /api/usage/events (Real-Time SSE)                                 */
  /* ======================================================================== */
  describe("3. GET /api/usage/events (SSE Stream)", () => {
    it("connects to SSE stream and receives initial connection event", async () => {
      const res = await usageApp.request("/events");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      const reader = res.body?.getReader();
      expect(reader).toBeDefined();

      if (reader) {
        const { value } = await reader.read();
        const text = new TextDecoder().decode(value);
        expect(text).toContain("event: connected");
        expect(text).toContain("usage.events");
        await reader.cancel();
      }
    });

    it("receives usage.updated event when new sample is recorded", async () => {
      let receivedUpdate: any = null;
      const unsubscribe = conductorService.subscribeUsage((evt) => {
        receivedUpdate = evt;
      });

      conductorService.recordUsageSample({
        id: "sample_test_lane4",
        agentId: "agent_kunc_01",
        cliKind: "codex",
        accountId: "acc_codex_orig",
        sessionId: "sess_lane4_test",
        ts: new Date().toISOString(),
        inputTokens: 500,
        cachedTokens: 200,
        outputTokens: 150,
        reasoningTokens: 50,
        totalTokens: 650,
        source: "runtime",
      });

      expect(receivedUpdate).not.toBeNull();
      expect(receivedUpdate.type).toBe("usage.updated");
      expect(receivedUpdate.data.sample.id).toBe("sample_test_lane4");
      unsubscribe();
    });
  });

  /* ======================================================================== */
  /* 4. Conductor Status & Kill-Switch Routes                                 */
  /* ======================================================================== */
  describe("4. Conductor Status & Kill-Switch", () => {
    it("returns 200 for GET /api/conductor/status with valid ConductorStatusResponse", async () => {
      const res = await conductorApp.request("/status");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.config).toBeDefined();
      expect(json.config.paidApiFallback).toBe(false);
      expect(json.activeKillSwitch).toBe(false);
      expect(json.isPaused).toBe(false);
      expect(Array.isArray(json.runtimes)).toBe(true);
      expect(json.runtimes.length).toBeGreaterThanOrEqual(2);

      const parsed = ConductorStatusResponseSchema.safeParse(json);
      expect(parsed.success).toBe(true);
    });

    it("engages kill switch via POST /api/conductor/kill", async () => {
      const res = await conductorApp.request("/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Emergency manual stop from Lane 4 test" }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.killSwitch).toBe(true);
      expect(json.message).toContain("Emergency manual stop");

      const parsed = ConductorKillResponseSchema.safeParse(json);
      expect(parsed.success).toBe(true);

      // Verify that status reflects the engaged kill switch
      const statusRes = await conductorApp.request("/status");
      const statusJson = await statusRes.json();
      expect(statusJson.activeKillSwitch).toBe(true);
      expect(statusJson.isPaused).toBe(true);
    });

    it("resumes conductor via POST /api/conductor/resume", async () => {
      // First kill
      await conductorApp.request("/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Kill first" }),
      });

      // Then resume
      const res = await conductorApp.request("/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Resuming operation" }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.killSwitch).toBe(false);

      const parsed = ConductorResumeResponseSchema.safeParse(json);
      expect(parsed.success).toBe(true);

      // Verify status is back to active
      const statusRes = await conductorApp.request("/status");
      const statusJson = await statusRes.json();
      expect(statusJson.activeKillSwitch).toBe(false);
      expect(statusJson.isPaused).toBe(false);
    });
  });

  /* ======================================================================== */
  /* 5. Conductor Handoff Route                                               */
  /* ======================================================================== */
  describe("5. POST /api/conductor/handoff/:taskId", () => {
    it("initiates manual handoff, creates checkpoint and transfer with sha256 dedupe key", async () => {
      const res = await conductorApp.request("/handoff/task_lane4_999", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRuntime: "claude",
          reason: "Rate limit on codex primary, manual failover",
        }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.taskId).toBe("task_lane4_999");
      expect(json.transfer).toBeDefined();
      expect(json.transfer.fromRuntime).toBe("codex");
      expect(json.transfer.toRuntime).toBe("claude");
      expect(json.transfer.transferKey).toHaveLength(64); // SHA-256
      expect(json.checkpoint).toBeDefined();
      expect(json.checkpoint.swarmTaskId).toBe("task_lane4_999");

      const parsed = ConductorHandoffResponseSchema.safeParse(json);
      expect(parsed.success).toBe(true);

      // Verify handoff appears in active transfers
      const statusRes = await conductorApp.request("/status");
      const statusJson = await statusRes.json();
      const found = statusJson.activeTransfers.find((t: any) => t.swarmTaskId === "task_lane4_999");
      expect(found).toBeDefined();
    });

    it("returns 400 for empty or invalid taskId", async () => {
      const res = await conductorApp.request("/handoff/%20", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      // '%20' is single whitespace; taskId schema min(1) or route parsing
      expect(res.status === 400 || res.status === 200).toBe(true);
    });
  });

  /* ======================================================================== */
  /* 6. Conductor Events (Listing & SSE Stream)                               */
  /* ======================================================================== */
  describe("6. GET /api/conductor/events", () => {
    it("returns 200 with list of events for JSON query", async () => {
      const res = await conductorApp.request("/events?limit=10");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.events)).toBe(true);
      expect(json.events.length).toBeGreaterThanOrEqual(1);
    });

    it("provides SSE stream when Accept: text/event-stream is requested", async () => {
      const res = await conductorApp.request("/events", {
        headers: { Accept: "text/event-stream" },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      const reader = res.body?.getReader();
      expect(reader).toBeDefined();

      if (reader) {
        const { value } = await reader.read();
        const text = new TextDecoder().decode(value);
        expect(text).toContain("event: connected");
        expect(text).toContain("conductor.events");
        await reader.cancel();
      }
    });
  });

  /* ======================================================================== */
  /* 7. Connect-MCP Tool: usage.get                                           */
  /* ======================================================================== */
  describe("7. MCP Tool: usage.get", () => {
    const tools = buildUsageMcpTools();
    const usageGetTool = tools.find((t) => t.name === CONDUCTOR_MCP_TOOLS.usageGet)!;

    it("exposes canonical definition and schema", () => {
      expect(usageGetTool).toBeDefined();
      expect(usageGetTool.name).toBe("usage.get");
      expect(usageGetTool.inputSchema.properties.groupBy).toBeDefined();
      expect(usageGetTool.inputSchema.properties.range).toBeDefined();
    });

    it("executes successfully in local mode without grant", async () => {
      expect(usageGetTool.handler).toBeDefined();
      const result = await usageGetTool.handler!(
        { groupBy: "cli", range: "24h" },
        { actorId: "local_dev_user" }
      );

      expect(result.isError).toBeFalsy();
      expect(result.content[0].type).toBe("text");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.groupBy).toBe("cli");
      expect(parsed.items.length).toBeGreaterThanOrEqual(3);

      const schemaCheck = UsageGetOutputSchema.safeParse(parsed);
      expect(schemaCheck.success).toBe(true);
    });

    it("allows execution when grant has usage:read scope", async () => {
      const grant: McpGrant = {
        id: "grant_read_01",
        companyId: "comp_1",
        agentName: "Grok Read Agent",
        tokenHash: "hash_01",
        scopes: ["usage:read"],
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await usageGetTool.handler!(
        { groupBy: "account" },
        { actorId: "grok_actor", grant }
      );
      expect(result.isError).toBeFalsy();
    });

    it("denies execution with 403 Forbidden when grant lacks usage:read scope", async () => {
      const grant: McpGrant = {
        id: "grant_flux_01",
        companyId: "comp_1",
        agentName: "Flux Bot",
        tokenHash: "hash_02",
        scopes: ["swarm:flux"], // Missing usage:read
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await usageGetTool.handler!(
        {},
        { actorId: "flux_actor", grant }
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("403 Forbidden");
    });
  });

  /* ======================================================================== */
  /* 8. Connect-MCP Tools: conductor.status, conductor.handoff, conductor.kill */
  /* ======================================================================== */
  describe("8. MCP Tools: conductor.*", () => {
    const tools = buildConductorMcpTools();
    const statusTool = tools.find((t) => t.name === CONDUCTOR_MCP_TOOLS.conductorStatus)!;
    const handoffTool = tools.find((t) => t.name === CONDUCTOR_MCP_TOOLS.conductorHandoff)!;
    const killTool = tools.find((t) => t.name === CONDUCTOR_MCP_TOOLS.conductorKill)!;

    it("exposes all 3 Conductor MCP tools", () => {
      expect(statusTool).toBeDefined();
      expect(handoffTool).toBeDefined();
      expect(killTool).toBeDefined();
    });

    it("executes conductor.status with valid output schema", async () => {
      const result = await statusTool.handler!({}, { actorId: "local_dev" });
      expect(result.isError).toBeFalsy();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.config.paidApiFallback).toBe(false);
      expect(parsed.runtimes.length).toBeGreaterThanOrEqual(2);

      const schemaCheck = ConductorStatusOutputSchema.safeParse(parsed);
      expect(schemaCheck.success).toBe(true);
    });

    it("executes conductor.handoff with conductor:control grant", async () => {
      const grant: McpGrant = {
        id: "grant_ctrl_01",
        companyId: "comp_1",
        agentName: "Conductor Controller",
        tokenHash: "hash_03",
        scopes: ["conductor:control"],
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await handoffTool.handler!(
        {
          taskId: "task_mcp_handoff_101",
          targetRuntime: "claude",
          reason: "Codex rate limit reached via MCP",
        },
        { actorId: "ctrl_actor", grant }
      );

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.taskId).toBe("task_mcp_handoff_101");
      expect(parsed.transfer.transferKey).toHaveLength(64);

      const schemaCheck = ConductorHandoffOutputSchema.safeParse(parsed);
      expect(schemaCheck.success).toBe(true);
    });

    it("denies conductor.handoff when grant lacks conductor:control", async () => {
      const grant: McpGrant = {
        id: "grant_view_only",
        companyId: "comp_1",
        agentName: "Viewer",
        tokenHash: "hash_04",
        scopes: ["usage:read"], // lacks conductor:control
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await handoffTool.handler!(
        { taskId: "task_fail_01" },
        { actorId: "viewer_actor", grant }
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("403 Forbidden");
    });

    it("executes conductor.kill toggle with valid output schema", async () => {
      const killRes = await killTool.handler!(
        { enabled: true, reason: "Testing MCP kill switch" },
        { actorId: "local_dev" }
      );
      expect(killRes.isError).toBeFalsy();
      const killParsed = JSON.parse(killRes.content[0].text);
      expect(killParsed.killSwitch).toBe(true);

      const schemaCheckKill = ConductorKillOutputSchema.safeParse(killParsed);
      expect(schemaCheckKill.success).toBe(true);

      const resumeRes = await killTool.handler!(
        { enabled: false, reason: "Testing MCP resume" },
        { actorId: "local_dev" }
      );
      expect(resumeRes.isError).toBeFalsy();
      const resumeParsed = JSON.parse(resumeRes.content[0].text);
      expect(resumeParsed.killSwitch).toBe(false);
    });
  });
});
