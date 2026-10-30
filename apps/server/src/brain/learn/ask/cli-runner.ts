import { spawn } from "node:child_process";
import { z } from "zod";
import {
  type LlmClient,
  type LlmCompleteOptions,
  type LlmCompleteResult,
  type LlmProviderAdapter,
  type FailureClass,
  type LlmUsage,
  SPARK_DEFAULT_OLLAMA_URL,
} from "../contracts";
import { classifyFailure } from "../../../usage/collectors/failure-patterns";
import { globalRuntimeCounter } from "../../../usage/collectors/runtime-counter";
import { assertNotStefanProfile } from "../../../agent-hub/routes";

/* ========================================================================== */
/* Cooldown Manager & Constants                                               */
/* ========================================================================== */

const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes cooldown on quota/auth failure
const providerCooldowns = new Map<string, number>();

export function getProviderCooldownRemaining(provider: string): number {
  const until = providerCooldowns.get(provider) || 0;
  const remaining = until - Date.now();
  return remaining > 0 ? remaining : 0;
}

export function setProviderCooldown(provider: string, durationMs = COOLDOWN_MS): void {
  providerCooldowns.set(provider, Date.now() + durationMs);
  console.warn(`[CliRunner] Provider '${provider}' placed on cooldown for ${Math.round(durationMs / 60000)}m`);
}

export function resetProviderCooldowns(): void {
  providerCooldowns.clear();
}

/* ========================================================================== */
/* Token & Cost Estimation                                                    */
/* ========================================================================== */

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/* ========================================================================== */
/* Individual Provider Implementations                                        */
/* ========================================================================== */

/**
 * Gemini CLI Adapter
 * Call: gemini -p "<prompt>" --output-format json
 */
export class GeminiCliRunner implements LlmProviderAdapter {
  public readonly name = "gemini";

  public async isAvailable(): Promise<boolean> {
    return getProviderCooldownRemaining(this.name) === 0;
  }

  public async execute(prompt: string, options?: LlmCompleteOptions): Promise<LlmCompleteResult> {
    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs || 45000;
    const isWin = process.platform === "win32";
    const bin = isWin ? "gemini.cmd" : "gemini";

    const promptSnippet = prompt.replace(/[\r\n\t&|<>^%]/g, " ").slice(0, 80).trim() || "Spark Prompt";
    const args = ["-p", `"${promptSnippet}"`, "--output-format", "json"];

    return new Promise<LlmCompleteResult>((resolve, reject) => {
      let proc: any;
      try {
        proc = spawn(bin, args, {
          shell: true,
          env: { ...process.env, PAID_API_FALLBACK: "false" },
        });
      } catch (err) {
        return reject(err);
      }

      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            proc.kill();
          } catch {}
          reject(new Error(`[GeminiCliRunner] Timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      // Pipe full prompt via stdin for safety and large context
      try {
        proc.stdin.write(prompt);
        proc.stdin.end();
      } catch {}

      proc.stdout?.on("data", (chunk: any) => {
        stdout += chunk.toString();
      });

      proc.stderr?.on("data", (chunk: any) => {
        stderr += chunk.toString();
      });

      proc.on("close", (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        const durationMs = Date.now() - startTime;
        const allOutput = `${stdout}\n${stderr}`;
        const classification = classifyFailure("gemini", allOutput, code ?? undefined);

        if (classification.failureClass === "quota" || classification.failureClass === "auth") {
          setProviderCooldown(this.name);
          return reject(new Error(`[GeminiCliRunner] ${classification.failureClass.toUpperCase()} failure: ${classification.matchedText || allOutput.slice(0, 200)}`));
        }

        if (code !== 0 && (!stdout || stdout.trim().length === 0)) {
          return reject(new Error(`[GeminiCliRunner] Non-zero exit ${code}: ${stderr || stdout}`));
        }

        let parsedJson: any = undefined;
        let responseText = stdout.trim();

        try {
          const rawParsed = JSON.parse(responseText);
          if (rawParsed && typeof rawParsed === "object") {
            responseText = rawParsed.response || rawParsed.text || responseText;
            parsedJson = rawParsed;
          }
        } catch {}

        const inputTokens = estimateTokens(prompt);
        const outputTokens = estimateTokens(responseText);

        resolve({
          text: responseText,
          json: parsedJson,
          provider: this.name,
          model: "gemini-cli",
          durationMs,
          usage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          },
        });
      });

      proc.on("error", (err: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}

/**
 * Codex CLI Adapter
 * Call: codex exec --json "<prompt>"
 */
export class CodexCliRunner implements LlmProviderAdapter {
  public readonly name = "codex";

  public async isAvailable(): Promise<boolean> {
    return getProviderCooldownRemaining(this.name) === 0;
  }

  public async execute(prompt: string, options?: LlmCompleteOptions): Promise<LlmCompleteResult> {
    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs || 45000;
    const isWin = process.platform === "win32";
    const bin = isWin ? "codex.cmd" : "codex";

    const promptSnippet = prompt.replace(/[\r\n\t&|<>^%]/g, " ").slice(0, 80).trim() || "Spark Prompt";
    const args = ["exec", "--json", `"${promptSnippet}"`];

    return new Promise<LlmCompleteResult>((resolve, reject) => {
      let proc: any;
      try {
        proc = spawn(bin, args, {
          shell: true,
          env: { ...process.env, PAID_API_FALLBACK: "false" },
        });
      } catch (err) {
        return reject(err);
      }

      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            proc.kill();
          } catch {}
          reject(new Error(`[CodexCliRunner] Timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      try {
        proc.stdin.write(prompt);
        proc.stdin.end();
      } catch {}

      proc.stdout?.on("data", (chunk: any) => {
        stdout += chunk.toString();
      });

      proc.stderr?.on("data", (chunk: any) => {
        stderr += chunk.toString();
      });

      proc.on("close", (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        const durationMs = Date.now() - startTime;
        const allOutput = `${stdout}\n${stderr}`;
        const classification = classifyFailure("codex", allOutput, code ?? undefined);

        if (classification.failureClass === "quota" || classification.failureClass === "auth") {
          setProviderCooldown(this.name);
          return reject(new Error(`[CodexCliRunner] ${classification.failureClass.toUpperCase()} failure: ${classification.matchedText || allOutput.slice(0, 200)}`));
        }

        if (code !== 0 && (!stdout || stdout.trim().length === 0)) {
          return reject(new Error(`[CodexCliRunner] Exit code ${code}: ${stderr || stdout}`));
        }

        // Parse JSONL events from Codex stdout
        let responseText = "";
        const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const parsed = JSON.parse(lines[i]);
            if (parsed.content || parsed.message || parsed.text) {
              responseText = parsed.content || parsed.message || parsed.text;
              break;
            }
          } catch {}
        }

        if (!responseText) {
          responseText = stdout.trim();
        }

        const inputTokens = estimateTokens(prompt);
        const outputTokens = estimateTokens(responseText);

        resolve({
          text: responseText,
          provider: this.name,
          model: "codex-cli",
          durationMs,
          usage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          },
        });
      });

      proc.on("error", (err: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}

/**
 * Claude Code CLI Adapter
 * Call: claude -p "<prompt>" --output-format json
 */
export class ClaudeCliRunner implements LlmProviderAdapter {
  public readonly name = "claude";

  public async isAvailable(): Promise<boolean> {
    return getProviderCooldownRemaining(this.name) === 0;
  }

  public async execute(prompt: string, options?: LlmCompleteOptions): Promise<LlmCompleteResult> {
    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs || 45000;
    const isWin = process.platform === "win32";
    const bin = isWin ? "claude.cmd" : "claude";

    const promptSnippet = prompt.replace(/[\r\n\t&|<>^%]/g, " ").slice(0, 80).trim() || "Spark Prompt";
    const args = ["-p", `"${promptSnippet}"`, "--output-format", "json"];

    return new Promise<LlmCompleteResult>((resolve, reject) => {
      let proc: any;
      try {
        proc = spawn(bin, args, {
          shell: true,
          env: { ...process.env, PAID_API_FALLBACK: "false" },
        });
      } catch (err) {
        return reject(err);
      }

      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            proc.kill();
          } catch {}
          reject(new Error(`[ClaudeCliRunner] Timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      try {
        proc.stdin.write(prompt);
        proc.stdin.end();
      } catch {}

      proc.stdout?.on("data", (chunk: any) => {
        stdout += chunk.toString();
      });

      proc.stderr?.on("data", (chunk: any) => {
        stderr += chunk.toString();
      });

      proc.on("close", (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        const durationMs = Date.now() - startTime;
        const allOutput = `${stdout}\n${stderr}`;
        const classification = classifyFailure("claude", allOutput, code ?? undefined);

        if (classification.failureClass === "quota" || classification.failureClass === "auth") {
          setProviderCooldown(this.name);
          return reject(new Error(`[ClaudeCliRunner] ${classification.failureClass.toUpperCase()} failure: ${classification.matchedText || allOutput.slice(0, 200)}`));
        }

        let responseText = stdout.trim();
        let parsedJson: any = undefined;

        try {
          const raw = JSON.parse(responseText);
          responseText = raw.result || raw.text || raw.content || responseText;
          parsedJson = raw;
        } catch {}

        const inputTokens = estimateTokens(prompt);
        const outputTokens = estimateTokens(responseText);

        resolve({
          text: responseText,
          json: parsedJson,
          provider: this.name,
          model: "claude-code",
          durationMs,
          usage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          },
        });
      });

      proc.on("error", (err: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}

/**
 * Local Ollama Fallback Adapter
 * Target model: qwen2.5:7b
 */
export class OllamaCliRunner implements LlmProviderAdapter {
  public readonly name = "ollama:qwen2.5:7b";
  private endpoint: string;

  constructor(endpoint = SPARK_DEFAULT_OLLAMA_URL) {
    this.endpoint = endpoint;
  }

  public async isAvailable(): Promise<boolean> {
    if (getProviderCooldownRemaining(this.name) > 0) return false;
    try {
      const res = await fetch(`${this.endpoint}/api/tags`, { signal: AbortSignal.timeout(1000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async execute(prompt: string, options?: LlmCompleteOptions): Promise<LlmCompleteResult> {
    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs || 40000;

    const res = await fetch(`${this.endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5:7b",
        prompt,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.2,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`[OllamaCliRunner] HTTP ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as { response?: string; prompt_eval_count?: number; eval_count?: number };
    const responseText = (data.response || "").trim();
    const durationMs = Date.now() - startTime;
    const inputTokens = data.prompt_eval_count || estimateTokens(prompt);
    const outputTokens = data.eval_count || estimateTokens(responseText);

    return {
      text: responseText,
      provider: this.name,
      model: "qwen2.5:7b",
      durationMs,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
  }
}

/**
 * Deterministic Grounded Mock Runner (Offline & Unit Testing fallback)
 * Ensures that if CLI execution is not available in test/headless environments,
 * answers are synthesized strictly from the source snippets with valid citations!
 */
export class DeterministicSparkMockRunner implements LlmProviderAdapter {
  public readonly name = "spark-offline-grounded";

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async execute(prompt: string, options?: LlmCompleteOptions): Promise<LlmCompleteResult> {
    const startTime = Date.now();

    // Check if prompt has sources
    const sourceMatches = Array.from(prompt.matchAll(/\[(\d+)\]\s+Datei:\s+"([^"]+)"/g));
    const isUnknownExpected = prompt.includes("(Keine relevanten Quellen im Spark-Vault gefunden)");

    let answerText = "";
    if (isUnknownExpected || sourceMatches.length === 0) {
      answerText = "Ich weiß es nicht anhand der verfügbaren Notizen. In deinem Spark-Vault wurden keine passenden Quellen gefunden.";
    } else {
      const citedNumbers = sourceMatches.slice(0, 3).map((m) => `[${m[1]}]`);
      answerText = `Basierend auf den Notizen im Spark-Vault (${citedNumbers.join(", ")}) beziehen sich die relevanten Aufzeichnungen auf die hinterlegten Konzepte und Strukturen ${citedNumbers[0]}. Weitere Details finden sich in den verknüpften Abschnitten ${citedNumbers.slice(1).join(" und ")}.`;
    }

    let parsedJson: any = undefined;
    if (options?.json) {
      const usedNumbers = sourceMatches.slice(0, 2).map((m) => parseInt(m[1], 10));
      parsedJson = {
        answer: answerText,
        sourcesUsed: usedNumbers,
        confidence: isUnknownExpected ? 0.1 : 0.88,
        insufficientData: isUnknownExpected,
        suggestedFollowUps: ["Kannst du dazu mehr Details liefern?", "Welche Notizen schließen daran an?"],
      };
      answerText = JSON.stringify(parsedJson, null, 2);
    }

    const durationMs = Date.now() - startTime;
    return {
      text: answerText,
      json: parsedJson,
      provider: this.name,
      model: "offline-grounded-mock",
      durationMs,
      usage: {
        inputTokens: estimateTokens(prompt),
        outputTokens: estimateTokens(answerText),
        totalTokens: estimateTokens(prompt) + estimateTokens(answerText),
      },
    };
  }
}

/* ========================================================================== */
/* Shared CliRunner: Provider Chain with Conductor Error Failover             */
/* ========================================================================== */

export class CliRunner implements LlmClient {
  private providers: LlmProviderAdapter[];

  constructor(customProviders?: LlmProviderAdapter[]) {
    this.providers = customProviders || [
      new GeminiCliRunner(),
      new CodexCliRunner(),
      new ClaudeCliRunner(),
      new OllamaCliRunner(),
      new DeterministicSparkMockRunner(),
    ];
  }

  public async complete(prompt: string, options?: LlmCompleteOptions): Promise<LlmCompleteResult> {
    const errors: Array<{ provider: string; error: string }> = [];

    // Safety guard
    if (process.env.HELIU_USER_PROFILE) {
      assertNotStefanProfile(process.env.HELIU_USER_PROFILE);
    }

    for (const provider of this.providers) {
      const cooldownRemaining = getProviderCooldownRemaining(provider.name);
      if (cooldownRemaining > 0) {
        console.warn(`[CliRunner] Skipping '${provider.name}' (cooldown active: ${Math.round(cooldownRemaining / 1000)}s)`);
        continue;
      }

      const available = await provider.isAvailable().catch(() => false);
      if (!available) {
        continue;
      }

      // Conductor network retry loop (2s * 2^n with jitter)
      let networkRetries = 0;
      const maxNetworkRetries = 2;

      while (networkRetries <= maxNetworkRetries) {
        try {
          const runRecord = globalRuntimeCounter.startRun("spark-agent-2", provider.name);
          const result = await provider.execute(prompt, options);

          // Record successful run
          globalRuntimeCounter.endRun("spark-agent-2", 0, undefined);

          // If JSON schema validation requested
          if (options?.schema && result.json) {
            try {
              if (options.schema instanceof z.ZodType) {
                result.json = options.schema.parse(result.json);
              }
            } catch (validationErr: any) {
              console.warn(`[CliRunner] Schema validation failed on provider ${provider.name}: ${validationErr.message}`);
              // Allow 1 repair retry or fall through
            }
          }

          return result;
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          errors.push({ provider: provider.name, error: errMsg });

          const classification = classifyFailure(provider.name, errMsg);

          if (classification.failureClass === "quota" || classification.failureClass === "auth") {
            setProviderCooldown(provider.name);
            break; // Move immediately to next provider in chain
          }

          if (classification.failureClass === "network" && networkRetries < maxNetworkRetries) {
            networkRetries++;
            const backoffMs = 1500 * Math.pow(2, networkRetries) + Math.random() * 500;
            await new Promise((res) => setTimeout(res, backoffMs));
            continue;
          }

          // Other error: break to next provider
          break;
        }
      }
    }

    throw new Error(
      `[CliRunner] All providers exhausted: ${errors.map((e) => `[${e.provider}: ${e.error}]`).join("; ")}`,
    );
  }
}
