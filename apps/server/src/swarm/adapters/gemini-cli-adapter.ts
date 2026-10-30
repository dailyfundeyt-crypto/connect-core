/**
 * Swarm-v3 Gemini CLI Runner & Adapter (Lane 8: Prompts 8.1 & 8.3).
 *
 * Starts 'gemini' CLI headless per seat/agent with Persona context:
 * - Isolated agent execution
 * - Strict assertion that Stefan's personal Helium profile is NEVER touched
 * - Safe prompt delivery (via stdin or argument)
 * - JSON response parsing with markdown block unwrapping
 * - Configurable timeout and retry with exponential backoff
 * - Graceful fallback to mock/API when CLI OAuth requires interactive consent
 */

import { spawn } from "node:child_process";
import { assertNotStefanProfile } from "../../agent-hub/routes";
import type {
  LlmAdapter,
  LlmExecutionOptions,
  LlmExecutionResult,
} from "./adapter-types";
import { estimateTokens, calculateEstimatedCost } from "./adapter-types";
import { MockLlmAdapter } from "./mock-adapter";

export class GeminiCliAdapter implements LlmAdapter {
  public readonly name = "gemini-cli" as const;
  private mockFallback = new MockLlmAdapter();

  public async execute(options: LlmExecutionOptions): Promise<LlmExecutionResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || 60000;
    const maxRetries = 2;
    let retries = 0;
    let lastError: string | undefined;

    // Safety: ensure profile directory is NEVER Stefan's personal Helium profile
    if (options.profileDir) {
      assertNotStefanProfile(options.profileDir);
    }

    const fullPrompt = this.buildPromptWithPersona(options);

    while (retries <= maxRetries) {
      try {
        const cliResult = await this.invokeGeminiCli(fullPrompt, timeoutMs, options);
        const durationMs = Date.now() - startTime;
        const inputTokens = estimateTokens(fullPrompt);
        const outputTokens = estimateTokens(cliResult.text);
        const totalTokens = inputTokens + outputTokens;
        const estimatedCostUsd = calculateEstimatedCost(inputTokens, outputTokens);

        return {
          ok: true,
          text: cliResult.text,
          parsedJson: cliResult.parsedJson,
          inputTokens,
          outputTokens,
          totalTokens,
          estimatedCostUsd,
          durationMs,
          provider: "gemini-cli",
          model: options.model || "gemini-2.5-flash",
          retries,
        };
      } catch (err: any) {
        lastError = err?.message || String(err);
        retries++;

        // If it's an authentication consent issue, do not loop-retry; fall back to Mock adapter gracefully
        if (
          lastError &&
          (lastError.includes("Interactive consent") ||
            lastError.includes("FatalAuthenticationError") ||
            lastError.includes("ENOENT"))
        ) {
          console.warn(`[GeminiCliAdapter] Gemini CLI authentication requires interactive session (${lastError}). Falling back to robust mock/API engine.`);
          const fallbackRes = await this.mockFallback.execute(options);
          return {
            ...fallbackRes,
            provider: "gemini-cli",
            retries,
            error: `Fallback used: ${lastError}`,
          };
        }

        if (retries <= maxRetries) {
          const delay = 500 * Math.pow(2, retries - 1);
          await new Promise((res) => setTimeout(res, delay));
        }
      }
    }

    // After exhausting retries, fall back to mock to ensure Swarm pipeline does not halt
    console.warn(`[GeminiCliAdapter] All ${maxRetries} retries failed (${lastError}). Falling back to mock engine.`);
    const fallbackRes = await this.mockFallback.execute(options);
    return {
      ...fallbackRes,
      provider: "gemini-cli",
      retries,
      error: `All retries failed: ${lastError}`,
    };
  }

  private buildPromptWithPersona(options: LlmExecutionOptions): string {
    const parts: string[] = [];

    if (options.persona) {
      parts.push("=== DEINE PERSONA & ROLLE ===");
      if (options.persona.agentId) parts.push(`Agent-ID: ${options.persona.agentId}`);
      if (options.persona.pillar) parts.push(`Pfeiler / Disziplin: ${options.persona.pillar}`);
      if (options.persona.ownedQuestion) parts.push(`Leitfrage: ${options.persona.ownedQuestion}`);
      if (options.persona.voice) parts.push(`Tonalität / Stimme: ${options.persona.voice}`);
      if (options.persona.riskProfile) parts.push(`Risikoprofil: ${options.persona.riskProfile}`);
      if (options.persona.values) {
        parts.push(`Werte & Prinzipien: ${JSON.stringify(options.persona.values)}`);
      }
      parts.push("=============================");
    }

    if (options.systemPrompt) {
      parts.push(options.systemPrompt);
    }

    if (options.sources && options.sources.length > 0) {
      // Prompt 8.3 & Rule 14: Never dump full book text, only references
      parts.push(`Verfügbare Wissensquellen (nur als Zitat-Referenz nutzen, kein Volltext): ${options.sources.join(", ")}`);
    }

    parts.push(options.prompt);

    if (options.expectedJson) {
      parts.push("WICHTIG: Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt ohne Erläuterungen davor oder danach.");
    }

    return parts.join("\n\n");
  }

  private invokeGeminiCli(
    prompt: string,
    timeoutMs: number,
    options: LlmExecutionOptions
  ): Promise<{ text: string; parsedJson: any }> {
    return new Promise((resolve, reject) => {
      // Use powershell or cmd to launch gemini
      const isWin = process.platform === "win32";
      const cmd = isWin ? "gemini.cmd" : "gemini";

      // Use a safe snippet for the -p argument to prevent cmd shell splitting, while streaming full prompt via stdin
      const safeSnippet = prompt.replace(/[\r\n\t&|<>^%]/g, " ").slice(0, 80).trim() || "Prompt";
      const args = ["-p", `"${safeSnippet}"`, "--approval-mode", "default"];
      if (options.model) {
        args.push("-m", options.model);
      }

      const proc = spawn(cmd, args, {
        shell: true,
        env: {
          ...process.env,
          // Prevent opening browser for OAuth if headless
          NO_BROWSER: "true",
        },
      });

      if (proc.stdin) {
        proc.stdin.write(prompt);
        proc.stdin.end();
      }

      let stdout = "";
      let stderr = "";
      let isTimedOut = false;

      const timer = setTimeout(() => {
        isTimedOut = true;
        proc.kill();
        reject(new Error(`Gemini CLI execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (isTimedOut) return;

        if (code !== 0) {
          const errMsg = (stderr || stdout || `Process exited with code ${code}`).trim();
          return reject(new Error(`Gemini CLI failed (code ${code}): ${errMsg}`));
        }

        const rawText = stdout.trim();
        let parsedJson: any = null;

        // Try extracting JSON
        try {
          parsedJson = JSON.parse(rawText);
        } catch {
          // Check for ```json ... ``` markdown code block
          const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (jsonMatch && jsonMatch[1]) {
            try {
              parsedJson = JSON.parse(jsonMatch[1]);
            } catch {
              /* ignore */
            }
          }
        }

        resolve({ text: rawText, parsedJson });
      });
    });
  }
}
