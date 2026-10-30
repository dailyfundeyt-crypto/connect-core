import postgres from "postgres";
import { assertNotStefanProfile } from "../src/agent-hub/routes";
import { agentBrowserDirs } from "../src/agent-hub/catalog";

async function runTests() {
  console.log("=== Step 18 Integration Test: Browser-Use Service Integration ===");

  // 1. Database & Agent Setup
  const pgPass = "f1691e59c1531553fd6002595803b1792d1aedf0201833fb";
  const sql = postgres(`postgres://connect:${pgPass}@127.0.0.1:5544/connect`);

  let agentId: string;
  let agentName: string;
  try {
    const agents = await sql`SELECT id, name FROM agents ORDER BY created_at DESC LIMIT 5`;
    if (!agents || agents.length === 0) {
      throw new Error("No agents found in database!");
    }
    agentId = agents[0].id;
    agentName = agents[0].name;
    console.log(`[PASS] Using agent: "${agentName}" (${agentId})`);
  } catch (err: any) {
    console.error("[FAIL] Could not query agents from database:", err.message);
    process.exit(1);
  } finally {
    await sql.end();
  }

  // 2. Isolation & Security Verification
  console.log("\n--- Testing Helium Profile Isolation & Stefan Profile Protection ---");
  const dirs = agentBrowserDirs(agentId);
  console.log(`Agent profile directory: ${dirs.profile}`);
  console.log(`Agent output directory:  ${dirs.output}`);

  if (!dirs.profile.includes("ConnectAgents") || !dirs.profile.includes(agentId)) {
    throw new Error(`Agent profile is not properly isolated: ${dirs.profile}`);
  }
  console.log("[PASS] Agent has isolated Helium profile under ConnectAgents");

  // Verify Stefan's personal profile is strictly rejected
  const localAppData = process.env.LOCALAPPDATA || "C:\\Users\\Kunc GmbH\\AppData\\Local";
  const stefanHeliumProfile = `${localAppData}\\imput\\Helium\\User Data`;
  let stefanBlocked = false;
  try {
    assertNotStefanProfile(stefanHeliumProfile);
  } catch (e: any) {
    stefanBlocked = true;
    console.log(`[PASS] assertNotStefanProfile blocked Stefan's profile correctly: ${e.message}`);
  }
  if (!stefanBlocked) {
    throw new Error("CRITICAL SECURITY VIOLATION: Stefan's Helium profile was NOT rejected!");
  }

  // Verify agent's profile passes assertion
  try {
    assertNotStefanProfile(dirs.profile);
    console.log("[PASS] assertNotStefanProfile allowed agent's isolated profile.");
  } catch (e: any) {
    throw new Error(`Agent's profile unexpectedly blocked: ${e.message}`);
  }

  // 3. API Endpoints Testing on http://localhost:3101
  console.log("\n--- Testing HTTP Endpoints on http://localhost:3101 ---");
  const baseUrl = "http://127.0.0.1:3101";
  const sessionCookie = "better-auth.session_token=MMHNZJ3XXnRPoTlZsa7Afe7QmKw5PMyI.53f7mIMtcQtsOzc8+m66roKn3HQEkPAcV9CxInavY0c=";
  const headers = {
    Cookie: sessionCookie,
    "Content-Type": "application/json",
  };

  // 3a. Status Endpoint
  console.log(`\nTesting GET /api/agents/${agentId}/browser-use/status ...`);
  const statusRes = await fetch(`${baseUrl}/api/agents/${agentId}/browser-use/status`, { headers });
  console.log(`Status HTTP code: ${statusRes.status}`);
  if (!statusRes.ok) {
    const txt = await statusRes.text();
    throw new Error(`GET browser-use/status failed with ${statusRes.status}: ${txt}`);
  }
  const statusJson = await statusRes.json();
  console.log("[PASS] Status response:", JSON.stringify(statusJson, null, 2));
  if (!statusJson.ok || !statusJson.status?.serviceAvailable) {
    throw new Error("Browser-use service not available according to status endpoint!");
  }

  // 3b. Open Endpoint (Navigate)
  const targetUrl = "https://example.com";
  console.log(`\nTesting POST /api/agents/${agentId}/browser-use/open with ${targetUrl} ...`);
  const openRes = await fetch(`${baseUrl}/api/agents/${agentId}/browser-use/open`, {
    method: "POST",
    headers,
    body: JSON.stringify({ url: targetUrl }),
  });
  console.log(`Open HTTP code: ${openRes.status}`);
  const openJson = await openRes.json();
  console.log("[PASS] Open response ok:", openJson.ok, "title:", openJson.title, "url:", openJson.url);
  if (!openJson.ok) {
    throw new Error(`POST browser-use/open failed: ${openJson.error}`);
  }

  // 3c. Click Endpoint
  console.log(`\nTesting POST /api/agents/${agentId}/browser-use/click (a selector) ...`);
  const clickRes = await fetch(`${baseUrl}/api/agents/${agentId}/browser-use/click`, {
    method: "POST",
    headers,
    body: JSON.stringify({ selector: "a" }),
  });
  console.log(`Click HTTP code: ${clickRes.status}`);
  const clickJson = await clickRes.json();
  console.log("[PASS] Click response ok:", clickJson.ok, "output:", clickJson.output);
  if (!clickJson.ok) {
    throw new Error(`POST browser-use/click failed: ${clickJson.error}`);
  }

  // 3d. Type Endpoint
  console.log(`\nTesting POST /api/agents/${agentId}/browser-use/type ...`);
  const typeRes = await fetch(`${baseUrl}/api/agents/${agentId}/browser-use/type`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text: "Hello from Browser-Use Swarm Agent!", submit: false }),
  });
  console.log(`Type HTTP code: ${typeRes.status}`);
  const typeJson = await typeRes.json();
  console.log("[PASS] Type response ok:", typeJson.ok, "output:", typeJson.output);
  if (!typeJson.ok) {
    throw new Error(`POST browser-use/type failed: ${typeJson.error}`);
  }

  // 3e. Screenshot Endpoint
  console.log(`\nTesting GET /api/agents/${agentId}/browser-use/screenshot ...`);
  const shotRes = await fetch(`${baseUrl}/api/agents/${agentId}/browser-use/screenshot`, { headers });
  console.log(`Screenshot HTTP code: ${shotRes.status}`);
  const shotJson = await shotRes.json();
  console.log("[PASS] Screenshot response ok:", shotJson.ok, "has screenshot:", !!shotJson.screenshot);
  if (!shotJson.ok || !shotJson.screenshot) {
    throw new Error(`GET browser-use/screenshot failed: ${shotJson.error}`);
  }

  // 3f. Action Endpoint (Universal)
  console.log(`\nTesting POST /api/agents/${agentId}/browser-use/action ...`);
  const actionRes = await fetch(`${baseUrl}/api/agents/${agentId}/browser-use/action`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "screenshot" }),
  });
  console.log(`Action HTTP code: ${actionRes.status}`);
  const actionJson = await actionRes.json();
  console.log("[PASS] Action response ok:", actionJson.ok, "action:", actionJson.action);
  if (!actionJson.ok) {
    throw new Error(`POST browser-use/action failed: ${actionJson.error}`);
  }

  // 3g. Task Endpoint
  console.log(`\nTesting POST /api/agents/${agentId}/browser-use/task ...`);
  const taskRes = await fetch(`${baseUrl}/api/agents/${agentId}/browser-use/task`, {
    method: "POST",
    headers,
    body: JSON.stringify({ task: "--status" }),
  });
  console.log(`Task HTTP code: ${taskRes.status}`);
  const taskJson = await taskRes.json();
  console.log("[PASS] Task response ok:", taskJson.ok, "output:", taskJson.output ? taskJson.output.slice(0, 150) : "");
  if (!taskJson.ok) {
    throw new Error(`POST browser-use/task failed: ${taskJson.error}`);
  }

  console.log("\n========================================================");
  console.log(" ALL STEP 18 BROWSER-USE INTEGRATION TESTS PASSED! ");
  console.log("========================================================");
}

runTests().catch((err) => {
  console.error("\n[TEST FAILED]:", err);
  process.exit(1);
});
