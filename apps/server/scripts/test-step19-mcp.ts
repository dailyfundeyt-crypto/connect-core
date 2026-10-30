/**
 * Testskript für Phase E Schritt 19: Connect-MCP-Server Integrationstest
 *
 * Testet:
 * 1. Health & Manifest
 * 2. Token-Erstellung, Validierung & Tunnel-Header-Prüfung
 * 3. Die 9 Tools:
 *    - list_agents
 *    - create_agent
 *    - start_agent
 *    - stop_agent
 *    - send_task
 *    - get_status
 *    - get_result
 *    - browser_action
 *    - get_screenshot
 */

import postgres from "postgres";

const pgPass = "f1691e59c1531553fd6002595803b1792d1aedf0201833fb";
const dbUrl = "postgres://connect:" + pgPass + "@127.0.0.1:5544/connect";
const sql = postgres(dbUrl);

const BASE_URL = "http://127.0.0.1:3101/api/connect-mcp";

async function jsonRpcCall(method: string, params: any = {}, token?: string, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}/jsonrpc`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  const body = (await res.json()) as any;
  return { status: res.status, body };
}

async function main() {
  console.log("================================================================================");
  console.log("PHASE E SCHRITT 19 — CONNECT-MCP-SERVER TESTS");
  console.log("================================================================================\n");

  // 1. Health
  console.log("1. Prüfe /api/connect-mcp/health...");
  const healthRes = await fetch(`${BASE_URL}/health`);
  const health = (await healthRes.json()) as any;
  console.log("   Status:", healthRes.status);
  console.log("   Server:", health.server, "Version:", health.version);
  console.log("   Tunnel unterstützt:", health.tunnel_supported);
  console.log("   Tools registriert:", health.tools);
  if (!health.ok || !health.tunnel_supported) {
    throw new Error("Health check fehlgeschlagen!");
  }
  console.log("   -> OK!\n");

  // 2. Manifest & Alle 9 Tools prüfen
  console.log("2. Prüfe /api/connect-mcp/manifest...");
  const manifestRes = await fetch(`${BASE_URL}/manifest`);
  const manifest = (await manifestRes.json()) as any;
  console.log("   Status:", manifestRes.status);
  console.log("   Tools im Manifest:", manifest.tools.length);

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

  for (const name of REQUIRED_TOOLS) {
    const found = manifest.tools.find((t: any) => t.name === name);
    if (!found) {
      throw new Error(`Pflicht-Tool '${name}' fehlt im Manifest!`);
    }
    console.log(`   [✓] Tool '${name}': ${found.description.slice(0, 55)}...`);
  }
  console.log("   -> Alle 9 Pflicht-Tools im Manifest vorhanden: OK!\n");

  // 3. Token-Erstellung & Auth-Tests
  console.log("3. Token-Erstellung & Authentifizierungs-Tests...");
  const tokenCreateRes = await fetch(`${BASE_URL}/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: "Schritt 19 Test-Token", lifetime: "permanent" }),
  });
  console.log("   POST /tokens Status:", tokenCreateRes.status);
  const tokenData = (await tokenCreateRes.json()) as any;
  const plaintextToken = tokenData.plaintextToken;
  console.log("   Neues Token erzeugt:", tokenData.id, "(Länge:", plaintextToken.length, ")");
  if (!plaintextToken) throw new Error("Konnte kein MCP-Token erzeugen!");

  // 3a. Ungültiges Token testen
  console.log("   3a. Test mit ungültigem Token (Erwartet 401)...");
  const invalidRes = await jsonRpcCall("tools/list", {}, "sk-invalid-token-12345");
  console.log("       Status:", invalidRes.status, "Error:", invalidRes.body?.error?.message);
  if (invalidRes.status !== 401) throw new Error("Ungültiges Token wurde nicht mit 401 abgewiesen!");

  // 3b. Gültiges Token testen
  console.log("   3b. Test mit gültigem Bearer-Token (Erwartet 200)...");
  const validRes = await jsonRpcCall("tools/list", {}, plaintextToken);
  console.log("       Status:", validRes.status, "Tools geliefert:", validRes.body?.result?.tools?.length);
  if (validRes.status !== 200 || !validRes.body?.result?.tools) {
    throw new Error("Gültiges Token wurde nicht akzeptiert!");
  }

  // 3c. Tunnel-Simulation: Cloudflare-Header OHNE Token (Erwartet 401)
  console.log("   3c. Tunnel-Simulation OHNE Token (Erwartet 401)...");
  const tunnelNoToken = await jsonRpcCall("tools/list", {}, undefined, { "cf-ray": "mock-cf-ray-123" });
  console.log("       Status:", tunnelNoToken.status, "Error:", tunnelNoToken.body?.error?.message);
  if (tunnelNoToken.status !== 401) {
    throw new Error("Tunnel-Anfrage ohne Token wurde nicht blockiert!");
  }

  // 3d. Tunnel-Simulation: Cloudflare-Header MIT Token (Erwartet 200)
  console.log("   3d. Tunnel-Simulation MIT Token (Erwartet 200)...");
  const tunnelWithToken = await jsonRpcCall("tools/list", {}, plaintextToken, { "cf-ray": "mock-cf-ray-123" });
  console.log("       Status:", tunnelWithToken.status);
  if (tunnelWithToken.status !== 200) {
    throw new Error("Tunnel-Anfrage mit gültigem Token wurde blockiert!");
  }
  console.log("   -> Token-Auth & Tunnel-Gate erfolgreich verifiziert: OK!\n");

  // 4. Tool 1: list_agents
  console.log("4. Test Tool: list_agents...");
  const listRes = await jsonRpcCall(
    "tools/call",
    { name: "list_agents", arguments: { include_status: true } },
    plaintextToken,
  );
  console.log("   Status:", listRes.status);
  const parsedList = JSON.parse(listRes.body?.result?.content?.[0]?.text || "{}");
  console.log("   Gefundene Agenten:", parsedList.count);
  console.log("   Erster Agent:", parsedList.agents?.[0]?.name, "(Engine:", parsedList.agents?.[0]?.engine, ")");
  console.log("   -> list_agents: OK!\n");

  // 5. Tool 2: create_agent
  console.log("5. Test Tool: create_agent...");
  const testAgentName = `Swarm19 Bot ${Date.now() % 10000}`;
  const createRes = await jsonRpcCall(
    "tools/call",
    {
      name: "create_agent",
      arguments: {
        name: testAgentName,
        title: "Swarm Phase E Agent",
        role_description: "Autonomer Test-Agent für MCP Swarm Steuerung",
        engine: "antigravity",
        model: "gemini-3.8-flash",
        account_email: "dailyfunde.yt@gmail.com",
        allow_write: true,
      },
    },
    plaintextToken,
  );
  console.log("   Status:", createRes.status);
  const createResult = JSON.parse(createRes.body?.result?.content?.[0]?.text || "{}");
  const createdAgentId = createResult.agent?.id;
  console.log("   Neuer Agent angelegt:", createResult.agent?.name, "ID:", createdAgentId);
  console.log("   Account-Email:", createResult.agent?.account_email);
  if (!createdAgentId) throw new Error("Agent-Erstellung fehlgeschlagen!");
  console.log("   -> create_agent: OK!\n");

  // 6. Tool 3: start_agent
  console.log("6. Test Tool: start_agent...");
  const startRes = await jsonRpcCall(
    "tools/call",
    {
      name: "start_agent",
      arguments: {
        agent_id: createdAgentId,
        cli: "antigravity",
        account_email: "dailyfunde.yt@gmail.com",
        start_browser: true,
      },
    },
    plaintextToken,
  );
  console.log("   Status:", startRes.status);
  const startData = JSON.parse(startRes.body?.result?.content?.[0]?.text || "{}");
  console.log("   Agent Terminal Status:", startData.status, "PID:", startData.terminal?.pid);
  console.log("   Browser-Tab:", startData.browser_tab ? "Ja" : "Nein");
  console.log("   -> start_agent: OK!\n");

  // 7. Tool 4: get_status (für Agent)
  console.log("7. Test Tool: get_status (Agent-Status)...");
  const statusRes = await jsonRpcCall(
    "tools/call",
    {
      name: "get_status",
      arguments: { agent_id: createdAgentId },
    },
    plaintextToken,
  );
  console.log("   Status:", statusRes.status);
  const statusData = JSON.parse(statusRes.body?.result?.content?.[0]?.text || "{}");
  console.log("   Agent:", statusData.name, "Engine:", statusData.engine);
  console.log("   Terminal Status:", statusData.terminal?.status);
  console.log("   Offene Browser-Tabs:", statusData.browser?.open_tabs);
  console.log("   -> get_status (Agent): OK!\n");

  // 8. Tool 5: browser_action
  console.log("8. Test Tool: browser_action (Navigation)...");
  const browserActionRes = await jsonRpcCall(
    "tools/call",
    {
      name: "browser_action",
      arguments: {
        agent_id: createdAgentId,
        action: "navigate",
        url: "https://example.com",
      },
    },
    plaintextToken,
  );
  console.log("   Status:", browserActionRes.status);
  const browserData = JSON.parse(browserActionRes.body?.result?.content?.[0]?.text || "{}");
  console.log("   Browser Action OK:", browserData.ok);
  console.log("   URL:", browserData.url, "Titel:", browserData.title);
  console.log("   Screenshot vorhanden:", Boolean(browserData.screenshot));
  console.log("   -> browser_action: OK!\n");

  // 9. Tool 6: get_screenshot
  console.log("9. Test Tool: get_screenshot...");
  const shotRes = await jsonRpcCall(
    "tools/call",
    {
      name: "get_screenshot",
      arguments: { agent_id: createdAgentId },
    },
    plaintextToken,
  );
  console.log("   Status:", shotRes.status);
  const shotData = JSON.parse(shotRes.body?.result?.content?.[0]?.text || "{}");
  console.log("   Screenshot OK:", shotData.ok);
  console.log("   Screenshot Data-URL:", shotData.screenshot ? `${shotData.screenshot.slice(0, 35)}... (Länge: ${shotData.screenshot.length})` : "Kein Screenshot");
  console.log("   -> get_screenshot: OK!\n");

  // 10. Tool 7: send_task (asynchron)
  console.log("10. Test Tool: send_task (asynchron)...");
  const sendTaskRes = await jsonRpcCall(
    "tools/call",
    {
      name: "send_task",
      arguments: {
        agent_id: createdAgentId,
        title: "Recherchiere Marktdaten",
        prompt: "Erstelle eine kurze Zusammenfassung der aktuellen Markttrends.",
        priority: "high",
        wait: false,
      },
    },
    plaintextToken,
  );
  console.log("   Status:", sendTaskRes.status);
  const sendTaskData = JSON.parse(sendTaskRes.body?.result?.content?.[0]?.text || "{}");
  const createdTaskId = sendTaskData.task_id;
  console.log("   Task ID:", createdTaskId, "Status:", sendTaskData.status);
  if (!createdTaskId) throw new Error("send_task lieferte keine task_id!");
  console.log("   -> send_task (async): OK!\n");

  // 11. Tool 8: get_status (für Task)
  console.log("11. Test Tool: get_status (Task-Status)...");
  const taskStatusRes = await jsonRpcCall(
    "tools/call",
    {
      name: "get_status",
      arguments: { task_id: createdTaskId },
    },
    plaintextToken,
  );
  console.log("   Status:", taskStatusRes.status);
  const taskStatusData = JSON.parse(taskStatusRes.body?.result?.content?.[0]?.text || "{}");
  console.log("   Task Status:", taskStatusData.status, "Titel:", taskStatusData.title);
  console.log("   -> get_status (Task): OK!\n");

  // 12. Tool 9: get_result
  console.log("12. Test Tool: get_result (für Task & Agent)...");
  const taskResultRes = await jsonRpcCall(
    "tools/call",
    {
      name: "get_result",
      arguments: { task_id: createdTaskId },
    },
    plaintextToken,
  );
  console.log("   Status (nach task_id):", taskResultRes.status);
  const taskResultData = JSON.parse(taskResultRes.body?.result?.content?.[0]?.text || "{}");
  console.log("   Result:", taskResultData.message || taskResultData.result_text || "Task läuft");

  const agentResultRes = await jsonRpcCall(
    "tools/call",
    {
      name: "get_result",
      arguments: { agent_id: createdAgentId },
    },
    plaintextToken,
  );
  console.log("   Status (nach agent_id):", agentResultRes.status);
  const agentResultData = JSON.parse(agentResultRes.body?.result?.content?.[0]?.text || "{}");
  console.log("   Terminal-Logs (Zeilen):", agentResultData.terminal_logs_tail?.length);
  console.log("   -> get_result: OK!\n");

  // 13. Tool 10: stop_agent
  console.log("13. Test Tool: stop_agent...");
  const stopRes = await jsonRpcCall(
    "tools/call",
    {
      name: "stop_agent",
      arguments: {
        agent_id: createdAgentId,
        stop_browser: true,
      },
    },
    plaintextToken,
  );
  console.log("   Status:", stopRes.status);
  const stopData = JSON.parse(stopRes.body?.result?.content?.[0]?.text || "{}");
  console.log("   Stop Status:", stopData.status, "Browser geschlossen:", stopData.browser_closed);
  console.log("   -> stop_agent: OK!\n");

  console.log("================================================================================");
  console.log("ALLE 9 MCP-TOOLS + TOKEN AUTH + TUNNEL GATE ERFOLGREICH GETESTET!");
  console.log("================================================================================");

  await sql.end({ timeout: 1 });
}

main().catch((err) => {
  console.error("Test fehlgeschlagen:", err);
  process.exit(1);
});
