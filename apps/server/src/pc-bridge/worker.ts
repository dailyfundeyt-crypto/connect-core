/**
 * Handy-Brücke, PC-Seite: läuft im lokalen Connect-Server (localhost:3101).
 *
 * Baut eine AUSGEHENDE Verbindung zur Online-Datenbank auf (Supabase, Transaction-Pooler), meldet
 * alle 20 s „PC online“ samt bereiten Anbietern und Grok-Bot-Liste, holt Aufträge des Besitzers ab,
 * führt die Anbieter-CLI unsichtbar aus (Codex/Claude über cli-model, Grok Bot über gbot) und schreibt
 * die Antwort zurück. Kein offener Port, kein Tunnel, keine Token-Dateien.
 *
 * Konfiguration: %LOCALAPPDATA%\ConnectApp\data\pc-bridge.env (oder Umgebungsvariablen)
 *   PC_BRIDGE_DATABASE_URL   postgres://…pooler.supabase.com:6543/postgres (nie geloggt)
 *   PC_BRIDGE_OWNER_USER_ID  Online-Nutzer-ID, für den dieser PC arbeitet
 *   PC_BRIDGE_LABEL          Anzeigename (optional)
 *   PC_BRIDGE_DISABLED=1     ausschalten
 */
import { SQL } from "bun";
import { existsSync, readFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { CLI_MODELS, cliStatus, isCliKind, runCli } from "../agent-hub/cli-model";
import { gbotStatus, listGrokBots, runGbotJson } from "../agent-hub/gbot-sync";
import {
  claimJob,
  finishJob,
  heartbeat,
  type PcGrokBot,
  type PcJob,
  type PcProviderInfo,
  PROVIDER_LABELS,
  pruneJobs,
  type Q,
  writeProgress,
} from "./store";

const VERSION = "pc-bridge 1";
const HEARTBEAT_MS = 20_000;
const POLL_MS = 1_500;
const PROVIDERS_REFRESH_MS = 5 * 60_000;
const MAX_PARALLEL = 2;
const FLUSH_MS = 600;
const GROK_POLL_MS = 3_000;
const GROK_QUIET_MS = 35_000;
const GROK_MAX_MS = 270_000;

export type PcBridgeWorkerState = {
  configured: boolean;
  running: boolean;
  connected: boolean;
  label: string | null;
  ownerHint: string | null;
  lastHeartbeat: string | null;
  lastError: string | null;
  activeJobs: number;
  jobsDone: number;
  jobsFailed: number;
  lastJobAt: string | null;
  providers: PcProviderInfo[];
  grokBotCount: number;
};

const state: PcBridgeWorkerState = {
  configured: false,
  running: false,
  connected: false,
  label: null,
  ownerHint: null,
  lastHeartbeat: null,
  lastError: null,
  activeJobs: 0,
  jobsDone: 0,
  jobsFailed: 0,
  lastJobAt: null,
  providers: [],
  grokBotCount: 0,
};

export function pcBridgeWorkerState(): PcBridgeWorkerState {
  return { ...state, providers: [...state.providers] };
}

function configFile(): string {
  const base = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ConnectApp", "data") : join(homedir(), ".connect-app");
  return join(base, "pc-bridge.env");
}

function readConfig(): { url: string; owner: string; label: string; disabled: boolean } | null {
  const values: Record<string, string> = {};
  const file = process.env.PC_BRIDGE_ENV_FILE || configFile();
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match?.[1] && !line.trim().startsWith("#")) values[match[1]] = (match[2] ?? "").replace(/^["']|["']$/g, "");
    }
  }
  const pick = (name: string) => process.env[name]?.trim() || values[name]?.trim() || "";
  const url = pick("PC_BRIDGE_DATABASE_URL");
  const owner = pick("PC_BRIDGE_OWNER_USER_ID");
  if (!url || !owner) return null;
  return { url, owner, label: pick("PC_BRIDGE_LABEL") || hostname(), disabled: pick("PC_BRIDGE_DISABLED") === "1" };
}

/** Bun cannot take a postgres URL whole on Windows (oven-sh/bun#27713), so pass the parts. */
function connect(url: string): Q {
  const parsed = new URL(url);
  const params = Object.fromEntries(parsed.searchParams);
  const sslmode = params.sslmode;
  const tls = sslmode === undefined ? true : !["disable", "allow", "prefer"].includes(sslmode);
  const client = new SQL({
    adapter: "postgres",
    hostname: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "postgres",
    ...(tls ? { tls: true } : {}),
    // Transaction pooler: no named prepared statements; few connections.
    prepare: false,
    max: 3,
    idleTimeout: 30,
  } as never);
  return async (text, values = []) => (await client.unsafe(text, values as never[])) as unknown as Record<string, unknown>[];
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/postgres(ql)?:\/\/[^\s]+/gi, "postgres://***");

// ------------------------------------------------------------------ provider snapshot

async function providerSnapshot(): Promise<{ providers: PcProviderInfo[]; grokBots: PcGrokBot[] }> {
  const providers: PcProviderInfo[] = [];
  for (const kind of ["codex", "claude"] as const) {
    try {
      const status = await cliStatus(kind);
      providers.push({
        kind: `${kind}-cli`,
        label: PROVIDER_LABELS[`${kind}-cli`],
        ready: status.installed && status.loggedIn !== false,
        detail: status.installed ? (status.loggedIn === false ? "Nicht angemeldet" : status.version ? `Bereit · ${status.version}` : "Bereit") : status.detail,
        models: CLI_MODELS[kind],
      });
    } catch (error) {
      providers.push({ kind: `${kind}-cli`, label: PROVIDER_LABELS[`${kind}-cli`], ready: false, detail: errorText(error), models: CLI_MODELS[kind] });
    }
  }
  let grokBots: PcGrokBot[] = [];
  try {
    const status = await gbotStatus();
    if (status.installed && status.loggedIn) {
      grokBots = (await listGrokBots())
        .filter((bot) => !bot.kind || bot.kind === "bot")
        .map((bot) => ({ id: bot.id, name: bot.name, ...(bot.title ? { title: bot.title } : {}), ...(bot.description ? { description: bot.description.slice(0, 200) } : {}) }));
    }
    providers.push({ kind: "grok-bot", label: PROVIDER_LABELS["grok-bot"], ready: Boolean(status.installed && status.loggedIn), detail: status.detail, models: [] });
  } catch (error) {
    providers.push({ kind: "grok-bot", label: PROVIDER_LABELS["grok-bot"], ready: false, detail: errorText(error), models: [] });
  }
  return { providers, grokBots };
}

// ------------------------------------------------------------------ job runners

type Sink = { append: (text: string) => void; signal: AbortSignal };

async function runCliJob(job: PcJob, sink: Sink) {
  const kind = job.provider === "codex-cli" ? "codex" : "claude";
  if (!isCliKind(kind)) throw new Error("Unbekannter Anbieter.");
  let first = true;
  for await (const event of runCli({ kind, model: job.model, agentId: `pc-${job.agent_id}`, prompt: job.prompt, signal: sink.signal })) {
    if (!event.text) continue;
    // Codex sends whole messages (one per item), Claude streams deltas.
    sink.append(kind === "codex" && !first ? `\n\n${event.text}` : event.text);
    first = false;
  }
}

type GrokEntry = { kind?: string; id?: string; seq?: number; message?: { type?: string; content?: string; widget?: { prompt?: string; options?: { label?: string }[] } } };

function grokEntries(raw: unknown): GrokEntry[] {
  const entries = (raw as { transcript?: { entries?: unknown } } | null)?.transcript?.entries;
  return Array.isArray(entries) ? (entries as GrokEntry[]) : [];
}

function grokText(entry: GrokEntry): string {
  const message = entry.message;
  if (!message) return "";
  if (message.type === "text") return message.content?.trim() ?? "";
  if (message.type === "widget" && message.widget) {
    const options = (message.widget.options ?? []).map((option) => `• ${option.label ?? ""}`).join("\n");
    return [message.widget.prompt ?? "", options].filter(Boolean).join("\n");
  }
  return "";
}

const BOT_ID = /^[A-Za-z0-9_-]{8,80}$/;

async function runGrokJob(job: PcJob, sink: Sink) {
  if (!BOT_ID.test(job.model)) throw new Error("Ungültige Grok-Bot-ID.");
  const message = job.prompt.trim().slice(0, 8_000);
  if (!message) throw new Error("Leere Nachricht.");
  const before = grokEntries(await runGbotJson(["thread", job.model]));
  const baseline = before.reduce((max, entry) => Math.max(max, entry.seq ?? 0), 0);
  await runGbotJson(["send", job.model, message]);
  const seen = new Set<string>();
  const started = Date.now();
  let lastNew = Date.now();
  let any = false;
  while (!sink.signal.aborted) {
    await new Promise((resolve) => setTimeout(resolve, GROK_POLL_MS));
    let entries: GrokEntry[] = [];
    try {
      entries = grokEntries(await runGbotJson(["thread", job.model]));
    } catch {
      continue;
    }
    for (const entry of entries) {
      if ((entry.seq ?? 0) <= baseline || entry.kind !== "send-message") continue;
      const key = entry.id ?? String(entry.seq);
      if (seen.has(key)) continue;
      seen.add(key);
      const text = grokText(entry);
      if (!text) continue;
      sink.append(any ? `\n\n${text}` : text);
      any = true;
      lastNew = Date.now();
    }
    if (any && Date.now() - lastNew > GROK_QUIET_MS) return;
    if (Date.now() - started > GROK_MAX_MS) {
      sink.append(any ? "\n\n(Der Grok Bot arbeitet noch – den Rest siehst du in der Grok-Bot-App.)" : "Der Grok Bot hat noch nicht geantwortet – die Antwort erscheint in der Grok-Bot-App.");
      return;
    }
  }
}

// ------------------------------------------------------------------ loop

let started = false;

export function startPcBridgeWorker() {
  if (started) return;
  started = true;
  const config = readConfig();
  if (!config || config.disabled) {
    state.configured = Boolean(config);
    state.lastError = config?.disabled ? "Ausgeschaltet (PC_BRIDGE_DISABLED=1)." : "Nicht eingerichtet (pc-bridge.env fehlt).";
    return;
  }
  state.configured = true;
  state.running = true;
  state.label = config.label;
  state.ownerHint = `${config.owner.slice(0, 4)}…`;
  const q = connect(config.url);
  const workerId = `${hostname()}-${process.pid}`;
  let snapshotAt = 0;
  let snapshot: { providers: PcProviderInfo[]; grokBots: PcGrokBot[] } | null = null;
  let snapshotting = false;
  let snapshotSentAt = -1;

  const beat = async () => {
    try {
      // The provider/bot snapshot only travels when it changed; the beat itself is one small row.
      const sendSnapshot = snapshot && snapshotAt !== snapshotSentAt ? snapshot : null;
      await heartbeat(q, {
        ownerUserId: config.owner,
        workerId,
        label: config.label,
        version: VERSION,
        ...(sendSnapshot ? { providers: sendSnapshot.providers, grokBots: sendSnapshot.grokBots } : {}),
      });
      if (sendSnapshot) snapshotSentAt = snapshotAt;
      state.connected = true;
      state.lastHeartbeat = new Date().toISOString();
      if (state.lastError?.startsWith("Verbindung")) state.lastError = null;
    } catch (error) {
      state.connected = false;
      state.lastError = `Verbindung zur Online-Datenbank fehlgeschlagen: ${errorText(error)}`;
    }
    if (!snapshotting && Date.now() - snapshotAt > PROVIDERS_REFRESH_MS) {
      snapshotting = true;
      providerSnapshot()
        .then((next) => {
          snapshot = next;
          snapshotAt = Date.now();
          state.providers = next.providers;
          state.grokBotCount = next.grokBots.length;
          void beat();
        })
        .catch((error) => {
          state.lastError = `Anbieter-Status: ${errorText(error)}`;
        })
        .finally(() => {
          snapshotting = false;
        });
    }
  };

  const runJob = async (job: PcJob) => {
    state.activeJobs += 1;
    state.lastJobAt = new Date().toISOString();
    const controller = new AbortController();
    let output = "";
    let dirty = false;
    const flush = async () => {
      if (!dirty) return;
      dirty = false;
      const status = await writeProgress(q, job.id, output).catch(() => null);
      if (status === "cancelled") controller.abort();
    };
    const timer = setInterval(() => void flush(), FLUSH_MS);
    try {
      const sink: Sink = {
        append: (text) => {
          output += text;
          dirty = true;
        },
        signal: controller.signal,
      };
      if (job.provider === "grok-bot") await runGrokJob(job, sink);
      else await runCliJob(job, sink);
      clearInterval(timer);
      await finishJob(q, job.id, { output });
      state.jobsDone += 1;
    } catch (error) {
      clearInterval(timer);
      state.jobsFailed += 1;
      await finishJob(q, job.id, { output, error: errorText(error).slice(0, 1_000) }).catch(() => {});
    } finally {
      state.activeJobs -= 1;
    }
  };

  const poll = async () => {
    if (state.activeJobs >= MAX_PARALLEL || !state.connected) return;
    try {
      const job = await claimJob(q, config.owner, workerId);
      if (job) void runJob(job);
    } catch (error) {
      state.lastError = `Aufträge abholen: ${errorText(error)}`;
    }
  };

  void beat();
  setInterval(() => void beat(), HEARTBEAT_MS);
  setInterval(() => void poll(), POLL_MS);
  setInterval(() => void pruneJobs(q, config.owner).catch(() => {}), 6 * 60 * 60_000);
  console.info(`[pc-bridge] Handy-Brücke aktiv (${config.label}).`);
}
