import { Hono } from "hono";
import {
  CompanyAppToggleSchema,
  GetCompanyAppsResponseSchema,
  UpdateCompanyAppsRequestSchema,
  UpdateCompanyAppsResponseSchema,
} from "../../packages/contracts/src/swarm-v3";
import {
  createCompanyAppsRouter,
  getCompanyApps,
  updateCompanyApps,
  CANONICAL_COMPANY_APPS,
} from "../../apps/server/src/companies/company-apps";

async function runTests() {
  console.log("=== Swarm-v3 Lane 2: Company Apps Tests ===");

  // 1. Validate Default Canonical Apps
  console.log("1. Validating canonical company apps...");
  if (CANONICAL_COMPANY_APPS.length < 3) {
    throw new Error("Expected at least 3 canonical apps");
  }
  for (const app of CANONICAL_COMPANY_APPS) {
    if (!app.appId || !app.appName) {
      throw new Error(`Invalid app definition: ${JSON.stringify(app)}`);
    }
  }
  console.log(`  [PASS] Found ${CANONICAL_COMPANY_APPS.length} canonical apps.`);

  // 2. Test Service getCompanyApps (Default / Fallback)
  console.log("2. Testing getCompanyApps (default fallback)...");
  const initialApps = await getCompanyApps("company-lane2-test");
  if (!Array.isArray(initialApps) || initialApps.length === 0) {
    throw new Error("getCompanyApps returned empty array");
  }
  // Validate every item against contract
  initialApps.forEach((item) => CompanyAppToggleSchema.parse(item));
  const analysisApp = initialApps.find((a) => a.appId === "analysis");
  if (!analysisApp || analysisApp.enabled !== true) {
    throw new Error("Expected default apps to be enabled=true");
  }
  console.log("  [PASS] getCompanyApps returned valid, enabled default apps.");

  // 3. Test Service updateCompanyApps
  console.log("3. Testing updateCompanyApps...");
  const updatedApps = await updateCompanyApps("company-lane2-test", [
    { appId: "analysis", enabled: false, sort: 99 },
    { appId: "flux", enabled: true, sort: 1 },
  ]);
  updatedApps.forEach((item) => CompanyAppToggleSchema.parse(item));
  const disabledAnalysis = updatedApps.find((a) => a.appId === "analysis");
  if (!disabledAnalysis || disabledAnalysis.enabled !== false || disabledAnalysis.sort !== 99) {
    throw new Error("updateCompanyApps failed to disable analysis or set sort");
  }
  console.log("  [PASS] updateCompanyApps successfully persisted toggles.");

  // 4. Test Hono Router Endpoints (API Roundtrip)
  console.log("4. Testing Hono Router Endpoints...");
  const app = new Hono();
  app.route("/api/companies/:id/apps", createCompanyAppsRouter());

  // 4a. GET Request
  const getRes = await app.request("http://localhost:3101/api/companies/company-lane2-test/apps", {
    method: "GET",
    headers: { host: "localhost:3101" },
  });
  if (getRes.status !== 200) {
    throw new Error(`GET returned status ${getRes.status}: ${await getRes.text()}`);
  }
  const getJson = await getRes.json();
  GetCompanyAppsResponseSchema.parse(getJson);
  if (!getJson.success || getJson.companyId !== "company-lane2-test") {
    throw new Error(`Unexpected GET response: ${JSON.stringify(getJson)}`);
  }
  console.log("  [PASS] GET /api/companies/:id/apps returned 200 OK & validated schema.");

  // 4b. PUT Request (Toggle)
  const putRes = await app.request("http://localhost:3101/api/companies/company-lane2-test/apps", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      host: "localhost:3101",
    },
    body: JSON.stringify({
      apps: [
        { appId: "analysis", enabled: true, sort: 5 },
        { appId: "connect-sozial", enabled: true, sort: 1 },
      ],
    }),
  });
  if (putRes.status !== 200) {
    throw new Error(`PUT returned status ${putRes.status}: ${await putRes.text()}`);
  }
  const putJson = await putRes.json();
  UpdateCompanyAppsResponseSchema.parse(putJson);
  if (!putJson.success || putJson.updatedCount !== 2) {
    throw new Error(`Unexpected PUT response: ${JSON.stringify(putJson)}`);
  }
  console.log("  [PASS] PUT /api/companies/:id/apps returned 200 OK & updated 2 apps.");

  // 4c. PUT Validation Error Check
  const invalidPutRes = await app.request("http://localhost:3101/api/companies/company-lane2-test/apps", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      host: "localhost:3101",
    },
    body: JSON.stringify({ apps: "not-an-array" }),
  });
  if (invalidPutRes.status !== 400) {
    throw new Error(`Expected 400 for invalid body, got ${invalidPutRes.status}`);
  }
  console.log("  [PASS] PUT with invalid body correctly rejected with 400 Bad Request.");

  console.log("=== All Lane 2 Tests Passed Successfully! ===");
}

runTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
