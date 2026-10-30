import { describe, expect, it, beforeEach } from "bun:test";
import { Hono } from "hono";
import { ConnectMcpServer } from "./server";
import { createConnectMcpRouter } from "./routes";
import { createSwarmGrant, clearGrantsForTests } from "./grants";
import {
  createMcpToken,
  resolveMcpToken,
  revokeMcpToken,
  rotateMcpToken,
  checkTokenRateLimit,
  clearTokensForTests,
  hashToken,
} from "./tokens";
import type { ConnectMcpAuthContext } from "./types";

describe("Connect-MCP Server, Tokens & Routes (v06 / A18)", () => {
  let server: ConnectMcpServer;
  let authContext: ConnectMcpAuthContext;

  beforeEach(async () => {
    clearGrantsForTests();
    clearTokensForTests();
    server = new ConnectMcpServer(undefined);

    // Erstelle Standard-Grant für Hyper
    const hyperGrant = await createSwarmGrant({
      principal: "grokbot:hyper",
      companyId: "c-hyper",
      scopes: ["operate", "open_ui", "read"],
    });

    authContext = {
      principal: "grokbot:hyper",
      tokenId: "test-token-id",
      tokenHash: "dummy-hash",
      grants: [hyperGrant],
      isLocal: true,
      isTunnel: false,
    };
  });

  // =========================================================================
  // 1. JSON-RPC MCP Server Tests
  // =========================================================================
  it("Server beantwortet initialize", async () => {
    const res: any = await server.handleJsonRpc(
      { jsonrpc: "2.0", id: 1, method: "initialize" },
      authContext,
    );
    expect(res.id).toBe(1);
    expect(res.result.serverInfo.name).toBe("connect-mcp-server");
    expect(res.result.protocolVersion).toBe("2024-11-05");
  });

  it("Server listet alle Tools in tools/list auf", async () => {
    const res: any = await server.handleJsonRpc(
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      authContext,
    );
    expect(res.id).toBe(2);
    expect(Array.isArray(res.result.tools)).toBe(true);

    const names = res.result.tools.map((t: any) => t.name);
    // Primäre Tools
    expect(names).toContain("list_companies");
    expect(names).toContain("list_swarms");
    expect(names).toContain("swarm_status");
    expect(names).toContain("swarm_create");
    expect(names).toContain("swarm_dispatch_task");
    expect(names).toContain("agent_health");
    expect(names).toContain("brain_write");
    expect(names).toContain("use_agent");
    expect(names).toContain("open_ui_link");

    // Vertrags-Aliase
    expect(names).toContain("connect_list_bots");
    expect(names).toContain("connect_create_swarm");
    expect(names).toContain("connect_open_ui");
  });

  it("Tools/call: swarm_status funktioniert mit gültigem Grant", async () => {
    const res: any = await server.handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "swarm_status",
          arguments: { companyId: "c-hyper" },
        },
      },
      authContext,
    );
    expect(res.id).toBe(3);
    expect(res.error).toBeUndefined();
    expect(res.result.content[0].text).toContain("activeWorkers");
  });

  it("Tools/call: verweigert Aufruf ohne passenden Scope", async () => {
    // grokbot:hyper hat keinen 'brain_write' Scope
    const res: any = await server.handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "brain_write",
          arguments: {
            title: "Test Note",
            content: "Test Content",
            companyId: "c-hyper",
          },
        },
      },
      authContext,
    );
    expect(res.id).toBe(4);
    expect(res.error).toBeDefined();
    expect(res.error.code).toBe(-32003); // FORBIDDEN
    expect(res.error.message).toContain("brain_write");
  });

  // =========================================================================
  // 2. Token-Sicherheit (Hashing, Lifetime, Rotation)
  // =========================================================================
  it("Tokens werden nur als SHA-256 Hash gespeichert", async () => {
    const created = await createMcpToken({
      principal: "grokbot:test",
      label: "Test Token",
      lifetime: "permanent",
    });

    expect(created.plaintextToken).toStartWith("cpt_");

    // Auflösen mit Plaintext funktioniert
    const resolved = await resolveMcpToken(created.plaintextToken);
    expect(resolved).not.toBeNull();
    expect(resolved!.principal).toBe("grokbot:test");
    expect(resolved!.tokenHash).toBe(hashToken(created.plaintextToken));

    // Plaintext existiert nicht im gespeicherten Record
    expect((resolved as any).plaintextToken).toBeUndefined();
  });

  it("Token-Rotation widerruft alten Token und erzeugt neuen", async () => {
    const original = await createMcpToken({
      principal: "grokbot:rotation-test",
      label: "Rotating Token",
    });

    const rotated = await rotateMcpToken(original.id);
    expect(rotated).not.toBeNull();
    expect(rotated!.plaintextToken).not.toBe(original.plaintextToken);

    // Alter Token ist widerrufen
    const oldResolved = await resolveMcpToken(original.plaintextToken);
    expect(oldResolved).toBeNull();

    // Neuer Token funktioniert
    const newResolved = await resolveMcpToken(rotated!.plaintextToken);
    expect(newResolved).not.toBeNull();
  });

  it("Widerrufenes Token wird sofort abgewiesen", async () => {
    const token = await createMcpToken({
      principal: "grokbot:revoke-test",
      label: "Revocable",
    });

    expect(await resolveMcpToken(token.plaintextToken)).not.toBeNull();
    await revokeMcpToken(token.id);
    expect(await resolveMcpToken(token.plaintextToken)).toBeNull();
  });

  // =========================================================================
  // 3. Rate-Limiting pro Token
  // =========================================================================
  it("Rate-Limiter blockiert nach Überschreitung des Limits", () => {
    const key = "test-rate-limit-token";
    // 5 Anfragen erlauben
    for (let i = 0; i < 5; i++) {
      const check = checkTokenRateLimit(key, 5, 60_000);
      expect(check.allowed).toBe(true);
    }

    // 6. Anfrage wird blockiert
    const blocked = checkTokenRateLimit(key, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  // =========================================================================
  // 4. HTTP Router & Feature Flag Guard
  // =========================================================================
  it("Router verweigert Anfragen, wenn Feature Flag 'connectMcp' aus ist (503)", async () => {
    // Flag connectMcp ist standardmäßig false
    delete process.env.CONNECT_FLAGS_V06;
    const router = createConnectMcpRouter(undefined, server);

    const res = await router.request("http://localhost/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });

    expect(res.status).toBe(503);
    const body: any = await res.json();
    expect(body.error).toContain("Connect-MCP ist deaktiviert");
  });

  it("Router akzeptiert Anfragen mit Token, wenn Flag 'connectMcp' aktiv ist", async () => {
    process.env.CONNECT_FLAGS_V06 = "connectMcp";
    const router = createConnectMcpRouter(undefined, server);

    const token = await createMcpToken({
      principal: "grokbot:hyper",
      label: "Router Test Token",
    });

    const res = await router.request("http://localhost/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.plaintextToken}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "ping" }),
    });

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.id).toBe(99);
    delete process.env.CONNECT_FLAGS_V06;
  });

  it("Open UI Link Tool generiert Pairing-Link und QR SVG", async () => {
    const res: any = await server.handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 77,
        method: "tools/call",
        params: {
          name: "open_ui_link",
          arguments: {
            companyId: "c-hyper",
            target: "swarm",
            open_in_browser: false,
          },
        },
      },
      authContext,
    );

    expect(res.id).toBe(77);
    expect(res.error).toBeUndefined();
    const resultObj = JSON.parse(res.result.content[0].text);
    expect(resultObj.ok).toBe(true);
    expect(resultObj.pairUrl).toContain("/__connect/pair?t=");
    expect(resultObj.pairToken).toBeDefined();
    expect(resultObj.qrSvg).toContain("<svg");
  });
});
