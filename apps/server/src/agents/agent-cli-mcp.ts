/**
 * Echte MCP-Server pro CLI (Phase C - Schritt 15).
 *
 * Verwaltet und synchronisiert die MCP-Konfiguration der jeweiligen CLI
 * aus deren echter Konfigurationsdatei im isolierten Agenten-Konto:
 *
 * 1. Antigravity: %LOCALAPPDATA%\ConnectAgents\<agentId>\antigravity-home\.gemini\antigravity\mcp_config.json
 * 2. Codex:       %LOCALAPPDATA%\ConnectAgents\<agentId>\codex-home\config.toml (und mcp.json)
 * 3. Claude:      %LOCALAPPDATA%\ConnectAgents\<agentId>\claude-config\.claude.json
 * 4. Hermes:      %LOCALAPPDATA%\ConnectAgents\<agentId>\hermes-home\config.yaml (und mcp.json)
 * 5. Freebuff:    %LOCALAPPDATA%\ConnectAgents\<agentId>\freebuff-config\mcp.json
 * 6. Workspace:   %LOCALAPPDATA%\ConnectAgents\<agentId>\workspace\mcp.json
 *
 * Funktionen:
 * - 1:1 Lesen der echten Konfigurationsdatei von der Festplatte
 * - Änderungen in Connect schreiben sofort zurück in die jeweilige CLI-Config
 * - Dateiüberwachung (fs.watch + mtime) hält Frontend & Backend synchron
 * - 100% Stefan-Profilschutz: Globale Pfade werden NIEMALS berührt
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  watch,
  writeFileSync,
  type FSWatcher,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";
import { getAgentCliConfigDirs } from "../agent-hub/codex-accounts";
import { CUSTOM_MCPS } from "../agent-hub/custom-mcps";
import { assertNotStefanProfile } from "../agent-hub/routes";

export const SUPPORTED_CLIS = [
  "antigravity",
  "codex",
  "claude",
  "hermes",
  "freebuff",
  "workspace",
] as const;

export type SupportedCli = (typeof SUPPORTED_CLIS)[number];

export type AgentCliMcpServer = {
  id: string;
  name: string;
  type: "http" | "sse" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  description?: string;
  enabled: boolean;
};

export type CliConfigFileDetails = {
  cli: SupportedCli;
  primaryPath: string;
  format: "json" | "toml" | "yaml";
  companionPaths: string[];
};

export type CliConfigInfo = {
  cli: SupportedCli;
  agentId: string;
  configFilePath: string;
  format: "json" | "toml" | "yaml";
  exists: boolean;
  lastModified: string | null;
  sizeBytes: number;
  servers: AgentCliMcpServer[];
  rawContent: string;
  availableClis: string[];
  chosenCli: string;
  isWatching: boolean;
};

export type CliMcpChangeEvent = {
  agentId: string;
  cli: SupportedCli;
  filePath: string;
  event: "change" | "rename" | "write";
  timestamp: string;
  lastModified: string;
  serverCount: number;
};

/**
 * Sicherheitsprüfung: Verhindert jeglichen Zugriff auf Stefans Benutzerprofil
 * oder globale CLI-Dateien.
 */
export function assertSafeMcpPath(targetPath: string): void {
  assertNotStefanProfile(targetPath);
  const norm = targetPath.toLowerCase().replace(/\\/g, "/");
  const userProfile = (process.env.USERPROFILE || "").toLowerCase().replace(/\\/g, "/");
  if (userProfile) {
    const globalClaude = `${userProfile}/.claude.json`;
    const globalGemini = `${userProfile}/.gemini/antigravity`;
    if (norm === globalClaude || (norm.startsWith(globalGemini) && !norm.includes("connectagents"))) {
      throw new Error(`SICHERHEITSABBRUCH: Zugriff auf globales Profil strikt verboten: ${targetPath}`);
    }
  }
}

/**
 * Ermittelt die exakten Datei-Pfade für eine gegebene CLI im Agenten-Verzeichnis.
 */
export function getCliConfigFileDetails(
  agentId: string,
  cli: SupportedCli,
  accountEmail?: string | null,
): CliConfigFileDetails {
  const paths = getAgentCliConfigDirs(agentId, accountEmail);

  switch (cli) {
    case "antigravity": {
      const primaryPath = join(
        paths.antigravityHome,
        ".gemini",
        "antigravity",
        "mcp_config.json",
      );
      const companionPaths = [
        join(paths.antigravityHome, ".gemini", "antigravity", "mcp_servers.json"),
        join(paths.antigravityHome, "mcp.json"),
      ];
      return { cli, primaryPath, format: "json", companionPaths };
    }
    case "codex": {
      const primaryPath = join(paths.codexHome, "config.toml");
      const companionPaths = [
        join(paths.codexHome, "mcp.json"),
        join(paths.codexHome, "config.json"),
      ];
      return { cli, primaryPath, format: "toml", companionPaths };
    }
    case "claude": {
      const primaryPath = join(paths.claudeConfig, ".claude.json");
      const companionPaths = [join(paths.claudeConfig, "claude.json")];
      return { cli, primaryPath, format: "json", companionPaths };
    }
    case "hermes": {
      const primaryPath = join(paths.hermesHome, "config.yaml");
      const companionPaths = [join(paths.hermesHome, "mcp.json")];
      return { cli, primaryPath, format: "yaml", companionPaths };
    }
    case "freebuff": {
      // FREEBUFF_CONFIG_DIR ist der Config-Ordner selbst — freebuff liest mcp.json dort.
      const primaryPath = join(paths.freebuffConfig, "mcp.json");
      const companionPaths = [join(paths.freebuffConfig, "manicode", "mcp.json")];
      return { cli, primaryPath, format: "json", companionPaths };
    }
    case "workspace": {
      const primaryPath = join(paths.workspace, "mcp.json");
      const companionPaths = [join(paths.workspace, ".mcp.json")];
      return { cli, primaryPath, format: "json", companionPaths };
    }
  }
}

/**
 * Standard-Start-Server für neu angelegte Config-Dateien.
 */
export function getDefaultMcpServers(): AgentCliMcpServer[] {
  const baseUrl = "http://localhost:3101";
  return [
    {
      id: "flux",
      name: "Flux (E-Commerce/Warenverwaltung)",
      type: "http",
      url: `${baseUrl}/api/connect-mcp/flux/jsonrpc`,
      description: "Produkte, Warenwirtschaft, Lagerbestände und Bestellungen",
      enabled: true,
    },
    {
      id: "spark",
      name: "Spark (Wissen)",
      type: "http",
      url: `${baseUrl}/api/connect-mcp/spark/jsonrpc`,
      description: "Unternehmenswissen, Brain-Memory und Notizen",
      enabled: true,
    },
    {
      id: "hyper",
      name: "Hyper (Trading)",
      type: "http",
      url: `${baseUrl}/api/connect-mcp/hyper/jsonrpc`,
      description: "Marktdaten, Charts und Handelsausführung",
      enabled: false,
    },
    {
      id: "analyse",
      name: "Analyse (Social Automatisierung)",
      type: "http",
      url: `${baseUrl}/api/connect-mcp/analyse/jsonrpc`,
      description: "Social Media Analyse und Reporting",
      enabled: false,
    },
    {
      id: "connect-mcp",
      name: "Connect-MCP",
      type: "http",
      url: `${baseUrl}/api/connect-mcp/jsonrpc`,
      description: "Globale Connect-Tools (Agenten, Apps, Steuerung)",
      enabled: true,
    },
    {
      id: "connect-browser",
      name: "Connect-Browser",
      type: "http",
      url: `${baseUrl}/api/connect-mcp/browser/jsonrpc`,
      description: "Browser-Steuerung via CDP & Helium",
      enabled: true,
    },
  ];
}

/* ========================================================================== */
/* Parser & Serialisierer für JSON, TOML und YAML                             */
/* ========================================================================== */

/**
 * Parst eine JSON-MCP-Konfigurationsdatei und extrahiert die Server.
 */
export function parseJsonMcpServers(raw: string): {
  servers: AgentCliMcpServer[];
  rawParsed: Record<string, unknown>;
} {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const serversMap =
      (obj.mcpServers as Record<string, unknown>) ||
      (obj.mcp_servers as Record<string, unknown>) ||
      {};

    const list: AgentCliMcpServer[] = [];
    for (const [id, val] of Object.entries(serversMap)) {
      if (!val || typeof val !== "object") continue;
      const entry = val as Record<string, unknown>;
      const customMatch = CUSTOM_MCPS.find((c) => c.id.toLowerCase() === id.toLowerCase());

      const rawType = typeof entry.type === "string" ? entry.type.toLowerCase() : "";
      const type: "http" | "sse" | "stdio" =
        rawType === "stdio" ? "stdio" : rawType === "sse" ? "sse" : "http";

      list.push({
        id,
        name: (entry.name as string) || (entry.title as string) || customMatch?.name || id,
        type,
        url: typeof entry.url === "string" ? entry.url : undefined,
        command: typeof entry.command === "string" ? entry.command : undefined,
        args: Array.isArray(entry.args) ? entry.args.map(String) : undefined,
        env: entry.env && typeof entry.env === "object" ? (entry.env as Record<string, string>) : undefined,
        description: (entry.description as string) || customMatch?.description || undefined,
        enabled: entry.enabled !== false,
      });
    }

    return { servers: list, rawParsed: obj };
  } catch {
    return { servers: [], rawParsed: {} };
  }
}

/**
 * Parst eine TOML-MCP-Konfigurationsdatei (z.B. Codex config.toml).
 */
export function parseTomlMcpServers(raw: string): {
  servers: AgentCliMcpServer[];
  rawParsed: Record<string, unknown>;
} {
  let parsed: Record<string, unknown> = {};
  try {
    const bun = (globalThis as { Bun?: { TOML?: { parse: (s: string) => Record<string, unknown> } } }).Bun;
    if (bun?.TOML?.parse) {
      parsed = bun.TOML.parse(raw);
    }
  } catch {
    parsed = {};
  }

  // Fallback: Einfaches Zeilen-Parsing für [mcp_servers.<name>]
  if (Object.keys(parsed).length === 0) {
    const lines = raw.split(/\r?\n/);
    let currentServer: string | null = null;
    const serversMap: Record<string, Record<string, unknown>> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const headerMatch = trimmed.match(/^\[mcp_servers\.([a-zA-Z0-9_-]+)\]$/);
      if (headerMatch) {
        currentServer = headerMatch[1];
        serversMap[currentServer] = serversMap[currentServer] || {};
        continue;
      }

      if (currentServer && trimmed.includes("=")) {
        const [k, ...rest] = trimmed.split("=");
        const key = k.trim();
        const rawVal = rest.join("=").trim().replace(/^["']|["']$/g, "");
        if (key === "url") serversMap[currentServer].url = rawVal;
        if (key === "command") serversMap[currentServer].command = rawVal;
        if (key === "type") serversMap[currentServer].type = rawVal;
        if (key === "enabled") serversMap[currentServer].enabled = rawVal === "true";
      }
    }
    parsed = { mcp_servers: serversMap };
  }

  const serversMap =
    (parsed.mcp_servers as Record<string, unknown>) ||
    (parsed.mcpServers as Record<string, unknown>) ||
    {};

  const list: AgentCliMcpServer[] = [];
  for (const [id, val] of Object.entries(serversMap)) {
    if (!val || typeof val !== "object") continue;
    const entry = val as Record<string, unknown>;
    const customMatch = CUSTOM_MCPS.find((c) => c.id.toLowerCase() === id.toLowerCase());

    const type: "http" | "sse" | "stdio" =
      entry.type === "stdio" || (!entry.url && entry.command) ? "stdio" : "http";

    list.push({
      id,
      name: (entry.name as string) || customMatch?.name || id,
      type,
      url: typeof entry.url === "string" ? entry.url : undefined,
      command: typeof entry.command === "string" ? entry.command : undefined,
      args: Array.isArray(entry.args) ? entry.args.map(String) : undefined,
      description: (entry.description as string) || customMatch?.description || undefined,
      enabled: entry.enabled !== false && entry.enabled !== "false",
    });
  }

  return { servers: list, rawParsed: parsed };
}

/**
 * Parst eine YAML-MCP-Konfigurationsdatei (z.B. Hermes config.yaml).
 */
export function parseYamlMcpServers(raw: string): {
  servers: AgentCliMcpServer[];
  rawParsed: Record<string, unknown>;
} {
  try {
    const parsed = (YAML.parse(raw) as Record<string, unknown>) || {};
    const serversMap =
      (parsed.mcp_servers as Record<string, unknown>) ||
      (parsed.mcpServers as Record<string, unknown>) ||
      {};

    const list: AgentCliMcpServer[] = [];
    for (const [id, val] of Object.entries(serversMap)) {
      if (!val || typeof val !== "object") continue;
      const entry = val as Record<string, unknown>;
      const customMatch = CUSTOM_MCPS.find((c) => c.id.toLowerCase() === id.toLowerCase());

      const type: "http" | "sse" | "stdio" =
        entry.type === "stdio" || (!entry.url && entry.command) ? "stdio" : "http";

      list.push({
        id,
        name: (entry.name as string) || customMatch?.name || id,
        type,
        url: typeof entry.url === "string" ? entry.url : undefined,
        command: typeof entry.command === "string" ? entry.command : undefined,
        args: Array.isArray(entry.args) ? entry.args.map(String) : undefined,
        description: (entry.description as string) || customMatch?.description || undefined,
        enabled: entry.enabled !== false,
      });
    }

    return { servers: list, rawParsed: parsed };
  } catch {
    return { servers: [], rawParsed: {} };
  }
}

/**
 * Erstellt den String-Inhalt für eine JSON-Konfigurationsdatei.
 */
export function serializeJsonMcp(
  servers: AgentCliMcpServer[],
  existingParsed: Record<string, unknown> = {},
): string {
  const map: Record<string, unknown> = {};
  for (const s of servers) {
    map[s.id] = {
      type: s.type,
      ...(s.url ? { url: s.url } : {}),
      ...(s.command ? { command: s.command } : {}),
      ...(s.args && s.args.length > 0 ? { args: s.args } : {}),
      ...(s.env && Object.keys(s.env).length > 0 ? { env: s.env } : {}),
      ...(s.description ? { description: s.description } : {}),
      enabled: s.enabled,
    };
  }

  const out = { ...existingParsed, mcpServers: map, mcp_servers: map };
  return JSON.stringify(out, null, 2);
}

/**
 * Erstellt den String-Inhalt für eine TOML-Konfigurationsdatei.
 */
export function serializeTomlMcp(
  servers: AgentCliMcpServer[],
  existingParsed: Record<string, unknown> = {},
): string {
  const lines: string[] = [
    "# Automatisch synchronisiert von Connect App (Phase C Schritt 15)",
    "# Echte MCP-Server Konfiguration",
    "",
  ];

  for (const s of servers) {
    const safeKey = s.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    lines.push(`[mcp_servers.${safeKey}]`);
    if (s.type) lines.push(`type = "${s.type}"`);
    if (s.url) lines.push(`url = "${s.url}"`);
    if (s.command) lines.push(`command = "${s.command}"`);
    if (s.args && s.args.length > 0) lines.push(`args = ${JSON.stringify(s.args)}`);
    if (s.description) lines.push(`description = "${s.description}"`);
    lines.push(`enabled = ${s.enabled}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Erstellt den String-Inhalt für eine YAML-Konfigurationsdatei.
 */
export function serializeYamlMcp(
  servers: AgentCliMcpServer[],
  existingParsed: Record<string, unknown> = {},
): string {
  const map: Record<string, unknown> = {};
  for (const s of servers) {
    map[s.id] = {
      ...(s.type ? { type: s.type } : {}),
      ...(s.url ? { url: s.url } : {}),
      ...(s.command ? { command: s.command } : {}),
      ...(s.args && s.args.length > 0 ? { args: s.args } : {}),
      ...(s.description ? { description: s.description } : {}),
      enabled: s.enabled,
    };
  }

  const out = {
    ...existingParsed,
    mcp_servers: Object.keys(map).length > 0 ? map : {},
  };
  return YAML.stringify(out);
}

/* ========================================================================== */
/* Dateiüberwachung (File Watcher)                                             */
/* ========================================================================== */

type AgentWatcherState = {
  watchers: FSWatcher[];
  watchedDirs: Set<string>;
  listeners: Set<(evt: CliMcpChangeEvent) => void>;
  lastMtimes: Map<string, number>;
  debounceTimers: Map<string, Timer>;
};

const agentWatchers = new Map<string, AgentWatcherState>();

function getOrCreateAgentWatcher(agentId: string): AgentWatcherState {
  let state = agentWatchers.get(agentId);
  if (!state) {
    state = {
      watchers: [],
      watchedDirs: new Set(),
      listeners: new Set(),
      lastMtimes: new Map(),
      debounceTimers: new Map(),
    };
    agentWatchers.set(agentId, state);
  }
  return state;
}

/**
 * Registriert eine Dateiüberwachung für die Verzeichnisse eines Agenten.
 */
export function watchAgentCliMcpFiles(
  agentId: string,
  accountEmail?: string | null,
): void {
  const state = getOrCreateAgentWatcher(agentId);

  for (const cli of SUPPORTED_CLIS) {
    const details = getCliConfigFileDetails(agentId, cli, accountEmail);
    assertSafeMcpPath(details.primaryPath);

    const dir = dirname(details.primaryPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (!state.watchedDirs.has(dir)) {
      try {
        const w = watch(dir, { recursive: false }, (eventType, filename) => {
          if (!filename) return;
          const changedFileName = String(filename).toLowerCase();
          const primaryName = details.primaryPath.split(/[/\\]/).pop()?.toLowerCase();

          if (primaryName && changedFileName === primaryName) {
            handleConfigFileChanged(agentId, cli, details.primaryPath, eventType as any);
          }
        });
        state.watchers.push(w);
        state.watchedDirs.add(dir);
      } catch (err) {
        console.warn(`[agent-cli-mcp] Konnte Verzeichnis nicht überwachen (${dir}):`, err);
      }
    }
  }
}

function handleConfigFileChanged(
  agentId: string,
  cli: SupportedCli,
  filePath: string,
  event: "change" | "rename" | "write",
): void {
  const state = agentWatchers.get(agentId);
  if (!state) return;

  // Debounce (150ms)
  const existingTimer = state.debounceTimers.get(filePath);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(() => {
    state.debounceTimers.delete(filePath);
    try {
      if (!existsSync(filePath)) return;
      const stats = statSync(filePath);
      const prevMtime = state.lastMtimes.get(filePath) || 0;
      if (stats.mtimeMs <= prevMtime) return;

      state.lastMtimes.set(filePath, stats.mtimeMs);

      // Inhalt lesen und Anzahl Server ermitteln
      const config = readAgentCliMcpConfig(agentId, cli);
      const changeEvt: CliMcpChangeEvent = {
        agentId,
        cli,
        filePath,
        event,
        timestamp: new Date().toISOString(),
        lastModified: config.lastModified || new Date().toISOString(),
        serverCount: config.servers.length,
      };

      for (const listener of state.listeners) {
        try {
          listener(changeEvt);
        } catch (err) {
          console.error("[agent-cli-mcp] Listener-Fehler:", err);
        }
      }
    } catch {}
  }, 150);

  state.debounceTimers.set(filePath, timer);
}

/**
 * Abonniert Änderungen an den CLI-MCP-Konfigurationsdateien eines Agenten.
 */
export function subscribeAgentCliMcpChanges(
  agentId: string,
  callback: (evt: CliMcpChangeEvent) => void,
  accountEmail?: string | null,
): () => void {
  const state = getOrCreateAgentWatcher(agentId);
  state.listeners.add(callback);
  watchAgentCliMcpFiles(agentId, accountEmail);

  return () => {
    state.listeners.delete(callback);
  };
}

/* ========================================================================== */
/* Hauptfunktionen: Lesen, Schreiben, Synchronisieren                          */
/* ========================================================================== */

/**
 * Liest die MCP-Konfiguration der jeweiligen CLI 1:1 aus ihrer Config-Datei.
 */
export function readAgentCliMcpConfig(
  agentId: string,
  cliInput?: string,
  accountEmail?: string | null,
): CliConfigInfo {
  const cli: SupportedCli = SUPPORTED_CLIS.includes(cliInput as SupportedCli)
    ? (cliInput as SupportedCli)
    : "antigravity";

  const details = getCliConfigFileDetails(agentId, cli, accountEmail);
  assertSafeMcpPath(details.primaryPath);

  const dir = dirname(details.primaryPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let exists = existsSync(details.primaryPath);
  let rawContent = "";
  let lastModified: string | null = null;
  let sizeBytes = 0;

  // Falls die Datei noch nicht existiert: Standard-Server anlegen
  if (!exists) {
    const defaultServers = getDefaultMcpServers();
    let initialContent = "";
    if (details.format === "json") initialContent = serializeJsonMcp(defaultServers);
    else if (details.format === "toml") initialContent = serializeTomlMcp(defaultServers);
    else initialContent = serializeYamlMcp(defaultServers);

    writeFileSync(details.primaryPath, initialContent, "utf8");
    exists = true;

    // Auch Companion-Files seeding
    for (const comp of details.companionPaths) {
      try {
        mkdirSync(dirname(comp), { recursive: true });
        if (!existsSync(comp)) {
          writeFileSync(comp, serializeJsonMcp(defaultServers), "utf8");
        }
      } catch {}
    }
  }

  try {
    rawContent = readFileSync(details.primaryPath, "utf8");
    const stats = statSync(details.primaryPath);
    lastModified = new Date(stats.mtimeMs).toISOString();
    sizeBytes = stats.size;
  } catch (err) {
    console.error(`[agent-cli-mcp] Fehler beim Lesen von ${details.primaryPath}:`, err);
    rawContent = "";
  }

  let servers: AgentCliMcpServer[] = [];
  if (details.format === "json") {
    servers = parseJsonMcpServers(rawContent).servers;
  } else if (details.format === "toml") {
    servers = parseTomlMcpServers(rawContent).servers;
  } else {
    servers = parseYamlMcpServers(rawContent).servers;
  }

  // Sicherstellen, dass die Datei überwacht wird
  watchAgentCliMcpFiles(agentId, accountEmail);

  return {
    cli,
    agentId,
    configFilePath: details.primaryPath,
    format: details.format,
    exists,
    lastModified,
    sizeBytes,
    servers,
    rawContent,
    availableClis: [...SUPPORTED_CLIS],
    chosenCli: cli,
    isWatching: true,
  };
}

/**
 * Schreibt eine aktualisierte Server-Liste zurück in die CLI-Config-Datei.
 */
export function writeAgentCliMcpConfig(
  agentId: string,
  cliInput: string,
  servers: AgentCliMcpServer[],
  accountEmail?: string | null,
): CliConfigInfo {
  const cli: SupportedCli = SUPPORTED_CLIS.includes(cliInput as SupportedCli)
    ? (cliInput as SupportedCli)
    : "antigravity";

  const details = getCliConfigFileDetails(agentId, cli, accountEmail);
  assertSafeMcpPath(details.primaryPath);

  mkdirSync(dirname(details.primaryPath), { recursive: true });

  let existingRaw = "";
  if (existsSync(details.primaryPath)) {
    try {
      existingRaw = readFileSync(details.primaryPath, "utf8");
    } catch {}
  }

  let newContent = "";
  if (details.format === "json") {
    const { rawParsed } = parseJsonMcpServers(existingRaw);
    newContent = serializeJsonMcp(servers, rawParsed);
  } else if (details.format === "toml") {
    const { rawParsed } = parseTomlMcpServers(existingRaw);
    newContent = serializeTomlMcp(servers, rawParsed);
  } else {
    const { rawParsed } = parseYamlMcpServers(existingRaw);
    newContent = serializeYamlMcp(servers, rawParsed);
  }

  writeFileSync(details.primaryPath, newContent, "utf8");

  // Companion-Dateien aktualisieren
  const jsonContent = serializeJsonMcp(servers);
  for (const comp of details.companionPaths) {
    try {
      mkdirSync(dirname(comp), { recursive: true });
      writeFileSync(comp, jsonContent, "utf8");
    } catch (err) {
      console.warn(`[agent-cli-mcp] Companion-Fehler bei ${comp}:`, err);
    }
  }

  // Watcher triggern
  handleConfigFileChanged(agentId, cli, details.primaryPath, "write");

  return readAgentCliMcpConfig(agentId, cli, accountEmail);
}

/**
 * Schreibt den rohen Inhalt (JSON/TOML/YAML) 1:1 zurück in die Datei.
 */
export function writeRawAgentCliMcpConfig(
  agentId: string,
  cliInput: string,
  rawContent: string,
  accountEmail?: string | null,
): CliConfigInfo {
  const cli: SupportedCli = SUPPORTED_CLIS.includes(cliInput as SupportedCli)
    ? (cliInput as SupportedCli)
    : "antigravity";

  const details = getCliConfigFileDetails(agentId, cli, accountEmail);
  assertSafeMcpPath(details.primaryPath);

  // Validierung je nach Format
  if (details.format === "json") {
    JSON.parse(rawContent); // Wirft bei Syntaxfehler
  } else if (details.format === "yaml") {
    YAML.parse(rawContent); // Wirft bei Syntaxfehler
  }

  mkdirSync(dirname(details.primaryPath), { recursive: true });
  writeFileSync(details.primaryPath, rawContent, "utf8");

  // Server aus neuem Inhalt parsen für Companion-Sync
  let servers: AgentCliMcpServer[] = [];
  if (details.format === "json") servers = parseJsonMcpServers(rawContent).servers;
  else if (details.format === "toml") servers = parseTomlMcpServers(rawContent).servers;
  else servers = parseYamlMcpServers(rawContent).servers;

  const jsonContent = serializeJsonMcp(servers);
  for (const comp of details.companionPaths) {
    try {
      mkdirSync(dirname(comp), { recursive: true });
      writeFileSync(comp, jsonContent, "utf8");
    } catch {}
  }

  handleConfigFileChanged(agentId, cli, details.primaryPath, "write");
  return readAgentCliMcpConfig(agentId, cli, accountEmail);
}

/**
 * Synchronisiert die MCP-Server in ALLE 6 CLI-Verzeichnisse des Agenten.
 */
export function syncAllAgentCliMcpConfigs(
  agentId: string,
  servers: AgentCliMcpServer[],
  accountEmail?: string | null,
): { syncedClis: string[]; writtenFiles: string[] } {
  const writtenFiles: string[] = [];

  for (const cli of SUPPORTED_CLIS) {
    const details = getCliConfigFileDetails(agentId, cli, accountEmail);
    assertSafeMcpPath(details.primaryPath);

    mkdirSync(dirname(details.primaryPath), { recursive: true });

    let content = "";
    if (details.format === "json") content = serializeJsonMcp(servers);
    else if (details.format === "toml") content = serializeTomlMcp(servers);
    else content = serializeYamlMcp(servers);

    writeFileSync(details.primaryPath, content, "utf8");
    writtenFiles.push(details.primaryPath);

    const jsonContent = serializeJsonMcp(servers);
    for (const comp of details.companionPaths) {
      try {
        mkdirSync(dirname(comp), { recursive: true });
        writeFileSync(comp, jsonContent, "utf8");
        writtenFiles.push(comp);
      } catch {}
    }

    handleConfigFileChanged(agentId, cli, details.primaryPath, "write");
  }

  return {
    syncedClis: [...SUPPORTED_CLIS],
    writtenFiles,
  };
}
