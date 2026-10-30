import { Hono } from "hono";
import { createBrainsRouter } from "../../apps/server/src/swarm/brains/routes";
import { ListSeatBrainsResponseSchema, SeatBrainResponseSchema } from "../../packages/contracts/src/swarm-v3/api";

async function runBrainsApiTests() {
  console.log("=== [API TEST] /api/brains Router & Endpoints Validation ===");

  const app = new Hono();
  app.route("/api/brains", createBrainsRouter());

  // 1. GET /api/brains (List)
  console.log("1. GET /api/brains...");
  const listRes = await app.request("/api/brains", { method: "GET" });
  if (listRes.status !== 200) {
    throw new Error(`Expected 200, got ${listRes.status}`);
  }
  const listBody = await listRes.json();
  ListSeatBrainsResponseSchema.parse(listBody);
  if (listBody.brains.length < 3) {
    throw new Error(`Expected at least 3 seeded brains, got ${listBody.brains.length}`);
  }
  console.log(`  [PASS] Listed ${listBody.brains.length} seat brains.`);

  // 2. GET /api/brains/:id (Single)
  console.log("2. GET /api/brains/brain-hormozi-offer...");
  const getRes = await app.request("/api/brains/brain-hormozi-offer", { method: "GET" });
  if (getRes.status !== 200) {
    throw new Error(`Expected 200, got ${getRes.status}`);
  }
  const getBody = await getRes.json();
  SeatBrainResponseSchema.parse(getBody);
  if (getBody.brain.privacy !== "private") {
    throw new Error("Hormozi brain must be private");
  }
  console.log("  [PASS] Retrieved single brain matching contract schema.");

  // 3. POST /api/brains (Create)
  console.log("3. POST /api/brains...");
  const newBrain = {
    id: "brain-test-api",
    name: "API Test Brain",
    frameworks: ["Test Framework A"],
    principles: ["Test Principle A"],
    positions: ["Test Position A"],
    sources: [{ sourceId: "general-knowledge" }],
  };
  const createRes = await app.request("/api/brains", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newBrain),
  });
  if (createRes.status !== 201) {
    throw new Error(`Expected 201, got ${createRes.status}`);
  }
  const createBody = await createRes.json();
  SeatBrainResponseSchema.parse(createBody);
  console.log("  [PASS] Successfully created new seat brain.");

  // 4. PUT /api/brains/:id (Update)
  console.log("4. PUT /api/brains/brain-test-api...");
  const updateRes = await app.request("/api/brains/brain-test-api", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Updated API Test Brain" }),
  });
  if (updateRes.status !== 200) {
    throw new Error(`Expected 200, got ${updateRes.status}`);
  }
  const updateBody = await updateRes.json();
  if (updateBody.brain.name !== "Updated API Test Brain") {
    throw new Error("Brain name was not updated!");
  }
  console.log("  [PASS] Successfully updated seat brain.");

  // 5. GET /api/brains/sources/100m/search?q=decoy
  console.log("5. GET /api/brains/sources/100m/search?q=decoy...");
  const searchRes = await app.request("/api/brains/sources/100m/search?q=decoy&k=3", {
    method: "GET",
    headers: {
      Host: "localhost:3101",
      "X-MCP-Grant": "brains:private:read",
    },
  });
  if (searchRes.status !== 200) {
    throw new Error(`Expected 200, got ${searchRes.status}`);
  }
  const searchBody = (await searchRes.json()) as any;
  if (!searchBody.success || searchBody.results.length === 0) {
    throw new Error("Expected search results for 'decoy' query");
  }
  const firstCitation = searchBody.results[0].chunk.citation;
  if (!firstCitation.includes("Section II") || !firstCitation.includes("Decoy Offer")) {
    throw new Error(`Expected Section II Decoy Offer citation, got: ${firstCitation}`);
  }
  console.log(`  [PASS] Search returned top citation: ${firstCitation}`);

  // 6. POST /api/brains/verify-quotes
  console.log("6. POST /api/brains/verify-quotes...");
  const verifyRes = await app.request("/api/brains/verify-quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: 'Hormozi noted: "Say a Thanksgiving turkey takes three hours to cook. We all know what happens if you double the temperature to cook it" [100M MM · Section II › Decoy Offer · Z. 1539–1580]',
    }),
  });
  if (verifyRes.status !== 200) {
    throw new Error(`Expected 200, got ${verifyRes.status}`);
  }
  const verifyBody = (await verifyRes.json()) as any;
  if (!verifyBody.verification.valid) {
    throw new Error(`Quote verification should be valid, got: ${JSON.stringify(verifyBody)}`);
  }
  console.log("  [PASS] POST /api/brains/verify-quotes confirmed verbatim quotation.");

  // 7. GET /api/brains/audit
  console.log("7. GET /api/brains/audit...");
  const auditRes = await app.request("/api/brains/audit", { method: "GET" });
  if (auditRes.status !== 200) {
    throw new Error(`Expected 200, got ${auditRes.status}`);
  }
  const auditBody = (await auditRes.json()) as any;
  if (typeof auditBody.budgetStats?.usedTokens !== "number") {
    throw new Error("Audit log missing budgetStats");
  }
  console.log("  [PASS] GET /api/brains/audit returned security logs and budget metrics.");

  // 8. DELETE /api/brains/:id
  console.log("8. DELETE /api/brains/brain-test-api...");
  const delRes = await app.request("/api/brains/brain-test-api", { method: "DELETE" });
  if (delRes.status !== 200) {
    throw new Error(`Expected 200, got ${delRes.status}`);
  }
  console.log("  [PASS] Deleted test brain.");

  console.log("=== ALL BRAINS API ENDPOINT TESTS PASSED ===\n");
}

runBrainsApiTests().catch((err) => {
  console.error("Brains API test failed:", err);
  process.exit(1);
});
