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
import { isAbsolute, join } from "node:path";
import { getAgentCliConfigDirs } from "./codex-accounts";
import { prepareAgyHome } from "./agy-shared-sessions"; // helium-agyshare

export type CliKind = "codex" | "claude" | "antigravity" | "freebuff" | "gemini";

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
  /**
   * Stufe 4: Freebuff (https://freebuff.com). Die CLI hat keinen
   * `--model`-Flag — das Modell wird in `~/.config/manicode/settings.json`
   * (`freebuffModel`-Feld) gesetzt. Wir nehmen die dokumentierten
   * Modellnamen plus "auto" (= Default-Auswahl).
   *
   * Freebuff ist die kostenlose Alternative zu Codex/Claude/Antigravity
   * mit eingebautem Web-Research + Browser-Use. Login läuft über
   * `freebuff login` (Browser-OAuth, kein API-Key).
   */
  freebuff: [
    "auto",
    "z-ai/glm-5.3-flash",
    "mimo-fast",
    "mimo-2.6-pro",
    "deepseek-v4.1-flash",
    "deepseek-v4.1-flash-fast",
    "gpt-6-luna",
    "solar-mini-4",
    "solar-pro-4",
    "space-bunny-alpha",
    "gemini-3.8-flash",
    "muse-spark-1.3",
  ],
  gemini: [
    "auto",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash-exp",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
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
  /**
   * Stufe 4: Freebuff. Wird über `npm i -g freebuff` installiert; die
   * npm-Library ist nur ein Wrapper, der das eigentliche Binary nach
   * `~/.config/manicode/freebuff.exe` (Windows) / `~/.config/manicode/freebuff`
   * (Unix) downloaded. Wir suchen dort direkt und im PATH als Fallback.
   */
  freebuff: { pkg: "freebuff", bin: "index.js", label: "Freebuff (Browser-Login, kostenlos)", binary: "freebuff" },
  gemini: { pkg: "@google/gemini-cli", bin: "bin/gemini.js", label: "Gemini CLI", binary: "gemini" },
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
 * Wo Freebuff landet, wenn es per `npm i -g freebuff` installiert wurde.
 *
 * Die npm-Library ist nur ein Wrapper. Das echte Binary wird beim ersten
 * Aufruf heruntergeladen und liegt unter
 *   - Windows: `%USERPROFILE%\.config\manicode\freebuff.exe`
 *   - Unix:    `~/.config/manicode/freebuff`
 *
 * Der npm-Wrapper selbst liegt im `node_modules/freebuff/`, also
 * suchen wir in `npmGlobalRoots()` und zusätzlich im User-Config-Verzeichnis.
 */
function freebuffRoots(): string[] {
  const roots: string[] = [];
  roots.push(join(homedir(), ".config", "manicode"));
  // PATH-Lookup als Fallback
  return roots;
}

/**
 * Pfad zum ausführbaren CLI, oder `null` wenn nicht installiert.
 *
 * Codex & Claude sind Node-Skripte unter `node_modules/<pkg>/...`, also
 * suchen wir im npm-Global-Root. Antigravity ist ein Go-Binary und liegt
 * unter `antigravityRoots()` (oder ist im PATH — siehe Fallback).
 * Freebuff ist ein natives Binary unter `freebuffRoots()` (oder im PATH).
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
  if (kind === "freebuff") {
    const exe = process.platform === "win32" ? "freebuff.exe" : "freebuff";
    for (const root of freebuffRoots()) {
      const candidate = join(root, exe);
      if (existsSync(candidate)) return candidate;
    }
    for (const root of npmGlobalRoots()) {
      const candidate = join(root, "freebuff", "index.js");
      if (existsSync(candidate)) return candidate;
    }
    // Fallback: PATH-Lookup
    return exe;
  }
  if (kind === "gemini") {
    const exe = process.platform === "win32" ? "gemini.cmd" : "gemini";
    for (const root of npmGlobalRoots()) {
      const candidate = join(root, "@google", "gemini-cli", "bin", "gemini.js");
      if (existsSync(candidate)) return candidate;
    }
    if (process.env.APPDATA) {
      const candidate = join(process.env.APPDATA, "npm", exe);
      if (existsSync(candidate)) return candidate;
    }
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

/** Child env without Connect's own secrets, with isolated CLI config directories per agent. */
function childEnv(
  agentId?: string,
  accountEmail?: string,
  kind?: CliKind,
  skills?: Array<{ id: string; name: string; enabled: boolean }>,
  websites?: Array<{ id?: string; url: string; purpose?: string; enabled?: boolean }>,
  subagents?: Array<{ id?: string; name: string; url: string; description?: string; enabled?: boolean }>,
): NodeJS.ProcessEnv {
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

  if (agentId) {
    const paths = getAgentCliConfigDirs(agentId, accountEmail);
    env.CONNECT_AGENT_ID = agentId;
    env.AGENT_ID = agentId;
    env.AGENT_WORKDIR = paths.workspace;
    env.AGENT_BROWSER_PROFILE = paths.browserProfile;
    // Echte CLI-Config-Verzeichnisse pro Bot (Mehrkonten-Software)
    env.CODEX_HOME = paths.codexHome;
    env.CLAUDE_CONFIG_DIR = paths.claudeConfig;
    env.HERMES_HOME = paths.hermesHome;
    // freebuff liest FREEBUFF_CONFIG_DIR (absolut) — XDG_CONFIG_HOME ignoriert die CLI.
    env.FREEBUFF_CONFIG_DIR = paths.freebuffConfig;
    env.ANTIGRAVITY_CONFIG_DIR = paths.antigravityHome;
    env.ANTIGRAVITY_HOME = paths.antigravityHome;
    env.AGY_ACCOUNT = paths.googleAccount;
    env.GOOGLE_ACCOUNT = paths.googleAccount;
    env.CONNECT_ACCOUNT_EMAIL = paths.googleAccount;

    if (skills && skills.length > 0) {
      const active = skills.filter((s) => s.enabled);
      env.CONNECT_AGENT_SKILLS = JSON.stringify(active.map((s) => s.name));
      env.AGENT_SKILLS = active.map((s) => s.name).join(", ");
      env.ENABLED_SKILLS = active.map((s) => s.id).join(",");
    }

    // Phase C Schritt 13: Webseiten-Liste im Env
    if (websites && websites.length > 0) {
      const activeWeb = websites.filter((w) => w.enabled !== false);
      env.CONNECT_AGENT_WEBSITES = JSON.stringify(activeWeb.map((w) => ({ url: w.url, purpose: w.purpose || "" })));
      env.AGENT_WEBSITES = activeWeb.map((w) => `${w.url} (${w.purpose || "Kontext"})`).join("; ");
    }

    // Phase C Schritt 14: Subagenten (Online-KIs) im Env
    if (subagents && subagents.length > 0) {
      const activeSubs = subagents.filter((s) => s.enabled !== false);
      env.CONNECT_AGENT_SUBAGENTS = JSON.stringify(activeSubs.map((s) => ({ name: s.name, url: s.url, description: s.description || "" })));
      env.AGENT_SUBAGENTS = activeSubs.map((s) => `${s.name} (${s.url} - ${s.description || "Online-KI"})`).join("; ");
    }

    if (kind === "antigravity") {
      // helium-agyshare: gemeinsamer Verlauf + No-Ask-Dateien auch fuer Chat-Aufrufe
      try {
        prepareAgyHome(paths.antigravityHome);
      } catch {
        // best effort
      }
      env.USERPROFILE = paths.antigravityHome;
      env.HOME = paths.antigravityHome;
      env.HOMEDRIVE = paths.antigravityHome.slice(0, 2);
      env.HOMEPATH = paths.antigravityHome.slice(2);
    }
  }

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

export type CliEvent = {
  text?: string;
  error?: string;
  usage?: { input: number; output: number };
  fatal?: boolean;
  /**
   * Hinweis über den Zustand der CLI (z.B. "Antigravity bereit — 20 Browser-Tools").
   * Gehört NICHT zur Antwort des Agenten und landet deshalb nicht in `text` — sonst
   * steht die Zeile als erste Zeile in der Chat-Antwort.
   */
  notice?: string;
};

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
    const args = [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--ignore-user-config",
      "--color",
      "never",
      "--sandbox",
      allowWrite ? "workspace-write" : "read-only",
    ];
    if (model && model !== "auto") {
      args.push("-m", model);
    }
    args.push("-C", cwd, "-");
    return args;
  }
  if (kind === "claude") {
    const effectiveModel = model && model !== "auto" ? model : "sonnet";
    return [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--model",
      effectiveModel,
      "--allowedTools",
      allowWrite ? "Read Glob Grep WebFetch WebSearch Edit Write" : "Read Glob Grep WebFetch WebSearch",
    ];
  }
  // Stufe 4: Freebuff.
  // Freebuff hat:
  //   - `--cwd <dir>` für Arbeitsverzeichnis
  //   - `--trust-agents` für Auto-Load .agents Files (sonst fragt die CLI)
  //   - **kein** `--model`-Flag (Modell wird in settings.json gesetzt)
  //   - **kein** `--output-format`-Flag
  //   - **kein** `-p`-Flag und akzeptiert keinen Prompt als Argument
  //
  // Freebuff ist eine interaktive TUI-Anwendung und wird im PTY-Terminal
  // (CLI-Reiter) interaktiv gefahren.
  if (kind === "freebuff") {
    return [
      "--cwd",
      cwd,
      "--trust-agents",
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
  // Im Headless-Batch-Modus (-p) kann agy den Benutzer nicht interaktiv
  // nach Tool-Rechten (WebFetch, Browser-Tools, etc.) fragen. Ohne das Flag
  // bricht agy mit 'a tool required permission that headless mode cannot prompt for' ab.
  // Wir setzen daher `--dangerously-skip-permissions` immer für `-p`.
  const args = [
    "--output-format",
    "stream-json",
    "--dangerously-skip-permissions",
    "-p",
    prompt,
  ];
  return args;
}

/** Translate one JSON line of the CLI into what the chat needs. */
function parseLine(kind: CliKind, line: string, state: { sawDelta: boolean; retries: number }): CliEvent | null {
  // Stufe 4: Freebuff. Freebuff hat **kein** JSON-Stream-Format — die TUI
  // gibt plain text auf stdout/stderr aus. Wir sammeln alle nicht-leeren
  // Zeilen und schicken jede einzeln als Text-Delta. Wenn der Prozess
  // beendet ist, hat der Generator die komplette Antwort.
  if (kind === "freebuff") {
    if (line.trim().length > 0) {
      state.sawDelta = true;
      return { text: line };
    }
    return null;
  }
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (kind === "antigravity") {
    /*
     * Antigravity streamt `{"event": "step_update", "step_update": { step_type, text_delta }}` —
     * der Ereignistyp steht in `event`, NICHT in `type`. Der eigene Zweig hier unten las nur `type`
     * und erkannte deshalb kein einziges Ereignis: der Run endete mit "keine Antwort erhalten",
     * obwohl die CLI sauber geantwortet hatte.
     *
     * `parseAntigravityLine` ist die vollständige Antigravity-Auswertung (sie akzeptiert `event`
     * wie auch `type`, verarbeitet `init`, `step_update`, `result` und Auth-Fehler). Die wird hier
     * benutzt, statt sie parallel zu pflegen.
     */
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
        ? `Antigravity bereit — ${browserTools.length} Browser-Tools`
        : `Antigravity bereit — ${tools.length} Tools`;
      return { notice: note };
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

export function detectBrowserOpenIntent(prompt: string): { url: string; label: string } | null {
  const p = prompt.trim();
  const lower = p.toLowerCase();

  const hasBrowserWord = lower.includes("browser");
  const hasOpenAction =
    lower.includes("öffne") ||
    lower.includes("oeffne") ||
    lower.includes("open") ||
    lower.includes("gehe") ||
    lower.includes("navigier") ||
    lower.includes("starte");

  const isBrowserIntent =
    (hasBrowserWord && hasOpenAction) ||
    (/(?:^|\s)(?:öffne|oeffne|open)\s+(?:https?:\/\/|[a-z0-9-]+\.[a-z]{2,})/i.test(lower));

  if (!isBrowserIntent) return null;

  let target = "";
  // 1. "öffne im browser <target>" / "open in browser <target>"
  const m1 = lower.match(/(?:öffne|oeffne|open|starte?)\s+(?:im\s+browser|in\s+(?:the\s+)?browser)\s+(.+)/i);
  // 2. "öffne <target> im browser" / "open <target> in browser"
  const m2 = lower.match(/(?:öffne|oeffne|open|starte?)\s+(.+?)\s+(?:im\s+browser|in\s+(?:the\s+)?browser)/i);
  // 3. "im browser (öffne/gehe zu) <target>"
  const m3 = lower.match(/(?:im\s+browser|in\s+(?:the\s+)?browser)[:,\s]+(?:öffne|oeffne|open|gehe\s+zu|navigier\w*)?\s*(.+)/i);
  // 4. "gehe/navigiere (zu/auf) <target> (im browser)"
  const m4 = lower.match(/(?:gehe|navigier\w*)\s+(?:zu|auf|in)?\s*(.+?)(?:\s+(?:im\s+browser|in\s+(?:the\s+)?browser))?$/i);
  // 5. fallback: "öffne <target>"
  const m5 = lower.match(/(?:öffne|oeffne|open)\s+(.+)/i);

  if (m1 && m1[1]) {
    target = m1[1].trim();
  } else if (m2 && m2[1]) {
    target = m2[1].trim();
  } else if (m3 && m3[1]) {
    target = m3[1].trim();
  } else if (m4 && m4[1]) {
    target = m4[1].trim();
  } else if (m5 && m5[1]) {
    target = m5[1].trim();
  }

  target = target
    .replace(/(?:im\s+browser|in\s+(?:the\s+)?browser)/gi, "")
    .replace(/^(bitte|mal|doch)\s+/gi, "")
    .replace(/[.!?]+$/g, "")
    .trim();

  if (!target) return null;

  let url = "";
  let label = target;

  if (/^https?:\/\//i.test(target)) {
    url = target;
    try {
      label = new URL(target).hostname.replace(/^www\./, "");
    } catch {}
  } else if (target === "tiktok" || target === "tik tok") {
    url = "https://www.tiktok.com";
    label = "TikTok";
  } else if (target === "youtube") {
    url = "https://www.youtube.com";
    label = "YouTube";
  } else if (target === "google") {
    url = "https://www.google.com";
    label = "Google";
  } else if (target === "instagram") {
    url = "https://www.instagram.com";
    label = "Instagram";
  } else if (/^[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+(:\d+)?(\/.*)?$/.test(target)) {
    url = `https://${target}`;
    label = target;
  } else {
    url = `https://www.${target.replace(/\s+/g, "")}.com`;
    label = target;
  }

  return { url, label };
}

export type CliRunOptions = { kind: CliKind; model: string; agentId: string; prompt: string; allowWrite?: boolean; signal?: AbortSignal; accountEmail?: string };

/** Runs the CLI once and yields text pieces as they come. Throws with a readable German message. */
export async function* runCli(options: CliRunOptions): AsyncGenerator<CliEvent> {
  // Echte Browser-Aktionen im isolierten Helium-Profil des Agenten steuern
  const browserIntent = detectBrowserOpenIntent(options.prompt);
  if (browserIntent && options.agentId) {
    try {
      const { browserUseOpen } = await import("../agents/agent-browser-use");
      const res = await browserUseOpen(options.agentId, browserIntent.url);
      if (res.ok) {
        yield {
          text: `${browserIntent.label} wurde in deinem Agent-Browser geöffnet: ${res.url || browserIntent.url}`,
        };
        return;
      } else {
        yield {
          text: `Fehler beim Öffnen im Agent-Browser: ${res.error || "Navigation fehlgeschlagen"}`,
        };
        return;
      }
    } catch (err) {
      yield {
        text: `Fehler beim Öffnen im Agent-Browser: ${err instanceof Error ? err.message : String(err)}`,
      };
      return;
    }
  }

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
  if (options.kind === "freebuff") {
    // Freebuff akzeptiert das Modell über die settings.json
    await writeFreebuffModel(options.model);
    // Freebuff ist eine rein interaktive Terminal-CLI (OpenTUI) mit ConPTY/xterm.js
    // und unterstützt keinen Headless-Streaming-Batch-Modus per Prompt-Argument.
    // Wir antworten dem Chat direkt mit einer verständlichen Anleitung.
    yield {
      text: "Freebuff ist als interaktives Terminal (TUI) konzipiert. Bitte wechsle oben auf den Reiter **CLI**, um direkt im Freebuff-Terminal interaktiv zu chatten und Code zu bearbeiten.",
    };
    return;
  }
  const cwd = agentWorkdir(options.agentId);
  let effectiveEmail = options.accountEmail;
  let agentSkills: any[] = [];
  let agentWebsites: any[] = [];
  let agentSubagents: any[] = [];
  let effectivePrompt = options.prompt;
  if (options.agentId) {
    try {
      const {
        lookupAgentAccountEmail,
        lookupAgentSkills,
        lookupAgentWebsites,
        lookupAgentSubagents,
      } = await import("./agent-terminal-manager");
      if (!effectiveEmail) {
        effectiveEmail = (await lookupAgentAccountEmail(options.agentId)) ?? undefined;
      }
      agentSkills = await lookupAgentSkills(options.agentId);
      agentWebsites = await lookupAgentWebsites(options.agentId);
      agentSubagents = await lookupAgentSubagents(options.agentId);
      const { syncAgentSkillsToWorkspace } = await import("../agents/agent-skills");
      const { syncAgentWebsitesToWorkspace, formatWebsitesContext } = await import("../agents/agent-websites");
      const { syncAgentSubagentsToWorkspace, formatSubagentsContext } = await import("../agents/agent-subagents");
      const paths = getAgentCliConfigDirs(options.agentId, effectiveEmail);
      syncAgentSkillsToWorkspace(options.agentId, agentSkills, cwd, paths.antigravityHome);
      syncAgentWebsitesToWorkspace(options.agentId, agentWebsites, cwd, paths.antigravityHome);
      syncAgentSubagentsToWorkspace(options.agentId, agentSubagents, cwd, paths.antigravityHome);
      const { syncAgentMapToWorkspace } = await import("./agent-terminal-manager");
      await syncAgentMapToWorkspace(options.agentId);

      // Phase C Schritt 13: Webseiten-Liste als Kontext für den Prompt
      const websiteCtx = formatWebsitesContext(agentWebsites);
      if (websiteCtx && !options.prompt.includes("Bekannte Webseiten & Portale")) {
        effectivePrompt = `${websiteCtx}\n\n${options.prompt}`;
      }

      // Phase C Schritt 14: Subagenten (Online-KIs) als Kontext für den Prompt
      const subagentCtx = formatSubagentsContext(agentSubagents);
      if (subagentCtx && !effectivePrompt.includes("Verfügbare Subagenten")) {
        effectivePrompt = `${subagentCtx}\n\n${effectivePrompt}`;
      }
    } catch {
      // ignore
    }
  }

  const args = argsFor(options.kind, options.model, cwd, !!options.allowWrite, effectivePrompt);
  // Antigravity ist ein natives Binary und wird direkt aufgerufen;
  // Codex und Claude sind Node-Skripte, also läuft das über `node entry.js`.
  const isNativeBinary = options.kind === "antigravity" || (options.kind === "gemini" && !entry?.endsWith(".js"));
  const cmd = isNativeBinary ? entry : nodeBinary();
  const cmdArgs = isNativeBinary ? args : [entry, ...args];
  const child = spawn(cmd, cmdArgs, {
    cwd,
    env: childEnv(
      options.agentId,
      effectiveEmail,
      options.kind,
      agentSkills,
      agentWebsites,
      agentSubagents,
    ),
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
    child.stdin?.end(effectivePrompt, "utf8");
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
      const isAuthError =
        /(not logged in|please log in|unauthorized|auth(?:entication)? required|\b401\b)/i.test(stderr) &&
        !/choices are login/i.test(stderr);
      const hint = isAuthError ? " Bitte unter Einstellungen › Anbieter neu anmelden." : "";
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

export function createCliModel(input: { kind: CliKind; model: string; agentId: string; allowWrite?: boolean; accountEmail?: string }) {
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
  if (kind === "freebuff") {
    // Freebuff-Login läuft über `freebuff login` (Browser-OAuth). Wir
    // prüfen `~/.config/manicode/credentials.json` — existiert der Token,
    // ist der User eingeloggt.
    const freebuffDir = process.env.FREEBUFF_CONFIG_DIR?.trim();
    const credentialsPath = join(
      freebuffDir && isAbsolute(freebuffDir) ? freebuffDir : join(homedir(), ".config", "manicode"),
      "credentials.json",
    );
    let loggedIn = false;
    try {
      const raw = JSON.parse(await Bun.file(credentialsPath).text()) as { default?: { tokenStore?: string } };
      loggedIn = Boolean(raw.default?.tokenStore);
    } catch {
      loggedIn = false;
    }
    return {
      ...base,
      installed: true,
      version,
      loggedIn,
      detail: loggedIn
        ? "Angemeldet (Token in credentials.json)."
        : "Nicht angemeldet. Bitte `freebuff login` einmalig ausführen.",
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
  if (kind === "freebuff") {
    // Freebuff hat `freebuff login` — startet den Browser-OAuth-Flow.
    // Wir übergeben den Login-Befehl direkt; die CLI managed das Popup
    // selbst und schreibt den Token in den System-Keyring.
    const child = spawn(entry, ["login"], { env: childEnv(), stdio: "ignore", detached: false });
    setTimeout(() => killTree(child), 10 * 60_000);
    child.on("error", () => {});
    return {
      started: true,
      message: "Freebuff-Login gestartet. Bitte im neu geöffneten Browser den OAuth-Flow bestätigen.",
    };
  }
  const args = kind === "codex" ? ["login"] : ["auth", "login"];
  const child = spawn(nodeBinary(), [entry, ...args], { env: childEnv(), windowsHide: true, stdio: "ignore", detached: false });
  setTimeout(() => killTree(child), 5 * 60_000);
  child.on("error", () => {});
  return { started: true, message: "Anmeldung gestartet. Bitte im Browser bestätigen." };
}

/**
 * Freebuff-Settings-Datei: `~/.config/manicode/settings.json`.
 * Wir schreiben das gewünschte Modell vor jedem Lauf hinein und
 * restaurieren den alten Wert danach (im finally-Block des Generators).
 */
type FreebuffSettings = { mode?: string; adsEnabled?: boolean; freebuffModel?: string; [k: string]: unknown };

function freebuffSettingsPath(): string {
  // FREEBUFF_CONFIG_DIR hat Vorrang; nur ein absoluter Pfad ist gültig.
  const override = process.env.FREEBUFF_CONFIG_DIR?.trim();
  const base = override && isAbsolute(override) ? override : join(homedir(), ".config", "manicode");
  return join(base, "settings.json");
}

async function readFreebuffSettings(): Promise<FreebuffSettings> {
  try {
    return (await Bun.file(freebuffSettingsPath()).json()) as FreebuffSettings;
  } catch {
    return {};
  }
}

async function writeFreebuffSettings(settings: FreebuffSettings): Promise<void> {
  const path = freebuffSettingsPath();
  const { mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  try {
    mkdirSync(dirname(path), { recursive: true });
    await Bun.write(path, JSON.stringify(settings, null, 2));
  } catch {
    // Best effort
  }
}

/**
 * Setzt das `freebuffModel`-Feld in den Settings. Freebuff liest das
 * nur beim Start; ein Hot-Swap ist nicht vorgesehen.
 *
 * `auto` lässt das Feld weg, damit Freebuff seine Default-Auswahl trifft.
 */
async function writeFreebuffModel(model: string): Promise<void> {
  const settings = await readFreebuffSettings();
  if (model === "auto" || !model) {
    delete settings.freebuffModel;
  } else {
    settings.freebuffModel = model;
  }
  await writeFreebuffSettings(settings);
}

export function isCliKind(value: string): value is CliKind {
  return value === "codex" || value === "claude" || value === "antigravity" || value === "freebuff";
}
