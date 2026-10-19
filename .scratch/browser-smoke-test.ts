/**
 * Smoke-Test für die Browser-Endpoints (Stufe 1.2).
 *
 * Findet einen existierenden Agent, ruft:
 *   1. POST /api/agent-mcp/:id/browser/open
 *   2. GET  /api/agent-mcp/:id/browser/tabs
 *   3. POST /api/agent-mcp/:id/browser/action (navigate)
 *   4. POST /api/agent-mcp/:id/browser/close
 */

const BASE = "http://127.0.0.1:3001";

interface Profile {
  id: string;
  name: string;
}

async function get(path: string, cookie?: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

async function post(path: string, body: unknown, cookie?: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function main() {
  console.log("🔍 Login + Agent suchen…");
  // Login (bestehender User aus .env)
  const loginRes = await post("/api/auth/sign-in/email", {
    email: "admin@local.test",
    password: "admin123456",
  });
  console.log("Login status:", loginRes.status);
  const setCookie = loginRes.headers.get("set-cookie");
  if (!setCookie) {
    console.log("No set-cookie; trying dev bypass");
  }
  const cookie = setCookie?.split(";")[0] ?? "";

  // Agents-Liste
  const agentsRes = await get("/api/agents", cookie);
  console.log("Agents status:", agentsRes.status);
  if (!agentsRes.ok) {
    const txt = await agentsRes.text();
    console.log("Body:", txt.slice(0, 200));
    return;
  }
  const data = (await agentsRes.json()) as { agents?: Profile[] };
  const agent = data.agents?.[0];
  if (!agent) {
    console.log("❌ Kein Agent gefunden.");
    return;
  }
  console.log("✅ Agent:", agent.id, agent.name);

  // 1. Open
  console.log("\n🔍 POST /api/agent-mcp/:id/browser/open");
  const openRes = await post(`/api/agent-mcp/${agent.id}/browser/open`, {}, cookie);
  console.log("Status:", openRes.status);
  const openBody = await openRes.json();
  console.log("Body:", JSON.stringify(openBody, null, 2));

  // 2. Tabs
  console.log("\n🔍 GET /api/agent-mcp/:id/browser/tabs");
  const tabsRes = await get(`/api/agent-mcp/${agent.id}/browser/tabs`, cookie);
  console.log("Status:", tabsRes.status);
  console.log("Body:", JSON.stringify(await tabsRes.json(), null, 2));

  // 3. Action: navigate
  console.log("\n🔍 POST /api/agent-mcp/:id/browser/action (navigate)");
  const navRes = await post(
    `/api/agent-mcp/${agent.id}/browser/action`,
    { action: { kind: "navigate", url: "https://example.com" } },
    cookie,
  );
  console.log("Status:", navRes.status);
  console.log("Body:", JSON.stringify(await navRes.json(), null, 2));

  // 4. Screenshot
  console.log("\n🔍 GET /api/agent-mcp/:id/browser/screenshot");
  const ssRes = await get(`/api/agent-mcp/${agent.id}/browser/screenshot`, cookie);
  console.log("Status:", ssRes.status);
  console.log("Body:", JSON.stringify(await ssRes.json(), null, 2));

  // 5. Close
  console.log("\n🔍 POST /api/agent-mcp/:id/browser/close");
  const closeRes = await post(`/api/agent-mcp/${agent.id}/browser/close`, {}, cookie);
  console.log("Status:", closeRes.status);
  console.log("Body:", JSON.stringify(await closeRes.json(), null, 2));

  // 6. Tabs nochmal (sollte leer sein)
  console.log("\n🔍 GET /api/agent-mcp/:id/browser/tabs (nach close)");
  const tabsRes2 = await get(`/api/agent-mcp/${agent.id}/browser/tabs`, cookie);
  console.log("Status:", tabsRes2.status);
  console.log("Body:", JSON.stringify(await tabsRes2.json(), null, 2));
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
