/**
 * The MCP servers Connect really supports, as one-click cards ("Verbinder").
 *
 * Every entry turns what a person typed into a server definition. Secrets (tokens) are not part of
 * the definition: routes.ts stores them in the vault and the definition keeps only the pointer.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";

export type FieldSpec = {
  key: string;
  label: string;
  type: "text" | "secret" | "folders" | "url" | "command";
  placeholder?: string;
  help?: string;
  required?: boolean;
};

export type SecretRef = {
  target: "env" | "header";
  name: string;
  prefix?: string;
  credentialId: string;
};

export type ServerDefinition = {
  id: string;
  catalogKey: string;
  title: string;
  transport: "stdio" | "http" | "sse";
  /** For stdio: an npm package installed under %LOCALAPPDATA%\ConnectAgents\mcp, or a raw command. */
  pkg?: string;
  bin?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  secrets?: SecretRef[];
  /** Set for servers that belong to one agent (its own browser). */
  ownerAgentId?: string;
  options?: Record<string, unknown>;
  createdAt: string;
};

export type CatalogEntry = {
  key: string;
  title: string;
  description: string;
  icon: string;
  transport: "stdio" | "http" | "sse" | "builtin";
  /** One instance per agent (browser) instead of one shared server. */
  perAgent?: boolean;
  fields: FieldSpec[];
  /** Secret fields: where the value goes when the server is started. */
  secretTargets?: Record<string, { target: "env" | "header"; name: string; prefix?: string }>;
  docsUrl?: string;
  build?: (input: BuildInput) => Omit<ServerDefinition, "id" | "catalogKey" | "title" | "createdAt" | "secrets">;
};

export type BuildInput = { values: Record<string, string>; agentId?: string };

export function connectAgentsRoot(): string {
  const base = process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? process.env.HOME ?? ".", "AppData", "Local");
  return path.join(base, "ConnectAgents");
}

export function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "agent";
}

export function heliumExecutable(): string {
  const candidates = [
    process.env.CONNECT_HELIUM_BIN,
    process.env.CONNECT_CHROME_BIN,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "imput", "Helium", "Application", "chrome.exe") : undefined,
  ].filter((value): value is string => !!value && value.trim().length > 0);
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0] ?? "chrome";
}

export function agentBrowserDirs(agentId: string) {
  const root = path.join(connectAgentsRoot(), safeSegment(agentId));
  return { root, profile: path.join(root, "helium"), output: path.join(root, "output") };
}

function folderList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\n;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export const CATALOG: CatalogEntry[] = [
  {
    key: "browser",
    title: "Mein Browser",
    description: "Eigener Helium-Browser pro Agent: Seiten öffnen, klicken, Formulare ausfüllen und Screenshots machen.",
    icon: "helium",
    transport: "stdio",
    perAgent: true,
    fields: [],
    build: ({ values, agentId }) => {
      const dirs = agentBrowserDirs(agentId ?? "shared");
      const headless = values.headless !== "false";
      return {
        transport: "stdio",
        pkg: "@playwright/mcp",
        bin: "cli.js",
        args: [
          "--browser",
          "chrome",
          "--executable-path",
          heliumExecutable(),
          "--user-data-dir",
          dirs.profile,
          "--output-dir",
          dirs.output,
          "--image-responses",
          "omit",
          ...(headless ? ["--headless"] : []),
        ],
        options: { headless, profile: dirs.profile },
      };
    },
  },
  {
    key: "filesystem",
    title: "Dateisystem",
    description: "Dateien in freigegebenen Ordnern lesen, durchsuchen und schreiben – nur in den Ordnern, die du angibst.",
    icon: "folder",
    transport: "stdio",
    fields: [
      {
        key: "folders",
        label: "Freigegebene Ordner",
        type: "folders",
        placeholder: "C:\\Users\\…\\Documents\\Projekt",
        help: "Ein Ordner pro Zeile. Der Agent kommt nur an diese Ordner.",
        required: true,
      },
    ],
    build: ({ values }) => {
      const folders = folderList(values.folders);
      return {
        transport: "stdio",
        pkg: "@modelcontextprotocol/server-filesystem",
        bin: "dist/index.js",
        args: folders,
        options: { folders },
      };
    },
  },
  {
    key: "brain",
    title: "Brain",
    description: "Gemeinsames Gedächtnis aus deinem Obsidian-Brain. Rechte stellst du im Brain-Tab des Agents ein.",
    icon: "brain",
    transport: "builtin",
    fields: [],
  },
  {
    key: "github",
    title: "GitHub",
    description: "Repos, Issues und Pull Requests durchsuchen, lesen und bearbeiten (offizieller GitHub-MCP).",
    icon: "github",
    transport: "http",
    docsUrl: "https://github.com/settings/personal-access-tokens",
    fields: [
      {
        key: "token",
        label: "Personal Access Token",
        type: "secret",
        placeholder: "github_pat_…",
        help: "github.com → Settings → Developer settings → Personal access tokens.",
        required: true,
      },
    ],
    secretTargets: { token: { target: "header", name: "Authorization", prefix: "Bearer " } },
    build: () => ({ transport: "http", url: "https://api.githubcopilot.com/mcp/" }),
  },
  {
    key: "notion",
    title: "Notion",
    description: "Arbeitsbereichsinhalte durchsuchen, Seiten lesen und Notizen in Notion aktualisieren.",
    icon: "notion",
    transport: "stdio",
    docsUrl: "https://www.notion.so/profile/integrations",
    fields: [
      {
        key: "token",
        label: "Notion-Integration-Token",
        type: "secret",
        placeholder: "ntn_…",
        help: "notion.so/profile/integrations → neue interne Integration, Seiten mit ihr teilen.",
        required: true,
      },
    ],
    secretTargets: { token: { target: "env", name: "NOTION_TOKEN" } },
    build: () => ({ transport: "stdio", pkg: "@notionhq/notion-mcp-server", bin: "bin/cli.mjs" }),
  },
  {
    key: "supabase",
    title: "Supabase",
    description: "Tabellen, SQL, Logs und Edge Functions deiner Supabase-Projekte (offizieller Supabase-MCP).",
    icon: "supabase",
    transport: "http",
    docsUrl: "https://supabase.com/dashboard/account/tokens",
    fields: [
      {
        key: "token",
        label: "Access Token",
        type: "secret",
        placeholder: "sbp_…",
        help: "supabase.com/dashboard/account/tokens",
        required: true,
      },
      { key: "projectRef", label: "Projekt-ID (optional)", type: "text", placeholder: "abcdefghijklmnop" },
    ],
    secretTargets: { token: { target: "header", name: "Authorization", prefix: "Bearer " } },
    build: ({ values }) => {
      const ref = values.projectRef?.trim();
      return {
        transport: "http",
        url: `https://mcp.supabase.com/mcp${ref ? `?project_ref=${encodeURIComponent(ref)}` : ""}`,
      };
    },
  },
  {
    key: "deepwiki",
    title: "DeepWiki",
    description: "Dokumentation zu jedem öffentlichen GitHub-Repo lesen und Fragen dazu stellen. Ohne Anmeldung.",
    icon: "deepwiki",
    transport: "http",
    fields: [],
    build: () => ({ transport: "http", url: "https://mcp.deepwiki.com/mcp" }),
  },
  {
    key: "context7",
    title: "Context7",
    description: "Aktuelle Doku und Codebeispiele zu Bibliotheken und Frameworks. Ohne Anmeldung.",
    icon: "context7",
    transport: "http",
    fields: [{ key: "token", label: "API-Key (optional)", type: "secret", placeholder: "ctx7sk-…" }],
    secretTargets: { token: { target: "header", name: "CONTEXT7_API_KEY" } },
    build: () => ({ transport: "http", url: "https://mcp.context7.com/mcp" }),
  },
  {
    key: "cloudflare-docs",
    title: "Cloudflare Docs",
    description: "Cloudflare-Dokumentation durchsuchen: Workers, Pages, R2, D1 und mehr. Ohne Anmeldung.",
    icon: "cloudflare",
    transport: "http",
    fields: [],
    build: () => ({ transport: "http", url: "https://docs.mcp.cloudflare.com/mcp" }),
  },
  {
    key: "memory",
    title: "Notizbuch",
    description: "Fakten als kleinen Wissensgraphen merken und später wiederfinden (lokal gespeichert).",
    icon: "memory",
    transport: "stdio",
    fields: [],
    build: () => ({
      transport: "stdio",
      pkg: "@modelcontextprotocol/server-memory",
      bin: "dist/index.js",
      env: { MEMORY_FILE_PATH: path.join(connectAgentsRoot(), "mcp", "memory.jsonl") },
    }),
  },
  {
    key: "custom",
    title: "Eigener MCP-Server",
    description: "Beliebigen MCP-Server per Befehl (stdio) oder Adresse (HTTP/SSE) verbinden.",
    icon: "custom",
    transport: "stdio",
    fields: [
      { key: "name", label: "Name", type: "text", placeholder: "Mein Server", required: true },
      {
        key: "command",
        label: "Befehl (stdio)",
        type: "command",
        placeholder: "npx -y @modelcontextprotocol/server-everything",
        help: "Entweder Befehl oder Adresse ausfüllen.",
      },
      { key: "url", label: "Adresse (HTTP oder SSE)", type: "url", placeholder: "https://…/mcp oder http://127.0.0.1:8931/sse" },
      { key: "token", label: "Token (optional)", type: "secret", placeholder: "Bearer-Token" },
    ],
    secretTargets: { token: { target: "header", name: "Authorization", prefix: "Bearer " } },
    build: ({ values }) => {
      const url = values.url?.trim();
      if (url) {
        return { transport: /\/sse\/?$/.test(url) ? "sse" : "http", url };
      }
      const parts = splitCommand(values.command ?? "");
      if (parts.length === 0) throw new Error("Bitte einen Befehl oder eine Adresse angeben.");
      return { transport: "stdio", command: parts[0], args: parts.slice(1) };
    },
  },
];

export function catalogEntry(key: string): CatalogEntry | undefined {
  return CATALOG.find((entry) => entry.key === key);
}

/** Split a command line on spaces, keeping "quoted parts" together. */
export function splitCommand(line: string): string[] {
  const parts: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const match of line.matchAll(pattern)) parts.push(match[1] ?? match[2] ?? match[3] ?? "");
  return parts.filter((part) => part.length > 0);
}

/** What the browser sees: no build functions, no secret targets beyond field names. */
export function publicCatalog() {
  return CATALOG.map(({ build: _build, secretTargets: _targets, ...entry }) => entry);
}
