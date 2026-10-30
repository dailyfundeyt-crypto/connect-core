import { Hono } from "hono";
import { createBrainsRouter } from "../../apps/server/src/swarm/brains/routes";
import {
  isPrivateSourceDisabled,
  search100MChunks,
} from "../../apps/server/src/swarm/brains/sources/book-retrieval";
import { isMiroFishSimulationEnabled } from "../../apps/server/src/swarm/brains/security";

async function runServerlessIsolationTests() {
  console.log("=== [SECURITY TEST] Serverless / Vercel Environment Isolation ===");

  const originalServerless = process.env.CONNECT_SERVERLESS;
  const originalVercel = process.env.VERCEL;
  const originalMiroFishFlag = process.env.CONNECT_SIM_MIROFISH;

  try {
    // -------------------------------------------------------------
    // Scenario 1: CONNECT_SERVERLESS = 1 (Vercel Preview / Prod mode)
    // -------------------------------------------------------------
    console.log("1. Testing CONNECT_SERVERLESS=1...");
    process.env.CONNECT_SERVERLESS = "1";
    delete process.env.VERCEL;

    if (!isPrivateSourceDisabled()) {
      throw new Error("isPrivateSourceDisabled() should be true when CONNECT_SERVERLESS=1");
    }

    if (isMiroFishSimulationEnabled()) {
      throw new Error("isMiroFishSimulationEnabled() should be FALSE when CONNECT_SERVERLESS=1");
    }

    let searchThrew = false;
    try {
      search100MChunks("decoy offer");
    } catch (err: any) {
      searchThrew = true;
      if (!err.message.includes("Private source unavailable")) {
        throw new Error(`Unexpected error message: ${err.message}`);
      }
    }
    if (!searchThrew) {
      throw new Error("search100MChunks should throw when CONNECT_SERVERLESS=1");
    }

    // Test API Route under CONNECT_SERVERLESS=1
    const app = new Hono();
    app.route("/api/brains", createBrainsRouter());
    const res = await app.request("/api/brains/sources/100m/search?q=decoy", {
      method: "GET",
    });
    if (res.status !== 404) {
      throw new Error(`Expected 404 on serverless search endpoint, got ${res.status}`);
    }
    const body = (await res.json()) as any;
    if (body.error !== "private source unavailable") {
      throw new Error(`Expected 'private source unavailable', got: ${JSON.stringify(body)}`);
    }
    console.log("  [PASS] CONNECT_SERVERLESS=1 strictly blocks MiroFish and private sources (404).");

    // -------------------------------------------------------------
    // Scenario 2: VERCEL = 1
    // -------------------------------------------------------------
    console.log("2. Testing VERCEL=1...");
    delete process.env.CONNECT_SERVERLESS;
    process.env.VERCEL = "1";

    if (!isPrivateSourceDisabled()) {
      throw new Error("isPrivateSourceDisabled() should be true when VERCEL=1");
    }
    if (isMiroFishSimulationEnabled()) {
      throw new Error("isMiroFishSimulationEnabled() should be FALSE when VERCEL=1");
    }
    console.log("  [PASS] VERCEL=1 strictly blocks MiroFish and private sources.");

    // -------------------------------------------------------------
    // Scenario 3: CONNECT_SIM_MIROFISH = "off"
    // -------------------------------------------------------------
    console.log("3. Testing CONNECT_SIM_MIROFISH=off...");
    delete process.env.CONNECT_SERVERLESS;
    delete process.env.VERCEL;
    process.env.CONNECT_SIM_MIROFISH = "off";

    if (isMiroFishSimulationEnabled()) {
      throw new Error("isMiroFishSimulationEnabled() should be FALSE when CONNECT_SIM_MIROFISH=off");
    }
    console.log("  [PASS] Feature-flag CONNECT_SIM_MIROFISH=off disables MiroFish engine.");

    // -------------------------------------------------------------
    // Scenario 4: Local Desktop Default
    // -------------------------------------------------------------
    console.log("4. Testing Local Desktop Defaults...");
    delete process.env.CONNECT_SERVERLESS;
    delete process.env.VERCEL;
    delete process.env.CONNECT_SIM_MIROFISH;

    if (isPrivateSourceDisabled()) {
      throw new Error("isPrivateSourceDisabled() should be false locally");
    }
    if (!isMiroFishSimulationEnabled()) {
      throw new Error("isMiroFishSimulationEnabled() should default to true locally");
    }
    console.log("  [PASS] Local Desktop environment has access to private brains and MiroFish.");

    console.log("=== ALL SERVERLESS ISOLATION TESTS PASSED ===\n");
  } finally {
    // Restore environment variables
    if (originalServerless !== undefined) process.env.CONNECT_SERVERLESS = originalServerless;
    else delete process.env.CONNECT_SERVERLESS;

    if (originalVercel !== undefined) process.env.VERCEL = originalVercel;
    else delete process.env.VERCEL;

    if (originalMiroFishFlag !== undefined) process.env.CONNECT_SIM_MIROFISH = originalMiroFishFlag;
    else delete process.env.CONNECT_SIM_MIROFISH;
  }
}

runServerlessIsolationTests().catch((err) => {
  console.error("Serverless isolation test failed:", err);
  process.exit(1);
});
