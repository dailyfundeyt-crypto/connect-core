import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DEFAULT_BASE_URL = "http://127.0.0.1:3101";
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_BYTES = 200_000;

const server = new McpServer(
  { name: "connect-local-app", version: "0.2.0" },
  {
    instructions:
      "This MCP server controls the user-facing Connect app through explicit, fixed-route tools for status, agent management, channels, routines, and thread status. It does not expose arbitrary API paths, credential issuance, or direct filesystem access. Connect's own authentication, authorization, validation, and computer/plugin policies remain in force.",
  },
);

function localBaseUrl(): URL {
  const value = process.env.CONNECT_MCP_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const url = new URL(value);
  const isLoopback = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]).has(
    url.hostname.toLowerCase(),
  );
  if (
    url.protocol !== "http:" ||
    !isLoopback ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "CONNECT_MCP_BASE_URL must be a plain HTTP loopback origin, such as http://127.0.0.1:3101.",
    );
  }
  return url;
}

function encodeId(value: string, label: string): string {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > 256 ||
    /[\/\\?#\u0000-\u001f]/.test(trimmed)
  ) {
    throw new Error(label + " must be a non-empty ID without URL separators.");
  }
  return encodeURIComponent(trimmed);
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const secretField =
      /^(auth|authorization|token|access[_-]?token|refresh[_-]?token|secret|password|credential|api[_-]?key|private[_-]?key|client[_-]?secret|cookie|key)$/i;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        secretField.test(key) ? "[redacted]" : redact(item),
      ]),
    );
  }
  return value;
}

async function readLimited(
  response: Response,
): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) return { text: "", truncated: false };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    const remaining = MAX_RESPONSE_BYTES - total;
    if (value.byteLength > remaining) {
      if (remaining > 0) chunks.push(value.slice(0, remaining));
      total = MAX_RESPONSE_BYTES;
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(bytes), truncated };
}

function formatResponse(body: string, truncated: boolean): string {
  let formatted = body;
  try {
    formatted = JSON.stringify(redact(JSON.parse(body)), null, 2);
  } catch {
    formatted = body.replace(/(bearer\s+)[^\s"'<>]+/gi, "$1[redacted]");
  }
  if (truncated) formatted += "\n[Response truncated at 200 KB.]";
  return formatted || "(empty response)";
}

async function request(
  baseUrl: URL,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
) {
  const url = new URL(path, baseUrl);
  if (url.origin !== baseUrl.origin || !url.pathname.startsWith("/api/")) {
    throw new Error("The MCP server can only call Connect API routes.");
  }

  const headers = new Headers({ accept: "application/json, text/plain" });
  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text" as const,
          text:
            "Could not reach Connect at " +
            baseUrl.origin +
            ". Is Connect App running? (" +
            message +
            ")",
        },
      ],
      isError: true,
    };
  }

  const responseBody = await readLimited(response);
  return {
    content: [
      {
        type: "text" as const,
        text:
          method +
          " " +
          url.pathname +
          url.search +
          "\nHTTP " +
          response.status +
          " " +
          response.statusText +
          "\n\n" +
          formatResponse(responseBody.text, responseBody.truncated),
      },
    ],
    ...(!response.ok ? { isError: true } : {}),
  };
}

const baseUrl = localBaseUrl();

server.registerTool(
  "connect_status",
  {
    title: "Check Connect status",
    description: "Check whether the local Connect app is running and reachable.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => request(baseUrl, "GET", "/api/me"),
);

server.registerTool(
  "connect_list_agents",
  {
    title: "List Connect agents",
    description: "List the agents in the local Connect app.",
    inputSchema: { hidden: z.boolean().optional() },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ hidden }) =>
    request(
      baseUrl,
      "GET",
      "/api/agents" + (hidden ? "?hidden=true" : ""),
    ),
);

server.registerTool(
  "connect_get_agent",
  {
    title: "Get a Connect agent",
    description: "Read one agent by its ID from the local Connect app.",
    inputSchema: { agentId: z.string().min(1).max(256) },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ agentId }) =>
    request(
      baseUrl,
      "GET",
      "/api/agents/" + encodeId(agentId, "Agent ID"),
    ),
);

server.registerTool(
  "connect_list_channels",
  {
    title: "List Connect channels",
    description: "List channels in the local Connect app.",
    inputSchema: { limit: z.number().int().min(1).max(100).optional() },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ limit }) =>
    request(
      baseUrl,
      "GET",
      "/api/channels" + (limit ? "?limit=" + String(limit) : ""),
    ),
);

server.registerTool(
  "connect_get_channel",
  {
    title: "Get a Connect channel",
    description: "Read one channel by its ID from the local Connect app.",
    inputSchema: { channelId: z.string().min(1).max(256) },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ channelId }) =>
    request(
      baseUrl,
      "GET",
      "/api/channels/" + encodeId(channelId, "Channel ID"),
    ),
);

server.registerTool(
  "connect_create_channel",
  {
    title: "Create a Connect channel",
    description:
      "Create a new channel for one existing agent. Connect currently supports one agent per channel.",
    inputSchema: {
      agentIds: z.array(z.string().min(1).max(256)).length(1),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ agentIds }) =>
    request(baseUrl, "POST", "/api/channels", { agentIds }),
);

server.registerTool(
  "connect_pin_channel",
  {
    title: "Pin or unpin a Connect channel",
    description:
      "Set the current user's pin state for a channel. This changes only the channel's position in the local Connect sidebar.",
    inputSchema: {
      channelId: z.string().min(1).max(256),
      pinned: z.boolean(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ channelId, pinned }) =>
    request(
      baseUrl,
      "PUT",
      "/api/channels/" + encodeId(channelId, "Channel ID") + "/pin",
      { pinned },
    ),
);

server.registerTool(
  "connect_mark_channel_read",
  {
    title: "Mark a Connect channel as read",
    description:
      "Mark a channel as read for the current user in the local Connect app.",
    inputSchema: { channelId: z.string().min(1).max(256) },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ channelId }) =>
    request(
      baseUrl,
      "PUT",
      "/api/channels/" + encodeId(channelId, "Channel ID") + "/read",
    ),
);

server.registerTool(
  "connect_api_help",
  {
    title: "Explain Connect MCP tools",
    description: "Explain the available Connect MCP actions and their boundaries.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => ({
    content: [
      {
        type: "text",
        text: [
          "Connected to the local Connect API at " + baseUrl.origin + ".",
          "Available: status; agent list, read, capabilities, connection test, create, update, duplicate, hide, unhide, soft-delete, and handoff settings; channel list, read, create, pin, read state, busy state, and soft-delete; scheduled routine list, enable/pause, and delete; conversation list, transcript read, rename, archive/restore; policy-governed agent browser status, read, snapshot, navigation and interaction, plus control handoff; thread ID creation and status check.",
          "The server does not expose arbitrary API paths, agent chat/execution, credential issuance or values, multipart uploads, or direct filesystem access. Agent API-key fields stay in Connect UI; Connect applies computer action policies and audit logging to browser interactions. Shell commands, arbitrary file access, computer resets, credential entry, and plugin tool execution are not exposed.",
          "Connect's own API validation and permissions remain in force. Responses redact common credential and token fields and are capped at 200 KB.",
        ].join("\n"),
      },
    ],
  }),
);

server.registerTool(
  "connect_get_agent_capabilities",
  {
    title: "Get Connect agent capabilities",
    description: "Read which agent types this Connect installation can create.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => request(baseUrl, "GET", "/api/agents/capabilities"),
);

server.registerTool(
  "connect_test_agent_connection",
  {
    title: "Test an agent connection",
    description: "Run Connect's validated connection check for an agent endpoint. Connect applies its configured address and network protections.",
    inputSchema: {
      endpoint: z.string().url(),
      headers: z.record(z.string(), z.string()).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ endpoint, headers }) =>
    request(baseUrl, "POST", "/api/agents/test-connection", {
      endpoint,
      ...(headers ? { headers } : {}),
    }),
);

server.registerTool(
  "connect_create_agent",
  {
    title: "Create a Connect agent",
    description: "Create an agent profile in Connect. Endpoint validation is enforced by Connect. Credential fields are intentionally omitted; add secrets in the app's credential form.",
    inputSchema: {
      name: z.string().min(1).max(80),
      title: z.string().min(1).max(120),
      roleDescription: z.string().min(1).max(1000),
      endpoint: z.string().url().optional(),
      visibility: z.enum(["private", "public"]).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ name, title, roleDescription, endpoint, visibility }) =>
    request(baseUrl, "POST", "/api/agents", {
      name,
      title,
      roleDescription,
      ...(endpoint ? { endpoint } : {}),
      ...(visibility ? { visibility } : {}),
    }),
);

server.registerTool(
  "connect_update_agent",
  {
    title: "Update a Connect agent",
    description: "Update the name, title, role, and optionally endpoint of an agent you can manage. Connect enforces ownership and endpoint rules. This tool cannot read or change stored credentials.",
    inputSchema: {
      agentId: z.string().min(1).max(256),
      name: z.string().min(1).max(80),
      title: z.string().min(1).max(120),
      roleDescription: z.string().min(1).max(1000),
      endpoint: z.string().url().optional(),
      visibility: z.enum(["private", "public"]).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ agentId, name, title, roleDescription, endpoint, visibility }) =>
    request(
      baseUrl,
      "PATCH",
      "/api/agents/" + encodeId(agentId, "Agent ID"),
      {
        name,
        title,
        roleDescription,
        ...(endpoint ? { endpoint } : {}),
        ...(visibility ? { visibility } : {}),
      },
    ),
);

server.registerTool(
  "connect_duplicate_agent",
  {
    title: "Duplicate a Connect agent",
    description: "Create a copy of a manageable agent profile.",
    inputSchema: { agentId: z.string().min(1).max(256) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ agentId }) =>
    request(
      baseUrl,
      "POST",
      "/api/agents/" + encodeId(agentId, "Agent ID") + "/duplicate",
    ),
);

server.registerTool(
  "connect_hide_agent",
  {
    title: "Hide a Connect agent",
    description: "Hide a manageable agent from the normal agent list. This does not delete it.",
    inputSchema: { agentId: z.string().min(1).max(256) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ agentId }) =>
    request(
      baseUrl,
      "POST",
      "/api/agents/" + encodeId(agentId, "Agent ID") + "/hide",
    ),
);

server.registerTool(
  "connect_unhide_agent",
  {
    title: "Unhide a Connect agent",
    description: "Restore a hidden agent to the normal agent list.",
    inputSchema: { agentId: z.string().min(1).max(256) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ agentId }) =>
    request(
      baseUrl,
      "POST",
      "/api/agents/" + encodeId(agentId, "Agent ID") + "/unhide",
    ),
);

server.registerTool(
  "connect_delete_agent",
  {
    title: "Remove a Connect agent",
    description: "Soft-delete an agent profile you can manage. Connect may refuse protected or referenced agents.",
    inputSchema: { agentId: z.string().min(1).max(256) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ agentId }) =>
    request(
      baseUrl,
      "DELETE",
      "/api/agents/" + encodeId(agentId, "Agent ID"),
    ),
);

server.registerTool(
  "connect_get_agent_handoff",
  {
    title: "Read an agent's handoff settings",
    description: "Read the handoff capability and the agents this agent may hand work to, as allowed by Connect.",
    inputSchema: { agentId: z.string().min(1).max(256) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ agentId }) =>
    request(
      baseUrl,
      "GET",
      "/api/agents/" + encodeId(agentId, "Agent ID") + "/handoff",
    ),
);

server.registerTool(
  "connect_set_channel_busy",
  {
    title: "Set Connect channel activity",
    description: "Set the channel busy indicator in Connect.",
    inputSchema: {
      channelId: z.string().min(1).max(256),
      busy: z.boolean(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ channelId, busy }) =>
    request(
      baseUrl,
      "POST",
      "/api/channels/" + encodeId(channelId, "Channel ID") + "/busy",
      { busy },
    ),
);

server.registerTool(
  "connect_delete_channel",
  {
    title: "Remove a Connect channel",
    description: "Soft-delete a channel from Connect. Its transcript and underlying thread are not hard-deleted by this endpoint.",
    inputSchema: { channelId: z.string().min(1).max(256) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ channelId }) =>
    request(
      baseUrl,
      "DELETE",
      "/api/channels/" + encodeId(channelId, "Channel ID"),
    ),
);

server.registerTool(
  "connect_list_routines",
  {
    title: "List Connect routines",
    description: "List the current user's scheduled agent routines and their next run status.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => request(baseUrl, "GET", "/api/routines"),
);

server.registerTool(
  "connect_set_routine_enabled",
  {
    title: "Enable or pause a Connect routine",
    description: "Set whether a scheduled routine is enabled for the current user.",
    inputSchema: {
      routineId: z.string().min(1).max(256),
      enabled: z.boolean(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ routineId, enabled }) =>
    request(
      baseUrl,
      "PUT",
      "/api/routines/" + encodeId(routineId, "Routine ID") + "/enabled",
      { enabled },
    ),
);

server.registerTool(
  "connect_delete_routine",
  {
    title: "Delete a Connect routine",
    description: "Delete a scheduled routine owned by the current user.",
    inputSchema: { routineId: z.string().min(1).max(256) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ routineId }) =>
    request(
      baseUrl,
      "DELETE",
      "/api/routines/" + encodeId(routineId, "Routine ID"),
    ),
);

server.registerTool(
  "connect_mint_thread_id",
  {
    title: "Create a Connect conversation ID",
    description: "Ask Connect to mint an ID for a new direct agent conversation.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async () => request(baseUrl, "POST", "/api/threads/mint"),
);

server.registerTool(
  "connect_check_thread",
  {
    title: "Check a Connect conversation",
    description: "Check whether Connect still recognizes a conversation thread ID.",
    inputSchema: { threadId: z.string().uuid() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ threadId }) =>
    request(
      baseUrl,
      "GET",
      "/api/threads/" + encodeId(threadId, "Thread ID"),
    ),
);
server.registerTool(
  "connect_list_conversations",
  {
    title: "List Connect conversations",
    description: "List recent Connect conversations. Optionally include archived conversations or filter by agent.",
    inputSchema: {
      agentId: z.string().min(1).max(256).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      includeArchived: z.boolean().optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ agentId, limit, includeArchived }) => {
    const query = new URLSearchParams();
    if (agentId) query.set("agentId", agentId);
    if (limit) query.set("limit", String(limit));
    if (includeArchived) query.set("includeArchived", "true");
    const suffix = query.size ? "?" + query.toString() : "";
    return request(baseUrl, "GET", "/api/copilotkit/threads" + suffix);
  },
);

server.registerTool(
  "connect_get_conversation_messages",
  {
    title: "Read Connect conversation messages",
    description: "Read the stored transcript for a conversation, scoped by Connect to the current user.",
    inputSchema: {
      threadId: z.string().min(1).max(256),
      agentId: z.string().min(1).max(256),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ threadId, agentId }) => {
    const query = new URLSearchParams({ agentId });
    return request(
      baseUrl,
      "GET",
      "/api/copilotkit/threads/" +
        encodeId(threadId, "Thread ID") +
        "/messages?" +
        query.toString(),
    );
  },
);

server.registerTool(
  "connect_rename_conversation",
  {
    title: "Rename a Connect conversation",
    description: "Rename a conversation owned by the current user.",
    inputSchema: {
      threadId: z.string().min(1).max(256),
      name: z.string().min(1).max(200),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ threadId, name }) =>
    request(
      baseUrl,
      "PATCH",
      "/api/copilotkit/threads/" + encodeId(threadId, "Thread ID"),
      { name },
    ),
);

server.registerTool(
  "connect_archive_conversation",
  {
    title: "Archive a Connect conversation",
    description: "Archive a conversation owned by the current user.",
    inputSchema: { threadId: z.string().min(1).max(256) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ threadId }) =>
    request(
      baseUrl,
      "POST",
      "/api/copilotkit/threads/" +
        encodeId(threadId, "Thread ID") +
        "/archive",
    ),
);

server.registerTool(
  "connect_restore_conversation",
  {
    title: "Restore an archived Connect conversation",
    description: "Unarchive a conversation owned by the current user.",
    inputSchema: { threadId: z.string().min(1).max(256) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ threadId }) =>
    request(
      baseUrl,
      "PATCH",
      "/api/copilotkit/threads/" + encodeId(threadId, "Thread ID"),
      { archived: false },
    ),
);
server.registerTool(
  "connect_computer_status",
  {
    title: "Check an agent computer",
    description: "Read the status of an agent's governed computer.",
    inputSchema: { agentId: z.string().min(1).max(256) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ agentId }) =>
    request(
      baseUrl,
      "GET",
      "/api/computers/" + encodeId(agentId, "Agent ID") + "/status",
    ),
);

server.registerTool(
  "connect_computer_read_page",
  {
    title: "Read an agent browser page",
    description: "Read text and page details from an agent's governed browser.",
    inputSchema: { agentId: z.string().min(1).max(256) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ agentId }) =>
    request(
      baseUrl,
      "GET",
      "/api/computers/" + encodeId(agentId, "Agent ID") + "/read",
    ),
);

server.registerTool(
  "connect_computer_snapshot",
  {
    title: "Inspect an agent browser page",
    description: "Get the interactive elements and snapshot ID needed for policy-checked click/type actions.",
    inputSchema: { agentId: z.string().min(1).max(256) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ agentId }) =>
    request(
      baseUrl,
      "POST",
      "/api/computers/" + encodeId(agentId, "Agent ID") + "/snapshot",
    ),
);

server.registerTool(
  "connect_computer_navigate",
  {
    title: "Navigate an agent browser",
    description: "Open a URL in the agent's governed browser. Connect checks navigation policy and destination safety.",
    inputSchema: {
      agentId: z.string().min(1).max(256),
      url: z.string().url(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ agentId, url }) =>
    request(
      baseUrl,
      "POST",
      "/api/computers/" + encodeId(agentId, "Agent ID") + "/navigate",
      { url },
    ),
);

server.registerTool(
  "connect_computer_click",
  {
    title: "Click an agent browser element",
    description: "Click an element from the latest browser snapshot. Connect applies the agent's action policy and records the action.",
    inputSchema: {
      agentId: z.string().min(1).max(256),
      ref: z.string().min(1).max(256),
      snapshotId: z.number().int(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ agentId, ref, snapshotId }) =>
    request(
      baseUrl,
      "POST",
      "/api/computers/" + encodeId(agentId, "Agent ID") + "/click",
      { ref, snapshotId },
    ),
);

server.registerTool(
  "connect_computer_type",
  {
    title: "Type into an agent browser field",
    description: "Type ordinary, non-secret text into an element from the latest browser snapshot. Do not pass passwords, payment details, API keys, or one-time codes; enter secrets through Connect's dedicated human secret flow. Connect applies the agent's action policy.",
    inputSchema: {
      agentId: z.string().min(1).max(256),
      ref: z.string().min(1).max(256),
      snapshotId: z.number().int(),
      text: z.string().max(10000),
      submit: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ agentId, ref, snapshotId, text, submit }) =>
    request(
      baseUrl,
      "POST",
      "/api/computers/" + encodeId(agentId, "Agent ID") + "/type",
      { ref, snapshotId, text, ...(submit ? { submit: true } : {}) },
    ),
);

server.registerTool(
  "connect_computer_press_key",
  {
    title: "Press a key in an agent browser",
    description: "Press a key on the agent's governed browser, directed at a reference from the latest snapshot. Connect applies the agent's action policy.",
    inputSchema: {
      agentId: z.string().min(1).max(256),
      ref: z.string().min(1).max(256),
      snapshotId: z.number().int(),
      key: z.string().min(1).max(40),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ agentId, ref, snapshotId, key }) =>
    request(
      baseUrl,
      "POST",
      "/api/computers/" + encodeId(agentId, "Agent ID") + "/key",
      { ref, snapshotId, key },
    ),
);

server.registerTool(
  "connect_computer_scroll",
  {
    title: "Scroll an agent browser page",
    description: "Scroll the agent's governed browser page. Connect applies the agent's action policy.",
    inputSchema: {
      agentId: z.string().min(1).max(256),
      deltaY: z.number().finite().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ agentId, deltaY }) =>
    request(
      baseUrl,
      "POST",
      "/api/computers/" + encodeId(agentId, "Agent ID") + "/scroll",
      deltaY === undefined ? {} : { deltaY },
    ),
);

server.registerTool(
  "connect_computer_control_status",
  {
    title: "Check browser control status",
    description: "Read whether a person or agent currently has control of this agent's browser.",
    inputSchema: { agentId: z.string().min(1).max(256) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ agentId }) =>
    request(
      baseUrl,
      "GET",
      "/api/computers/" + encodeId(agentId, "Agent ID") + "/control",
    ),
);

server.registerTool(
  "connect_computer_request_human",
  {
    title: "Ask for human browser control",
    description: "Request a person to take over the agent's browser.",
    inputSchema: {
      agentId: z.string().min(1).max(256),
      reason: z.string().max(500).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ agentId, reason }) =>
    request(
      baseUrl,
      "POST",
      "/api/computers/" + encodeId(agentId, "Agent ID") + "/control/request",
      reason ? { reason } : {},
    ),
);

server.registerTool(
  "connect_computer_take_control",
  {
    title: "Take control of an agent browser",
    description: "Take human control of the agent's browser through Connect's audited control handoff.",
    inputSchema: { agentId: z.string().min(1).max(256) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ agentId }) =>
    request(
      baseUrl,
      "POST",
      "/api/computers/" + encodeId(agentId, "Agent ID") + "/control/take",
    ),
);

server.registerTool(
  "connect_computer_release_control",
  {
    title: "Release control of an agent browser",
    description: "Release human control so the agent can continue.",
    inputSchema: { agentId: z.string().min(1).max(256) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ agentId }) =>
    request(
      baseUrl,
      "POST",
      "/api/computers/" + encodeId(agentId, "Agent ID") + "/control/release",
    ),
);
const transport = new StdioServerTransport();
await server.connect(transport);
