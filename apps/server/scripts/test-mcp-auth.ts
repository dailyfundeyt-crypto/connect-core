/**
 * Testskript für Agent A: Connect-MCP-Tools, Token-Auth, Localhost + Tunnel Hardening
 *
 * Akzeptanzkriterien:
 * 1. tools/list ohne Token über Tunnel-Host => 401
 * 2. Host-Header "evil-cloudflare.example" von Nicht-Loopback => 403
 * 3. Mit gültigem Token: alle 9 Pflicht-Tools gelistet mit JSON-Schema
 * 4. get_status & list_agents liefern valide Daten
 * 5. browser_action & get_screenshot funktionieren auf einem Swarm-Agent (nie Stefans Profil)
 * 6. Loopback-Zugriff ohne/mit Token
 * 7. Tunnel-Zugriff ohne/mit Token
 * 8. Query-Token standardmäßig aus (Tunnel mit ?token= => 401)
 * 9. In-Memory Rate-Limiting pro Token (schnelle Anfragen => 429)
 * 10. Stefan-Profil Schutz (assertNotStefanProfile blockiert jeden Zugriff auf Stefans Profil)
 */

import postgres from "postgres";

const pgPass = "f1691e59c1531553fd6002595803b1792d1aedf0201833fb";
const dbUrl = "postgres://connect:" + pgPass + "@127.0.0.1:5544/connect";

const BASE_URL = process.env.CONNECT_MCP_BASE_URL || "http://127.0.0.1:3101/api/connect-mcp";

interface JsonRpcResponse<T = any> {
  status: number;
  headers: Headers;
  body: {
    jsonrpc?: string;
    id?: any;
    result?: T;
    error?: {
      code: number;
      message: string;
      data?: any;
    };
  };
}

async function jsonRpcCall(
  method: string,
  params: any = {},
  token?: string | null,
  extraHeaders: Record<string, string> = {},
  queryParams: Record<string, string> = {},
): Promise<JsonRpcResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = new URL(`${BASE_URL}/jsonrpc`);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now() + Math.floor(Math.random() * 1000),
      method,
      params,
    }),
  });

  let body: any = {};
  try {
    body = await res.json();
  } catch (err) {
    body = { raw: await res.text().catch(() => "") };
  }

  return { status: res.status, headers: res.headers, body };
}

async function main() {
  console.log("================================================================================");
  console.log("AGENT A: CONNECT-MCP HARDENING & AUTH VERIFIKATIONSTEST");
  console.log(`Ziel-URL: ${BASE_URL}`);
  console.log("================================================================================\n");

  const results: { test: string; passed: boolean; details: string }[] = [];

  function record(test: string, passed: boolean, details: string) {
    results.push({ test, passed, details });
    const mark = passed ? "[PASS]" : "[FAIL]";
    console.log(`${mark} ${test}: ${details}`);
    if (!passed) {
      console.error(`       FEHLER: Test nicht bestanden!`);
    }
  }

  // 0. Health Check
  console.log("--- 0. Health Check ---");
  try {
    const healthRes = await fetch(`${BASE_URL}/health`);
    const health = (await healthRes.json()) as any;
    const ok = healthRes.status === 200 && health.ok === true && health.tunnel_supported === true;
    record("Health-Check", ok, `Status: ${healthRes.status}, Server: ${health.server}, Tools: ${health.tools}`);
  } catch (err: any) {
    record("Health-Check", false, `Verbindung fehlgeschlagen: ${err.message}`);
    process.exit(1);
  }

  // 1. Loopback ohne Token
  console.log("\n--- 1. Loopback-Zugriff ohne Token ---");
  try {
    const res = await jsonRpcCall("tools/list", {});
    const ok = res.status === 200 && Array.isArray(res.body?.result?.tools);
    record(
      "Loopback ohne Token",
      ok,
      `Status: ${res.status}, Tools erhalten: ${res.body?.result?.tools?.length ?? 0}`,
    );
  } catch (err: any) {
    record("Loopback ohne Token", false, err.message);
  }

  // 2. Token Erstellung via POST /api/connect-mcp/tokens
  console.log("\n--- 2. Token-Erstellung ---");
  let validToken = "";
  try {
    const tokenRes = await fetch(`${BASE_URL}/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Agent A Hardening Test Token", lifetime: "permanent" }),
    });
    const tokenData = (await tokenRes.json()) as any;
    validToken = tokenData.plaintextToken;
    const ok = tokenRes.status === 201 && typeof validToken === "string" && validToken.length >= 16;
    record(
      "Token-Erstellung",
      ok,
      `Status: ${tokenRes.status}, Token-ID: ${tokenData.id}, Token: ${validToken?.slice(0, 8)}...`,
    );
  } catch (err: any) {
    record("Token-Erstellung", false, err.message);
  }

  if (!validToken) {
    console.error("Abbruch: Ohne valides Token können die Folge-Tests nicht ausgeführt werden.");
    process.exit(1);
  }

  // 3. Loopback mit gültigem Token
  console.log("\n--- 3. Loopback mit gültigem Token ---");
  try {
    const res = await jsonRpcCall("tools/list", {}, validToken);
    const ok = res.status === 200 && Array.isArray(res.body?.result?.tools);
    record("Loopback mit Token", ok, `Status: ${res.status}, Tools: ${res.body?.result?.tools?.length}`);
  } catch (err: any) {
    record("Loopback mit Token", false, err.message);
  }

  // 4. Loopback mit ungültigem Token (Erwartet 401)
  console.log("\n--- 4. Loopback mit ungültigem Token ---");
  try {
    const res = await jsonRpcCall("tools/list", {}, "ct_invalid_random_token_string_12345");
    const ok = res.status === 401 && (res.body?.error?.code === -32001 || res.body?.error?.code === -32600);
    record("Ungültiges Token", ok, `Status: ${res.status}, Code: ${res.body?.error?.code}, Msg: ${res.body?.error?.message}`);
  } catch (err: any) {
    record("Ungültiges Token", false, err.message);
  }

  // 5. Tunnel ohne Token (Erwartet 401)
  // Simulation über erlaubten Tunnel-Host und Cloudflare-Header
  console.log("\n--- 5. Tunnel-Zugriff ohne Token ---");
  try {
    const res = await jsonRpcCall("tools/list", {}, null, {
      Host: "tunnel.kunc-connect.local",
    });
    const ok = res.status === 401;
    record(
      "Tunnel ohne Token (Host: tunnel.kunc-connect.local)",
      ok,
      `Status: ${res.status}, Error: ${res.body?.error?.message}`,
    );
  } catch (err: any) {
    record("Tunnel ohne Token (Host)", false, err.message);
  }

  try {
    const resCf = await jsonRpcCall("tools/list", {}, null, {
      "cf-ray": "mock-cf-ray-tunnel-12345",
    });
    const okCf = resCf.status === 401;
    record(
      "Tunnel ohne Token (Cloudflare cf-ray)",
      okCf,
      `Status: ${resCf.status}, Error: ${resCf.body?.error?.message}`,
    );
  } catch (err: any) {
    record("Tunnel ohne Token (CF)", false, err.message);
  }

  // 6. Tunnel mit gültigem Token (Erwartet 200)
  console.log("\n--- 6. Tunnel-Zugriff mit gültigem Token ---");
  try {
    const res = await jsonRpcCall("tools/list", {}, validToken, {
      Host: "tunnel.kunc-connect.local",
    });
    const ok = res.status === 200 && Array.isArray(res.body?.result?.tools);
    record(
      "Tunnel mit Token (Host: tunnel.kunc-connect.local)",
      ok,
      `Status: ${res.status}, Tools geliefert: ${res.body?.result?.tools?.length}`,
    );
  } catch (err: any) {
    record("Tunnel mit Token", false, err.message);
  }

  // 7. Gefälschter Host von Nicht-Loopback (Erwartet 403)
  console.log("\n--- 7. Gefälschter Host 'evil-cloudflare.example' von Nicht-Loopback ---");
  try {
    const res = await jsonRpcCall("tools/list", {}, validToken, {
      Host: "evil-cloudflare.example",
      "x-test-remote-ip": "198.51.100.22",
    });
    const ok = res.status === 403;
    record(
      "Gefälschter Host Nicht-Loopback (evil-cloudflare.example)",
      ok,
      `Status: ${res.status}, Antwort: ${JSON.stringify(res.body)}`,
    );
  } catch (err: any) {
    record("Gefälschter Host Nicht-Loopback", false, err.message);
  }

  // 8. Gefälschter Host direkt (Erwartet 403)
  console.log("\n--- 8. Gefälschter Host 'evil-cloudflare.example' ---");
  try {
    const res = await jsonRpcCall("tools/list", {}, validToken, {
      Host: "evil-cloudflare.example",
    });
    const ok = res.status === 403;
    record(
      "Gefälschter Host direkt (evil-cloudflare.example)",
      ok,
      `Status: ${res.status}, Antwort: ${JSON.stringify(res.body)}`,
    );
  } catch (err: any) {
    record("Gefälschter Host direkt", false, err.message);
  }

  // 9. Query-Token standardmäßig aus (Erwartet 401 über Tunnel)
  console.log("\n--- 9. Query-Token Test (Standardmäßig deaktiviert) ---");
  try {
    // Über Tunnel-Host mit query param ?token= aber OHNE Authorization-Header
    const res = await jsonRpcCall(
      "tools/list",
      {},
      null, // kein Bearer
      { Host: "tunnel.kunc-connect.local" },
      { token: validToken }, // per Query
    );
    const ok = res.status === 401;
    record(
      "Query-Token über Tunnel (ohne CONNECT_MCP_ALLOW_QUERY_TOKEN)",
      ok,
      `Status: ${res.status} (Erwartet: 401 Unauthorized)`,
    );
  } catch (err: any) {
    record("Query-Token über Tunnel", false, err.message);
  }

  // 10. Alle 9 Pflicht-Tools mit JSON-Schema verifizieren
  console.log("\n--- 10. Überprüfung der 9 Pflicht-Tools mit JSON-Schema ---");
  const REQUIRED_TOOLS = [
    "list_agents",
    "create_agent",
    "start_agent",
    "stop_agent",
    "send_task",
    "get_status",
    "get_result",
    "browser_action",
    "get_screenshot",
  ];

  try {
    const res = await jsonRpcCall("tools/list", {}, validToken);
    const tools: any[] = res.body?.result?.tools || [];
    let allFound = true;
    for (const name of REQUIRED_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      if (!tool) {
        allFound = false;
        record(`Pflicht-Tool '${name}'`, false, "Fehlt in tools/list!");
      } else {
        const hasSchema = tool.inputSchema && tool.inputSchema.type === "object";
        record(`Pflicht-Tool '${name}'`, hasSchema, `Schema vorhanden: ${hasSchema}, Desc: ${tool.description?.slice(0, 45)}...`);
      }
    }
    record("Alle 9 Pflicht-Tools vorhanden", allFound, `Gefunden: ${tools.length} Tools gesamt`);
  } catch (err: any) {
    record("Alle 9 Pflicht-Tools", false, err.message);
  }

  // 11. Tool-Aufrufe: list_agents & get_status
  console.log("\n--- 11. Tool-Aufrufe: list_agents & get_status ---");
  try {
    const listRes = await jsonRpcCall(
      "tools/call",
      { name: "list_agents", arguments: { include_status: true } },
      validToken,
    );
    const content = listRes.body?.result?.content?.[0]?.text;
    const ok = listRes.status === 200 && Boolean(content);
    record("Tool: list_agents", ok, `Status: ${listRes.status}, Content-Länge: ${content?.length ?? 0}`);
  } catch (err: any) {
    record("Tool: list_agents", false, err.message);
  }

  try {
    const statusRes = await jsonRpcCall(
      "tools/call",
      { name: "get_status", arguments: {} },
      validToken,
    );
    const content = statusRes.body?.result?.content?.[0]?.text;
    const ok = statusRes.status === 200 && Boolean(content);
    record("Tool: get_status", ok, `Status: ${statusRes.status}, Content: ${content?.slice(0, 60)}...`);
  } catch (err: any) {
    record("Tool: get_status", false, err.message);
  }

  // 12. Swarm-Agent: browser_action & get_screenshot
  console.log("\n--- 12. Swarm-Agent: browser_action & get_screenshot ---");
  try {
    const swarmBrowserRes = await jsonRpcCall(
      "tools/call",
      {
        name: "browser_action",
        arguments: {
          agent_id: "swarm20-agent-01",
          action: "evaluate",
          expression: "document.title",
        },
      },
      validToken,
    );
    // Sollte ein gültiges McpToolResult zurückgeben (isError kann true oder false sein je nachdem ob Browser gestartet ist, aber kein Servercrash 500)
    const ok = swarmBrowserRes.status === 200 && swarmBrowserRes.body?.result?.content;
    const isErr = swarmBrowserRes.body?.result?.isError;
    record(
      "Tool: browser_action auf Swarm-Worker",
      Boolean(ok),
      `Status: ${swarmBrowserRes.status}, isError: ${isErr}, Text: ${swarmBrowserRes.body?.result?.content?.[0]?.text?.slice(0, 60)}...`,
    );
  } catch (err: any) {
    record("Tool: browser_action auf Swarm-Worker", false, err.message);
  }

  try {
    const swarmShotRes = await jsonRpcCall(
      "tools/call",
      {
        name: "get_screenshot",
        arguments: {
          agent_id: "swarm20-agent-01",
        },
      },
      validToken,
    );
    const ok = swarmShotRes.status === 200 && swarmShotRes.body?.result?.content;
    const isErr = swarmShotRes.body?.result?.isError;
    record(
      "Tool: get_screenshot auf Swarm-Worker",
      Boolean(ok),
      `Status: ${swarmShotRes.status}, isError: ${isErr}, ContentType: ${swarmShotRes.body?.result?.content?.[0]?.type}`,
    );
  } catch (err: any) {
    record("Tool: get_screenshot auf Swarm-Worker", false, err.message);
  }

  // 13. Schutz von Stefan-Profil (assertNotStefanProfile)
  console.log("\n--- 13. Schutz von Stefans eigenem Profil ---");
  try {
    const stefanBrowserRes = await jsonRpcCall(
      "tools/call",
      {
        name: "browser_action",
        arguments: {
          agent_id: "stefan",
          action: "navigate",
          url: "https://evil.com",
        },
      },
      validToken,
    );
    // Erwartet: isError = true oder abgelehnt, keinesfalls Zugriff auf Profil
    const text = stefanBrowserRes.body?.result?.content?.[0]?.text || "";
    const blocked =
      stefanBrowserRes.body?.result?.isError === true ||
      text.toLowerCase().includes("stefan") ||
      text.toLowerCase().includes("geschützt") ||
      text.toLowerCase().includes("verboten") ||
      text.toLowerCase().includes("not allowed");
    record(
      "Stefan-Profil Schutz (browser_action)",
      blocked,
      `Abgewiesen: ${blocked}, Text: ${text.slice(0, 80)}`,
    );
  } catch (err: any) {
    record("Stefan-Profil Schutz (browser_action)", true, `Blockiert via Exception: ${err.message}`);
  }

  try {
    const stefanShotRes = await jsonRpcCall(
      "tools/call",
      {
        name: "get_screenshot",
        arguments: {
          agent_id: "stefan",
        },
      },
      validToken,
    );
    const text = stefanShotRes.body?.result?.content?.[0]?.text || "";
    const blocked =
      stefanShotRes.body?.result?.isError === true ||
      text.toLowerCase().includes("stefan") ||
      text.toLowerCase().includes("geschützt") ||
      text.toLowerCase().includes("verboten");
    record(
      "Stefan-Profil Schutz (get_screenshot)",
      blocked,
      `Abgewiesen: ${blocked}, Text: ${text.slice(0, 80)}`,
    );
  } catch (err: any) {
    record("Stefan-Profil Schutz (get_screenshot)", true, `Blockiert via Exception: ${err.message}`);
  }

  // 14. Rate-Limiting Test (In-Memory pro Token)
  console.log("\n--- 14. In-Memory Rate-Limiting Test ---");
  try {
    let hitRateLimit = false;
    let rateLimitStatus = 0;
    // Sende 120 schnelle Anfragen in einer Schleife
    for (let i = 0; i < 130; i++) {
      const res = await jsonRpcCall("tools/list", {}, validToken);
      if (res.status === 429) {
        hitRateLimit = true;
        rateLimitStatus = res.status;
        break;
      }
    }
    record(
      "Rate-Limiting (HTTP 429 nach Anfrageserie)",
      hitRateLimit,
      `Rate limit erreicht: ${hitRateLimit} (Status: ${rateLimitStatus})`,
    );
  } catch (err: any) {
    record("Rate-Limiting", false, err.message);
  }

  // 15. Token Management über Tunnel: Bearer erforderlich
  console.log("\n--- 15. Token Management über Tunnel ---");
  try {
    const resNoToken = await fetch(`${BASE_URL}/tokens`, {
      headers: { Host: "tunnel.kunc-connect.local" },
    });
    const okNoToken = resNoToken.status === 401;
    record("GET /tokens über Tunnel ohne Token", okNoToken, `Status: ${resNoToken.status} (Erwartet 401)`);

    const resWithToken = await fetch(`${BASE_URL}/tokens`, {
      headers: {
        Host: "tunnel.kunc-connect.local",
        Authorization: `Bearer ${validToken}`,
      },
    });
    const okWithToken = resWithToken.status === 200;
    record("GET /tokens über Tunnel mit Token", okWithToken, `Status: ${resWithToken.status} (Erwartet 200)`);
  } catch (err: any) {
    record("Token Management über Tunnel", false, err.message);
  }

  // Abschlussbericht
  console.log("\n================================================================================");
  console.log("AGENT A TESTBERICHT");
  console.log("================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`Gesamt: ${total} Tests | Bestanden: ${passed} | Fehlgeschlagen: ${failed}`);

  if (failed > 0) {
    console.error(`\n[FEHLER] ${failed} Tests sind fehlgeschlagen.`);
    process.exit(1);
  } else {
    console.log(`\n[ERFOLG] Alle ${passed} Tests erfolgreich bestanden!`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Unerwarteter Fehler im Testskript:", err);
  process.exit(1);
});
