/**
 * Grok-Bot-Sync: holt Bots aus der lokalen Grok-Bot-Desktop-Sitzung per `gbot`
 * (windowsHide, kein Fenster) und legt sie als Connect-Agenten an (Quelle grok-bot).
 * Secrets werden weder gelesen noch exportiert — nur Name, Anweisungen, Avatar-Hinweise, IDs.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type GrokBotRow = {
  id: string;
  name: string;
  title?: string;
  description?: string;
  avatarColor?: string;
  avatarShape?: string;
  hiddenFromSidebar?: boolean;
  kind?: string;
};

export type GrokImportMap = {
  /** grokBotId → connectAgentId */
  byGrokId: Record<string, string>;
  updatedAt: string;
};

const RUN_TIMEOUT_MS = 45_000;

function npmGlobalRoots(): string[] {
  const roots: string[] = [];
  if (process.env.APPDATA) roots.push(join(process.env.APPDATA, "npm", "node_modules"));
  if (process.env.npm_config_prefix) roots.push(join(process.env.npm_config_prefix, "node_modules"));
  roots.push(join(homedir(), ".npm-global", "lib", "node_modules"), "/usr/local/lib/node_modules");
  return roots;
}

/** Entry of grok-bot-cli, or null when not installed. */
export function gbotEntry(): string | null {
  for (const root of npmGlobalRoots()) {
    const candidate = join(root, "grok-bot-cli", "dist", "bin", "gbot.mjs");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function nodeBinary(): string {
  const fixed = process.platform === "win32" ? "C:\\Program Files\\nodejs\\node.exe" : "/usr/bin/node";
  return existsSync(fixed) ? fixed : "node";
}

function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  const secret = /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|DATABASE_URL|COOKIE|CREDENTIAL)/i;
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (secret.test(name)) continue;
    env[name] = value;
  }
  env.NO_COLOR = "1";
  return env;
}

function mapPath(): string {
  const base = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "ConnectApp", "cli-agents")
    : join(homedir(), ".connect-app", "cli-agents");
  mkdirSync(base, { recursive: true });
  return join(base, "grok-import-map.json");
}

export function readImportMap(): GrokImportMap {
  const path = mapPath();
  if (!existsSync(path)) return { byGrokId: {}, updatedAt: new Date(0).toISOString() };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as GrokImportMap;
    return { byGrokId: raw.byGrokId && typeof raw.byGrokId === "object" ? raw.byGrokId : {}, updatedAt: raw.updatedAt ?? new Date(0).toISOString() };
  } catch {
    return { byGrokId: {}, updatedAt: new Date(0).toISOString() };
  }
}

function writeImportMap(map: GrokImportMap) {
  writeFileSync(mapPath(), JSON.stringify(map, null, 2), "utf8");
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

/** Run `gbot … --json` hidden; returns parsed JSON or throws a short German error. */
export function runGbotJson(args: string[]): Promise<unknown> {
  const entry = gbotEntry();
  if (!entry) {
    return Promise.reject(new Error("grok-bot-cli (gbot) ist nicht installiert. Bitte: npm install -g grok-bot-cli"));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(nodeBinary(), [entry, ...args, "--json"], {
      windowsHide: true,
      env: childEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      killTree(child);
      reject(new Error("gbot hat zu lange gebraucht (Timeout). Ist die Grok-Bot-Desktop-App angemeldet?"));
    }, RUN_TIMEOUT_MS);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`gbot konnte nicht gestartet werden: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const text = stdout.trim() || stderr.trim();
      if (code !== 0) {
        const hint = /session|decrypt|DPAPI|login|sign.?in|not found|Safe Storage/i.test(text)
          ? " Grok-Bot-Desktop-App öffnen und einmal anmelden."
          : "";
        reject(new Error((text.slice(0, 400) || `gbot exit ${code}`) + hint));
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("gbot lieferte kein gültiges JSON."));
      }
    });
  });
}

export async function gbotStatus(): Promise<{
  kind: "gbot";
  label: string;
  installed: boolean;
  version: string | null;
  loggedIn: boolean | null;
  detail: string;
  botCount: number | null;
}> {
  const entry = gbotEntry();
  if (!entry) {
    return {
      kind: "gbot",
      label: "Grok Bot (Desktop-Sync)",
      installed: false,
      version: null,
      loggedIn: null,
      detail: "Nicht installiert. npm install -g grok-bot-cli",
      botCount: null,
    };
  }
  let version: string | null = null;
  try {
    const pkg = JSON.parse(readFileSync(join(entry, "..", "..", "..", "package.json"), "utf8")) as { version?: string };
    version = pkg.version ?? null;
  } catch {
    /* ignore */
  }
  try {
    const bots = await listGrokBots();
    return {
      kind: "gbot",
      label: "Grok Bot (Desktop-Sync)",
      installed: true,
      version,
      loggedIn: true,
      detail: `${bots.length} Bots aus der Desktop-Sitzung`,
      botCount: bots.length,
    };
  } catch (error) {
    return {
      kind: "gbot",
      label: "Grok Bot (Desktop-Sync)",
      installed: true,
      version,
      loggedIn: false,
      detail: error instanceof Error ? error.message : String(error),
      botCount: null,
    };
  }
}

export async function listGrokBots(): Promise<GrokBotRow[]> {
  const raw = await runGbotJson(["bots", "list"]);
  if (!Array.isArray(raw)) throw new Error("Unerwartete gbot-Antwort (keine Liste).");
  const out: GrokBotRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.name !== "string") continue;
    out.push({
      id: row.id,
      name: row.name,
      ...(typeof row.title === "string" ? { title: row.title } : {}),
      ...(typeof row.description === "string" ? { description: row.description } : {}),
      ...(typeof row.avatarColor === "string" ? { avatarColor: row.avatarColor } : {}),
      ...(typeof row.avatarShape === "string" ? { avatarShape: row.avatarShape } : {}),
      ...(typeof row.hiddenFromSidebar === "boolean" ? { hiddenFromSidebar: row.hiddenFromSidebar } : {}),
      ...(typeof row.kind === "string" ? { kind: row.kind } : {}),
    });
  }
  return out;
}

export type ImportResult = {
  imported: { grokBotId: string; agentId: string; name: string; status: "created" | "skipped" }[];
  errors: { grokBotId: string; name?: string; error: string }[];
};

type CreateFn = (input: {
  name: string;
  title: string;
  roleDescription: string;
  visibility: "private";
  systemPrompt?: string;
}) => Promise<{ id: string; name: string }>;

type ListFn = () => Promise<{ id: string; name: string }[]>;

/**
 * Import selected Grok bots as Connect agents. Duplicate = already in import-map OR same name
 * with source note; skips those. No secrets in the map.
 */
export async function importGrokBots(
  grokBotIds: string[],
  create: CreateFn,
  listExisting: ListFn,
): Promise<ImportResult> {
  const wanted = new Set(grokBotIds.filter((id) => /^[A-Za-z0-9_-]{8,80}$/.test(id)));
  if (wanted.size === 0) return { imported: [], errors: [{ grokBotId: "", error: "Keine gültigen Bot-IDs." }] };

  const bots = await listGrokBots();
  const byId = new Map(bots.map((bot) => [bot.id, bot]));
  const map = readImportMap();
  const existing = await listExisting();
  const existingNames = new Set(existing.map((agent) => agent.name.trim().toLowerCase()));
  const result: ImportResult = { imported: [], errors: [] };

  for (const id of wanted) {
    const bot = byId.get(id);
    if (!bot) {
      result.errors.push({ grokBotId: id, error: "Bot nicht in gbot bots list gefunden." });
      continue;
    }
    const already = map.byGrokId[id];
    if (already && existing.some((agent) => agent.id === already)) {
      result.imported.push({ grokBotId: id, agentId: already, name: bot.name, status: "skipped" });
      continue;
    }
    if (existingNames.has(bot.name.trim().toLowerCase())) {
      result.imported.push({ grokBotId: id, agentId: existing.find((a) => a.name.trim().toLowerCase() === bot.name.trim().toLowerCase())!.id, name: bot.name, status: "skipped" });
      continue;
    }
    const title = (bot.title?.trim() || bot.name).slice(0, 120);
    const roleDescription = (
      bot.description?.trim() ||
      `Importiert aus Grok Bot (${bot.name}).`
    ).slice(0, 4000);
    try {
      const agent = await create({
        name: bot.name.slice(0, 80),
        title,
        roleDescription,
        visibility: "private",
        systemPrompt: roleDescription,
      });
      map.byGrokId[id] = agent.id;
      existingNames.add(agent.name.trim().toLowerCase());
      result.imported.push({ grokBotId: id, agentId: agent.id, name: agent.name, status: "created" });
    } catch (error) {
      result.errors.push({
        grokBotId: id,
        name: bot.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  map.updatedAt = new Date().toISOString();
  writeImportMap(map);
  return result;
}

/** Public list for the UI: bots + alreadyImported flag, no secrets. */
export async function listGrokBotsForUi(): Promise<{
  bots: (GrokBotRow & { alreadyImported: boolean; connectAgentId: string | null })[];
  status: Awaited<ReturnType<typeof gbotStatus>>;
}> {
  const status = await gbotStatus();
  if (!status.installed || status.loggedIn === false) {
    return { bots: [], status };
  }
  const bots = await listGrokBots();
  const map = readImportMap();
  return {
    bots: bots.map((bot) => ({
      ...bot,
      alreadyImported: Boolean(map.byGrokId[bot.id]),
      connectAgentId: map.byGrokId[bot.id] ?? null,
    })),
    status,
  };
}
