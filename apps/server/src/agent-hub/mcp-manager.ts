/**
 * Keeps one live MCP client per configured server (stdio, Streamable HTTP or SSE).
 *
 * stdio servers are started HIDDEN (windowsHide, no console window) by our own transport instead of
 * the SDK's StdioClientTransport, which does not hide its child on Windows. A process that stays
 * idle for IDLE_MS is stopped and restarted on the next call, so a per-agent browser does not sit in
 * memory all day.
 */
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { resultText } from "../plugins/mcp";
import { connectAgentsRoot, type ServerDefinition } from "./catalog";

const CONNECT_TIMEOUT_MS = 120_000;
const CALL_TIMEOUT_MS = 180_000;
const IDLE_MS = 20 * 60_000;

export type ListedTool = { name: string; description: string; inputSchema: Record<string, unknown> };
export type ServerStatus = {
  state: "connected" | "connecting" | "error" | "idle";
  error?: string;
  at: string;
  toolCount?: number;
};

/** A stdio transport that never opens a console window and kills the whole process tree on close. */
class HiddenStdioTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private child?: ChildProcess;
  private buffer = new ReadBuffer();
  stderrTail = "";

  constructor(
    private command: string,
    private args: string[],
    private env: Record<string, string>,
    private cwd: string,
  ) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, this.args, {
        cwd: this.cwd,
        env: this.env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        shell: false,
      });
      this.child = child;
      let started = false;
      child.on("error", (error) => {
        if (!started) reject(error);
        this.onerror?.(error);
      });
      child.on("spawn", () => {
        started = true;
        resolve();
      });
      child.on("close", () => {
        this.child = undefined;
        this.onclose?.();
      });
      child.stdout?.on("data", (chunk: Buffer) => {
        this.buffer.append(chunk);
        for (;;) {
          let message: JSONRPCMessage | null;
          try {
            message = this.buffer.readMessage();
          } catch (error) {
            this.onerror?.(error as Error);
            continue;
          }
          if (!message) break;
          this.onmessage?.(message);
        }
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        this.stderrTail = (this.stderrTail + chunk.toString("utf8")).slice(-4000);
      });
      child.stdin?.on("error", (error) => this.onerror?.(error));
    });
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      const stdin = this.child?.stdin;
      if (!stdin) return reject(new Error("MCP-Prozess läuft nicht."));
      stdin.write(serializeMessage(message), (error) => (error ? reject(error) : resolve()));
    });
  }

  async close(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    if (!child?.pid) return;
    if (process.platform === "win32") {
      await new Promise<void>((resolve) => {
        execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, () => resolve());
      });
    } else {
      child.kill("SIGTERM");
    }
  }
}

function findOnPath(executable: string): string | null {
  const dirs = (process.env.PATH ?? process.env.Path ?? "").split(path.delimiter).filter(Boolean);
  const names = process.platform === "win32" ? [`${executable}.exe`, `${executable}.cmd`, executable] : [executable];
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function nodeExecutable(): string {
  return process.env.CONNECT_NODE_BIN || findOnPath("node") || "node";
}

export function mcpPackagesDir(): string {
  return path.join(connectAgentsRoot(), "mcp");
}

/** node + the package's entry when installed locally, otherwise `npx -y <pkg>` (hidden). */
export function stdioCommand(definition: ServerDefinition): { command: string; args: string[] } {
  const extra = definition.args ?? [];
  if (definition.pkg) {
    const pkgDir = path.join(mcpPackagesDir(), "node_modules", ...definition.pkg.split("/"));
    let entry = definition.bin ? path.join(pkgDir, definition.bin) : "";
    if ((!entry || !existsSync(entry)) && existsSync(path.join(pkgDir, "package.json"))) {
      try {
        const manifest = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")) as { bin?: string | Record<string, string> };
        const bin = typeof manifest.bin === "string" ? manifest.bin : Object.values(manifest.bin ?? {})[0];
        if (bin) entry = path.join(pkgDir, bin);
      } catch {}
    }
    if (entry && existsSync(entry)) return { command: nodeExecutable(), args: [entry, ...extra] };
    return wrapForWindows("npx", ["-y", definition.pkg, ...extra]);
  }
  return wrapForWindows(definition.command ?? "", extra);
}

function wrapForWindows(command: string, args: string[]) {
  if (process.platform !== "win32") return { command, args };
  const resolved = /[\\/]/.test(command) ? command : (findOnPath(command) ?? command);
  if (/\.(cmd|bat)$/i.test(resolved) || !/\.exe$/i.test(resolved)) {
    return { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", command, ...args] };
  }
  return { command: resolved, args };
}

type Live = {
  client: Client;
  transport: Transport;
  tools: ListedTool[];
  lastUsed: number;
  idleTimer?: ReturnType<typeof setInterval>;
};

export type ResolvedSecrets = { env: Record<string, string>; headers: Record<string, string> };

export class McpManager {
  private live = new Map<string, Live>();
  private pending = new Map<string, Promise<Live>>();
  private statuses = new Map<string, ServerStatus>();

  constructor(
    private resolveSecrets: (definition: ServerDefinition) => Promise<ResolvedSecrets>,
    private onState: (id: string, state: { tools?: ListedTool[]; status: ServerStatus }) => Promise<void>,
  ) {
    process.once("exit", () => {
      for (const live of this.live.values()) void live.transport.close().catch(() => {});
    });
  }

  status(id: string): ServerStatus | undefined {
    return this.statuses.get(id);
  }

  isLive(id: string) {
    return this.live.has(id);
  }

  private setStatus(id: string, status: ServerStatus, tools?: ListedTool[]) {
    this.statuses.set(id, status);
    void this.onState(id, { status, ...(tools ? { tools } : {}) }).catch(() => {});
  }

  async connect(definition: ServerDefinition): Promise<ListedTool[]> {
    const live = await this.ensure(definition);
    return live.tools;
  }

  private ensure(definition: ServerDefinition): Promise<Live> {
    const existing = this.live.get(definition.id);
    if (existing) return Promise.resolve(existing);
    const inflight = this.pending.get(definition.id);
    if (inflight) return inflight;
    const promise = this.open(definition).finally(() => this.pending.delete(definition.id));
    this.pending.set(definition.id, promise);
    return promise;
  }

  private async open(definition: ServerDefinition): Promise<Live> {
    this.setStatus(definition.id, { state: "connecting", at: new Date().toISOString() });
    const secrets = await this.resolveSecrets(definition);
    let transport: Transport;
    let stdio: HiddenStdioTransport | undefined;
    if (definition.transport === "stdio") {
      const { command, args } = stdioCommand(definition);
      if (!command) throw new Error("Kein Befehl für diesen Server.");
      const cwd = mcpPackagesDir();
      mkdirSync(cwd, { recursive: true });
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) if (typeof value === "string") env[key] = value;
      // The Connect server's own secrets never reach a third-party process.
      for (const key of Object.keys(env)) {
        if (/^(KEY_ENCRYPTION_KEY|DATABASE_URL|CONNECT_APP_DB_PASSWORD|WORKER_SHARED_SECRET|INTELLIGENCE_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|COMPUTER_TOKEN|SUPERVISOR_TOKEN|MANAGED_AGENT_TOKEN|AGENT_TOOL_TOKEN|BETTER_AUTH_SECRET)$/i.test(key)) {
          delete env[key];
        }
      }
      Object.assign(env, definition.env ?? {}, secrets.env);
      stdio = new HiddenStdioTransport(command, args, env, cwd);
      transport = stdio;
    } else {
      const url = new URL(definition.url ?? "");
      const headers = { ...(definition.headers ?? {}), ...secrets.headers };
      transport =
        definition.transport === "sse"
          ? new SSEClientTransport(url, { requestInit: { headers }, eventSourceInit: { fetch: (input, init) => fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), ...headers } }) } })
          : new StreamableHTTPClientTransport(url, { requestInit: { headers } });
    }
    const client = new Client({ name: "connect-hermes", version: "1.0.0" });
    try {
      await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, "Verbindung dauert zu lange");
      const tools = await listAllTools(client);
      const live: Live = { client, transport, tools, lastUsed: Date.now() };
      transport.onclose = () => {
        if (this.live.get(definition.id) === live) {
          this.live.delete(definition.id);
          if (live.idleTimer) clearInterval(live.idleTimer);
          this.setStatus(definition.id, { state: "idle", at: new Date().toISOString(), toolCount: tools.length });
        }
      };
      if (definition.transport === "stdio") {
        live.idleTimer = setInterval(() => {
          if (Date.now() - live.lastUsed > IDLE_MS) void this.disconnect(definition.id);
        }, 60_000);
        (live.idleTimer as { unref?: () => void }).unref?.();
      }
      this.live.set(definition.id, live);
      this.setStatus(definition.id, { state: "connected", at: new Date().toISOString(), toolCount: tools.length }, tools);
      return live;
    } catch (error) {
      const detail = stdio?.stderrTail.trim().split(/\r?\n/).slice(-3).join(" | ");
      const message = `${errorText(error)}${detail ? ` (${detail.slice(0, 400)})` : ""}`;
      await transport.close().catch(() => {});
      this.setStatus(definition.id, { state: "error", error: message, at: new Date().toISOString() });
      throw new Error(message);
    }
  }

  async disconnect(id: string): Promise<void> {
    const live = this.live.get(id);
    this.live.delete(id);
    if (!live) return;
    if (live.idleTimer) clearInterval(live.idleTimer);
    await live.client.close().catch(() => {});
    await live.transport.close().catch(() => {});
    this.setStatus(id, { state: "idle", at: new Date().toISOString(), toolCount: live.tools.length });
  }

  async call(definition: ServerDefinition, tool: string, args: unknown): Promise<{ text: string; isError: boolean }> {
    const live = await this.ensure(definition);
    live.lastUsed = Date.now();
    try {
      const result = (await withTimeout(
        live.client.callTool({ name: tool, arguments: (args ?? {}) as Record<string, unknown> }, undefined, { timeout: CALL_TIMEOUT_MS }),
        CALL_TIMEOUT_MS + 5_000,
        "Werkzeug antwortet nicht",
      )) as { content?: unknown; structuredContent?: unknown; isError?: boolean };
      live.lastUsed = Date.now();
      return { text: resultText(result.content, result.structuredContent).text, isError: result.isError === true };
    } catch (error) {
      // A dead process or session: drop it so the next call starts fresh.
      if (!this.live.has(definition.id) || /closed|EPIPE|not running|läuft nicht|ECONNRESET/i.test(errorText(error))) {
        await this.disconnect(definition.id).catch(() => {});
      }
      throw error;
    }
  }
}

async function listAllTools(client: Client): Promise<ListedTool[]> {
  const tools: ListedTool[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const result = await withTimeout(client.listTools(cursor ? { cursor } : undefined), 60_000, "Werkzeugliste dauert zu lange");
    for (const tool of result.tools) {
      tools.push({
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: (tool.inputSchema ?? { type: "object" }) as Record<string, unknown>,
      });
    }
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  return tools;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} (${Math.round(ms / 1000)} s).`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
