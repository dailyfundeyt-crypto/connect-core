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

export type CliKind = "codex" | "claude" | "antigravity";

/**
 * Modelle, die jeder Provider nativ anbietet. "Browser-Use" ist kein
 * separates Modell, sondern ein Tool-Flag auf der CLI — Antigravity z.B.
 * hat ein eingebautes Browser-Tool, das im non-interactive-Mode aktiv ist,
 * sobald der Prompt es braucht. Wir listen hier nur die Modellnamen, die
 * wir per `--model` durchreichen.
 */
export const CLI_MODELS: Record<CliKind, string[]> = {
  codex: ["gpt-5.5", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-6-luna"],
  claude: ["sonnet", "opus", "haiku"],
  /**
   * Stand 2026-10: Antigravity listet seine Modelle intern in einer
   * `agy models`-Ausgabe. Wir nehmen die dokumentierten Namen plus einen
   * „auto"-Eintrag, der `--model` weg lässt und die Default-Auswahl der
   * CLI nimmt — beides ist im MCP-Tool-Kontext wichtig, weil der User
   * den Provider konfiguriert, ohne jedes Mal die Modelliste zu pflegen.
   */
  antigravity: [
    "auto",
    "gemini-3.8-flash-high",
    "gemini-3.8-flash-medium",
    "gemini-3.8-flash-low",
    "gemini-3.7-flash-high",
    "gemini-3.7-flash-medium",
    "gemini-3.7-flash-low",
    "gemini-3.1-pro-high",
    "gemini-3.1-pro-low",
  ],
};

/**
 * Wie der Provider aufgerufen wird:
 *   - `pkg` ist der npm-Package-Name (für die Installations-Hinweise)
 *   - `bin` ist der Pfad *relativ* zum Package-Root, also `bin/foo.js`
 *   - `label` ist der UI-Text in den Settings
 *   - `binary` ist der Name, mit dem die CLI im PATH aufgerufen wird,
 *     also `agy` für Antigravity (kein node-Wrapper)
 *
 * Antigravity hat ein **eingebautes Browser-Tool** (siehe Codelab
 * "tool calling, and conversation history" + Settings "Tool Permission"):
 * der Agent kann von sich aus Webseiten öffnen, klicken, Formulare
 * ausfüllen. Das ist die „browser-use"-Anbindung, die der User in dieser
 * Stufe mit-antigravity möchte — kein zusätzliches Paket nötig, einfach
 * `agy -p "..."` aufrufen, der Agent klickt selbst.
 */
const CLI_PACKAGES: Record<CliKind, { pkg: string; bin: string; label: string; binary: string }> = {
  codex: { pkg: "@openai/codex", bin: "bin/codex.js", label: "Codex (ChatGPT-Login)", binary: "codex" },
  claude: { pkg: "@anthropic-ai/claude-code", bin: "cli.js", label: "Claude (Claude-Login)", binary: "claude" },
  /**
   * Antigravity wird nicht über npm-global installiert (es ist ein
   * Go-Binary), aber wir listen den npm-Namen `@google/antigravity-cli`
   * als Fallback-Hinweis. Den eigentlichen Pfad suchen wir in den
   * plattformspezifischen `antigravityRoots()` weiter unten.
   */
  antigravity: { pkg: "@google/antigravity-cli", bin: "bin/agy.js", label: "Antigravity (Google-OAuth)", binary: "agy" },
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

/**
 * Wo Antigravity (`agy`) standardmäßig landet.
 *
 * Auf Windows installiert das PowerShell-Skript nach
 * `%LOCALAPPDATA%\agy\bin\agy.exe`, auf Unix nach `~/.local/bin/agy`. Wir
 * suchen beide — wenn `agy` zusätzlich im PATH ist, greift der
 * `PATH`-Lookup unten, der in `cliEntry` als Fallback läuft.
 */
function antigravityRoots(): string[] {
  const roots: string[] = [];
  if (process.env.LOCALAPPDATA) {
    roots.push(join(process.env.LOCALAPPDATA, "agy", "bin"));
  }
  if (process.platform !== "win32") {
    roots.push(join(homedir(), ".local", "bin"));
  }
  // Falls die CLI über npm installiert wurde, landet sie wie Codex/Claude.
  roots.push(...npmGlobalRoots().map((root) => root.replace(/node_modules$/, "")));
  return roots;
}

/**
 * Pfad zum ausführbaren CLI, oder `null` wenn nicht installiert.
 *
 * Codex & Claude sind Node-Skripte unter `node_modules/<pkg>/...`, also
 * suchen wir im npm-Global-Root. Antigravity ist ein Go-Binary und liegt
 * unter `antigravityRoots()` (oder ist im PATH — siehe Fallback).
 */
export function cliEntry(kind: CliKind): string | null {
  if (kind === "antigravity") {
    const exe = process.platform === "win32" ? "agy.exe" : "agy";
    for (const root of antigravityRoots()) {
      const candidate = join(root, exe);
      if (existsSync(candidate)) return candidate;
    }
    // Fallback: PATH-Lookup. Wir vertrauen darauf, dass der Installer
    // den Pfad gesetzt hat, und fragen das OS.
    return exe;
  }
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

/**
 * CLI-Args pro Provider.
 *
 * Antigravity hat ein **eingebautes Browser-Tool** (siehe Codelab
 * "Tool calling"): sobald der Prompt Web-Aktionen braucht, klickt die
 * CLI selbst. Wir setzen deshalb `--dangerously-skip-permissions` nicht —
 * der User hat die Tool-Permission in seinen Antigravity-Settings eh auf
 * `request-review` (oder einen anderen Wert) gesetzt, und das respektieren
 * wir. Nur wenn `allowWrite` aktiv ist, geben wir der CLI den Freiraum
 * für File-Operations; sonst bleibt sie read-only.
 *
 * Browser-Use heißt bei Antigravity also: einfach den Prompt losschicken,
 * die CLI kümmert sich. Das `--sandbox`-Flag existiert bei Antigravity
 * nicht — die Sandbox-Auswahl läuft über `agy --sandbox on|off`. Wir
 * lassen es weg und übergeben das Verzeichnis via `-C`.
 */
function argsFor(kind: CliKind, model: string, cwd: string, allowWrite: boolean, prompt: string): string[] {
  if (kind === "codex") {
    return ["exec", "--json", "--skip-git-repo-check", "--ignore-user-config", "--color", "never", "--sandbox", allowWrite ? "workspace-write" : "read-only", "-m", model, "-C", cwd, "-"];
  }
  if (kind === "claude") {
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
  // antigravity: `-p` braucht zwingend ein Argument direkt danach
  // (agy bricht sonst mit "flag needs an argument: -p" ab). Wir bauen
  // deshalb `-p` und den Prompt als zusammenhängendes Paar ein. **Wichtig:**
  // `-p` darf **nicht** am Anfang stehen, weil agy das nächste Argument
  // als Prompt-Text interpretiert — und das ist `--output-format`, was
  // agy dann als Prompt-String verschluckt (Bug in einer früheren Version).
  //
  // Reihenfolge: alle Flags zuerst, `-p <prompt>` als Letztes. Der Prompt
  // wird **nicht** über stdin gegeben — agy will ihn als Argument.
  //
  // Antigravity hat KEIN `--no-color`-Flag und KEIN `-C`-Flag (cwd wird
  // via `--add-dir` oder schlicht via `cwd` des Prozesses gesetzt). Wir
  // nutzen den `cwd`-Parameter von `spawn()` für das Arbeitsverzeichnis
  // und übergeben keine Flags, die agy nicht kennt.
  //
  // Für Write-Tasks setzen wir `--dangerously-skip-permissions` (agy
  // hat keinen `--sandbox`-Toggle für `-p`-Mode; das `--sandbox`-Flag
  // existiert zwar, ist aber für interaktive Sessions).
  const args = [
    "--output-format",
    "stream-json",
  ];
  if (allowWrite) {
    args.push("--dangerously-skip-permissions");
  }
  args.push("-p", prompt);
  return args;
}

/** Translate one JSON line of the CLI into what the chat needs. */
function parseLine(kind: CliKind, line: string, state: { sawDelta: boolean; retries: number }): CliEvent | null {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (kind === "antigravity") {
    return parseAntigravityLine(event, state);
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

/**
 * Antigravity-Stream-JSON unterscheidet sich von Claude/Codex:
 *   - `event: "step_update"` mit `step_type: "agent_response"` und
 *     `text_delta` enthält das, was der Agent sagt
 *   - `event: "init"` zeigt zu Beginn die verfügbaren Tools (interessant
 *     für die UI als Hinweis, dass Browser-Use verfügbar ist)
 *   - `event: "result"` ist die Schluss-Nachricht mit `response` und
 *     `usage` (input_tokens, output_tokens, thinking_tokens, …)
 *
 * Wir halten uns an das, was die Doku verspricht, und fallen auf
 * `{ text: roher JSON }` zurück, wenn das Format mal nicht passt.
 */
function parseAntigravityLine(event: Record<string, unknown>, state: { sawDelta: boolean; retries: number }): CliEvent | null {
  // Antigravity-Output hat `event: "..."` als Top-Level, nicht `type: "..."`.
  // Wir akzeptieren beides, falls eine ältere CLI-Version noch das alte
  // Format liefert.
  const type = (event.event ?? event.type) as string | undefined;
  // Init-Event: Tools-Liste. Wir geben einen kurzen Hinweis zurück, der
  // in der Stream-UI angezeigt werden kann.
  if (type === "init") {
    const init = event.init as { tools?: string[]; permission_mode?: string } | undefined;
    const tools = Array.isArray(init?.tools) ? init.tools : [];
    if (tools.length > 0) {
      const browserTools = tools.filter((t) => t.startsWith("browser_") || t === "open_browser_url" || t === "click_browser_pixel" || t === "capture_browser_screenshot" || t === "read_browser_page");
      const note = browserTools.length > 0
        ? `\n[Antigravity bereit — Browser-Tools: ${browserTools.length}]\n`
        : `\n[Antigravity bereit — ${tools.length} Tools]\n`;
      return { text: note };
    }
    return null;
  }
  // step_update mit agent_response → Text-Delta
  if (type === "step_update") {
    const step = event.step_update as { step_type?: string; text_delta?: string; state?: string } | undefined;
    if (step?.step_type === "agent_response" && step.text_delta) {
      state.sawDelta = true;
      return { text: step.text_delta };
    }
    // Step-Wechsel: kurze Markierung
    if (step?.step_type === "user_input" && step.state === "DONE") {
      return null;
    }
    if (step?.step_type === "agent_response" && step.state === "ACTIVE" && !step.text_delta) {
      // Agent beginnt zu antworten
      return null;
    }
    return null;
  }
  // Modell-Retry
  if (type === "system" && event.subtype === "api_retry") {
    state.retries += 1;
    if (state.retries >= 3) {
      return {
        error: "Antigravity erreicht seinen Server nicht (mehrere Fehlversuche). Meist hilft: `agy --version` prüfen, dann `agy` einmalig neu anmelden.",
        fatal: true,
      };
    }
    return null;
  }
  // Auth-Fehler / fatal
  if (type === "error" || type === "result" && event.is_error) {
    const message = String(event.error ?? event.message ?? event.result ?? "Antigravity-Fehler");
    if (/not signed in|unauthor|login|401/i.test(message)) {
      return {
        error: "Antigravity ist nicht angemeldet. Bitte unter Einstellungen › Anbieter › Antigravity neu anmelden.",
        fatal: true,
      };
    }
    return { error: message, fatal: true };
  }
  // Schluss-Event mit Response + Usage
  if (type === "result" || type === "done" || type === "complete") {
    const result = (event.result ?? event) as {
      response?: string;
      usage?: { input_tokens?: number; output_tokens?: number; thinking_tokens?: number; total_tokens?: number };
      duration_seconds?: number;
      num_turns?: number;
    };
    const u = result.usage;
    const usage = u
      ? {
          input: u.input_tokens ?? 0,
          output: (u.output_tokens ?? 0) + (u.thinking_tokens ?? 0),
        }
      : undefined;
    // Wenn der Stream schon Deltas geliefert hat, ist response nur ein
    // Wiederhol-Confirm. Sonst schicken wir den response-Text.
    if (!state.sawDelta && typeof result.response === "string" && result.response) {
      state.sawDelta = true;
      return { text: result.response, ...(usage ? { usage } : {}) };
    }
    return usage ? { usage } : null;
  }
  return null;
}

export type CliRunOptions = { kind: CliKind; model: string; agentId: string; prompt: string; allowWrite?: boolean; signal?: AbortSignal };

/** Runs the CLI once and yields text pieces as they come. Throws with a readable German message. */
export async function* runCli(options: CliRunOptions): AsyncGenerator<CliEvent> {
  const entry = cliEntry(options.kind);
  const label = CLI_PACKAGES[options.kind].label;
  if (!entry) throw new Error(`${label}: Die CLI ist auf diesem PC nicht installiert (npm i -g ${CLI_PACKAGES[options.kind].pkg}).`);
  // "auto" ist ein magischer Modellname bei Antigravity — wir lassen das
  // Original durch, weil die Regex ihn durchlässt (Buchstaben+Zahlen+Punkt).
  if (options.kind !== "antigravity" && !MODEL_NAME.test(options.model)) {
    throw new Error(`${label}: Ungültiger Modellname.`);
  }
  if (options.kind === "antigravity" && options.model !== "auto") {
    // Antigravity-Modellnamen können Leerzeichen enthalten („Gemini 3.7
    // Flash (Low)"). Wir validieren hier nur, dass was Sinnvolles drin ist.
    if (options.model.length === 0 || options.model.length > 80) {
      throw new Error(`${label}: Ungültiger Modellname.`);
    }
  }
  const cwd = agentWorkdir(options.agentId);
  const args = argsFor(options.kind, options.model, cwd, !!options.allowWrite, options.prompt);
  // Antigravity ist ein Go-Binary und wird direkt aufgerufen; Codex und
  // Claude sind Node-Skripte, also läuft das über `node entry.js`.
  const cmd = options.kind === "antigravity" ? entry : nodeBinary();
  const cmdArgs = options.kind === "antigravity" ? args : [entry, ...args];
  const child = spawn(cmd, cmdArgs, {
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
  // Antigravity bekommt den Prompt als `-p "<prompt>"`-Argument; Codex und
  // Claude lesen ihn aus stdin. Stdin für Antigravity schließen wir
  // sofort, damit agy nicht auf eine EOF wartet.
  if (options.kind === "antigravity") {
    child.stdin?.end();
  } else {
    child.stdin?.end(options.prompt, "utf8");
  }

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
    const cmd = kind === "antigravity" ? entry : nodeBinary();
    const cmdArgs = kind === "antigravity" ? args : [entry, ...args];
    const child = spawn(cmd, cmdArgs, { env: childEnv(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
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
  if (!cliEntry(kind)) {
    // Antigravity hat eine andere Installations-Anleitung als die
    // npm-Pakete — der Installer ist plattformspezifisch.
    const hint = kind === "antigravity"
      ? "Antigravity ist auf diesem PC nicht installiert. Installiere es mit `irm https://antigravity.google/cli/install.ps1 | iex` (Windows) bzw. `curl -fsSL https://antigravity.google/cli/install.sh | bash` (Unix)."
      : `Nicht installiert (npm i -g ${CLI_PACKAGES[kind].pkg}).`;
    return { ...base, installed: false, version: null, loggedIn: null, detail: hint };
  }
  const version = (await runQuick(kind, ["--version"])).out.trim().split("\n")[0] || null;
  if (kind === "codex") {
    const status = await runQuick(kind, ["login", "status"]);
    const loggedIn = status.code === 0 && /logged in/i.test(status.out);
    return { ...base, installed: true, version, loggedIn, detail: status.out.trim().split("\n").pop() ?? "" };
  }
  if (kind === "antigravity") {
    // Antigravity hat keinen eigenen `auth status`-Subcommand. Wir prüfen
    // einen Settings-File: `~/.gemini/antigravity-cli/settings.json`
    // existiert nach erfolgreichem Login immer. Wenn nicht, hat der
    // User den Onboarding-Wizard noch nicht durchlaufen.
    const settingsPath = join(homedir(), ".gemini", "antigravity-cli", "settings.json");
    const settingsExists = existsSync(settingsPath);
    return {
      ...base,
      installed: true,
      version,
      loggedIn: settingsExists,
      detail: settingsExists
        ? "Angemeldet (Google-OAuth-Token im System-Keyring)."
        : "Nicht angemeldet. Bitte `agy` einmalig starten, um den Login-Flow zu durchlaufen.",
    };
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

/**
 * Startet den Login-Flow des Providers.
 *
 * Antigravity: läuft ohne Argumente, der User kommt in den
 * `agy`-Onboarding-Wizard, der ihn durch Google-OAuth führt. Wir starten
 * das mit `--output-format stream-json` weg, damit der Wizard still in
 * der Shell läuft (er interagiert über TTY mit dem User, was wir hier
 * nicht simulieren können).
 */
export function startCliLogin(kind: CliKind): { started: boolean; message: string } {
  const entry = cliEntry(kind);
  if (!entry) return { started: false, message: "CLI nicht installiert." };
  if (kind === "antigravity") {
    // Antigravity hat keinen dedizierten login-Befehl — der User startet
    // die CLI einmalig, der Onboarding-Wizard übernimmt. Wir starten
    // `agy` so, dass es sichtbar ist (kein windowsHide), damit der
    // User das Terminal sieht und durchklicken kann.
    const child = spawn(entry, [], { env: childEnv(), stdio: "ignore", detached: false });
    setTimeout(() => killTree(child), 10 * 60_000);
    child.on("error", () => {});
    return {
      started: true,
      message: "Antigravity-Login gestartet. Bitte im neu geöffneten Fenster den Google-OAuth-Wizard durchlaufen.",
    };
  }
  const args = kind === "codex" ? ["login"] : ["auth", "login"];
  const child = spawn(nodeBinary(), [entry, ...args], { env: childEnv(), windowsHide: true, stdio: "ignore", detached: false });
  setTimeout(() => killTree(child), 5 * 60_000);
  child.on("error", () => {});
  return { started: true, message: "Anmeldung gestartet. Bitte im Browser bestätigen." };
}

export function isCliKind(value: string): value is CliKind {
  return value === "codex" || value === "claude" || value === "antigravity";
}
