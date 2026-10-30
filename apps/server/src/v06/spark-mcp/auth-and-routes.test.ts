import { describe, expect, it, beforeEach } from "bun:test";
import { Hono } from "hono";
import { SparkMcpServer } from "./server";
import { SparkMcpStore } from "./store";
import { createSparkMcpRouter } from "./routes";
import { registerTestAgentToken, clearTestAgentTokens } from "./auth";
import type { AgentAuthContext } from "./types";

describe("Spark-MCP Auth, Server & Routes (v06)", () => {
  let store: SparkMcpStore;
  let server: SparkMcpServer;
  let testAgent: AgentAuthContext;

  beforeEach(() => {
    store = new SparkMcpStore(undefined);
    store.clearForTests();
    server = new SparkMcpServer(undefined, store);
    clearTestAgentTokens();

    testAgent = {
      agentId: "agent-a08-runner",
      agentName: "AgentRunner",
      companyId: "c-100",
      scopes: ["spark:folders:write", "spark:folders:read"],
      isLocal: true,
      isTunnel: false,
    };

    registerTestAgentToken("valid-test-token-12345", testAgent);
  });

  // =========================================================================
  // JSON-RPC Protokoll über Server
  // =========================================================================
  it("Server beantwortet initialize", async () => {
    const res: any = await server.handleJsonRpc(
      { jsonrpc: "2.0", id: 1, method: "initialize" },
      testAgent,
    );
    expect(res.id).toBe(1);
    expect(res.result.serverInfo.name).toBe("connect-spark-mcp");
    expect(res.result.protocolVersion).toBe("2024-11-05");
  });

  it("Server listet alle 12 Tools in tools/list auf", async () => {
    const res: any = await server.handleJsonRpc(
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      testAgent,
    );
    expect(res.id).toBe(2);
    expect(Array.isArray(res.result.tools)).toBe(true);
    expect(res.result.tools.length).toBe(12);

    const toolNames = res.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain("folder_create");
    expect(toolNames).toContain("folder_rename");
    expect(toolNames).toContain("folder_move");
    expect(toolNames).toContain("folder_mark_settings");
    expect(toolNames).toContain("link_add");
    expect(toolNames).toContain("link_move");
    expect(toolNames).toContain("note_create");
    expect(toolNames).toContain("note_read");
    expect(toolNames).toContain("note_update");
    expect(toolNames).toContain("note_trash");
    expect(toolNames).toContain("note_attach_to_folder");
    expect(toolNames).toContain("folder_context");
  });

  it("Server führt tools/call via JSON-RPC aus", async () => {
    const res: any = await server.handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "folder_create",
          arguments: {
            name: "JSON-RPC Ordner",
          },
        },
      },
      testAgent,
    );

    expect(res.id).toBe(3);
    expect(res.result.isError).toBeFalsy();
    const data = JSON.parse(res.result.content[0].text);
    expect(data.success).toBe(true);
    expect(data.folder.name).toBe("JSON-RPC Ordner");
  });

  // =========================================================================
  // HTTP Endpunkte & Middleware via Hono Router
  // =========================================================================
  it("HTTP Endpunkt: Verweigert Zugriff ohne Bearer-Token (401)", async () => {
    process.env.CONNECT_FLAGS_V06 = "sparkmcp"; // Flag aktivieren
    const app = new Hono();
    const router = createSparkMcpRouter(undefined, server);
    app.route("/api/v06/spark-mcp", router);

    const req = new Request("http://localhost/api/v06/spark-mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });

    const res = await app.fetch(req);
    expect(res.status).toBe(401);
  });

  it("HTTP Endpunkt: Akzeptiert autorisierte Requests mit Bearer-Token (200)", async () => {
    process.env.CONNECT_FLAGS_V06 = "sparkmcp"; // Flag aktivieren
    const app = new Hono();
    const router = createSparkMcpRouter(undefined, server);
    app.route("/api/v06/spark-mcp", router);

    const req = new Request("http://localhost/api/v06/spark-mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer valid-test-token-12345",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/list" }),
    });

    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.id).toBe(4);
    expect(body.result.tools.length).toBe(12);
  });

  it("Feature Flag Guard: Wenn Flag sparkMcp inaktiv ist -> 503 Service Unavailable", async () => {
    process.env.CONNECT_FLAGS_V06 = "-sparkmcp"; // Flag explizit deaktivieren
    const app = new Hono();
    const router = createSparkMcpRouter(undefined, server);
    app.route("/api/v06/spark-mcp", router);

    const req = new Request("http://localhost/api/v06/spark-mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer valid-test-token-12345",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/list" }),
    });

    const res = await app.fetch(req);
    expect(res.status).toBe(503);
    const body: any = await res.json();
    expect(body.error).toContain("Spark-MCP ist deaktiviert");

    delete process.env.CONNECT_FLAGS_V06;
  });
});
