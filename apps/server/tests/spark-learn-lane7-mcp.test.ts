import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  sparkLearnBrainTools,
  buildSparkLearnMcpTools,
  callSparkLearnTool,
} from "../src/brain/learn/mcp-tools";
import { buildSparkLearnHandlerTools } from "../src/connect-mcp/handlers/spark-learn";
import { AskService } from "../src/brain/learn/ask/service";
import { CliRunner, DeterministicSparkMockRunner } from "../src/brain/learn/ask/cli-runner";
import type { McpGrant } from "../src/contracts/api";

describe("Spark-Learn Lane 7: MCP Tools Registration & Metadata", () => {
  it("should export buildSparkLearnMcpTools with all 7 tools and dot aliases", () => {
    const tools = buildSparkLearnMcpTools();
    expect(tools.length).toBe(14); // 7 tools + 7 dot-notation aliases

    const toolNames = tools.map((t) => t.name);
    // Underscore names
    expect(toolNames).toContain("spark_ask");
    expect(toolNames).toContain("spark_semantic_search");
    expect(toolNames).toContain("spark_related");
    expect(toolNames).toContain("spark_quiz_next");
    expect(toolNames).toContain("spark_learn_status");
    expect(toolNames).toContain("spark_propose");
    expect(toolNames).toContain("spark_youtube_import");

    // Dot notation aliases
    expect(toolNames).toContain("spark.ask");
    expect(toolNames).toContain("spark.semantic_search");
    expect(toolNames).toContain("spark.related");
    expect(toolNames).toContain("spark.quiz_next");
    expect(toolNames).toContain("spark.learn_status");
    expect(toolNames).toContain("spark.propose");
    expect(toolNames).toContain("spark.youtube_import");
  });

  it("should have valid JSON-Schema inputs for all MCP tools", () => {
    const tools = buildSparkLearnMcpTools();
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.type).toBe("object");
      expect(typeof tool.inputSchema.properties).toBe("object");
      expect(typeof tool.handler).toBe("function");
    }
  });

  it("should export handler through connect-mcp/handlers/spark-learn.ts", () => {
    const tools = buildSparkLearnHandlerTools();
    expect(tools.length).toBe(14);
    const askTool = tools.find((t) => t.name === "spark_ask");
    expect(askTool).toBeDefined();
    expect(askTool?.name).toBe("spark_ask");
  });
});

describe("Spark-Learn Lane 7: Connect-MCP Tool Execution & Permissions", () => {
  const grantWithRead: McpGrant = {
    id: "grant_test_read",
    companyId: "test_company",
    agentName: "test_agent",
    tokenHash: "hash_read",
    scopes: ["spark:read"],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const grantWithWrite: McpGrant = {
    id: "grant_test_write",
    companyId: "test_company",
    agentName: "test_agent",
    tokenHash: "hash_write",
    scopes: ["spark:read", "spark:write"],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const grantWithoutPermissions: McpGrant = {
    id: "grant_test_none",
    companyId: "test_company",
    agentName: "test_agent",
    tokenHash: "hash_none",
    scopes: ["other:scope"],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const fastAskService = new AskService({
    cliRunner: new CliRunner([new DeterministicSparkMockRunner()]),
  });

  it("should deny spark_ask without spark:read scope", async () => {
    const tools = buildSparkLearnMcpTools({ grant: grantWithoutPermissions, askService: fastAskService });
    const askTool = tools.find((t) => t.name === "spark_ask")!;
    const res = await askTool.handler!({ query: "Test" }, { actorId: "test" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Forbidden");
  });

  it("should allow spark_ask with spark:read scope", async () => {
    const tools = buildSparkLearnMcpTools({ grant: grantWithRead, askService: fastAskService });
    const askTool = tools.find((t) => t.name === "spark_ask")!;
    const res = await askTool.handler!({ query: "Wie funktioniert Connect?" }, { actorId: "test" });
    expect(res.isError).toBeUndefined();
    const data = JSON.parse(res.content[0].text);
    expect(data.success).toBe(true);
    expect(data.response).toBeDefined();
    expect(data.response.query).toBe("Wie funktioniert Connect?");
  });

  it("should deny spark_propose without spark:write scope", async () => {
    const tools = buildSparkLearnMcpTools({ grant: grantWithRead });
    const proposeTool = tools.find((t) => t.name === "spark_propose")!;
    const res = await proposeTool.handler!(
      {
        kind: "new_note",
        payload: { path: "Inbox/Test.md", title: "Test", content: "Content" },
        rationale: "Testing propose scope",
      },
      { actorId: "test" },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Forbidden");
  });

  it("should allow spark_propose with spark:write scope", async () => {
    const tools = buildSparkLearnMcpTools({ grant: grantWithWrite });
    const proposeTool = tools.find((t) => t.name === "spark_propose")!;
    const res = await proposeTool.handler!(
      {
        kind: "add_link",
        payload: { source: "NoteA.md", target: "NoteB.md" },
        rationale: "Link relevant concepts together",
        sources: ["NoteA.md"],
      },
      { actorId: "test" },
    );
    expect(res.isError).toBeUndefined();
    const data = JSON.parse(res.content[0].text);
    expect(data.success).toBe(true);
    expect(data.proposalId).toBeDefined();
    expect(data.status).toBe("pending");
    expect(data.inboxPath).toContain("Inbox/");
  });

  it("should execute spark_learn_status successfully", async () => {
    const tools = buildSparkLearnMcpTools();
    const statusTool = tools.find((t) => t.name === "spark_learn_status")!;
    const res = await statusTool.handler!({}, { actorId: "test" });
    expect(res.isError).toBeUndefined();
    const data = JSON.parse(res.content[0].text);
    expect(data.success).toBe(true);
    expect(data.indexer).toBeDefined();
    expect(data.ollama).toBeDefined();
  });
});

describe("Spark-Learn Lane 7: Connect Agent Tools & Vault Isolation", () => {
  let testVaultRoot: string;
  let prevBrainPath: string | undefined;

  const fastAskService = new AskService({
    cliRunner: new CliRunner([new DeterministicSparkMockRunner()]),
  });

  beforeEach(() => {
    testVaultRoot = path.join(os.tmpdir(), `test-spark-lane7-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    mkdirSync(testVaultRoot, { recursive: true });
    mkdirSync(path.join(testVaultRoot, "Inbox"), { recursive: true });
    mkdirSync(path.join(testVaultRoot, "Projects"), { recursive: true });

    // Create agents.json giving 'sparkbot' access with valid BRAIN_AREAS
    const agentsJson = {
      version: 1,
      agents: [
        {
          id: "bot_spark_test",
          connectAgentId: "bot_spark_test",
          slug: "sparkbot",
          name: "Spark Test Agent",
          read: ["Kern", "Shared", "Projects", "Memory", "Daily", "Inbox", "Skills"],
          write: ["Inbox", "Memory"],
        },
      ],
      projects: [],
    };
    writeFileSync(path.join(testVaultRoot, "agents.json"), JSON.stringify(agentsJson, null, 2), "utf8");

    // Sample note
    writeFileSync(
      path.join(testVaultRoot, "Projects", "Architektur.md"),
      `# System Architektur

Hier ist die Dokumentation der Softwarearchitektur.

## Datenbank
Die Persistenz erfolgt über PostgreSQL auf Port 5544 mit pgvector.

## Vektor Embeddings
Embeddings werden lokal über Ollama bge-m3 mit 1024 Dimensionen berechnet.
`,
      "utf8",
    );

    prevBrainPath = process.env.CONNECT_BRAIN_PATH;
    process.env.CONNECT_BRAIN_PATH = testVaultRoot;
  });

  afterEach(() => {
    if (prevBrainPath !== undefined) {
      process.env.CONNECT_BRAIN_PATH = prevBrainPath;
    } else {
      delete process.env.CONNECT_BRAIN_PATH;
    }
    try {
      rmSync(testVaultRoot, { recursive: true, force: true });
    } catch {}
  });

  it("should return empty granted tools for bot without access in agents.json", async () => {
    const tools = await sparkLearnBrainTools({
      botId: "unknown_bot",
      configuredRoot: testVaultRoot,
    });
    expect(tools.length).toBe(0);
  });

  it("should return 7 tools for authenticated bot in agents.json", async () => {
    const tools = await sparkLearnBrainTools({
      botId: "bot_spark_test",
      configuredRoot: testVaultRoot,
      askService: fastAskService,
    });
    expect(tools.length).toBe(7);

    const names = tools.map((t) => t.name);
    expect(names).toEqual([
      "spark_ask",
      "spark_semantic_search",
      "spark_related",
      "spark_quiz_next",
      "spark_learn_status",
      "spark_propose",
      "spark_youtube_import",
    ]);
  });

  it("should answer questions with citations via spark_ask", async () => {
    const tools = await sparkLearnBrainTools({
      botId: "bot_spark_test",
      configuredRoot: testVaultRoot,
      askService: fastAskService,
    });
    const askTool = tools.find((t) => t.name === "spark_ask")!;

    const resultRaw = await askTool.execute({
      query: "Welche Datenbank wird für die Architektur verwendet?",
      maxCitations: 3,
    });

    const result = typeof resultRaw === "string" ? JSON.parse(resultRaw) : resultRaw;
    expect(result.query).toBe("Welche Datenbank wird für die Architektur verwendet?");
    expect(result.answer).toBeTruthy();
    expect(result.confidence).toBeGreaterThanOrEqual(0.1);
    expect(Array.isArray(result.citations)).toBe(true);

    // Verify access was recorded in log.md
    const logPath = path.join(testVaultRoot, "log.md");
    expect(existsSync(logPath)).toBe(true);
    const logContent = readFileSync(logPath, "utf8");
    expect(logContent).toContain("spark_ask");
  });

  it("should create proposal in Inbox and notify in Braucht-dich.md via spark_propose", async () => {
    const tools = await sparkLearnBrainTools({
      botId: "bot_spark_test",
      configuredRoot: testVaultRoot,
      askService: fastAskService,
    });
    const proposeTool = tools.find((t) => t.name === "spark_propose")!;

    const resultRaw = await proposeTool.execute({
      kind: "new_note",
      payload: {
        path: "Projects/NeuesKonzept.md",
        title: "Neues Konzept",
        content: "# Neues Konzept\nDies ist eine vorgeschlagene Notiz.",
      },
      rationale: "Dokumentation für neues Modul bereitstellen.",
      sources: ["Projects/Architektur.md"],
    });

    const result = typeof resultRaw === "string" ? JSON.parse(resultRaw) : resultRaw;
    expect(result.ok).toBe(true);
    expect(result.status).toBe("pending");
    expect(result.proposalId).toBeDefined();
    expect(result.inboxPath).toContain("Inbox/");

    // Verify file landed in Inbox
    const inboxFile = path.join(testVaultRoot, ...result.inboxPath.split("/"));
    expect(existsSync(inboxFile)).toBe(true);
    const inboxText = readFileSync(inboxFile, "utf8");
    expect(inboxText).toContain("type: \"proposal\"");
    expect(inboxText).toContain("Dokumentation für neues Modul bereitstellen.");
    expect(inboxText).toContain("Projects/Architektur.md");

    // Verify Braucht-dich.md entry for Stefan
    const needsFile = path.join(testVaultRoot, "Braucht-dich.md");
    expect(existsSync(needsFile)).toBe(true);
    const needsText = readFileSync(needsFile, "utf8");
    expect(needsText).toContain(result.proposalId);
    expect(needsText).toContain("Dokumentation für neues Modul bereitstellen.");

    // Verify log.md has inbox entry
    const logPath = path.join(testVaultRoot, "log.md");
    const logText = readFileSync(logPath, "utf8");
    expect(logText).toContain("spark_propose");
  });

  it("should import youtube video note via spark_youtube_import", async () => {
    const tools = await sparkLearnBrainTools({
      botId: "bot_spark_test",
      configuredRoot: testVaultRoot,
    });
    const ytTool = tools.find((t) => t.name === "spark_youtube_import")!;

    const resultRaw = await ytTool.execute({
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Architektur Überblick",
      folderName: "Inbox/YouTube",
    });

    const result = typeof resultRaw === "string" ? JSON.parse(resultRaw) : resultRaw;
    expect(result.ok).toBe(true);
    expect(result.imported).toBe(1);
    expect(result.videos[0].videoId).toBe("dQw4w9WgXcQ");
    expect(result.notePath).toContain("Inbox/YouTube");

    const noteFullPath = path.join(testVaultRoot, ...result.notePath.split("/"));
    expect(existsSync(noteFullPath)).toBe(true);
    const noteText = readFileSync(noteFullPath, "utf8");
    expect(noteText).toContain("type: \"youtube\"");
    expect(noteText).toContain("dQw4w9WgXcQ");
  });

  it("should invoke callSparkLearnTool directly", async () => {
    const res = await callSparkLearnTool("spark_learn_status", {}, "bot_spark_test", {
      configuredRoot: testVaultRoot,
    });
    expect(res.isError).toBe(false);
    const data = JSON.parse(res.text);
    expect(data.vault.available).toBe(true);
  });
});
