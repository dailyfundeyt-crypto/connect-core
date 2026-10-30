import { resolvePrivacy } from "../../apps/server/src/swarm/brains/types";
import { brainStore } from "../../apps/server/src/swarm/brains/brain-builder";

/**
 * Validates privacy flag enforcement on council and persona outputs.
 * Any output referencing 100M Money Models must be flagged private and non-shareable.
 */
export function evaluateOutputPrivacy(output: {
  text: string;
  sourceRefs?: (string | { sourceId: string })[];
}): { privacy: "private" | "shareable"; isShareable: boolean } {
  const containsBookCitation = output.text.includes("[100M MM ·") || output.text.includes("100m-money-models");
  const sourcesResolved = resolvePrivacy(output.sourceRefs);

  if (containsBookCitation || sourcesResolved === "private") {
    return { privacy: "private", isShareable: false };
  }
  return { privacy: "shareable", isShareable: true };
}

async function runPrivacyFlagTests() {
  console.log("=== [SECURITY TEST] Privacy Flag & Non-Shareable Enforcement ===");

  // 1. resolvePrivacy helper unit tests
  console.log("1. Validating resolvePrivacy logic...");
  if (resolvePrivacy(["100m-money-models"]) !== "private") {
    throw new Error("Failed: '100m-money-models' string must resolve to 'private'");
  }
  if (resolvePrivacy(["100m-book"]) !== "private") {
    throw new Error("Failed: '100m-book' string must resolve to 'private'");
  }
  if (resolvePrivacy([{ sourceId: "100m-money-models", chunkId: "c1" }]) !== "private") {
    throw new Error("Failed: object sourceId '100m-money-models' must resolve to 'private'");
  }
  if (resolvePrivacy([{ sourceId: "cfo-handbook" }]) !== "shareable") {
    throw new Error("Failed: non-100m source must resolve to 'shareable'");
  }
  if (resolvePrivacy([]) !== "shareable" || resolvePrivacy(undefined) !== "shareable") {
    throw new Error("Failed: empty sources must resolve to 'shareable'");
  }
  console.log("  [PASS] resolvePrivacy behaves strictly as specified.");

  // 2. SeatBrain store privacy enforcement
  console.log("2. Validating SeatBrain privacy resolution in store...");
  const hormoziBrain = brainStore.get("brain-hormozi-offer");
  if (!hormoziBrain || hormoziBrain.privacy !== "private") {
    throw new Error(`brain-hormozi-offer must have privacy 'private', got: ${hormoziBrain?.privacy}`);
  }

  const cfoBrain = brainStore.get("brain-cfo-risk");
  if (!cfoBrain || cfoBrain.privacy !== "shareable") {
    throw new Error(`brain-cfo-risk must have privacy 'shareable', got: ${cfoBrain?.privacy}`);
  }

  // Attempt to create a brain with 100M source but claiming privacy='shareable'
  const forcedShareable = brainStore.create({
    id: "brain-tamper-attempt",
    name: "Tamper Brain",
    frameworks: ["Decoy Offer"],
    principles: ["Test"],
    positions: ["Test"],
    sources: [{ sourceId: "100m-money-models", chapter: "Decoy" }],
    privacy: "shareable", // Should be overwritten by resolvePrivacy!
  });

  if (forcedShareable.privacy !== "private") {
    throw new Error("CRITICAL SECURITY FLAW: 100m brain was allowed to be created as 'shareable'!");
  }
  console.log("  [PASS] BrainStore automatically coerces 100m brains to 'private'.");

  // 3. Output privacy & shareability evaluation
  console.log("3. Validating Council & Persona Output Privacy Evaluation...");
  const privateCouncilOutput = {
    text: "The council recommends the Decoy Offer strategy [100M MM · Section II › Decoy Offer · Z. 1507–1765] to increase contract size.",
    sourceRefs: [{ sourceId: "100m-money-models" }],
  };
  const privRes = evaluateOutputPrivacy(privateCouncilOutput);
  if (privRes.privacy !== "private" || privRes.isShareable !== false) {
    throw new Error(`Council output with book citation must be private and unshareable! Got: ${JSON.stringify(privRes)}`);
  }

  const publicCouncilOutput = {
    text: "The council recommends improving team sprint velocity and tracking burndown charts.",
    sourceRefs: [{ sourceId: "agile-handbook" }],
  };
  const pubRes = evaluateOutputPrivacy(publicCouncilOutput);
  if (pubRes.privacy !== "shareable" || pubRes.isShareable !== true) {
    throw new Error(`Public output should be shareable! Got: ${JSON.stringify(pubRes)}`);
  }
  console.log("  [PASS] Output privacy evaluator prevents sharing of outputs with book citations.");

  console.log("=== ALL PRIVACY FLAG TESTS PASSED ===\n");
}

if (import.meta.main || (process.argv[1] && process.argv[1].includes("test-privacy-flags"))) {
  runPrivacyFlagTests().catch((err) => {
    console.error("Privacy flag test failed:", err);
    process.exit(1);
  });
}
