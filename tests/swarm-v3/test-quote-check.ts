import {
  verifyQuotes,
  checkStatementGrounding,
  extractQuotes,
  extractCitations,
} from "../../apps/server/src/swarm/brains/quote-check";
import { loadBookChunks } from "../../apps/server/src/swarm/brains/sources/book-ingest";

async function runQuoteCheckTests() {
  console.log("=== [TEST SUITE] Quote-Check & Citation Grounding (Roast-Room Concept) ===");

  const chunks = loadBookChunks();
  if (chunks.length === 0) {
    throw new Error("No book chunks loaded! Ensure 100M book ingest has run.");
  }
  console.log(`Loaded ${chunks.length} chunks for quote verification.`);

  // Test 1: Verbatim Quote from 100M Book
  // Exact phrase from Section II Decoy Offer (Z. 1539)
  const realQuoteText =
    'John explained the core principle: "Say a Thanksgiving turkey takes three hours to cook. We all know what happens if you double the temperature to cook it" [100M MM · Section II › Decoy Offer · Z. 1539–1580]';
  const res1 = verifyQuotes(realQuoteText, chunks);

  if (!res1.valid || res1.verifiedCount !== 1 || res1.unverifiedCount !== 0) {
    throw new Error(`Test 1 Failed: Expected verbatim quote to be verified. Got: ${JSON.stringify(res1)}`);
  }
  console.log("  [PASS] Test 1: True verbatim quote from 100M Money Models successfully verified.");

  // Test 2: Hallucinated / Fake Quote
  const fakeQuoteText =
    'Alex Hormozi stated: "Always give away free Lamborghinis to every person who visits your gym."';
  const res2 = verifyQuotes(fakeQuoteText, chunks);

  if (res2.valid || res2.unverifiedCount !== 1) {
    throw new Error(`Test 2 Failed: Hallucinated quote was unexpectedly accepted! Result: ${JSON.stringify(res2)}`);
  }
  if (res2.items[0]?.status !== "hallucinated") {
    throw new Error(`Test 2 Failed: Status should be 'hallucinated', got: ${res2.items[0]?.status}`);
  }
  console.log("  [PASS] Test 2: Hallucinated quote correctly identified and rejected.");

  // Test 3: Statement with $100M keyword but WITHOUT citation (must be flagged 'unbelegt')
  const ungroundedStatement =
    "We recommend implementing a Decoy Offer immediately to skyrocket our average order value.";
  const groundingRes1 = checkStatementGrounding(ungroundedStatement, chunks);

  if (groundingRes1.grounded || groundingRes1.status !== "unbelegt") {
    throw new Error(`Test 3 Failed: Statement without citation should be 'unbelegt', got: ${JSON.stringify(groundingRes1)}`);
  }
  console.log("  [PASS] Test 3: Uncited $100M claim correctly marked as 'unbelegt'.");

  // Test 4: Statement with $100M keyword WITH valid citation
  const groundedStatement =
    "We recommend implementing a Decoy Offer immediately [100M MM · Section II › Decoy Offer · Z. 1507–1765] to increase conversion on our core bundle.";
  const groundingRes2 = checkStatementGrounding(groundedStatement, chunks);

  if (!groundingRes2.grounded || groundingRes2.status !== "verified") {
    throw new Error(`Test 4 Failed: Grounded statement should be 'verified', got: ${JSON.stringify(groundingRes2)}`);
  }
  console.log("  [PASS] Test 4: Properly cited $100M claim correctly marked as 'verified'.");

  // Test 5: Extraction helpers
  const multiQuote = 'First quote "Quality over quantity always" and second quote "Speed is a competitive advantage" [100M MM · Section I · Z. 100-200]';
  const quotes = extractQuotes(multiQuote);
  const cites = extractCitations(multiQuote);

  if (quotes.length !== 2 || cites.length !== 1) {
    throw new Error(`Test 5 Failed: Quote/Citation extraction failed. Quotes: ${quotes.length}, Cites: ${cites.length}`);
  }
  console.log("  [PASS] Test 5: Quote and citation regex extractors verified.");

  console.log("=== ALL QUOTE-CHECK TESTS PASSED ===\n");
}

runQuoteCheckTests().catch((err) => {
  console.error("Quote check test failed:", err);
  process.exit(1);
});
