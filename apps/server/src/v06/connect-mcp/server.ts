/**
 * Connect-MCP Server (v06 / Wave 2 / A18).
 *
 * Implementiert den offiziellen MCP-Server für Grok Bot und externe Agenten
 * unter Einhaltung des MCP JSON-RPC 2.0 Protokolls.
 * Folgt dem Referenzmuster von A08 (Spark-MCP).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Database } from "../../db/client";
import { ALL_CONNECT_MCP_TOOLS, findToolByName } from "./tools";
import {
  checkTokenRateLimit,
  recordMcpAuditLog,
} from "./tokens";
import {
  JSON_RPC_ERRORS,
  type ConnectMcpAuthContext,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type ToolExecutionContext,
} from "./types";

export class ConnectMcpServer {
  private sdkServer: Server;

  constructor(private database?: Database) {
    // Initialisiere offizielles MCP SDK
    this.sdkServer = new Server(
      {
        name: "connect-mcp-server",
        version: "0.6.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.registerSdkHandlers();
  }

  private registerSdkHandlers(): void {
    // 1. List Tools
    this.sdkServer.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: ALL_CONNECT_MCP_TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    // 2. Call Tool (Fallback über MCP-SDK)
    this.sdkServer.setRequestHandler(CallToolRequestSchema, async (request): Promise<any> => {
      const tool = findToolByName(request.params.name);
      if (!tool) {
        throw new Error(`Tool "${request.params.name}" existiert nicht.`);
      }

      const defaultAuth: ConnectMcpAuthContext = {
        principal: "sdk-caller",
        grants: [],
        isLocal: true,
        isTunnel: false,
      };

      const result = await tool.handler(request.params.arguments || {}, {
        auth: defaultAuth,
        database: this.database,
      });

      return {
        content: [
          {
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    });
  }

  getSdkServer(): Server {
    return this.sdkServer;
  }

  /**
   * Liefert das Manifest und die Liste aller registrierten Tools.
   */
  getManifest(): {
    name: string;
    version: string;
    description: string;
    tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>;
  } {
    return {
      name: "connect-mcp-server",
      version: "0.6.0",
      description:
        "Connect MCP Server (v06) — Schwarm-Steuerung, Agenten-Hub, Brain und Mobile UI für Grok Bot und Partner-Agenten",
      tools: ALL_CONNECT_MCP_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  }

  /**
   * Verarbeitet JSON-RPC 2.0 Aufrufe über HTTP POST (Streamable HTTP / MCP RPC).
   */
  async handleJsonRpc(
    payload: unknown,
    auth: ConnectMcpAuthContext,
    ipAddress?: string,
  ): Promise<JsonRpcResponse | JsonRpcResponse[]> {
    // Batch-Anfragen unterstützen
    if (Array.isArray(payload)) {
      const responses: JsonRpcResponse[] = [];
      for (const item of payload) {
        responses.push(await this.handleSingleJsonRpc(item, auth, ipAddress));
      }
      return responses;
    }

    return this.handleSingleJsonRpc(payload, auth, ipAddress);
  }

  private async handleSingleJsonRpc(
    payload: unknown,
    auth: ConnectMcpAuthContext,
    ipAddress?: string,
  ): Promise<JsonRpcResponse> {
    if (!payload || typeof payload !== "object") {
      return {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST,
          message: "Ungültige JSON-RPC 2.0 Anfrage.",
        },
      };
    }

    const req = payload as Partial<JsonRpcRequest>;
    const id = req.id ?? null;

    if (req.jsonrpc !== "2.0" || !req.method) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST,
          message: "Request muss 'jsonrpc': '2.0' und eine 'method' enthalten.",
        },
      };
    }

    // Rate-Limiting pro Token/Principal prüfen
    const rateLimitKey = auth.tokenHash || auth.principal;
    const rateCheck = checkTokenRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
      await recordMcpAuditLog(
        {
          tokenId: auth.tokenId,
          principal: auth.principal,
          toolName: req.method,
          status: "denied",
          statusDetail: `Rate Limit überschritten. Retry after ${rateCheck.retryAfterSeconds}s`,
          ipAddress,
        },
        this.database,
      );

      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: JSON_RPC_ERRORS.RATE_LIMITED,
          message: `Rate-Limit überschritten. Bitte in ${rateCheck.retryAfterSeconds} Sekunden erneut versuchen.`,
        },
      };
    }

    try {
      switch (req.method) {
        case "initialize":
          return {
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: {
                tools: {
                  listChanged: false,
                },
              },
              serverInfo: {
                name: "connect-mcp-server",
                version: "0.6.0",
              },
            },
          };

        case "notifications/initialized":
        case "initialized":
          return {
            jsonrpc: "2.0",
            id,
            result: {},
          };

        case "ping":
          return {
            jsonrpc: "2.0",
            id,
            result: {},
          };

        case "tools/list":
          return {
            jsonrpc: "2.0",
            id,
            result: {
              tools: ALL_CONNECT_MCP_TOOLS.map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
              })),
            },
          };

        case "tools/call": {
          const params = (req.params || {}) as Record<string, unknown>;
          const toolName = String(params.name || "");
          const toolArgs = (params.arguments || {}) as Record<string, unknown>;

          const tool = findToolByName(toolName);
          if (!tool) {
            await recordMcpAuditLog(
              {
                tokenId: auth.tokenId,
                principal: auth.principal,
                toolName,
                status: "error",
                statusDetail: `Tool "${toolName}" nicht gefunden`,
                ipAddress,
              },
              this.database,
            );

            return {
              jsonrpc: "2.0",
              id,
              error: {
                code: JSON_RPC_ERRORS.METHOD_NOT_FOUND,
                message: `Tool "${toolName}" nicht gefunden. Verfügbar: ${ALL_CONNECT_MCP_TOOLS.map((t) => t.name).join(", ")}`,
              },
            };
          }

          const execCtx: ToolExecutionContext = {
            auth,
            companyId: typeof toolArgs.companyId === "string" ? toolArgs.companyId : undefined,
            database: this.database,
          };

          try {
            const rawResult = await tool.handler(toolArgs, execCtx);

            await recordMcpAuditLog(
              {
                tokenId: auth.tokenId,
                principal: auth.principal,
                companyId: execCtx.companyId,
                toolName,
                paramsSummary: JSON.stringify(toolArgs).slice(0, 200),
                status: "success",
                ipAddress,
              },
              this.database,
            );

            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text:
                      typeof rawResult === "string"
                        ? rawResult
                        : JSON.stringify(rawResult, null, 2),
                  },
                ],
              },
            };
          } catch (handlerErr: any) {
            const msg = handlerErr?.message || String(handlerErr);
            const isForbidden = msg.includes("403") || msg.toLowerCase().includes("verweigert");

            await recordMcpAuditLog(
              {
                tokenId: auth.tokenId,
                principal: auth.principal,
                companyId: execCtx.companyId,
                toolName,
                paramsSummary: JSON.stringify(toolArgs).slice(0, 200),
                status: "denied",
                statusDetail: msg,
                ipAddress,
              },
              this.database,
            );

            return {
              jsonrpc: "2.0",
              id,
              error: {
                code: isForbidden ? JSON_RPC_ERRORS.FORBIDDEN : JSON_RPC_ERRORS.INTERNAL_ERROR,
                message: msg,
              },
            };
          }
        }

        default:
          return {
            jsonrpc: "2.0",
            id,
            error: {
              code: JSON_RPC_ERRORS.METHOD_NOT_FOUND,
              message: `Methode "${req.method}" wird nicht unterstützt.`,
            },
          };
      }
    } catch (err: any) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: JSON_RPC_ERRORS.INTERNAL_ERROR,
          message: err?.message || "Interner Serverfehler.",
        },
      };
    }
  }
}

let sharedServer: ConnectMcpServer | null = null;

export function getConnectMcpServer(database?: Database): ConnectMcpServer {
  if (!sharedServer || database) {
    sharedServer = new ConnectMcpServer(database);
  }
  return sharedServer;
}
