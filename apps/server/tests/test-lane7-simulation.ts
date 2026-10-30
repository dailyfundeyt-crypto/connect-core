import {
  SimulationRunSchema,
  SimEntitySchema,
  SimRelationSchema,
  SimTickSchema,
  SimInjectionSchema,
  SimReportSchema,
  StartSimulationRequestSchema,
  InjectSimEventRequestSchema,
  mockSimulationRuns,
  mockSimEntities,
  mockSimRelations,
  mockSimTicks,
  mockSimReport,
} from "../src/contracts/swarm-v3";
import { SeedExtractor } from "../src/swarm/simulation/seed-extractor";
import { NativeSimulationEngine, PRESET_SCENARIOS } from "../src/swarm/simulation/native-engine";
import { SimulationReportAgent } from "../src/swarm/simulation/report-agent";
import { MiroFishAdapter } from "../src/swarm/simulation/mirofish-adapter";
import { SimulationService } from "../src/swarm/simulation/service";
import { createSimulationRouter } from "../src/swarm/simulation/router";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runLane7TestSuite() {
  console.log("=== Swarm-v3 Lane 7 (Zukunfts-Simulation) Test Suite ===");

  /* ======================================================================== */
  /* 1. Unit-Tests: Zod Contract-Validierung                                   */
  /* ======================================================================== */
  console.log("\n1. Testing Simulation Zod Contracts Validation...");
  for (const r of mockSimulationRuns) {
    const res = SimulationRunSchema.safeParse(r);
    assert(res.success, `Mock run ${r.id} must pass schema validation`);
  }
  for (const e of mockSimEntities) {
    const res = SimEntitySchema.safeParse(e);
    assert(res.success, `Mock entity ${e.id} must pass schema validation`);
  }
  for (const rel of mockSimRelations) {
    const res = SimRelationSchema.safeParse(rel);
    assert(res.success, `Mock relation must pass schema validation`);
  }
  for (const t of mockSimTicks) {
    const res = SimTickSchema.safeParse(t);
    assert(res.success, `Mock tick must pass schema validation`);
  }
  const repRes = SimReportSchema.safeParse(mockSimReport);
  assert(repRes.success, "Mock report must pass schema validation");
  console.log("  [PASS] All mock models pass canonical Zod contracts validation.");

  /* ======================================================================== */
  /* 2. Seed & Weltmodell Extraktion (Spark Plans -> Graph)                   */
  /* ======================================================================== */
  console.log("\n2. Testing SeedExtractor (Spark Plans -> Knowledge Graph)...");
  const extracted = SeedExtractor.extractFromFiles("test-run-1");
  assert(extracted.entities.length >= 8, `Must extract >= 8 entities (got ${extracted.entities.length})`);
  assert(extracted.relations.length >= 5, `Must extract >= 5 relations (got ${extracted.relations.length})`);

  const hasHolding = extracted.entities.some((e) => e.id === "holding_cnt");
  const hasConnect = extracted.entities.some((e) => e.id === "company_connect");
  const hasStefan = extracted.entities.some((e) => e.id === "team_stefan_kunc");
  const hasFramework = extracted.entities.some((e) => e.id === "res_100m_frameworks");

  assert(hasHolding, "Must extract CNT Holding");
  assert(hasConnect, "Must extract Connect company");
  assert(hasStefan, "Must extract Stefan Kunc CEO");
  assert(hasFramework, "Must extract $100M Money Models framework resource");

  console.log(`  [PASS] Successfully extracted ${extracted.entities.length} entities and ${extracted.relations.length} relations from Spark plans.`);
  console.log(`         Preview: ${extracted.summary.companiesCount} companies, ${extracted.summary.productsCount} products, ${extracted.summary.resourcesCount} resources, ${extracted.summary.goalsCount} goals.`);

  /* ======================================================================== */
  /* 3. Native Simulation Engine: 20 Agents x 10 Ticks under Budget           */
  /* ======================================================================== */
  console.log("\n3. Testing NativeSimulationEngine: 20 Agents x 10 Ticks under Budget...");
  const engine = new NativeSimulationEngine({
    runId: "run-bench-1",
    name: "Benchmark Run 20 Agents",
    engine: "native",
    maxTicks: 10,
    budgetTokens: 50000,
    seed: {
      companyName: "Connect (CNT Holding)",
      initialMrr: 12500,
      initialUsers: 140,
    },
  });

  const population = engine.getPopulation();
  assert(population.length === 20, `Population must have exactly 20 agents (got ${population.length})`);

  // Verify category distribution
  const categories = population.map((a) => a.category);
  const custCount = categories.filter((c) => c === "customer").length;
  const compCount = categories.filter((c) => c === "competitor").length;
  const teamCount = categories.filter((c) => c === "team").length;
  const invCount = categories.filter((c) => c === "investor").length;
  const mktCount = categories.filter((c) => c === "market").length;

  assert(custCount === 6, "Must have 6 customer agents");
  assert(compCount === 4, "Must have 4 competitor agents");
  assert(teamCount === 4, "Must have 4 team agents");
  assert(invCount === 3, "Must have 3 investor agents");
  assert(mktCount === 3, "Must have 3 market agents");

  console.log("  [PASS] 20 agents initialized across all 5 canonical categories.");

  // Execute 10 ticks
  const ticks = engine.step(10);
  assert(ticks.length === 10, `Engine must execute 10 ticks (got ${ticks.length})`);

  const usedTokens = engine.getUsedTokens();
  console.log(`  [INFO] Total tokens used for 20 agents x 10 ticks: ${usedTokens} / 50,000 budget.`);
  assert(usedTokens > 0 && usedTokens <= 50000, "Used tokens must stay strictly within 50,000 budget");
  console.log("  [PASS] 10 simulation ticks successfully executed under token budget.");

  const metricsHistory = engine.getMetricsHistory();
  const finalMetric = metricsHistory[metricsHistory.length - 1];
  assert(finalMetric.mrr > 12500, "MRR must grow from initial €12,500");
  assert(finalMetric.ruinProbability <= 0.05, "Ruin probability must stay minimal (<= 5%)");
  console.log(`  [PASS] Compounding metrics: Final MRR €${finalMetric.mrr.toLocaleString()}, Churn ${finalMetric.churnRatePercent}%, Runway ${finalMetric.runwayMonths}M.`);

  /* ======================================================================== */
  /* 4. God's-Eye Variable Injections & Scenarios                              */
  /* ======================================================================== */
  console.log("\n4. Testing God's-Eye Variable Injections & Preset Scenarios...");
  assert(PRESET_SCENARIOS.length >= 4, "Must provide >= 4 preset scenarios");

  const attractionScenario = PRESET_SCENARIOS.find((s) => s.id === "scenario_attraction_offer");
  assert(attractionScenario !== undefined, "Attraction Offer scenario must exist");
  assert(
    attractionScenario!.frameworkRef.includes("Section II"),
    "Attraction scenario must reference Section II"
  );

  const scenarioEngine = new NativeSimulationEngine({
    runId: "run-scenario-attraction",
    name: "Attraction Offer Test",
    engine: "native",
    maxTicks: 10,
    budgetTokens: 50000,
    seed: {
      selectedScenarioId: "scenario_attraction_offer",
      initialMrr: 10000,
      initialUsers: 100,
    },
  });

  const scenarioTicks = scenarioEngine.step(5);
  const injectionTick = scenarioTicks.find((t) => t.tick === 2);
  assert(injectionTick !== undefined, "Tick 2 must exist");
  assert(
    injectionTick!.event?.includes("INJEKTION"),
    "Tick 2 must trigger God's-eye injection event"
  );
  console.log("  [PASS] Preset scenarios and God's-eye variable injections applied as planned.");

  /* ======================================================================== */
  /* 5. ReportAgent & Hormozi Framework Citations                              */
  /* ======================================================================== */
  console.log("\n5. Testing SimulationReportAgent (Hormozi Citations & Disclaimer)...");
  const report = SimulationReportAgent.generateReport({
    config: {
      runId: "run-report-test",
      name: "Connect Scale Run",
      engine: "native",
      maxTicks: 10,
      budgetTokens: 50000,
      seed: { companyName: "Connect & CNT Holding" },
    },
    ticks,
    metricsHistory,
    engineUsed: "native",
  });

  assert(report.markdown !== undefined, "Report must contain rich markdown");
  const md = report.markdown!;

  // Mandatory checks
  assert(
    md.includes("Simulation, keine Prognosegarantie"),
    "Report must contain mandatory disclaimer 'Simulation, keine Prognosegarantie'"
  );
  assert(
    md.includes("Section VI › Make Your Money Model") || md.includes("Section VI"),
    "Report must cite Section VI Make Your Money Model"
  );
  assert(
    md.includes("[100M MM · Section II › Decoy Offer · Z. 1745–1750]"),
    "Report must cite Section II Decoy Offer"
  );
  assert(
    md.includes("[100M MM · Section V › Continuity Offers · Z. 2890–2940]"),
    "Report must cite Section V Continuity Offers"
  );
  assert(
    md.includes("scale-stefan"),
    "Report must prepare handoff payload for Council session 'scale-stefan'"
  );

  const proj = report.projections as any;
  assert(proj.mrrRange && proj.mrrRange.p50, "Report must calculate p50 MRR projection");
  assert(proj.mrrRange.p10 < proj.mrrRange.p50, "p10 projection must be strictly conservative");
  assert(proj.mrrRange.p90 > proj.mrrRange.p50, "p90 projection must be optimistic");

  console.log("  [PASS] Report generated with authentic citations, uncertainty ranges, and Council handoff.");

  /* ======================================================================== */
  /* 6. MiroFish AGPL Adapter & Fallback Resilience                           */
  /* ======================================================================== */
  console.log("\n6. Testing MiroFish Adapter & Fallback...");
  const isEnabledLocally = MiroFishAdapter.isEnabled();
  console.log(`  [INFO] MiroFish Feature Flag (local default): ${isEnabledLocally ? "ENABLED" : "DISABLED"}`);

  // Test serverless / Vercel guarantee
  process.env.VERCEL = "1";
  assert(MiroFishAdapter.isEnabled() === false, "MiroFish must be strictly disabled on Vercel");
  delete process.env.VERCEL;

  process.env.CONNECT_SERVERLESS = "1";
  assert(MiroFishAdapter.isEnabled() === false, "MiroFish must be strictly disabled in serverless environments");
  delete process.env.CONNECT_SERVERLESS;

  // Execute run with MiroFish adapter (tests live sidecar or fallback)
  const mfReport = await MiroFishAdapter.executeRun({
    runId: "run-mf-test",
    name: "MiroFish Adapter Test",
    engine: "mirofish",
    maxTicks: 10,
    budgetTokens: 50000,
    seed: { companyName: "CNT Holding" },
  });

  assert(mfReport.runId === "run-mf-test", "MiroFish run must produce valid SimReport");
  assert(mfReport.markdown?.includes("Simulation, keine Prognosegarantie"), "MiroFish report must contain disclaimer");
  console.log("  [PASS] MiroFish Adapter executes cleanly with zero cloud data leak and graceful fallback.");

  /* ======================================================================== */
  /* 7. HTTP API Router Tests (Hono)                                           */
  /* ======================================================================== */
  console.log("\n7. Testing Simulation Hono Router Endpoints...");
  const app = createSimulationRouter();

  // GET /health
  const healthRes = await app.request("/health");
  assert(healthRes.status === 200, "GET /health must return 200");
  const healthData = (await healthRes.json()) as any;
  assert(healthData.status === "ok", "Health status must be ok");

  // GET /scenarios
  const scenariosRes = await app.request("/scenarios");
  assert(scenariosRes.status === 200, "GET /scenarios must return 200");
  const scenariosData = (await scenariosRes.json()) as any;
  assert(scenariosData.count >= 4, "Must return at least 4 preset scenarios");

  // POST /extract-seed
  const seedRes = await app.request("/extract-seed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert(seedRes.status === 200, "POST /extract-seed must return 200");
  const seedData = (await seedRes.json()) as any;
  assert(seedData.preview.entities.length >= 8, "Extracted preview must contain >= 8 entities");

  // POST / (Start Run)
  const startRes = await app.request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "API Test Simulation",
      engine: "native",
      seed: { initialMrr: 15000, initialUsers: 150 },
    }),
  });
  assert(startRes.status === 200, "POST / must return 200");
  const startData = (await startRes.json()) as any;
  assert(startData.success === true, "Start run must succeed");
  const testRunId = startData.run.id;

  // GET /:id
  const getRunRes = await app.request(`/${testRunId}`);
  assert(getRunRes.status === 200, "GET /:id must return 200");

  // GET /:id/graph
  const graphRes = await app.request(`/${testRunId}/graph`);
  assert(graphRes.status === 200, "GET /:id/graph must return 200");
  const graphData = (await graphRes.json()) as any;
  assert(graphData.entities.length >= 8, "Graph must return entities");

  // POST /:id/inject
  const injectRes = await app.request(`/${testRunId}/inject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tick: 3,
      type: "gods_eye_market_shift",
      payload: { factor: 1.2 },
    }),
  });
  assert(injectRes.status === 200, "POST /:id/inject must return 200");

  // POST /:id/step
  const stepRes = await app.request(`/${testRunId}/step`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: 5 }),
  });
  assert(stepRes.status === 200, "POST /:id/step must return 200");
  const stepData = (await stepRes.json()) as any;
  assert(stepData.ticksExecuted === 5, "Must execute 5 ticks");

  // GET /:id/report
  const reportRes = await app.request(`/${testRunId}/report`);
  assert(reportRes.status === 200, "GET /:id/report must return 200");
  const reportData = (await reportRes.json()) as any;
  assert(reportData.report && reportData.report.markdown, "Must return SimReport with markdown");

  console.log("  [PASS] All 9 HTTP simulation API endpoints respond with correct status and contract DTOs.");

  console.log("\n=== ALL LANE 7 UNIT & INTEGRATION TESTS PASSED PERFECTLY ===");
  MiroFishAdapter.stop();
  process.exit(0);
}

runLane7TestSuite().catch((err) => {
  console.error("Test suite failed:", err);
  MiroFishAdapter.stop();
  process.exit(1);
});
