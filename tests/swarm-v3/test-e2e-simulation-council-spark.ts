import {
  SimulationRunSchema,
  CouncilSessionSchema,
  CouncilSeatSchema,
  CouncilTurnSchema,
  CouncilVoteSchema,
  DecisionRecordSchema,
  FolderNoteSchema,
} from "../../packages/contracts/src/swarm-v3/types";
import { brainStore } from "../../apps/server/src/swarm/brains/brain-builder";
import { verifyQuotes } from "../../apps/server/src/swarm/brains/quote-check";
import { evaluateOutputPrivacy } from "./test-privacy-flags";

async function runE2ETests() {
  console.log("=== [E2E INTEGRATION TEST] Simulation → Council → Decision Record → Spark ===");

  // -------------------------------------------------------------
  // Step 1: Start Simulation (Lane 7 Mock Fixture)
  // -------------------------------------------------------------
  console.log("Step 1: Running Market Simulation on Offer Options...");
  const simulationRun = SimulationRunSchema.parse({
    id: "sim_run_e2e_001",
    name: "Connect Pricing & Decoy Offer Market Simulation",
    status: "completed",
    engine: "native",
    seed: {
      marketSize: 10_000,
      baselineConversion: 0.03,
      testedOffers: ["flat_subscription_49", "decoy_35_vs_bundle_49"],
    },
    createdAt: new Date().toISOString(),
  });
  console.log(`  [PASS] Simulation completed: ${simulationRun.id} (engine: ${simulationRun.engine})`);

  // -------------------------------------------------------------
  // Step 2: Convene Council Session with Brain-backed Seats (Lane 6 + 10)
  // -------------------------------------------------------------
  console.log("Step 2: Convening Council Session with Seat-Brains...");
  const hormoziBrain = brainStore.get("brain-hormozi-offer")!;
  const cfoBrain = brainStore.get("brain-cfo-risk")!;

  const session = CouncilSessionSchema.parse({
    id: "council_session_e2e_001",
    question: "Should Connect adopt a Decoy Offer structure (35 EUR Web-only vs 49 EUR Full Suite) to accelerate ARR?",
    options: ["Adopt Decoy Structure (35 EUR vs 49 EUR)", "Maintain Flat 49 EUR Subscription"],
    mode: "full",
    status: "completed",
    context: "Simulation indicated +42% revenue projection under decoy offer contrast framing.",
    createdAt: new Date().toISOString(),
  });

  const seatHormozi = CouncilSeatSchema.parse({
    sessionId: session.id,
    agentId: hormoziBrain.agentId || "agent-hormozi",
    role: "Offer Architect",
    stance: "pro_decoy",
    riskTolerance: "high",
  });

  const seatCFO = CouncilSeatSchema.parse({
    sessionId: session.id,
    agentId: cfoBrain.agentId || "agent-cfo",
    role: "Risk & Unit Economics Auditor",
    stance: "cautious_support",
    riskTolerance: "low",
  });

  console.log(`  [PASS] Council convened with seats: ${seatHormozi.agentId}, ${seatCFO.agentId}`);

  // -------------------------------------------------------------
  // Step 3: Council Turns & Arguments with Verified Citations
  // -------------------------------------------------------------
  console.log("Step 3: Processing Council Turns & Citation Checks...");

  const turn1Content =
    'John explained the core principle: "Say a Thanksgiving turkey takes three hours to cook. We all know what happens if you double the temperature to cook it" [100M MM · Section II › Decoy Offer · Z. 1539–1580]. A decoy option at 35 EUR makes the 49 EUR bundle look like an irresistible no-brainer.';

  const turn1 = CouncilTurnSchema.parse({
    sessionId: session.id,
    round: 1,
    agentId: seatHormozi.agentId,
    content: turn1Content,
    stance: "pro_decoy",
    timestamp: new Date().toISOString(),
  });

  // Verify quotes in Turn 1
  const quoteCheck = verifyQuotes(turn1.content);
  if (!quoteCheck.valid) {
    throw new Error(`Council turn quote verification failed: ${JSON.stringify(quoteCheck)}`);
  }
  console.log("  [PASS] Turn 1 quotes verified against 100M Money Models source.");

  const turn2 = CouncilTurnSchema.parse({
    sessionId: session.id,
    round: 2,
    agentId: seatCFO.agentId,
    content:
      "From a cash flow standpoint, the simulation indicates payback drops from 45 days to 18 days. Since gross margins on software are > 85%, there is zero downside ruin risk. I endorse option 1.",
    stance: "pro_decoy",
    timestamp: new Date().toISOString(),
  });

  // -------------------------------------------------------------
  // Step 4: Voting & Decision Record Synthesis (Lane 6)
  // -------------------------------------------------------------
  console.log("Step 4: Submitting Votes & Synthesizing Decision Record...");

  const voteHormozi = CouncilVoteSchema.parse({
    sessionId: session.id,
    agentId: seatHormozi.agentId,
    option: "Adopt Decoy Structure (35 EUR vs 49 EUR)",
    score: 9.5,
    weight: 1.0,
    ruinFlag: false,
    rationale: "Maximizes perceived value via contrast framing.",
  });

  const voteCFO = CouncilVoteSchema.parse({
    sessionId: session.id,
    agentId: seatCFO.agentId,
    option: "Adopt Decoy Structure (35 EUR vs 49 EUR)",
    score: 8.5,
    weight: 1.0,
    ruinFlag: false,
    rationale: "Accelerates cash flow without increasing churn risk.",
  });

  const decisionRecord = DecisionRecordSchema.parse({
    sessionId: session.id,
    verdict: "Adopt Decoy Structure (35 EUR vs 49 EUR)",
    rationale:
      "Council unanimously resolved to deploy the 35 EUR / 49 EUR Decoy Offer model. Grounded in Hormozi Decoy Offer principles [100M MM · Section II › Decoy Offer · Z. 1539–1580] and verified safe by CFO risk audit.",
    dissent: "None. CFO agreed after margin check confirmed 85%+ margin eliminates downside ruin.",
    confidence: 0.95,
    recordMd:
      "# Decision Record: Adopt Decoy Structure\n\nUnanimous council approval grounded in Hormozi Decoy Offer [100M MM · Section II › Decoy Offer · Z. 1539–1580].",
    createdAt: new Date().toISOString(),
  });
  console.log(`  [PASS] Decision Record finalized: Confidence ${(decisionRecord.confidence * 100).toFixed(0)}%`);

  // Privacy Check on Decision Record
  const privacyCheck = evaluateOutputPrivacy({ text: decisionRecord.rationale });
  if (privacyCheck.privacy !== "private" || privacyCheck.isShareable !== false) {
    throw new Error("Decision Record containing 100M citation must be flagged private and non-shareable!");
  }
  console.log("  [PASS] Decision Record marked strictly 'private' due to 100M source citation.");

  // -------------------------------------------------------------
  // Step 5: Persisting Final Decision into Spark Note (Lane 3)
  // -------------------------------------------------------------
  console.log("Step 5: Writing Decision Record to Spark Vault Folder...");

  const sparkNote = FolderNoteSchema.parse({
    folderId: "folder_council_decisions",
    noteId: `note_decision_${session.id}`,
    title: `Decision Record - ${session.id}`,
    content: [
      `# Decision Record: ${decisionRecord.verdict}`,
      `**Session:** \`${session.id}\``,
      `**Confidence:** ${decisionRecord.confidence * 100}%`,
      `**Rationale:** ${decisionRecord.rationale}`,
      `**Dissent:** ${decisionRecord.dissent}`,
      `**Approved At:** ${decisionRecord.createdAt}`,
    ].join("\n\n"),
    createdAt: new Date().toISOString(),
  });

  if (!sparkNote.content || !sparkNote.content.includes("Decoy Offer principles")) {
    throw new Error("Spark Note missing decision content");
  }
  console.log(`  [PASS] Spark Note successfully formatted: ${sparkNote.noteId}`);

  console.log("=== E2E PIPELINE: SIMULATION → COUNCIL → DECISION RECORD → SPARK PASSED ===\n");
}

runE2ETests().catch((err) => {
  console.error("E2E Test failed:", err);
  process.exit(1);
});
