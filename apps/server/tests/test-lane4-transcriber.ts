/**
 * Comprehensive Test Suite for Lane 4:
 * Transcriber-Agent (Instagram -> Spark) + Marketplace Antigravity CLI
 */

import { Hono } from "hono";
import {
  TRANSCRIBER_TEMPLATE,
  getTranscriberService,
  createTranscriberRouter,
  extractToolsFromTranscript,
  transcribeInstagramReel,
} from "../src/agents/templates/transcriber";
import {
  getTranscriberManifest,
  provisionTranscriberAgentRecord,
} from "../src/plugins/store/listings/transcriber";
import { getStoreService } from "../src/plugins/store/service";

async function runLane4Tests() {
  console.log("============================================================");
  console.log("  SWARM-V3 LANE 4: Transcriber-Agent & Marketplace Tests");
  console.log("============================================================\n");

  const service = getTranscriberService();

  // 1. Template & Persona Verification
  console.log("1. Verifying Transcriber Agent Template & Persona...");
  if (TRANSCRIBER_TEMPLATE.id !== "agent_template_transcriber") {
    throw new Error(`Unexpected template ID: ${TRANSCRIBER_TEMPLATE.id}`);
  }
  if (!TRANSCRIBER_TEMPLATE.persona.ownedQuestion.includes("Instagram")) {
    throw new Error("Missing owned question in persona");
  }
  if (TRANSCRIBER_TEMPLATE.persona.agentId !== "agent_transcriber") {
    throw new Error("Incorrect agent ID in persona");
  }
  if (!TRANSCRIBER_TEMPLATE.systemPrompt.includes("getthescript.app")) {
    throw new Error("System prompt missing getthescript.app instructions");
  }
  console.log("   [PASS] Template, persona, and system prompt verified!\n");

  // 2. Transcription & Tool Extraction
  console.log("2. Testing Instagram Transcription & Tool Extraction...");
  const sampleReelUrl = "https://www.instagram.com/reel/DBabc123/";
  const transcriptionResult = await transcribeInstagramReel(sampleReelUrl);
  if (!transcriptionResult.transcript || transcriptionResult.transcript.length === 0) {
    throw new Error("Empty transcript returned");
  }

  const extracted = extractToolsFromTranscript(transcriptionResult.transcript);
  console.log(`   Extracted ${extracted.length} tools from transcript:`);
  for (const t of extracted) {
    console.log(`   - ${t.name} (${t.url}): ${t.purpose}`);
  }

  const toolNames = extracted.map((t) => t.name);
  if (!toolNames.includes("Particles Casberry")) {
    throw new Error("Missing Particles Casberry in extracted tools");
  }
  if (!toolNames.includes("Origin Kit")) {
    throw new Error("Missing Origin Kit in extracted tools");
  }
  if (!toolNames.includes("daisyUI")) {
    throw new Error("Missing daisyUI in extracted tools");
  }
  console.log("   [PASS] Tool extraction accurately identified all 3 tools!\n");

  // 3. Dry-Run Mode Execution
  console.log("3. Testing Dry-Run Mode (Plan only, no Spark mutation)...");
  const dryRunRes = await service.createJob({
    url: sampleReelUrl,
    dryRun: true,
  });

  if (!dryRunRes.success) {
    throw new Error(`Dry-run job failed: ${dryRunRes.job.error}`);
  }
  if (dryRunRes.job.status !== "completed") {
    throw new Error(`Expected completed status, got ${dryRunRes.job.status}`);
  }
  if (!dryRunRes.plan || !dryRunRes.plan.dryRun) {
    throw new Error("Execution plan missing or dryRun flag not set");
  }
  if (dryRunRes.plan.linksToAdd.length === 0) {
    throw new Error("Expected planned links in dry run plan");
  }
  console.log(`   [PASS] Dry-run created plan for ${dryRunRes.plan.linksToAdd.length} links without mutating store!\n`);

  // 4. Live Run & Spark Folder Matching + Duplicate Check
  console.log("4. Testing Live Job Execution & Duplicate Checking...");
  const liveRunRes = await service.createJob({
    url: sampleReelUrl,
    dryRun: false,
  });

  if (!liveRunRes.success) {
    throw new Error(`Live job failed: ${liveRunRes.job.error}`);
  }
  console.log(`   Created job: ${liveRunRes.job.id} (folder: ${liveRunRes.job.targetFolderId})`);

  // Run a second time with same URL to test duplicate avoidance
  const duplicateRunRes = await service.createJob({
    url: sampleReelUrl,
    dryRun: false,
  });
  if (duplicateRunRes.plan && duplicateRunRes.plan.skippedDuplicates.length === 0) {
    throw new Error("Duplicate run did not flag existing URLs as duplicates");
  }
  console.log(`   Duplicate detection correctly skipped: ${duplicateRunRes.plan?.skippedDuplicates.join(", ")}`);
  console.log("   [PASS] Live run and duplicate protection verified!\n");

  // 5. Seed Run for Test-Nutzer (daiyfunde.yt@gmail.com)
  console.log("5. Testing Seed for daiyfunde.yt@gmail.com (Prompt 4.2)...");
  const seedResult = await service.seedForTestUser("daiyfunde.yt@gmail.com");
  if (!seedResult.success) {
    throw new Error("Seed run failed");
  }
  if (seedResult.emailSent !== false) {
    throw new Error("VIOLATION: emailSent must be false (Keine E-Mail senden)!");
  }
  if (seedResult.linksCreated.length < 3) {
    throw new Error(`Expected at least 3 seed links, got ${seedResult.linksCreated.length}`);
  }
  console.log(`   Target user: ${seedResult.userEmail} (ID: ${seedResult.userId || "local"})`);
  console.log(`   Folder: ${seedResult.folderName} (${seedResult.folderId})`);
  console.log(`   Links seeded: ${seedResult.linksCreated.map((l) => l.title).join(", ")}`);
  console.log(`   Notes seeded: ${seedResult.notesCreated.map((n) => n.title).join(", ")}`);
  console.log(`   Email check: emailSent=${seedResult.emailSent} (Keine E-Mail gesendet)`);
  console.log("   [PASS] Seed-Test for daiyfunde.yt@gmail.com passed!\n");

  // 6. Store Marketplace Listing (Antigravity CLI)
  console.log("6. Testing Marketplace Listing & Agent Provisioning (Prompt 4.3)...");
  const manifest = getTranscriberManifest();
  if (manifest.id !== "agent-transcriber-cli") {
    throw new Error(`Unexpected manifest ID: ${manifest.id}`);
  }
  if (!manifest.tags?.includes("antigravity-cli")) {
    throw new Error("Manifest missing 'antigravity-cli' tag");
  }
  if (manifest.author !== "Stefan Kunc") {
    throw new Error(`Unexpected author: ${manifest.author}`);
  }

  // Provision agent record
  const provisionRes = await provisionTranscriberAgentRecord("flux", "Stefan Kunc");
  if (!provisionRes.success) {
    throw new Error("Agent provisioning failed");
  }
  console.log(`   Agent provisioned with ID: ${provisionRes.agentId} (created: ${provisionRes.created})`);

  // Register in Store Service
  const storeService = getStoreService();
  const publishRes = await storeService.publishItem(
    manifest,
    "Transcriber Agent v1.0.0 Release",
    "Stefan Kunc"
  );
  if (!publishRes.success) {
    throw new Error(`Store publish failed: ${publishRes.error}`);
  }

  const storeItem = storeService.getItem("agent-transcriber-cli");
  if (!storeItem) {
    throw new Error("Item not found in store after publish");
  }
  console.log(`   Store Item listed: ${storeItem.displayName} (Category: ${storeItem.category})`);

  // Test Install via Store API
  const installRes = await storeService.installItem("agent-transcriber-cli", "flux", "Stefan Kunc");
  if (!installRes.success) {
    throw new Error(`Store installation failed: ${installRes.error}`);
  }
  console.log(`   Store Installation active: ${installRes.install?.id}`);
  console.log("   [PASS] Marketplace listing and store installation verified!\n");

  // 7. Hono Router Verification
  console.log("7. Testing Hono API Endpoints (/api/agents/templates/transcriber)...");
  const testApp = new Hono();
  testApp.route("/api/agents/templates/transcriber", createTranscriberRouter());

  // GET /health
  const healthRes = await testApp.request("/api/agents/templates/transcriber/health");
  if (healthRes.status !== 200) {
    throw new Error(`Expected 200 for health, got ${healthRes.status}`);
  }

  // GET /
  const templateRes = await testApp.request("/api/agents/templates/transcriber");
  if (templateRes.status !== 200) {
    throw new Error(`Expected 200 for template, got ${templateRes.status}`);
  }

  // GET /jobs
  const jobsRes = await testApp.request("/api/agents/templates/transcriber/jobs");
  if (jobsRes.status !== 200) {
    throw new Error(`Expected 200 for jobs, got ${jobsRes.status}`);
  }

  // POST /jobs (dry-run)
  const createJobRes = await testApp.request("/api/agents/templates/transcriber/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://www.instagram.com/reel/DBabc123/",
      dryRun: true,
    }),
  });
  if (createJobRes.status !== 201) {
    throw new Error(`Expected 201 for job creation, got ${createJobRes.status}`);
  }

  // POST /seed
  const seedApiRes = await testApp.request("/api/agents/templates/transcriber/seed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "daiyfunde.yt@gmail.com" }),
  });
  if (seedApiRes.status !== 200) {
    throw new Error(`Expected 200 for seed API, got ${seedApiRes.status}`);
  }
  const seedApiJson = (await seedApiRes.json()) as any;
  if (!seedApiJson.result || seedApiJson.result.emailSent !== false) {
    throw new Error("Seed API failed emailSent false check");
  }

  console.log("   [PASS] All Hono API endpoints respond with expected 200/201 status codes!\n");

  console.log("============================================================");
  console.log("  ALL SWARM-V3 LANE 4 TESTS COMPLETED SUCCESSFULLY!");
  console.log("============================================================\n");
}

runLane4Tests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
