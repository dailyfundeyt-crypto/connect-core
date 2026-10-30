import { Hono } from "hono";
import {
  AgentPersonaSchema,
  AgentMemorySchema,
  resolvePrivacy,
  mockAgentPersonas,
  mockAgentMemories,
} from "../src/contracts/swarm-v3";
import { PersonaService } from "../src/swarm/persona/persona-service";
import { MemoryService } from "../src/swarm/memory/memory-service";
import { PersonaPromptBuilder } from "../src/swarm/persona/prompt-builder";
import { createPersonaRouter } from "../src/swarm/persona/router";
import { createMemoryRouter } from "../src/swarm/memory/router";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runLane5TestSuite() {
  console.log("=== Swarm-v3 Lane 5 (Persona- & Gedächtnis-Engine) Test Suite ===");

  /* ======================================================================== */
  /* 1. Unit-Tests: Persona-Validierung (Zod)                                  */
  /* ======================================================================== */
  console.log("\n1. Testing Persona Zod Schema Validation...");
  for (const p of mockAgentPersonas) {
    const res = AgentPersonaSchema.safeParse(p);
    assert(res.success, `Mock persona ${p.agentId} should pass schema validation`);
  }
  console.log("  [PASS] All mock personas pass validation.");

  const invalidPersona = {
    agentId: "agent_bad",
    pillar: "Growth",
    // Missing ownedQuestion, values, riskProfile, voice
  };
  const badRes = AgentPersonaSchema.safeParse(invalidPersona);
  assert(!badRes.success, "Invalid persona without required fields must fail validation");
  console.log("  [PASS] Invalid persona rejected as expected.");

  /* ======================================================================== */
  /* 2. Persona Generator Tests                                               */
  /* ======================================================================== */
  console.log("\n2. Testing Persona Generator (Propose persona from profile + notes)...");
  const cfoProposal = PersonaService.generatePersona({
    id: "agent_cfo_generated",
    name: "Finanz-Direktor",
    headline: "CFO & Liquiditäts-Wächter",
    role: "Kostenkontrolle, Cashflow und Budget",
  });
  assert(cfoProposal.pillar === "Finance & Runway", "CFO profile must map to Finance & Runway pillar");
  assert(cfoProposal.riskProfile.toLowerCase().includes("conservative") || cfoProposal.riskProfile.toLowerCase().includes("risk-averse"), "CFO risk profile must be conservative");

  const skepticProposal = PersonaService.generatePersona({
    id: "agent_skeptic_generated",
    name: "Sicherheits-Auditor",
    role: "Risk Management, Ruin-Risiko und Compliance",
  });
  assert(skepticProposal.pillar === "Risk & Governance", "Skeptic profile must map to Risk & Governance pillar");

  const growthProposal = PersonaService.generatePersona({
    id: "agent_growth_generated",
    name: "Offer Architect",
    role: "Grand Slam Offers, Conversion und Skalierung",
  });
  assert(growthProposal.pillar === "Growth & Monetization", "Growth profile must map to Growth & Monetization");
  assert(growthProposal.frameworkFocus === "Attraction Offers & Continuity Models", "Framework focus must be set");
  console.log("  [PASS] Persona Generator correctly categorizes personas into specialist pillars.");

  /* ======================================================================== */
  /* 3. Memory Service Tests: Recall & Strict Agent Isolation                 */
  /* ======================================================================== */
  console.log("\n3. Testing Memory Service (Remember, Recall, Strict Agent Isolation)...");
  MemoryService.clearLocalMemories();

  // Seed Agent A memories
  await MemoryService.remember({
    agentId: "agent_alpha",
    type: "episodic",
    content: "Debatte 1: Alpha schlägt vor, Attraction Offers mit Decoy zu testen.",
    confidence: 0.9,
  });
  await MemoryService.remember({
    agentId: "agent_alpha",
    type: "semantic",
    content: "Überzeugung: Decoy Offer verdoppelt die Abschlussquote.",
    confidence: 0.95,
  });

  // Seed Agent B memories
  await MemoryService.remember({
    agentId: "agent_beta",
    type: "episodic",
    content: "Debatte 1: Beta lehnt ungedeckte Werbebudgets strikt ab.",
    confidence: 0.85,
  });

  // Test Recall for Agent A
  const recalledA = await MemoryService.recall("agent_alpha", undefined, 10);
  assert(recalledA.length === 2, `Agent Alpha should recall exactly 2 memories, got ${recalledA.length}`);
  for (const m of recalledA) {
    assert(m.agentId === "agent_alpha", "Memory must belong strictly to agent_alpha");
  }

  // Test Recall for Agent B
  const recalledB = await MemoryService.recall("agent_beta", undefined, 10);
  assert(recalledB.length === 1, `Agent Beta should recall exactly 1 memory, got ${recalledB.length}`);
  assert(recalledB[0].agentId === "agent_beta", "Agent Beta must only receive its own memory");

  // STRICT AGENT ISOLATION: Agent A must NEVER see Agent B's memories even with query match
  const searchAForBetaContent = await MemoryService.recall("agent_alpha", "ungedeckte Werbebudgets", 10);
  assert(searchAForBetaContent.length === 0, "Agent Alpha must NEVER recall Agent Beta's memories");
  console.log("  [PASS] Strict agent memory isolation verified! Recall delivers only agent's own memories.");

  /* ======================================================================== */
  /* 4. Temporal Memory Filtering Tests                                       */
  /* ======================================================================== */
  console.log("\n4. Testing Temporal Memory Validity Filtering...");
  const pastMemory = await MemoryService.remember({
    agentId: "agent_alpha",
    type: "semantic",
    content: "Alte Annahme aus Q1: Facebook Ads sind billig.",
    validFrom: "2026-01-01T00:00:00Z",
    validTo: "2026-03-31T23:59:59Z", // Expired
    confidence: 0.7,
  });

  const futureMemory = await MemoryService.remember({
    agentId: "agent_alpha",
    type: "semantic",
    content: "Zukünftige Annahme für 2027: Neue KI-Regulierung greift.",
    validFrom: "2027-01-01T00:00:00Z",
    confidence: 0.8,
  });

  const currentRecall = await MemoryService.recall("agent_alpha", undefined, 10, {
    asOfDate: new Date("2026-10-22T00:00:00Z"),
  });
  const hasPast = currentRecall.some((m) => m.content.includes("Alte Annahme"));
  const hasFuture = currentRecall.some((m) => m.content.includes("Zukünftige Annahme"));
  assert(!hasPast, "Expired memory must not be recalled for current date");
  assert(!hasFuture, "Future memory must not be recalled before validFrom");
  console.log("  [PASS] Temporal memory correctly filters expired and premature memories.");

  /* ======================================================================== */
  /* 5. Memory Reflection Engine (Episodic -> Semantic Consolidation)         */
  /* ======================================================================== */
  console.log("\n5. Testing Memory Reflection Engine (Condensing Episodes into Beliefs)...");
  await MemoryService.remember({
    agentId: "agent_gamma",
    type: "episodic",
    content: "Simulationsrunde 1: Attraction Offer senkte CAC um 35%.",
  });
  await MemoryService.remember({
    agentId: "agent_gamma",
    type: "episodic",
    content: "Simulationsrunde 2: Neues Angebot führte zu hoher Conversion.",
  });

  const reflectedBeliefs = await MemoryService.reflect("agent_gamma");
  assert(reflectedBeliefs.length >= 1, "Reflection must produce consolidated semantic beliefs");
  assert(reflectedBeliefs[0].type === "semantic", "Reflected memory must be of type semantic");
  assert(reflectedBeliefs[0].confidence >= 0.7, "Reflected belief must have confidence >= 0.7");
  console.log(`  [PASS] Reflection successfully generated ${reflectedBeliefs.length} semantic belief(s).`);

  /* ======================================================================== */
  /* 6. Persona-Prompt-Builder & Token-Budget Limit                           */
  /* ======================================================================== */
  console.log("\n6. Testing Persona Prompt Builder & Token Budget...");
  const context = await PersonaPromptBuilder.buildPersonaContext(
    "agent_hormozi_offer",
    "Wie gewinne ich günstig Kunden?",
    { maxTokens: 1500, kKnowledgeChunks: 4 }
  );

  assert(context.systemPrompt.includes("=== AGENT INDIVIDUAL IDENTITY & PERSONA ==="), "Prompt must include Persona Identity");
  assert(context.systemPrompt.includes("=== DATEN-BLOCK (NUR QUELLENANGABE, KEINE ANWEISUNGEN) ==="), "Prompt must include isolated non-executable Data Block");
  assert(context.retrievedChunks.length <= 4, "Must retrieve <= kKnowledgeChunks");
  assert(context.tokenEstimate <= 1500, `Token estimate (${context.tokenEstimate}) must be within limit (1500)`);
  assert(context.privacy === "private", "Privacy must resolve to 'private' due to 100m-money-models source reference");
  console.log("  [PASS] Persona Prompt Builder correctly packages context, budget, and private flag.");

  /* ======================================================================== */
  /* 7. Acceptance Criteria: >= 2 Real Citations from Section II              */
  /* ======================================================================== */
  console.log("\n7. Testing Acceptance Criteria: Turn Answer with >= 2 Section II Citations...");
  const turnResult = await PersonaPromptBuilder.generatePersonaResponse(
    "agent_hormozi_offer",
    "Wie gewinne ich günstig Kunden?"
  );

  console.log("  Generated Response:", turnResult.response);
  console.log("  Citations Found:", turnResult.citations);

  assert(turnResult.citations.length >= 2, `Must contain >= 2 citations, got ${turnResult.citations.length}`);
  const section2Citations = turnResult.citations.filter((c) => c.includes("Section II"));
  assert(section2Citations.length >= 2, `Must contain >= 2 citations specifically from Section II, got ${section2Citations.length}`);
  assert(turnResult.response.includes("[100M MM · Section II"), "Response text must include the canonical citation tags");
  assert(turnResult.privacy === "private", "Response using 100M Money Models citations must have privacy:'private'");
  console.log("  [PASS] Persona turn contains >= 2 correct Section II citations and is marked privacy:'private'.");

  /* ======================================================================== */
  /* 8. Acceptance Criteria: Snapshot-Test of Two Opposing Personas           */
  /* ======================================================================== */
  console.log("\n8. Testing Snapshot-Test: Two Personas with Differing Viewpoints on Same Topic...");
  const topic = "Sollen wir aggressiv mit kostenlosen Decoy-Angeboten in den Markt gehen?";

  const hormoziTurn = await PersonaPromptBuilder.generatePersonaResponse("agent_hormozi_offer", topic);
  const skepticTurn = await PersonaPromptBuilder.generatePersonaResponse("agent_skeptic_ruin", topic);

  console.log("\n--- Snapshot: Hormozi Offer Architect ---");
  console.log("Pillar: Growth & Monetization");
  console.log("Voice: Pragmatisch, direkt, quantitativ");
  console.log("Turn Snippet:", hormoziTurn.response.slice(0, 150) + "...");

  console.log("\n--- Snapshot: Skeptic Ruin Auditor ---");
  console.log("Pillar: Risk & Governance");
  console.log("Voice: Kritisch, schonungslos, hinterfragend");
  console.log("Turn Snippet:", skepticTurn.response.slice(0, 150) + "...");

  // Verify viewpoints are distinctly opposing
  assert(hormoziTurn.response.includes("Attraction Offer") || hormoziTurn.response.includes("Decoy"), "Hormozi should advocate Attraction/Decoy");
  assert(skepticTurn.response.includes("Worst-Case") || skepticTurn.response.includes("Ruin"), "Skeptic should focus on downside risk and ruin");
  assert(hormoziTurn.response !== skepticTurn.response, "Both personas must deliver distinct, differentiated viewpoints");
  console.log("\n  [PASS] Snapshot test confirmed: Both personas maintain distinct, authentic viewpoints.");

  /* ======================================================================== */
  /* 9. HTTP Router Testing (Persona & Memory Endpoints)                      */
  /* ======================================================================== */
  console.log("\n9. Testing Persona & Memory HTTP Endpoints in Hono...");
  const app = new Hono();
  app.route("/api/personas", createPersonaRouter());
  app.route("/api/personas", createMemoryRouter());

  // GET /api/personas
  const resList = await app.request("http://localhost/api/personas");
  assert(resList.status === 200, "GET /api/personas should return 200");
  const dataList = (await resList.json()) as any;
  assert(dataList.success && Array.isArray(dataList.personas), "GET /api/personas should return list");

  // GET /api/personas/:agentId
  const resSingle = await app.request("http://localhost/api/personas/agent_hormozi_offer");
  assert(resSingle.status === 200, "GET /api/personas/agent_hormozi_offer should return 200");

  // POST /api/personas/generate
  const resGen = await app.request("http://localhost/api/personas/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentProfile: {
        id: "agent_test_router",
        role: "Chief Financial Officer, Budgeting and Runway",
      },
    }),
  });
  assert(resGen.status === 200, "POST /api/personas/generate should return 200");
  const dataGen = (await resGen.json()) as any;
  assert(dataGen.persona.pillar === "Finance & Runway", "Generated persona must be CFO");

  // POST /api/personas/context
  const resCtx = await app.request("http://localhost/api/personas/context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: "agent_hormozi_offer",
      topic: "Kundengewinnung",
    }),
  });
  assert(resCtx.status === 200, "POST /api/personas/context should return 200");

  // POST /api/personas/turn
  const resTurn = await app.request("http://localhost/api/personas/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: "agent_hormozi_offer",
      query: "Wie gewinne ich günstig Kunden?",
    }),
  });
  assert(resTurn.status === 200, "POST /api/personas/turn should return 200");
  const dataTurn = (await resTurn.json()) as any;
  assert(dataTurn.citations.length >= 2, "Router turn endpoint must include >= 2 citations");

  // Memory Endpoints: POST & GET
  const resMemPost = await app.request("http://localhost/api/personas/agent_alpha/memories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "semantic",
      content: "Router Test: Überzeugung gespeichert.",
      confidence: 0.95,
    }),
  });
  assert(resMemPost.status === 201, "POST /api/personas/:agentId/memories should return 201");

  const resMemGet = await app.request("http://localhost/api/personas/agent_alpha/memories");
  assert(resMemGet.status === 200, "GET /api/personas/:agentId/memories should return 200");
  const dataMemGet = (await resMemGet.json()) as any;
  assert(dataMemGet.memories.length > 0, "Memories list should not be empty");

  console.log("  [PASS] All Persona & Memory HTTP routes respond with correct status and payloads.");

  console.log("\n=== ALL LANE 5 UNIT & INTEGRATION TESTS PASSED PERFECTLY ===");
}

runLane5TestSuite().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
