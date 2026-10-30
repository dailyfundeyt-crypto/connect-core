import { Hono } from "hono";
import { registerSwarmV3Stubs } from "../../apps/server/src/swarm-v3/router-stubs";
import {
  ThemeDefaultSchema,
  CompanyAppToggleSchema,
  BrowserFolderSchema,
  FolderLinkSchema,
  FolderNoteSchema,
  TranscriberJobSchema,
  AgentPersonaSchema,
  AgentMemorySchema,
  CouncilSessionSchema,
  CouncilSeatSchema,
  CouncilTurnSchema,
  CouncilVoteSchema,
  DecisionRecordSchema,
  SimulationRunSchema,
  SimEntitySchema,
  SimRelationSchema,
  SimTickSchema,
  SimReportSchema,
  SwarmJobSchema,
  SeatBrainSchema,
  resolvePrivacy,
} from "../../packages/contracts/src/swarm-v3/types";
import {
  SWARM_V3_API_PREFIXES,
  SseEventSchema,
} from "../../packages/contracts/src/swarm-v3/api";
import {
  SWARM_V3_MCP_TOOLS,
  SWARM_V3_GRANT_SCOPES,
} from "../../packages/contracts/src/swarm-v3/mcp";
import {
  mockCompanyAppToggles,
  mockBrowserFolders,
  mockFolderLinks,
  mockFolderNotes,
  mockTranscriberJobs,
  mockAgentPersonas,
  mockAgentMemories,
  mockCouncilSessions,
  mockCouncilSeats,
  mockCouncilTurns,
  mockCouncilVotes,
  mockDecisionRecord,
  mockSimulationRuns,
  mockSimEntities,
  mockSimRelations,
  mockSimTicks,
  mockSimReport,
  mockSwarmJobs,
  mockSeatBrains,
} from "../../packages/contracts/src/swarm-v3/mocks";

async function runTests() {
  console.log("=== Swarm-v3 Contracts & Mocks Validation ===");

  // 1. Validate Types & Mocks
  console.log("1. Validating Zod Schemas against Mocks...");
  mockCompanyAppToggles.forEach((item) => CompanyAppToggleSchema.parse(item));
  mockBrowserFolders.forEach((item) => BrowserFolderSchema.parse(item));
  mockFolderLinks.forEach((item) => FolderLinkSchema.parse(item));
  mockFolderNotes.forEach((item) => FolderNoteSchema.parse(item));
  mockTranscriberJobs.forEach((item) => TranscriberJobSchema.parse(item));
  mockAgentPersonas.forEach((item) => AgentPersonaSchema.parse(item));
  mockAgentMemories.forEach((item) => AgentMemorySchema.parse(item));
  mockCouncilSessions.forEach((item) => CouncilSessionSchema.parse(item));
  mockCouncilSeats.forEach((item) => CouncilSeatSchema.parse(item));
  mockCouncilTurns.forEach((item) => CouncilTurnSchema.parse(item));
  mockCouncilVotes.forEach((item) => CouncilVoteSchema.parse(item));
  DecisionRecordSchema.parse(mockDecisionRecord);
  mockSimulationRuns.forEach((item) => SimulationRunSchema.parse(item));
  mockSimEntities.forEach((item) => SimEntitySchema.parse(item));
  mockSimRelations.forEach((item) => SimRelationSchema.parse(item));
  mockSimTicks.forEach((item) => SimTickSchema.parse(item));
  SimReportSchema.parse(mockSimReport);
  mockSwarmJobs.forEach((item) => SwarmJobSchema.parse(item));
  mockSeatBrains.forEach((item) => SeatBrainSchema.parse(item));
  console.log("  [PASS] All mock objects passed schema validation!");

  // 2. Test Privacy Resolver
  console.log("2. Validating resolvePrivacy helper...");
  const priv1 = resolvePrivacy(["100m-money-models"]);
  const priv2 = resolvePrivacy([{ sourceId: "100m-book" }]);
  const priv3 = resolvePrivacy([{ sourceId: "normal-wiki-note" }]);
  if (priv1 !== "private" || priv2 !== "private" || priv3 !== "shareable") {
    throw new Error(`resolvePrivacy check failed: ${priv1}, ${priv2}, ${priv3}`);
  }
  console.log("  [PASS] Privacy resolution behaves strictly as specified!");

  // 3. Test MCP Tool names & Grant Scopes
  console.log("3. Validating MCP tools and grant scopes...");
  if (!SWARM_V3_MCP_TOOLS.spark.folderCreate || !SWARM_V3_MCP_TOOLS.council.sessionCreate || !SWARM_V3_MCP_TOOLS.persona.get) {
    throw new Error("Missing MCP tools in registry");
  }
  if (!SWARM_V3_GRANT_SCOPES.includes("brains:private:read")) {
    throw new Error("Missing brains:private:read grant scope");
  }
  console.log("  [PASS] MCP tools & scopes verified!");

  // 4. Test Router Stubs (Hono)
  console.log("4. Validating Swarm-v3 Router Stubs (501 Not Implemented)...");
  const testApp = new Hono();
  registerSwarmV3Stubs(testApp);

  const testEndpoints = [
    "/api/companies/comp_test/apps",
    "/api/companies/comp_test/apps/something",
    "/api/spark/folders",
    "/api/spark/folders/subfolder",
    "/api/agents/templates/transcriber",
    "/api/personas",
    "/api/personas/agent_test",
    "/api/council",
    "/api/council/session_123",
    "/api/simulation",
    "/api/simulation/runs",
    "/api/swarm/runs",
    "/api/swarm/runs/job_123",
    "/api/brains",
    "/api/brains/brain_123",
  ];

  for (const path of testEndpoints) {
    const res = await testApp.request(path, { method: "GET" });
    if (res.status !== 501) {
      throw new Error(`Expected 501 for ${path}, got ${res.status}`);
    }
    const body = (await res.json()) as any;
    if (body.error !== "Not Implemented") {
      throw new Error(`Expected error 'Not Implemented' for ${path}, got ${body.error}`);
    }
  }
  console.log(`  [PASS] All ${testEndpoints.length} test routes returned 501 Not Implemented!`);

  console.log("\n=== ALL SWARM-V3 CONTRACTS & STUBS TESTS PASSED ===");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
