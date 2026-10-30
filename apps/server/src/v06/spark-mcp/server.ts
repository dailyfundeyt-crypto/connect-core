import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Database } from "../../db/client";
import { ALL_SPARK_MCP_TOOLS } from "./tools";
import { getSparkMcpStore, SparkMcpStore } from "./store";
import type { AgentAuthContext } from "./types";
import { logAgentAccess } from "../spark-overview";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown> | null;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export class SparkMcpServer {
  private sdkServer: Server;
  private store: SparkMcpStore;

  constructor(
    private database?: Database,
    customStore?: SparkMcpStore,
  ) {
    this.store = customStore || getSparkMcpStore(database);

    // Initialisiere offizielles MCP SDK
    this.sdkServer = new Server(
      {
        name: "spark-mcp-server",
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
    // List Tools
    this.sdkServer.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: ALL_SPARK_MCP_TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    // Call Tool (SDK Fallback)
    this.sdkServer.setRequestHandler(CallToolRequestSchema, async (request): Promise<any> => {
      const tool = ALL_SPARK_MCP_TOOLS.find((t) => t.name === request.params.name);
      if (!tool) {
        throw new Error(`Tool "${request.params.name}" existiert nicht.`);
      }

      // Default System Agent wenn über SDK aufgerufen
      const defaultAgent: AgentAuthContext = {
        agentId: "sdk-caller",
        agentName: "SdkCaller",
        companyId: "*",
        scopes: ["*"],
        isLocal: true,
        isTunnel: false,
      };

      const result = await tool.handler(request.params.arguments || {}, {
        agent: defaultAgent,
        database: this.database,
        store: this.store,
      });

      if (!result.isError && defaultAgent.agentId) {
        const toolArgs = (request.params.arguments || {}) as Record<string, unknown>;
        const ref = String(toolArgs.path || toolArgs.noteId || toolArgs.folderId || toolArgs.name || toolArgs.url || request.params.name);
        const kind = request.params.name.includes("note") ? "note" : request.params.name.includes("link") ? "link" : "folder";
        void logAgentAccess(defaultAgent.agentId, { kind, ref }).catch(() => {});
      }

      return {
        content: result.content,
        isError: result.isError,
      };
    });
  }

  getSdkServer(): Server {
    return this.sdkServer;
  }

  getStore(): SparkMcpStore {
    return this.store;
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
      name: "spark-mcp-server",
      version: "0.6.0",
      description:
        "Connect Spark MCP Server (v06) — Browser-Ordner, Links und Spark-Notizen für alle Agenten",
      tools: ALL_SPARK_MCP_TOOLS.map((t) => ({
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
    agent: AgentAuthContext,
  ): Promise<JsonRpcResponse | JsonRpcResponse[]> {
    // Batch-Anfragen unterstützen
    if (Array.isArray(payload)) {
      const responses: JsonRpcResponse[] = [];
      for (const item of payload) {
        responses.push(await this.handleSingleJsonRpc(item, agent));
      }
      return responses;
    }

    return this.handleSingleJsonRpc(payload, agent);
  }

  private async handleSingleJsonRpc(
    payload: unknown,
    agent: AgentAuthContext,
  ): Promise<JsonRpcResponse> {
    if (!payload || typeof payload !== "object") {
      return {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST,
          message: "Ungueltige JSON-RPC 2.0 Anfrage.",
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
                name: "connect-spark-mcp",
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
              tools: ALL_SPARK_MCP_TOOLS.map((t) => ({
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

          const tool = ALL_SPARK_MCP_TOOLS.find((t) => t.name === toolName);
          if (!tool) {
            return {
              jsonrpc: "2.0",
              id,
              error: {
                code: JSON_RPC_ERRORS.METHOD_NOT_FOUND,
                message: `Tool "${toolName}" nicht gefunden. Verfügbar: ${ALL_SPARK_MCP_TOOLS.map((t) => t.name).join(", ")}`,
              },
            };
          }

          const result = await tool.handler(toolArgs, {
            agent,
            database: this.database,
            store: this.store,
          });

          if (!result.isError && agent?.agentId) {
            const ref = String(toolArgs.path || toolArgs.noteId || toolArgs.folderId || toolArgs.name || toolArgs.url || toolName);
            const kind = toolName.includes("note") ? "note" : toolName.includes("link") ? "link" : "folder";
            void logAgentAccess(agent.agentId, { kind, ref }).catch(() => {});
          }

          return {
            jsonrpc: "2.0",
            id,
            result,
          };
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

let sharedServer: SparkMcpServer | null = null;

export function getSparkMcpServer(database?: Database): SparkMcpServer {
  if (!sharedServer || database) {
    sharedServer = new SparkMcpServer(database);
  }
  return sharedServer;
}
