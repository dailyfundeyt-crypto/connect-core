import {
  CouncilSessionSchema,
  CouncilSeatSchema,
  CouncilTurnSchema,
  CouncilVoteSchema,
  DecisionRecordSchema,
} from "../src/swarm/council/types";
import { CouncilChair } from "../src/swarm/council/chair";
import { AntiGroupthinkEngine } from "../src/swarm/council/anti-groupthink";
import { CouncilScoringEngine } from "../src/swarm/council/scoring";
import { CouncilDecisionRecordGenerator } from "../src/swarm/council/decision-record";
import { ScaleStefanTemplate } from "../src/swarm/council/templates/scale-stefan";
import { CouncilEngine } from "../src/swarm/council/council-engine";
import { createCouncilRouter } from "../src/swarm/council/router";
import { loadBookChunks } from "../src/swarm/brains/sources/book-ingest";
import { verifyQuote } from "../src/swarm/brains/quote-check";
import { MemoryService } from "../src/swarm/memory/memory-service";
import { getSparkFoldersStore } from "../src/brain/browser-folders/store";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[FAIL] Assertion failed: ${message}`);
  }
}

async function runLane6TestSuite() {
  console.log("=== Swarm-v3 Lane 6 (Council/Debatten-Engine Roast-Room) Test Suite ===");

  /* ======================================================================== */
  /* 1. Unit Tests: Schema Validations                                         */
  /* ======================================================================== */
  console.log("\n1. Testing Zod Schema Validations...");
  const validSession = {
    id: "session_test_01",
    question: "Sollen wir Option A oder B wählen?",
    options: ["Option A", "Option B"],
    mode: "full" as const,
    status: "in_progress" as const,
  };
  assert(CouncilSessionSchema.safeParse(validSession).success, "Valid session should pass schema");

  const validVote = {
    sessionId: "session_test_01",
    agentId: "agent_hormozi_offer",
    option: "Option A",
    score: 8.5,
    weight: 1.2,
    ruinFlag: false,
    rationale: "Solide Hebelwirkung",
  };
  assert(CouncilVoteSchema.safeParse(validVote).success, "Valid vote should pass schema");

  const invalidVote = {
    sessionId: "session_test_01",
    agentId: "agent_cfo",
    option: "Option A",
    score: 15.0, // Invalid: must be <= 10
  };
  assert(!CouncilVoteSchema.safeParse(invalidVote).success, "Score > 10 must fail validation");
  console.log("  [PASS] Zod schemas validate correctly.");

  /* ======================================================================== */
  /* 2. Chair Analysis & Missing Dimensions                                    */
  /* ======================================================================== */
  console.log("\n2. Testing Chair Analysis (Readiness & Dimensions)...");
  const vagueQuestion = "Sollen wir wachsen?";
  const analysisVague = CouncilChair.analyzeDebateReadiness(vagueQuestion, []);
  assert(!analysisVague.isSufficient, "Vague question without options must be insufficient");
  assert(analysisVague.missingDimensions.includes("options"), "Must detect missing options");
  assert(analysisVague.missingDimensions.includes("metrics"), "Must detect missing quantitative metrics");
  assert(analysisVague.missingDimensions.includes("limits"), "Must detect missing operational limits");
  assert(analysisVague.recommendedSeats.length >= 4, "Chair must recommend at least 4 pillar seats");

  const detailedAnalysis = CouncilChair.analyzeDebateReadiness(
    "Sollen wir das Angebot auf 5000€ mtl. umstellen bei 6 Monaten Runway und Ziel-MRR 50k?",
    ["Option A", "Option B"],
    "Mein Bauchgefühl tendiert zu Option B."
  );
  assert(detailedAnalysis.isSufficient, "Well-specified question with options must be ready");
  console.log("  [PASS] Chair analysis accurately identifies missing dimensions and readiness.");

  /* ======================================================================== */
  /* 3. Anti-Groupthink & Devil's Advocate Engine                             */
  /* ======================================================================== */
  console.log("\n3. Testing Anti-Groupthink & Devil's Advocate Trigger...");
  const unanimousTurns = [
    {
      sessionId: "s1",
      round: 1,
      agentId: "agent_hormozi_offer",
      content: "Ich bin absolut dafür, das ist optimal und großartig.",
      stance: "pro",
    },
    {
      sessionId: "s1",
      round: 1,
      agentId: "agent_cfo_cashflow",
      content: "Vollste Zustimmung, wir befürworten das ohne jeden Zweifel.",
      stance: "befürwortend",
    },
  ];
  const seats = [
    { sessionId: "s1", agentId: "agent_hormozi_offer", role: "Offer", weight: 1.2 },
    { sessionId: "s1", agentId: "agent_cfo_cashflow", role: "CFO", weight: 1.0 },
    { sessionId: "s1", agentId: "agent_skeptic_ruin", role: "Skeptic", weight: 1.5 },
  ];

  const groupthinkTrigger = AntiGroupthinkEngine.evaluateConsensus(unanimousTurns, seats, 1);
  assert(groupthinkTrigger.triggered, "Unanimous pro stances must trigger Anti-Groupthink intervention");
  assert(
    groupthinkTrigger.assignedAgentId === "agent_skeptic_ruin",
    "Must assign Devil's Advocate to agent_skeptic_ruin"
  );

  const devilsPrompt = AntiGroupthinkEngine.buildDevilsAdvocatePrompt(
    "Wie skalieren?",
    "Alle wollen Option B",
    "agent_skeptic_ruin",
    true
  );
  assert(
    devilsPrompt.includes("ANTI-GROUPTHINK INTERVENTION"),
    "Prompt must declare anti-groupthink intervention"
  );
  assert(
    devilsPrompt.includes("Hormozi"),
    "Hormozi debate prompt must demand arguments against blind book adherence"
  );
  console.log("  [PASS] Anti-Groupthink consensus detector and prompt builder pass.");

  /* ======================================================================== */
  /* 4. Ruin-Risk Cap & Scoring Engine                                         */
  /* ======================================================================== */
  console.log("\n4. Testing Scoring Engine & Ruin-Risk Cap...");
  const mockVotes = [
    // Option A: Safe, Score 8.0
    { sessionId: "s1", agentId: "agent_hormozi_offer", option: "Option A", score: 8.0, weight: 1.0, ruinFlag: false },
    { sessionId: "s1", agentId: "agent_skeptic_ruin", option: "Option A", score: 8.0, weight: 1.0, ruinFlag: false },
    // Option B: Rechnerisch höher (Score 9.5), ABER Ruin-Flag gesetzt!
    { sessionId: "s1", agentId: "agent_hormozi_offer", option: "Option B", score: 10.0, weight: 1.0, ruinFlag: false },
    { sessionId: "s1", agentId: "agent_skeptic_ruin", option: "Option B", score: 9.0, weight: 1.0, ruinFlag: true, rationale: "Existenzrisiko!" },
  ];

  const scoringResult = CouncilScoringEngine.calculateVerdict("Frage?", ["Option A", "Option B"], mockVotes, seats);
  assert(scoringResult.recommendedOption === "Option A", "Option with Ruin Flag must NOT win despite higher average");
  assert(scoringResult.hasCappedOptions, "Must flag that options were capped due to Ruin Risk");
  assert(scoringResult.scoresByOption["Option B"].status === "capped_ruin", "Option B must have capped_ruin status");
  assert(scoringResult.dissent !== undefined && scoringResult.dissent.includes("Ruin-Risk VETO"), "Dissent must log Ruin Veto");
  console.log("  [PASS] Ruin-Risk Cap correctly disqualified higher-scoring dangerous option.");

  /* ======================================================================== */
  /* 5. ADR Decision Record Generation & Spark Folder Persistence             */
  /* ======================================================================== */
  console.log("\n5. Testing Decision Record & Spark Folder Save...");
  const mockSession = {
    id: "session_adr_test",
    question: "Wie skalieren wir Q4?",
    options: ["Option A", "Option B"],
    context: "Wachstumstest für Stefan",
    mode: "full" as const,
    status: "completed" as const,
  };

  const recordMd = CouncilDecisionRecordGenerator.generateRecordMarkdown(
    mockSession,
    seats,
    unanimousTurns,
    mockVotes,
    scoringResult,
    [{ citationTag: "[100M MM · Section VI · Z. 100]", quote: "Front end gets customers." }]
  );

  assert(recordMd.includes("# ADR: Council Decision Record"), "Must contain ADR header");
  assert(recordMd.includes("Option A"), "Must contain Option A in matrix");
  assert(recordMd.includes("DISQUALIFIZIERT (Ruin)"), "Must highlight disqualified ruin option");
  assert(recordMd.includes("`private`"), "Must state private classification");

  const sparkSave = await CouncilDecisionRecordGenerator.saveToSparkDecisionsFolder(
    mockSession,
    {
      sessionId: mockSession.id,
      verdict: scoringResult.verdict,
      rationale: scoringResult.rationale,
      dissent: scoringResult.dissent,
      confidence: scoringResult.confidence,
      recordMd,
    }
  );
  assert(sparkSave.folderId.length > 0, "Must return valid Spark folderId");
  assert(sparkSave.noteId.includes("session_adr_test"), "Must attach note with session ID");

  const folderStore = getSparkFoldersStore();
  const folderNotes = await folderStore.listFolderNotes(sparkSave.folderId);
  assert(folderNotes.some((n) => n.noteId === sparkSave.noteId), "Note must exist in Spark 'Entscheidungen' folder");
  console.log("  [PASS] ADR Markdown generated and successfully stored in Spark folder 'Entscheidungen'.");

  /* ======================================================================== */
  /* 6. Complete 'scale-stefan' Debate Execution (4 Seats, 4 Rounds, Quotes)  */
  /* ======================================================================== */
  console.log("\n6. Testing Complete 'scale-stefan' Template Debate...");
  const scaleResult = await ScaleStefanTemplate.execute({
    mode: "quick",
    provider: "mock",
  });

  assert(scaleResult.session.status === "completed", "Debate session must reach completed status");
  assert(scaleResult.seats.length === 4, "Must have exactly 4 seats");
  assert(scaleResult.turns.length >= 4, "Must have debate turns across rounds");
  assert(scaleResult.votes.length === 12, "4 seats x 3 options = 12 total votes");
  assert(scaleResult.citations.length >= 5, "Must include at least 5 verified book citations");

  // Verify that at least one turn was Devil's Advocate
  const hasDevilsTurn = scaleResult.turns.some((t) => t.isDevilsAdvocate || t.stance === "contra_hormozi_framework");
  assert(hasDevilsTurn, "Debate must contain explicit Devil's Advocate intervention against framework");

  // Verify book citations against knowledge chunks
  const chunks = loadBookChunks();
  assert(chunks.length > 0, "Knowledge base book chunks must be available");
  for (const cite of scaleResult.citations) {
    const v = verifyQuote(cite.quote, chunks);
    assert(v.isVerbatim || v.similarity >= 0.7, `Quote "${cite.quote.slice(0, 30)}" must be verifiable`);
  }
  console.log(`  [PASS] 'scale-stefan' completed with 4 seats, ${scaleResult.citations.length} verified quotes, and ADR verdict.`);

  /* ======================================================================== */
  /* 7. Memory Reflection Integration (Lane 5)                                */
  /* ======================================================================== */
  console.log("\n7. Testing Agent Memory Reflection (Lane 5 Integration)...");
  await MemoryService.remember({
    agentId: "agent_hormozi_offer",
    type: "episodic",
    content: `Council-Debatte 'scale-stefan': Hybrid-Modell verabschiedet.`,
    confidence: 0.95,
    metadata: { sessionId: scaleResult.session.id, verdict: scaleResult.decision.verdict },
  });

  const recalled = await MemoryService.recall("agent_hormozi_offer", "Hybrid-Modell", 5);
  assert(recalled.length > 0, "Agent must recall its debate position from memory");
  console.log("  [PASS] Agent successfully saved and recalled episodic memory.");

  /* ======================================================================== */
  /* 8. REST & SSE Router Integration                                          */
  /* ======================================================================== */
  console.log("\n8. Testing Hono Router Endpoints & SSE Stream...");
  const router = createCouncilRouter();

  // Test /health
  const healthRes = await router.request("/health");
  assert(healthRes.status === 200, "/health must return 200");
  const healthData = await healthRes.json();
  assert(healthData.module === "council", "Health response must identify council module");

  // Test /templates
  const templatesRes = await router.request("/templates");
  assert(templatesRes.status === 200, "/templates must return 200");
  const templatesData = await templatesRes.json();
  assert(templatesData.templates.some((t: any) => t.id === "scale-stefan"), "scale-stefan template must be listed");

  // Test /chair/analyze
  const chairRes = await router.request("/chair/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "Wie skalieren?", options: ["A", "B"] }),
  });
  assert(chairRes.status === 200, "/chair/analyze must return 200");

  // Test /sessions creation
  const createRes = await router.request("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: "Welches Pricing?",
      options: ["99€", "299€"],
      mode: "quick",
    }),
  });
  assert(createRes.status === 200, "Create session must succeed");
  const createdSessionData = await createRes.json();
  const createdId = createdSessionData.session.id;

  // Test /sessions/:id/events (SSE)
  const eventsRes = await router.request(`/sessions/${createdId}/events`);
  assert(eventsRes.status === 200, "Events endpoint must return 200");
  assert(
    eventsRes.headers.get("content-type")?.includes("text/event-stream"),
    "Events must have text/event-stream content-type"
  );

  // Test /templates/scale-stefan/run via HTTP
  const runTemplateRes = await router.request("/templates/scale-stefan/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "quick", provider: "mock" }),
  });
  assert(runTemplateRes.status === 200, "Template run must return 200");
  const runTemplateData = await runTemplateRes.json();
  assert(runTemplateData.success, "Template run must report success: true");
  assert(runTemplateData.citationsCount >= 5, "Template run must yield >= 5 citations");

  console.log("  [PASS] All Hono API endpoints and SSE stream passed successfully.");

  console.log("\n=======================================================");
  console.log("  ALL 8 LANE 6 COUNCIL TEST SUITES PASSED (100% GREEN) ");
  console.log("=======================================================\n");
}

runLane6TestSuite().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
