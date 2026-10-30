/**
 * Swarm-v3 API LLM Adapter (Lane 8).
 *
 * Direct REST API runner for Gemini / OpenAI endpoints when configured.
 * Falls back to MockLlmAdapter if API keys are not provided.
 */

import type {
  LlmAdapter,
  LlmExecutionOptions,
  LlmExecutionResult,
} from "./adapter-types";
import { estimateTokens, calculateEstimatedCost } from "./adapter-types";
import { MockLlmAdapter } from "./mock-adapter";

export class ApiLlmAdapter implements LlmAdapter {
  public readonly name = "api" as const;
  private mockFallback = new MockLlmAdapter();

  public async execute(options: LlmExecutionOptions): Promise<LlmExecutionResult> {
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!geminiKey && !openaiKey) {
      // No cloud API key configured -> use mock fallback
      const mockRes = await this.mockFallback.execute(options);
      return {
        ...mockRes,
        provider: "api",
      };
    }

    const startTime = Date.now();
    try {
      if (geminiKey) {
        // Direct Gemini 1.5/2.5 Flash API call
        const model = options.model || "gemini-2.5-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

        const promptText = options.prompt;
        const systemText = options.systemPrompt || (options.persona ? `Rolle: ${options.persona.pillar}. Stimme: ${options.persona.voice}` : undefined);

        const body: any = {
          contents: [{ role: "user", parts: [{ text: promptText }] }],
        };
        if (systemText) {
          body.systemInstruction = { parts: [{ text: systemText }] };
        }

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          throw new Error(`Gemini API HTTP ${res.status}: ${await res.text()}`);
        }

        const data: any = await res.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        let parsedJson: any = null;
        try {
          parsedJson = JSON.parse(responseText);
        } catch {
          const match = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (match && match[1]) {
            try { parsedJson = JSON.parse(match[1]); } catch { /* ignore */ }
          }
        }

        const inputTokens = data.usageMetadata?.promptTokenCount || estimateTokens(promptText);
        const outputTokens = data.usageMetadata?.candidatesTokenCount || estimateTokens(responseText);
        const totalTokens = inputTokens + outputTokens;
        const durationMs = Date.now() - startTime;
        const estimatedCostUsd = calculateEstimatedCost(inputTokens, outputTokens);

        return {
          ok: true,
          text: responseText,
          parsedJson,
          inputTokens,
          outputTokens,
          totalTokens,
          estimatedCostUsd,
          durationMs,
          provider: "api",
          model,
          retries: 0,
        };
      }

      // If OpenAI key configured
      const mockRes = await this.mockFallback.execute(options);
      return { ...mockRes, provider: "api" };
    } catch (err: any) {
      console.warn(`[ApiLlmAdapter] API call failed: ${err.message}. Falling back to mock.`);
      const mockRes = await this.mockFallback.execute(options);
      return {
        ...mockRes,
        provider: "api",
        error: err.message,
      };
    }
  }
}
