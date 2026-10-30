/**
 * Agent CLI-Config MCP Synchronizer (Phase C - Schritt 16).
 *
 * Schreibt die für einen Agenten aktivierten MCPs (Flux, Spark, Hyper, Analyse,
 * Connect-MCP, Connect-Browser und weitere Verbinder) in alle isolierten
 * CLI-Konfigurationsverzeichnisse des Agenten:
 *
 * 1. Claude CLI:      %LOCALAPPDATA%\ConnectAgents\<agentId>\claude-config\.claude.json
 * 2. Codex CLI:       %LOCALAPPDATA%\ConnectAgents\<agentId>\codex-home\mcp.json & config.toml
 * 3. Hermes:          %LOCALAPPDATA%\ConnectAgents\<agentId>\hermes-home\config.yaml & mcp.json
 * 4. Antigravity:     %LOCALAPPDATA%\ConnectAgents\<agentId>\antigravity-home\.gemini\antigravity\mcp_config.json
 * 5. Freebuff:        %LOCALAPPDATA%\ConnectAgents\<agentId>\freebuff-config\mcp.json
 * 6. Workspace:       %LOCALAPPDATA%\ConnectAgents\<agentId>\workspace\mcp.json
 *
 * WICHTIG: Stefans globales Benutzerprofil (%USERPROFILE%\.claude.json, etc.)
 * wird NIEMALS angefasst. Alles bleibt strikt in den Bot-Verzeichnissen isoliert.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "../db/client";
import { listLinks, listServerRows } from "./db";
import { getAgentCliConfigDirs } from "./codex-accounts";
import { CUSTOM_MCPS, getCustomMcp } from "./custom-mcps";
import { lookupAgentAccountEmail } from "./agent-terminal-manager";

export type McpServerConfigEntry = {
  name: string;
  type: "http" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  description?: string;
};

export type CliMcpSyncResult = {
  agentId: string;
  accountEmail: string | null;
  activeServers: string[];
  syncedFiles: string[];
  updatedAt: string;
};

function getConnectBaseUrl(): string {
  if (process.env.CONNECT_APP_URL) {
    try {
      const u = new URL(process.env.CONNECT_APP_URL);
      return `${u.protocol}//${u.host}`;
    } catch {}
  }
  return "http://localhost:3101";
}

/**
 * Ermittelt alle für einen Agenten aktiven MCP-Server (Eigene MCPs + konfigurierte Verbinder).
 */
export async function getActiveAgentMcpConfigs(
  database: Database,
  agentId: string,
): Promise<Record<string, McpServerConfigEntry>> {
  const links = await listLinks(database, agentId);
  const activeLinks = new Set(
    links.filter((l) => l.enabled).map((l) => l.server_id.toLowerCase()),
  );

  const baseUrl = getConnectBaseUrl();
  const result: Record<string, McpServerConfigEntry> = {};

  // 1. Eigene MCPs prüfen
  for (const mcp of CUSTOM_MCPS) {
    const isEnabled =
      activeLinks.has(mcp.id.toLowerCase()) ||
      activeLinks.has(mcp.scope.toLowerCase()) ||
      (mcp.id === "connect-browser" && (activeLinks.size === 0 || Array.from(activeLinks).some((l) => l.includes("browser"))));
    if (isEnabled) {
      result[mcp.id] = {
        name: mcp.name,
        type: "http",
        url: `${baseUrl}${mcp.endpointPath}`,
        description: mcp.description,
      };
    }
  }

  // 2. Weitere Verbinder aus connect_mcp_servers prüfen
  try {
    const servers = await listServerRows(database);
    for (const server of servers) {
      if (activeLinks.has(server.id.toLowerCase())) {
        const def = server.definition as {
          title?: string;
          transport?: string;
          url?: string;
          command?: string;
          args?: string[];
        };
        if (def && !result[server.id]) {
          result[server.id] = {
            name: def.title || server.id,
            type: def.transport === "http" || def.transport === "sse" ? "http" : "stdio",
            url: def.url,
            command: def.command,
            args: def.args,
          };
        }
      }
    }
  } catch {
    // Best effort
  }

  return result;
}

/**
 * Schreibt die MCP-Konfiguration sauber in eine JSON-Datei, ohne andere Schlüssel zu löschen.
 */
function mergeJsonMcpConfig(filePath: string, mcpMap: Record<string, unknown>): void {
  try {
    const dir = join(filePath, "..");
    mkdirSync(dir, { recursive: true });

    let existing: Record<string, unknown> = {};
    if (existsSync(filePath)) {
      try {
        existing = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
      } catch {
        existing = {};
      }
    }

    existing.mcpServers = mcpMap;
    // Auch als Kompatibilitätsalias für Antigravity / Tools
    existing.mcp_servers = mcpMap;

    writeFileSync(filePath, JSON.stringify(existing, null, 2), "utf8");
  } catch (err) {
    console.error(`[cli-mcp-sync] Fehler beim Schreiben von ${filePath}:`, err);
  }
}

/**
 * Schreibt TOML-Konfiguration für Codex CLI.
 */
function writeCodexTomlConfig(filePath: string, mcpMap: Record<string, McpServerConfigEntry>): void {
  try {
    const dir = join(filePath, "..");
    mkdirSync(dir, { recursive: true });

    const lines: string[] = [
      "# Automatisch generiert von Connect App (Phase C Schritt 16)",
      "# Eigene MCPs pro Agent",
      "",
    ];

    for (const [id, cfg] of Object.entries(mcpMap)) {
      const safeKey = id.replace(/[^a-zA-Z0-9_-]/g, "_");
      lines.push(`[mcp_servers.${safeKey}]`);
      if (cfg.url) {
        lines.push(`url = "${cfg.url}"`);
      }
      if (cfg.command) {
        lines.push(`command = "${cfg.command}"`);
      }
      if (cfg.args && cfg.args.length > 0) {
        lines.push(`args = ${JSON.stringify(cfg.args)}`);
      }
      lines.push("");
    }

    writeFileSync(filePath, lines.join("\n"), "utf8");
  } catch (err) {
    console.error(`[cli-mcp-sync] Fehler beim Schreiben von ${filePath}:`, err);
  }
}

/**
 * Schreibt YAML-Konfiguration für Hermes Agent.
 */
function writeHermesYamlConfig(filePath: string, mcpMap: Record<string, McpServerConfigEntry>): void {
  try {
    const dir = join(filePath, "..");
    mkdirSync(dir, { recursive: true });

    const lines: string[] = [
      "# Automatisch generiert von Connect App (Phase C Schritt 16)",
      "# Eigene MCPs pro Agent",
      "mcp_servers:",
    ];

    if (Object.keys(mcpMap).length === 0) {
      lines.push("  {}");
    } else {
      for (const [id, cfg] of Object.entries(mcpMap)) {
        lines.push(`  ${id}:`);
        if (cfg.url) {
          lines.push(`    url: "${cfg.url}"`);
        }
        if (cfg.command) {
          lines.push(`    command: "${cfg.command}"`);
        }
      }
    }

    writeFileSync(filePath, lines.join("\n"), "utf8");
  } catch (err) {
    console.error(`[cli-mcp-sync] Fehler beim Schreiben von ${filePath}:`, err);
  }
}

/**
 * Führt den vollständigen Sync aller aktivierten MCPs in die CLI-Configs des Agenten durch.
 */
export async function syncAgentCliMcpConfigs(
  database: Database,
  agentId: string,
): Promise<CliMcpSyncResult> {
  const accountEmail = await lookupAgentAccountEmail(agentId);
  const paths = getAgentCliConfigDirs(agentId, accountEmail);
  const activeConfigs = await getActiveAgentMcpConfigs(database, agentId);

  // Generisches Format für JSON-Configs
  const mcpServersJson: Record<
    string,
    { type: string; url?: string; command?: string; args?: string[] }
  > = {};

  for (const [id, cfg] of Object.entries(activeConfigs)) {
    mcpServersJson[id] = {
      type: cfg.type,
      ...(cfg.url ? { url: cfg.url } : {}),
      ...(cfg.command ? { command: cfg.command } : {}),
      ...(cfg.args ? { args: cfg.args } : {}),
    };
  }

  const syncedFiles: string[] = [];

  // 1. Claude CLI (.claude.json und claude.json)
  const claudeDotJson = join(paths.claudeConfig, ".claude.json");
  const claudeJson = join(paths.claudeConfig, "claude.json");
  mergeJsonMcpConfig(claudeDotJson, mcpServersJson);
  mergeJsonMcpConfig(claudeJson, mcpServersJson);
  syncedFiles.push(claudeDotJson, claudeJson);

  // 2. Codex CLI (mcp.json, config.json, config.toml)
  const codexMcpJson = join(paths.codexHome, "mcp.json");
  const codexConfigJson = join(paths.codexHome, "config.json");
  const codexConfigToml = join(paths.codexHome, "config.toml");
  mergeJsonMcpConfig(codexMcpJson, mcpServersJson);
  mergeJsonMcpConfig(codexConfigJson, mcpServersJson);
  writeCodexTomlConfig(codexConfigToml, activeConfigs);
  syncedFiles.push(codexMcpJson, codexConfigJson, codexConfigToml);

  // 3. Hermes (config.yaml, mcp.json)
  const hermesYaml = join(paths.hermesHome, "config.yaml");
  const hermesMcpJson = join(paths.hermesHome, "mcp.json");
  writeHermesYamlConfig(hermesYaml, activeConfigs);
  mergeJsonMcpConfig(hermesMcpJson, mcpServersJson);
  syncedFiles.push(hermesYaml, hermesMcpJson);

  // 4. Antigravity CLI (.gemini/antigravity/mcp_config.json, mcp.json)
  const antigravityMcpConfig = join(paths.antigravityHome, ".gemini", "antigravity", "mcp_config.json");
  const antigravityMcpServers = join(paths.antigravityHome, ".gemini", "antigravity", "mcp_servers.json");
  const antigravityMcpJson = join(paths.antigravityHome, "mcp.json");
  mergeJsonMcpConfig(antigravityMcpConfig, mcpServersJson);
  mergeJsonMcpConfig(antigravityMcpServers, mcpServersJson);
  mergeJsonMcpConfig(antigravityMcpJson, mcpServersJson);
  syncedFiles.push(antigravityMcpConfig, antigravityMcpServers, antigravityMcpJson);

  // 5. Freebuff CLI (manicode/settings.json, mcp.json)
  // FREEBUFF_CONFIG_DIR ist der Config-Ordner selbst — die CLI liest mcp.json dort.
  const freebuffMcpJson = join(paths.freebuffConfig, "mcp.json");
  mergeJsonMcpConfig(freebuffMcpJson, mcpServersJson);
  syncedFiles.push(freebuffMcpJson);

  // 6. Agent Workspace (workspace/mcp.json, workspace/.mcp.json)
  const workspaceMcpJson = join(paths.workspace, "mcp.json");
  const workspaceDotMcpJson = join(paths.workspace, ".mcp.json");
  mergeJsonMcpConfig(workspaceMcpJson, mcpServersJson);
  mergeJsonMcpConfig(workspaceDotMcpJson, mcpServersJson);
  syncedFiles.push(workspaceMcpJson, workspaceDotMcpJson);

  return {
    agentId,
    accountEmail,
    activeServers: Object.keys(activeConfigs),
    syncedFiles,
    updatedAt: new Date().toISOString(),
  };
}
