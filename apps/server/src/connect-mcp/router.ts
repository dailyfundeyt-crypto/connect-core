/**
 * Connect-MCP — globaler MCP-Server, der alle Connect-Agenten und -Features
 * als Tools nach außen exponiert. Externe Clients (Perplexity Computer,
 * Grok-Bot, Codex-App, Manus, Claude) rufen diesen Endpoint als MCP-Server
 * auf.
 *
 * URL:    POST /api/connect-mcp/jsonrpc
 * Manifest: GET  /api/connect-mcp/manifest
 * Health:    GET  /api/connect-mcp/health
 *
 * Format: JSON-RPC 2.0
 *   { "jsonrpc": "2.0", "id": 1, "method": "tools/list" }
 *   { "jsonrpc": "2.0", "id": 2, "method": "tools/call",
 *     "params": { "name": "list_agents", "arguments": {} } }
 *
 * Auth: Bearer-Token im Header `Authorization: Bearer <token>`.
 *   - Token wird in Settings → Connect-MCP generiert
 *   - Token wird in der `connect_mcp_tokens`-Tabelle gespeichert
 *   - Single-User-Mode: Token optional (DEV_ACTOR wird genutzt)
 *   - Multi-User-Mode: Token pflicht
 *
 * Die Tool-Liste wächst mit jeder Stufe (Browser, Manus, Perplexity, …).
 * Erweitern = Eintrag in `tool-registry.ts` hinzufügen.
 *
 * Architektur (Stufe 5+):
 *   - Loopback-Only wie die anderen `/api/agent-hub/*`-Routen
 *   - JSON-RPC statt eigenes Format, damit Perplexity/Grok/Claude es
 *     nativ verstehen
 *   - Stub-First-Disziplin: jeder Handler liefert im Fehlerfall eine
 *     ehrliche Stub-Antwort (analog zu `run-turn-helper.ts`)
 */

import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";

// ============================================================================
// JSON-RPC 2.0 Types
// ============================================================================

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown> | unknown[] | null;
};

export type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcError = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
};

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

// JSON-RPC standard error codes
export const JSON_RPC_ERROR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// ============================================================================
// MCP-Tool-Definition (analog zu MCP-Spec)
// ============================================================================

export type McpToolDef = {
  /** Tool-Name, z.B. "list_agents" */
  name: string;
  /** Kurzbeschreibung für Tool-Listen */
  description: string;
  /** JSON-Schema (MCP-Format: type=object, properties, required) */
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  /**
   * Optionale Handler-Funktion. Wenn vorhanden, führt der Router sie aus,
   * wenn `tools/call` mit diesem Tool-Namen aufgerufen wird. Wenn nicht
   * vorhanden → Stub-Antwort.
   *
   * Handler werden in `handlers/*.ts` definiert und in `tool-registry.ts`
   * registriert.
   */
  handler?: McpToolHandler;
  /** Optionale Annotationen für UI-Clients */
  annotations?: {
    /** Wird das Tool als "Read-Only" gehandelt? */
    readOnlyHint?: boolean;
    /** Darf das Tool destruktive Aktionen ausführen? */
    destructiveHint?: boolean;
    /** Idempotent: gleicher Input = gleicher Effekt */
    idempotentHint?: boolean;
    /** Externe Welt-Interaktion? */
    openWorldHint?: boolean;
  };
};

export type McpToolResult = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "resource"; resource: { uri: string; text: string; mimeType?: string } }
  >;
  isError?: boolean;
};

export type McpToolContext = {
  /** User, der das Tool aufruft (kommt aus dem Bearer-Token) */
  actorId: string;
  /** Optional: expliziter Agent-Context, falls das Tool agent-scoped ist */
  agentId?: string;
  /** Optional: Request-Signal für Cancellation */
  signal?: AbortSignal;
};

export type McpToolHandler = (
  args: Record<string, unknown>,
  ctx: McpToolContext,
) => Promise<McpToolResult>;

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validiert die Argumente gegen das JSON-Schema des Tools.
 * Zod-basiert, weil Zod v4 die bessere Fehler-Struktur liefert.
 *
 * Wir konvertieren das JSON-Schema in einen Zod-Schema-Builder. Das ist
 * absichtlich minimal — die meisten Tools haben simple Inputs.
 */
export function validateToolArgs(
  def: McpToolDef,
  args: unknown,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  if (args === null || args === undefined) {
    return { ok: true, args: {} };
  }
  if (typeof args !== "object" || Array.isArray(args)) {
    return { ok: false, error: "args must be a JSON object" };
  }
  const obj = args as Record<string, unknown>;

  // Required-Fields prüfen
  const required = def.inputSchema.required ?? [];
  for (const key of required) {
    if (!(key in obj)) {
      return { ok: false, error: `Missing required field: ${key}` };
    }
  }

  // Type-Checks für bekannte Felder
  for (const [key, propSchema] of Object.entries(def.inputSchema.properties)) {
    if (!(key in obj)) continue;
    const value = obj[key];
    const prop = propSchema as { type?: string; enum?: unknown[] };
    if (prop.type === "string" && typeof value !== "string") {
      return { ok: false, error: `Field "${key}" must be a string` };
    }
    if (prop.type === "number" && typeof value !== "number") {
      return { ok: false, error: `Field "${key}" must be a number` };
    }
    if (prop.type === "integer" && !Number.isInteger(value)) {
      return { ok: false, error: `Field "${key}" must be an integer` };
    }
    if (prop.type === "boolean" && typeof value !== "boolean") {
      return { ok: false, error: `Field "${key}" must be a boolean` };
    }
    if (prop.type === "object" && (typeof value !== "object" || value === null || Array.isArray(value))) {
      return { ok: false, error: `Field "${key}" must be an object` };
    }
    if (prop.type === "array" && !Array.isArray(value)) {
      return { ok: false, error: `Field "${key}" must be an array` };
    }
    if (prop.enum && !prop.enum.includes(value)) {
      return {
        ok: false,
        error: `Field "${key}" must be one of: ${prop.enum.join(", ")}`,
      };
    }
  }

  return { ok: true, args: obj };
}

// ============================================================================
// JSON-RPC Dispatcher
// ============================================================================

export type DispatchResult = {
  response: JsonRpcResponse;
  /** Falls der Caller HTTP-Status 200 will, aber body ist ein Fehler */
  httpStatus: 200 | 400 | 401 | 403 | 404 | 500;
};

export type ConnectMcpDeps = {
  /** Liste der exponierten Tools (kommt aus `tool-registry.ts`) */
  tools: McpToolDef[];
  /** User-Identität aus dem Bearer-Token auflösen */
  resolveToken: (token: string) => Promise<{ id: string; email?: string; name?: string } | null>;
  /** Single-User-Mode: erlaube Anfragen ohne Token */
  singleUser?: { id: string; email?: string; name?: string };
};

export async function dispatchJsonRpc(
  raw: unknown,
  deps: ConnectMcpDeps,
  actor: { id: string; email?: string; name?: string } | null,
): Promise<DispatchResult> {
  // 1. Parse-Error
  if (typeof raw !== "object" || raw === null) {
    return {
      httpStatus: 400,
      response: {
        jsonrpc: "2.0",
        id: null,
        error: { code: JSON_RPC_ERROR.PARSE_ERROR, message: "Invalid JSON-RPC payload" },
      },
    };
  }

  const req = raw as Partial<JsonRpcRequest>;

  // 2. Invalid-Request
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    return {
      httpStatus: 400,
      response: {
        jsonrpc: "2.0",
        id: (req.id as JsonRpcId) ?? null,
        error: { code: JSON_RPC_ERROR.INVALID_REQUEST, message: "Invalid JSON-RPC 2.0 request" },
      },
    };
  }

  const id = (req.id as JsonRpcId) ?? null;

  // 3. Method: tools/list
  if (req.method === "tools/list") {
    return {
      httpStatus: 200,
      response: {
        jsonrpc: "2.0",
        id,
        result: {
          tools: deps.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            ...(t.annotations ? { annotations: t.annotations } : {}),
          })),
        },
      },
    };
  }

  // 4. Method: tools/call
  if (req.method === "tools/call") {
    if (!actor) {
      return {
        httpStatus: 401,
        response: {
          jsonrpc: "2.0",
          id,
          error: { code: JSON_RPC_ERROR.INVALID_REQUEST, message: "Authentication required" },
        },
      };
    }
    const params = (req.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
    const toolName = params.name;
    if (typeof toolName !== "string") {
      return {
        httpStatus: 400,
        response: {
          jsonrpc: "2.0",
          id,
          error: { code: JSON_RPC_ERROR.INVALID_PARAMS, message: "Missing tool name" },
        },
      };
    }
    const tool = deps.tools.find((t) => t.name === toolName);
    if (!tool) {
      return {
        httpStatus: 404,
        response: {
          jsonrpc: "2.0",
          id,
          error: { code: JSON_RPC_ERROR.METHOD_NOT_FOUND, message: `Unknown tool: ${toolName}` },
        },
      };
    }
    const validated = validateToolArgs(tool, params.arguments);
    if (!validated.ok) {
      return {
        httpStatus: 400,
        response: {
          jsonrpc: "2.0",
          id,
          error: { code: JSON_RPC_ERROR.INVALID_PARAMS, message: validated.error },
        },
      };
    }
    try {
      if (tool.handler) {
        const result = await tool.handler(validated.args, {
          actorId: actor.id,
        });
        return { httpStatus: 200, response: { jsonrpc: "2.0", id, result } };
      }
      // Kein Handler verdrahtet → Stub-Antwort (Commit-1-Verhalten).
      const result: McpToolResult = {
        content: [
          {
            type: "text",
            text: `[Connect-MCP-Stub] Tool "${toolName}" ist registriert, aber noch kein Handler verdrahtet (Commit 2-4 füllen die Handler). Args: ${JSON.stringify(validated.args)}`,
          },
        ],
      };
      return { httpStatus: 200, response: { jsonrpc: "2.0", id, result } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        httpStatus: 500,
        response: {
          jsonrpc: "2.0",
          id,
          error: { code: JSON_RPC_ERROR.INTERNAL_ERROR, message: `Tool handler error: ${message}` },
        },
      };
    }
  }

  // 5. Method: ping (für Health-Checks)
  if (req.method === "ping") {
    return {
      httpStatus: 200,
      response: { jsonrpc: "2.0", id, result: { pong: true, server: "connect-mcp", version: "0.1.0" } },
    };
  }

  // 6. Method-Not-Found
  return {
    httpStatus: 404,
    response: {
      jsonrpc: "2.0",
      id,
      error: { code: JSON_RPC_ERROR.METHOD_NOT_FOUND, message: `Unknown method: ${req.method}` },
    },
  };
}

// ============================================================================
// Auth: Bearer-Token Middleware
// ============================================================================

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const LOOPBACK_IP = /^(127\.|::1$|::ffff:127\.)/;

function hostnameOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Loopback-Bar + Bearer-Token.
 *
 * - Loopback ist Pflicht (kein Connect-MCP aus dem Internet).
 * - Token ist Pflicht, AUSSER im Single-User-Mode (DEPRECATED-Ausnahme,
 *   damit ein lokaler Grok-Bot ohne Token-Setup connecten kann).
 */
const localOnly: MiddlewareHandler = async (context, next) => {
  const host = hostnameOf(context.req.header("host"));
  if (!host || !LOOPBACK_HOSTS.has(host)) {
    return context.json({ error: "Connect-MCP ist nur lokal auf diesem PC erreichbar." }, 403);
  }
  const origin = context.req.header("origin");
  if (origin && origin !== "null") {
    const originHost = hostnameOf(origin);
    if (!originHost || !LOOPBACK_HOSTS.has(originHost)) {
      return context.json({ error: "Connect-MCP ist nur lokal auf diesem PC erreichbar." }, 403);
    }
  }
  await next();
};

export type TokenResolver = (token: string) => Promise<{ id: string; email?: string; name?: string } | null>;

export function createConnectMcpRouter(deps: ConnectMcpDeps): Hono {
  const app = new Hono();

  app.use("*", localOnly);

  // Health
  app.get("/health", (context) =>
    context.json({
      ok: true,
      server: "connect-mcp",
      version: "0.1.0",
      tools: deps.tools.length,
    }),
  );

  // Manifest (für Clients ohne JSON-RPC)
  app.get("/manifest", (context) =>
    context.json({
      server: { name: "connect-mcp", version: "0.1.0" },
      transport: "http",
      url: "/api/connect-mcp/jsonrpc",
      tools: deps.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        ...(t.annotations ? { annotations: t.annotations } : {}),
      })),
    }),
  );

  // JSON-RPC Endpoint
  app.post("/jsonrpc", async (context) => {
    // Auth: Bearer-Token (oder Single-User-Override)
    let actor: { id: string; email?: string; name?: string } | null = null;
    const authHeader = context.req.header("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      if (token) {
        actor = await deps.resolveToken(token);
      }
    }
    if (!actor && deps.singleUser) {
      actor = deps.singleUser;
    }
    if (!actor) {
      return context.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: JSON_RPC_ERROR.INVALID_REQUEST, message: "Authentication required: Bearer token missing" },
        },
        401,
      );
    }

    // Body parsen
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: JSON_RPC_ERROR.PARSE_ERROR, message: "Body must be valid JSON" },
        },
        400,
      );
    }

    // Batch-Support: Array von Requests
    if (Array.isArray(body)) {
      const results = await Promise.all(
        body.map((req) => dispatchJsonRpc(req, deps, actor)),
      );
      const responses = results.map((r) => r.response);
      const status = results.every((r) => r.httpStatus === 200) ? 200 : 400;
      return context.json(responses, status as 200 | 400);
    }

    const result = await dispatchJsonRpc(body, deps, actor);
    return context.json(result.response, result.httpStatus);
  });

  return app;
}
