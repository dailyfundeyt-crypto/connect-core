/**
 * Swarm-v3 OpenAI-Compatible Local Bridge Endpoint (Lane 8: Prompt 8.3 Zusatz).
 *
 * Provides a local OpenAI-compatible endpoint listening ONLY on 127.0.0.1.
 * Used by MiroFish Sidecar (Lane 7) as LLM_BASE_URL:
 * - Token stored securely in %LOCALAPPDATA%\ConnectAgents, NEVER logged
 * - Rate limiting and resource monitor integration
 * - Forwarding to Swarm LLM adapter (Gemini CLI / API / Mock)
 */

import http from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getResourceMonitor } from "../resource-monitor";
import { getLlmAdapter } from "./provider-factory";
import { assertNotStefanProfile } from "../../agent-hub/routes";

const DEFAULT_PORT = 3108;
const LOCAL_HOST = "127.0.0.1";

let serverInstance: http.Server | null = null;
let activePort = DEFAULT_PORT;

function getOrCreateBridgeToken(): string {
  const localAppData = process.env.LOCALAPPDATA || "C:\\Users\\Kunc GmbH\\AppData\\Local";
  const agentsDir = join(localAppData, "ConnectAgents");
  assertNotStefanProfile(agentsDir);

  if (!existsSync(agentsDir)) {
    mkdirSync(agentsDir, { recursive: true });
  }

  const tokenPath = join(agentsDir, "openai-bridge-token");
  if (existsSync(tokenPath)) {
    try {
      const existing = readFileSync(tokenPath, "utf-8").trim();
      if (existing.length >= 16) {
        return existing;
      }
    } catch {
      /* ignore */
    }
  }

  // Generate new secret token
  const newToken = `cpt_bridge_${randomBytes(24).toString("base64url")}`;
  writeFileSync(tokenPath, newToken, { encoding: "utf-8", mode: 0o600 });
  return newToken;
}

export function startOpenAiCompatServer(port: number = DEFAULT_PORT): Promise<number> {
  if (serverInstance) {
    return Promise.resolve(activePort);
  }

  const token = getOrCreateBridgeToken();
  const monitor = getResourceMonitor();

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      // Security: Only accept requests from localhost
      const remote = req.socket.remoteAddress;
      if (remote !== "127.0.0.1" && remote !== "::1" && remote !== "::ffff:127.0.0.1") {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Access denied: local loopback only" }));
      }

      // Health endpoint (unauthenticated)
      if (req.method === "GET" && (req.url === "/health" || req.url === "/v1/health")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ status: "ok", service: "swarm-v3-openai-bridge" }));
      }

      // Check Bearer Token (token is NEVER printed or logged)
      const authHeader = req.headers.authorization || "";
      const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      if (!bearerToken || bearerToken !== token) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "Invalid or missing Bearer token", type: "invalid_request_error" } }));
      }

      // Check Resource Monitor (Backpressure)
      const limits = {
        maxConcurrent: 20,
        maxCpuPercent: 85,
        minFreeMemMb: 1024,
        maxMemPercent: 90,
        taskTimeoutMs: 60000,
        maxRetries: 2,
        retryDelayMs: 800,
      };
      if (!monitor.checkLimits(limits).allowed) {
        res.writeHead(429, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          error: {
            message: "System capacity exceeded: Swarm resource monitor backpressure",
            type: "rate_limit_exceeded",
          },
        }));
      }

      // Route: GET /v1/models
      if (req.method === "GET" && req.url === "/v1/models") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          object: "list",
          data: [
            {
              id: "gemini-2.5-flash",
              object: "model",
              created: 1729600000,
              owned_by: "swarm-v3",
            },
            {
              id: "gemini-cli",
              object: "model",
              created: 1729600000,
              owned_by: "swarm-v3",
            },
            {
              id: "mock-gemini-v3",
              object: "model",
              created: 1729600000,
              owned_by: "swarm-v3",
            },
          ],
        }));
      }

      // Route: POST /v1/chat/completions
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });

        req.on("end", async () => {
          try {
            const parsed = JSON.parse(body);
            const messages: Array<{ role: string; content: string }> = parsed.messages || [];
            const model = parsed.model || "gemini-2.5-flash";

            let systemPrompt = "";
            const userPrompts: string[] = [];

            for (const msg of messages) {
              if (msg.role === "system") {
                systemPrompt += `${msg.content}\n`;
              } else if (msg.role === "user" || msg.role === "assistant") {
                userPrompts.push(`${msg.role.toUpperCase()}: ${msg.content}`);
              }
            }

            const prompt = userPrompts.join("\n\n");
            const provider = model.toLowerCase().includes("mock") ? "mock" : "gemini-cli";
            const adapter = getLlmAdapter(provider);
            const result = await adapter.execute({
              prompt,
              systemPrompt: systemPrompt.trim(),
              model,
              expectedJson: false,
            });

            const completionId = `chatcmpl-${randomBytes(12).toString("hex")}`;
            const responsePayload = {
              id: completionId,
              object: "chat.completion",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: result.text,
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: result.inputTokens,
                completion_tokens: result.outputTokens,
                total_tokens: result.totalTokens,
              },
            };

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(responsePayload));
          } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: { message: err?.message || "Internal error", type: "api_error" } }));
          }
        });
        return;
      }

      // Default 404
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Endpoint not found" }));
    });

    server.listen(port, LOCAL_HOST, () => {
      serverInstance = server;
      activePort = port;
      resolve(port);
    });

    server.on("error", (err) => {
      reject(err);
    });
  });
}

export function stopOpenAiCompatServer(): Promise<void> {
  return new Promise((resolve) => {
    if (serverInstance) {
      serverInstance.close(() => {
        serverInstance = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}
