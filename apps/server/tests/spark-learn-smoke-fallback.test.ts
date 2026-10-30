import { describe, test, expect, beforeEach } from "bun:test";
import {
  CliRunner,
  getProviderCooldownRemaining,
  resetProviderCooldowns,
} from "../src/brain/learn/ask/cli-runner";
import type { LlmProviderAdapter, LlmCompleteOptions, LlmCompleteResult } from "../src/brain/learn/contracts";
import { globalRuntimeCounter } from "../src/usage/collectors/runtime-counter";

class MockGeminiQuotaExhausted implements LlmProviderAdapter {
  public readonly name = "mock-gemini";
  public calls = 0;

  public async isAvailable(): Promise<boolean> {
    return getProviderCooldownRemaining(this.name) === 0;
  }

  public async execute(prompt: string, options?: LlmCompleteOptions): Promise<LlmCompleteResult> {
    this.calls++;
    throw new Error("HTTP 429 RESOURCE_EXHAUSTED: Rate limit or quota exceeded for Gemini CLI");
  }
}

class MockCodexSuccess implements LlmProviderAdapter {
  public readonly name = "mock-codex";
  public calls = 0;

  public async isAvailable(): Promise<boolean> {
    return getProviderCooldownRemaining(this.name) === 0;
  }

  public async execute(prompt: string, options?: LlmCompleteOptions): Promise<LlmCompleteResult> {
    this.calls++;
    return {
      text: "Codex fallback answer with citation [1]",
      provider: this.name,
      model: "codex-5.2",
      durationMs: 120,
      usage: {
        inputTokens: 50,
        outputTokens: 20,
        totalTokens: 70,
      },
    };
  }
}

describe("Spark-Learn Smoke-Test: 429 Fallback & Usage-Event Tracking", () => {
  beforeEach(() => {
    resetProviderCooldowns();
  });

  test("Simulate 429 Quota Exceeded on Gemini -> Failover to Codex and Cooldown Set", async () => {
    const mockGemini = new MockGeminiQuotaExhausted();
    const mockCodex = new MockCodexSuccess();

    const runner = new CliRunner([mockGemini, mockCodex]);

    // Initial state: cooldown is 0
    expect(getProviderCooldownRemaining("mock-gemini")).toBe(0);

    const initialSummary = globalRuntimeCounter.getSummary();
    const initialRuns = initialSummary.runsCount;

    // Run complete
    const result = await runner.complete("Erkläre die Kernstrukturen von Spark.");

    // Assertions
    expect(result).toBeDefined();
    expect(result.provider).toBe("mock-codex");
    expect(result.text).toContain("Codex fallback answer");
    expect(mockGemini.calls).toBe(1);
    expect(mockCodex.calls).toBe(1);

    // Cooldown verification for failed provider
    const cooldown = getProviderCooldownRemaining("mock-gemini");
    expect(cooldown).toBeGreaterThan(0);
    expect(cooldown).toBeLessThanOrEqual(30 * 60 * 1000);

    // Subsequent run must skip mock-gemini directly due to active cooldown!
    const result2 = await runner.complete("Zweite Testfrage.");
    expect(result2.provider).toBe("mock-codex");
    expect(mockGemini.calls).toBe(1); // Gemini was NOT called again
    expect(mockCodex.calls).toBe(2);

    // Verify usage counter
    const updatedSummary = globalRuntimeCounter.getSummary();
    expect(updatedSummary.runsCount).toBeGreaterThan(initialRuns);
  });
});
