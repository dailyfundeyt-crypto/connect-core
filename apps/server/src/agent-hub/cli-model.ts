/**
 * CLI-Login-Anbieter für Connect-Agenten (Codex über ChatGPT-Login, Claude über Claude-Login).
 *
 * Die Anbieter-CLI läuft unsichtbar im Hintergrund (kein Fenster, keine Shell), der Prompt geht über
 * stdin, die Antwort kommt als JSON-Lines zurück. Der Login bleibt komplett bei der CLI: Connect
 * liest keine Token-Dateien, es fragt höchstens `codex login status` / `claude auth status` ab.
 *
 * Nach außen ist das ein normales AI-SDK-Modell (LanguageModelV2), deshalb bleiben Chat-UI,
 * Chat-Speicher und Abgleich unverändert.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type CliKind = "codex" | "claude";

export const CLI_MODELS: Record<CliKind, string[]> = {
  codex: ["gpt-5.5", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-6-luna"],
  claude: ["sonnet", "opus", "haiku"],
};

const CLI_PACKAGES: Record<CliKind, { pkg: string; bin: string; label: string }> = {
  codex: { pkg: "@openai/codex", bin: "bin/codex.js", label: "Codex (ChatGPT-Login)" },
  claude: { pkg: "@anthropic-ai/claude-code", bin: "cli.js", label: "Claude (Claude-Login)" },
};

const MODEL_NAME = /^[A-Za-z0-9._:\-/]{1,64}$/;
const RUN_TIMEOUT_MS = 10 * 60_000;

function npmGlobalRoots(): string[] {
  const roots: string[] = [];
  if (process.env.APPDATA) roots.push(join(process.env.APPDATA, "npm", "node_modules"));
  if (process.env.npm_config_prefix) roots.push(join(process.env.npm_config_prefix, "node_modules"));
  roots.push(join(homedir(), ".npm-global", "lib", "node_modules"), "/usr/local/lib/node_modules", "/usr/lib/node_modules");
  return roots;
}

/** Path of the CLI's JS entry, or null when it is not installed. */
export function cliEntry(kind: CliKind): string | null {
  const { pkg, bin } = CLI_PACKAGES[kind];
  for (const root of npmGlobalRoots()) {
    const candidate = join(root, ...pkg.split("/"), ...bin.split("/"));
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function nodeBinary(): string {
  const fixed = process.platform === "win32" ? "C:\\Program Files\\nodejs\\node.exe" : "/usr/bin/node";
  return existsSync(fixed) ? fixed : "node";
}

/** Child env without Connect's own secrets, so the CLI uses the person's login and nothing leaks. */
function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  const secret = /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|DATABASE_URL|COOKIE|CREDENTIAL)/i;
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (secret.test(name)) continue;
    // A redirected Claude/OpenAI endpoint (e.g. a local model server) must not hijack the account login.
    if (/^(ANTHROPIC_|OPENAI_|CLAUDE_CODE_USE_)/i.test(name)) continue;
    env[name] = value;
  }
  env.NO_COLOR = "1";
  return env;
}

export function agentWorkdir(agentId: string): string {
  const base = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ConnectApp", "cli-agents") : join(homedir(), ".connect-app", "cli-agents");
  const dir = join(base, agentId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "agent");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function killTree(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } catch {
      child.kill();
    }
  } else child.kill("SIGTERM");
}

type CliEvent = { text?: string; error?: string; usage?: { input: number; output: number }; fatal?: boolean };

function argsFor(kind: CliKind, model: string, cwd: string, allowWrite: boolean): string[] {
  if (kind === "codex") {
    return ["exec", "--json", "--skip-git-repo-check", "--ignore-user-config", "--color", "never", "--sandbox", allowWrite ? "workspace-write" : "read-only", "-m", model, "-C", cwd, "-"];
  }
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--model",
    model,
    "--allowedTools",
    allowWrite ? "Read Glob Grep WebFetch WebSearch Edit Write" : "Read Glob Grep WebFetch WebSearch",
  ];
}

/** Translate one JSON line of the CLI into what the chat needs. */
function parseLine(kind: CliKind, line: string, state: { sawDelta: boolean; retries: number }): CliEvent | null {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (kind === "codex") {
    const item = event.item as { type?: string; text?: string } | undefined;
    if (event.type === "item.completed" && item?.type === "agent_message" && item.text) return { text: item.text };
    if (event.type === "turn.completed") {
      const u = event.usage as { input_tokens?: number; output_tokens?: number } | undefined;
      return { usage: { input: u?.input_tokens ?? 0, output: u?.output_tokens ?? 0 } };
    }
    if (event.type === "turn.failed" || event.type === "error") {
      const raw = (event.error as { message?: string } | undefined)?.message ?? (event.message as string | undefined) ?? "Codex-Fehler";
      let message = raw;
      try {
        message = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? raw;
      } catch {}
      return { error: message, fatal: event.type === "turn.failed" };
    }
    return null;
  }
  // claude stream-json
  if (event.type === "stream_event") {
    const inner = event.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
    if (inner?.type === "content_block_delta" && inner.delta?.type === "text_delta" && inner.delta.text) {
      state.sawDelta = true;
      return { text: inner.delta.text };
    }
    return null;
  }
  if (event.type === "system" && event.subtype === "api_retry") {
    state.retries += 1;
    if (state.retries >= 3) return { error: "Claude erreicht seinen Server nicht (mehrere Fehlversuche). Meist hilft: Claude Code aktualisieren mit `npm i -g @anthropic-ai/claude-code@latest`, dann `claude auth login`.", fatal: true };
    return null;
  }
  if (event.type === "result") {
    const u = event.usage as { input_tokens?: number; output_tokens?: number } | undefined;
    const usage = { input: u?.input_tokens ?? 0, output: u?.output_tokens ?? 0 };
    if (event.is_error) return { error: String(event.result ?? "Claude-Fehler"), usage, fatal: true };
    return { ...(state.sawDelta ? {} : { text: String(event.result ?? "") }), usage };
  }
  return null;
}

export type CliRunOptions = { kind: CliKind; model: string; agentId: string; prompt: string; allowWrite?: boolean; signal?: AbortSignal };

/** Runs the CLI once and yields text pieces as they come. Throws with a readable German message. */
export async function* runCli(options: CliRunOptions): AsyncGenerator<CliEvent> {
  const entry = cliEntry(options.kind);
  const label = CLI_PACKAGES[options.kind].label;
  if (!entry) throw new Error(`${label}: Die CLI ist auf diesem PC nicht installiert (npm i -g ${CLI_PACKAGES[options.kind].pkg}).`);
  if (!MODEL_NAME.test(options.model)) throw new Error(`${label}: Ungültiger Modellname.`);
  const cwd = agentWorkdir(options.agentId);
  const child = spawn(nodeBinary(), [entry, ...argsFor(options.kind, options.model, cwd, !!options.allowWrite)], {
    cwd,
    env: childEnv(),
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const queue: CliEvent[] = [];
  let wake: (() => void) | null = null;
  let done = false;
  let stderr = "";
  let buffer = "";
  const state = { sawDelta: false, retries: 0 };
  const push = (event: CliEvent) => {
    queue.push(event);
    wake?.();
  };
  const finish = () => {
    done = true;
    wake?.();
  };
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    buffer += chunk;
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) {
        const event = parseLine(options.kind, line, state);
        if (event) {
          push(event);
          if (event.fatal) killTree(child);
        }
      }
      index = buffer.indexOf("\n");
    }
  });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  child.on("error", (error) => {
    push({ error: `${label} ließ sich nicht starten: ${error.message}`, fatal: true });
    finish();
  });
  child.on("close", () => {
    const rest = buffer.trim();
    if (rest) {
      const event = parseLine(options.kind, rest, state);
      if (event) push(event);
    }
    finish();
  });
  const timer = setTimeout(() => {
    push({ error: `${label}: Zeitlimit erreicht (10 Minuten).`, fatal: true });
    killTree(child);
  }, RUN_TIMEOUT_MS);
  const onAbort = () => killTree(child);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  child.stdin?.end(options.prompt, "utf8");

  let produced = false;
  let lastError: string | null = null;
  try {
    while (true) {
      if (queue.length === 0) {
        if (done) break;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = null;
        continue;
      }
      const event = queue.shift()!;
      if (event.text) produced = true;
      if (event.error) {
        lastError = event.error;
        if (event.fatal) break;
        continue;
      }
      yield event;
    }
    if (options.signal?.aborted) return;
    if (lastError && !produced) throw new Error(`${label}: ${lastError}`);
    if (!produced) {
      const hint = /not logged in|login|unauthor|401/i.test(stderr) ? " Bitte unter Einstellungen › Anbieter neu anmelden." : "";
      throw new Error(`${label}: keine Antwort erhalten.${hint}${stderr ? ` (${stderr.trim().split("\n").slice(-2).join(" ").slice(0, 300)})` : ""}`);
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
    killTree(child);
  }
}

// ------------------------------------------------------------------ prompt flattening
// Lives in cli-prompt.ts (no Node imports) so the phone bridge on Vercel can share it.
import { flattenPrompt, type PromptMessage } from "./cli-prompt";
export { flattenPrompt };

// ------------------------------------------------------------------ AI SDK model (LanguageModelV2)

type CallOptions = { prompt: PromptMessage[]; abortSignal?: AbortSignal };

export function createCliModel(input: { kind: CliKind; model: string; agentId: string; allowWrite?: boolean }) {
  const provider = `${input.kind}-cli`;
  const usageOf = (u?: { input: number; output: number }) => ({
    inputTokens: u?.input,
    outputTokens: u?.output,
    totalTokens: u ? u.input + u.output : undefined,
  });
  return {
    specificationVersion: "v2" as const,
    provider,
    modelId: input.model,
    supportedUrls: {},
    async doGenerate(options: CallOptions) {
      let text = "";
      let usage: { input: number; output: number } | undefined;
      for await (const event of runCli({ ...input, prompt: flattenPrompt(options.prompt), ...(options.abortSignal ? { signal: options.abortSignal } : {}) })) {
        if (event.text) text += event.text;
        if (event.usage) usage = event.usage;
      }
      return { content: [{ type: "text" as const, text }], finishReason: "stop" as const, usage: usageOf(usage), warnings: [] };
    },
    async doStream(options: CallOptions) {
      const prompt = flattenPrompt(options.prompt);
      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          const id = "txt-0";
          let opened = false;
          let usage: { input: number; output: number } | undefined;
          try {
            for await (const event of runCli({ ...input, prompt, ...(options.abortSignal ? { signal: options.abortSignal } : {}) })) {
              if (event.usage) usage = event.usage;
              if (!event.text) continue;
              if (!opened) {
                controller.enqueue({ type: "text-start", id });
                opened = true;
              }
              controller.enqueue({ type: "text-delta", id, delta: event.text });
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!opened) {
              controller.enqueue({ type: "text-start", id });
              opened = true;
            }
            controller.enqueue({ type: "text-delta", id, delta: `\n\n⚠️ ${message}` });
          }
          if (opened) controller.enqueue({ type: "text-end", id });
          controller.enqueue({ type: "finish", finishReason: "stop", usage: usageOf(usage) });
          controller.close();
        },
      });
      return { stream };
    },
  };
}

// ------------------------------------------------------------------ status + login (auth bridge)

function runQuick(kind: CliKind, args: string[], timeoutMs = 15_000): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const entry = cliEntry(kind);
    if (!entry) return resolve({ code: null, out: "" });
    const child = spawn(nodeBinary(), [entry, ...args], { env: childEnv(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout?.on("data", (c) => {
      out += String(c);
    });
    child.stderr?.on("data", (c) => {
      out += String(c);
    });
    const timer = setTimeout(() => killTree(child), timeoutMs);
    child.on("error", () => resolve({ code: null, out }));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out: out.slice(0, 4000) });
    });
  });
}

export type CliStatus = { kind: CliKind; label: string; installed: boolean; version: string | null; loggedIn: boolean | null; detail: string; models: string[] };

export async function cliStatus(kind: CliKind): Promise<CliStatus> {
  const label = CLI_PACKAGES[kind].label;
  const base = { kind, label, models: CLI_MODELS[kind] };
  if (!cliEntry(kind)) return { ...base, installed: false, version: null, loggedIn: null, detail: `Nicht installiert (npm i -g ${CLI_PACKAGES[kind].pkg}).` };
  const version = (await runQuick(kind, ["--version"])).out.trim().split("\n")[0] || null;
  if (kind === "codex") {
    const status = await runQuick(kind, ["login", "status"]);
    const loggedIn = status.code === 0 && /logged in/i.test(status.out);
    return { ...base, installed: true, version, loggedIn, detail: status.out.trim().split("\n").pop() ?? "" };
  }
  const status = await runQuick(kind, ["auth", "status"]);
  let loggedIn: boolean | null = null;
  try {
    loggedIn = Boolean((JSON.parse(status.out) as { loggedIn?: boolean }).loggedIn);
  } catch {
    loggedIn = status.code === 0 ? null : false;
  }
  return { ...base, installed: true, version, loggedIn, detail: loggedIn ? "Angemeldet" : "Nicht angemeldet" };
}

/** Starts the CLI's own browser login in the background. The CLI opens the provider page itself. */
export function startCliLogin(kind: CliKind): { started: boolean; message: string } {
  const entry = cliEntry(kind);
  if (!entry) return { started: false, message: "CLI nicht installiert." };
  const args = kind === "codex" ? ["login"] : ["auth", "login"];
  const child = spawn(nodeBinary(), [entry, ...args], { env: childEnv(), windowsHide: true, stdio: "ignore", detached: false });
  setTimeout(() => killTree(child), 5 * 60_000);
  child.on("error", () => {});
  return { started: true, message: "Anmeldung gestartet. Bitte im Browser bestätigen." };
}

export function isCliKind(value: string): value is CliKind {
  return value === "codex" || value === "claude";
}
