/**
 * Unit Tests: Dictation Cleanup Engine & /api/desktop/dictation/clean Route (Lane 2)
 *
 * Verifies:
 * 1. Acceptance test: „äh treffen um neun… nein zehn“ -> „Treffen um zehn.“ in < 1.5 s
 * 2. Filler words removal (äh, ähm, uh, um, etc.)
 * 3. Self-corrections handling (nein, ach nein, wait, actually, etc.)
 * 4. Language preservation (de and en)
 * 5. Punctuation and capitalization normalization
 * 6. HTTP API route handling with X-Desktop-Token authentication
 */

import { describe, expect, it } from "bun:test";
import {
  cleanTranscriptHeuristic,
  cleanTranscriptWithLlm,
  createDictationRouter,
  DICTATION_CLEANUP_SYSTEM_PROMPT,
} from "../src/desktop/dictation";
import { DESKTOP_AUTH_HEADER } from "../../../packages/shared/src/desktop/contracts";

describe("Dictation Cleanup Prompt & Heuristic Engine (Lane 2)", () => {
  it("verifies system prompt specifies self-correction, final text only and language preservation", () => {
    expect(DICTATION_CLEANUP_SYSTEM_PROMPT).toContain("Selbstkorrekturen");
    expect(DICTATION_CLEANUP_SYSTEM_PROMPT).toContain("Füllwörter");
    expect(DICTATION_CLEANUP_SYSTEM_PROMPT).toContain("Sprache exakt");
    expect(DICTATION_CLEANUP_SYSTEM_PROMPT).toContain("AUSSCHLIESSLICH den finalen");
  });

  // Acceptance Test from agent-2-START.md:
  // „äh treffen um neun… nein zehn“ → „Treffen um zehn.“ < 1,5 s
  it("cleans acceptance test fixture: „äh treffen um neun… nein zehn“ -> „Treffen um zehn.“ in < 1.5s", async () => {
    const raw = "äh treffen um neun… nein zehn";
    const start = performance.now();
    const result = await cleanTranscriptWithLlm(raw, "de");
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(1500); // Must be strictly < 1.5s
    expect(result.cleanedText).toBe("Treffen um zehn.");
  });

  it("handles German time self-corrections with ellipsis", () => {
    const raw = "treffen um neun ... nein zehn";
    const cleaned = cleanTranscriptHeuristic(raw, "de");
    expect(cleaned).toBe("Treffen um zehn.");
  });

  it("removes filler words and capitalizes sentence start", () => {
    const raw = "äh Hallo Welt ähm bitte speichern";
    const cleaned = cleanTranscriptHeuristic(raw, "de");
    expect(cleaned).toBe("Hallo Welt bitte speichern.");
  });

  it("handles German self-corrections with 'ach nein'", () => {
    const raw = "morgen um acht ... ach nein um neun";
    const cleaned = cleanTranscriptHeuristic(raw, "de");
    expect(cleaned).toBe("Morgen um neun.");
  });

  it("handles quantity self-corrections with 'warte'", () => {
    const raw = "zwei Kaffee ... warte drei Kaffee";
    const cleaned = cleanTranscriptHeuristic(raw, "de");
    expect(cleaned).toBe("Drei Kaffee.");
  });

  it("handles English self-corrections and preserves language", () => {
    const raw = "uh let's meet at five ... no six";
    const cleaned = cleanTranscriptHeuristic(raw, "en");
    expect(cleaned).toBe("Let's meet at six.");
  });

  it("handles English filler words", () => {
    const raw = "um this is uh a test sentence";
    const cleaned = cleanTranscriptHeuristic(raw, "en");
    expect(cleaned).toBe("This is a test sentence.");
  });

  it("handles empty or whitespace-only inputs gracefully", async () => {
    const result = await cleanTranscriptWithLlm("   ", "de");
    expect(result.cleanedText).toBe("");
  });
});

describe("Dictation Server API Route POST /api/desktop/dictation/clean", () => {
  const router = createDictationRouter();

  it("rejects request without X-Desktop-Token header with 401 Unauthorized", async () => {
    const req = new Request("http://localhost/clean", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawTranscript: "Hallo Welt" }),
    });

    const res = await router.fetch(req);
    expect(res.status).toBe(401);
  });

  it("accepts authorized request and returns 200 OK with cleanedText", async () => {
    const req = new Request("http://localhost/clean", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [DESKTOP_AUTH_HEADER]: "connect-desktop-local-token-dev",
      },
      body: JSON.stringify({
        rawTranscript: "äh treffen um neun… nein zehn",
        language: "de",
      }),
    });

    const res = await router.fetch(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as any;
    expect(json.cleanedText).toBe("Treffen um zehn.");
    expect(json.durationMs).toBeDefined();
    expect(json.model).toBeDefined();
  });

  it("rejects invalid request payload with 400 Bad Request", async () => {
    const req = new Request("http://localhost/clean", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [DESKTOP_AUTH_HEADER]: "connect-desktop-local-token-dev",
      },
      body: JSON.stringify({
        // Missing rawTranscript
        language: 123,
      }),
    });

    const res = await router.fetch(req);
    expect(res.status).toBe(400);
  });
});
