/**
 * Local MCP server registry for Settings → MCP.
 * Mirrors the Cursor MCP connectors available in this workspace, with
 * per-server enable + ask/allow/deny permissions for bot tool calls.
 */

export type McpPermission = "ask" | "allow" | "deny";

export type McpCategory =
  | "local"
  | "productivity"
  | "dev"
  | "design"
  | "commerce"
  | "automation"
  | "ai-agents";

export type McpServerEntry = {
  id: string;
  name: string;
  description: string;
  category: McpCategory;
  /** Official or community identifier / URL hint */
  transport: "stdio" | "sse" | "http";
  commandHint?: string;
  /** Needs OAuth / connector login before tools work */
  authRequired?: boolean;
  enabled: boolean;
  /** Tool calls need confirmation unless allow */
  permission: McpPermission;
};

const KEY = "connect.mcp-servers";

export const MCP_CATEGORY_LABELS: Record<McpCategory, string> = {
  local: "Local / stdio",
  productivity: "Productivity",
  dev: "Developer platforms",
  design: "Design",
  commerce: "Commerce & wallets",
  automation: "Automation & research",
  "ai-agents": "AI-Agenten",
};

/**
 * Full Cursor-adjacent connector catalog (same namespaces as this agent session).
 * Defaults: off + ask — enable and set permissions per bot policy.
 */
export const MCP_CATALOG: Omit<McpServerEntry, "enabled" | "permission">[] = [
  // —— Local / classic MCP ——
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Read and write files in allowed directories.",
    category: "local",
    transport: "stdio",
    commandHint: "npx -y @modelcontextprotocol/server-filesystem",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Repos, PRs, and repository search.",
    category: "local",
    transport: "stdio",
    commandHint: "npx -y @modelcontextprotocol/server-github",
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Query databases with read permissions.",
    category: "local",
    transport: "stdio",
    commandHint: "npx -y @modelcontextprotocol/server-postgres",
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Web search without leaving the agent.",
    category: "local",
    transport: "stdio",
    commandHint: "npx -y @modelcontextprotocol/server-brave-search",
  },
  {
    id: "memory",
    name: "Memory",
    description: "Persistent knowledge graph for the agent.",
    category: "local",
    transport: "stdio",
    commandHint: "npx -y @modelcontextprotocol/server-memory",
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    description: "Browse and screenshot pages.",
    category: "local",
    transport: "stdio",
    commandHint: "npx -y @modelcontextprotocol/server-puppeteer",
  },

  // —— Productivity (Cursor session) ——
  {
    id: "slack",
    name: "Slack",
    description: "Channels, messages, and workspace search.",
    category: "productivity",
    transport: "http",
    authRequired: true,
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Read, draft, send, and label mail.",
    category: "productivity",
    transport: "http",
    authRequired: true,
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Events, availability, and scheduling.",
    category: "productivity",
    transport: "http",
    authRequired: true,
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Files, search, share, and downloads.",
    category: "productivity",
    transport: "http",
    authRequired: true,
  },
  {
    id: "notion",
    name: "Notion",
    description: "Pages, databases, comments, and agents.",
    category: "productivity",
    transport: "http",
    authRequired: true,
  },
  {
    id: "linear",
    name: "Linear",
    description: "Issues, projects, and cycles.",
    category: "productivity",
    transport: "http",
    authRequired: true,
  },
  {
    id: "clickup",
    name: "ClickUp",
    description: "Tasks, spaces, and docs.",
    category: "productivity",
    transport: "http",
    authRequired: true,
  },
  {
    id: "granola",
    name: "Granola",
    description: "Meeting notes and decisions context.",
    category: "productivity",
    transport: "http",
    authRequired: true,
  },
  {
    id: "readwise",
    name: "Readwise",
    description: "Highlights and reader library.",
    category: "productivity",
    transport: "http",
    authRequired: true,
  },
  {
    id: "agentmail",
    name: "Agentmail",
    description: "Agent-native mailbox for bots.",
    category: "productivity",
    transport: "http",
    authRequired: true,
  },

  // —— Developer platforms ——
  {
    id: "vercel",
    name: "Vercel",
    description: "Projects, deployments, env, and logs.",
    category: "dev",
    transport: "http",
    authRequired: true,
  },
  {
    id: "render",
    name: "Render",
    description: "Services, Postgres, deploys, and metrics.",
    category: "dev",
    transport: "http",
    authRequired: true,
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Projects, SQL, migrations, and edge functions.",
    category: "dev",
    transport: "http",
    authRequired: true,
  },
  {
    id: "cloudflare-docs",
    name: "Cloudflare Docs",
    description: "Workers, Pages, and platform documentation.",
    category: "dev",
    transport: "http",
  },
  {
    id: "cloudflare-bindings",
    name: "Cloudflare Bindings",
    description: "KV, R2, D1, and binding configuration.",
    category: "dev",
    transport: "http",
    authRequired: true,
  },
  {
    id: "cloudflare-builds",
    name: "Cloudflare Builds",
    description: "Build status and deployment pipelines.",
    category: "dev",
    transport: "http",
    authRequired: true,
  },
  {
    id: "cloudflare-observability",
    name: "Cloudflare Observability",
    description: "Logs, analytics, and runtime diagnostics.",
    category: "dev",
    transport: "http",
    authRequired: true,
  },
  {
    id: "clerk",
    name: "Clerk",
    description: "Auth, users, orgs, and billing.",
    category: "dev",
    transport: "http",
    authRequired: true,
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Errors and performance issues.",
    category: "dev",
    transport: "http",
    authRequired: true,
  },

  // —— Design ——
  {
    id: "figma",
    name: "Figma",
    description: "Design context, Code Connect, and Make.",
    category: "design",
    transport: "http",
    authRequired: true,
  },
  {
    id: "miro",
    name: "Miro",
    description: "Boards, sticky notes, and diagrams.",
    category: "design",
    transport: "http",
    authRequired: true,
  },
  {
    id: "runway",
    name: "Runway",
    description: "Generative video and media tools.",
    category: "design",
    transport: "http",
    authRequired: true,
  },
  {
    id: "typeform",
    name: "Typeform",
    description: "Forms, responses, and workspaces.",
    category: "design",
    transport: "http",
    authRequired: true,
  },

  // —— Commerce & wallets ——
  {
    id: "stripe",
    name: "Stripe",
    description: "Customers, payments, products, and billing.",
    category: "commerce",
    transport: "http",
    authRequired: true,
  },
  {
    id: "phantom-mcp",
    name: "Phantom",
    description: "Wallet connect and chain actions.",
    category: "commerce",
    transport: "http",
    authRequired: true,
  },
  {
    id: "phantom-connect-sdk",
    name: "Phantom Connect SDK",
    description: "Scaffold and validate Phantom integrations.",
    category: "commerce",
    transport: "http",
    authRequired: true,
  },
  {
    id: "aave",
    name: "Aave",
    description: "Lending markets and positions.",
    category: "commerce",
    transport: "http",
    authRequired: true,
  },
  {
    id: "circle",
    name: "Circle",
    description: "USDC and Circle developer APIs.",
    category: "commerce",
    transport: "http",
    authRequired: true,
  },
  {
    id: "whop",
    name: "Whop",
    description: "Products, memberships, and checkout.",
    category: "commerce",
    transport: "http",
    authRequired: true,
  },
  {
    id: "kraken",
    name: "Kraken",
    description: "Market data and paper trading.",
    category: "commerce",
    transport: "http",
    authRequired: true,
  },

  // —— Automation & research ——
  {
    id: "zapier",
    name: "Zapier",
    description: "Cross-app actions and agentic Zapier MCP.",
    category: "automation",
    transport: "http",
    authRequired: true,
  },
  {
    id: "apify",
    name: "Apify",
    description: "Actors, scrapers, and the Apify Store.",
    category: "automation",
    transport: "http",
    authRequired: true,
  },
  {
    id: "x",
    name: "X",
    description: "Posts, users, trends, and DMs.",
    category: "automation",
    transport: "http",
    authRequired: true,
  },
  {
    id: "upwork",
    name: "Upwork",
    description: "Jobs, proposals, and freelancer tools.",
    category: "automation",
    transport: "http",
    authRequired: true,
  },
  {
    id: "usertesting",
    name: "UserTesting",
    description: "Tests, insights, and research sessions.",
    category: "automation",
    transport: "http",
    authRequired: true,
  },

  // —— AI-Agenten (Cursor) ——
  {
    id: "cursor",
    name: "Cursor",
    description: "Native Cursor tools (goals, images).",
    category: "ai-agents",
    transport: "http",
  },
];

function defaults(): McpServerEntry[] {
  return MCP_CATALOG.map((entry) => ({
    ...entry,
    enabled: false,
    permission: "ask" as const,
  }));
}

function read(): McpServerEntry[] {
  if (typeof window === "undefined") return defaults();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<McpServerEntry>[];
    if (!Array.isArray(parsed)) return defaults();
    const byId = new Map(
      parsed
        .filter((row) => row && typeof row.id === "string")
        .map((row) => [row.id as string, row]),
    );
    return MCP_CATALOG.map((entry) => {
      const saved = byId.get(entry.id);
      return {
        ...entry,
        enabled: saved?.enabled === true,
        permission:
          saved?.permission === "allow" || saved?.permission === "deny"
            ? saved.permission
            : "ask",
      };
    });
  } catch {
    return defaults();
  }
}

function write(entries: McpServerEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    KEY,
    JSON.stringify(
      entries.map((e) => ({
        id: e.id,
        enabled: e.enabled,
        permission: e.permission,
      })),
    ),
  );
  window.dispatchEvent(new Event("connect-mcp-servers-changed"));
}

export function listMcpServers(): McpServerEntry[] {
  return read();
}

export function setMcpServerEnabled(
  id: string,
  enabled: boolean,
): McpServerEntry[] {
  const next = read().map((e) => (e.id === id ? { ...e, enabled } : e));
  write(next);
  return next;
}

export function setMcpServerPermission(
  id: string,
  permission: McpPermission,
): McpServerEntry[] {
  const next = read().map((e) => (e.id === id ? { ...e, permission } : e));
  write(next);
  return next;
}

/** Enable every catalog server with permission = ask (safe default). */
export function enableAllMcpServersAsk(): McpServerEntry[] {
  const next = read().map((e) => ({
    ...e,
    enabled: true,
    permission: "ask" as const,
  }));
  write(next);
  return next;
}

/** Enable the Cursor-namespace pack (productivity + platforms from this session). */
export function enableCursorMcpPack(): McpServerEntry[] {
  const pack = new Set(
    MCP_CATALOG.filter((e) => e.category !== "local").map((e) => e.id),
  );
  const next = read().map((e) =>
    pack.has(e.id)
      ? { ...e, enabled: true, permission: "ask" as const }
      : e,
  );
  write(next);
  return next;
}

export function disableAllMcpServers(): McpServerEntry[] {
  const next = read().map((e) => ({ ...e, enabled: false }));
  write(next);
  return next;
}

export function setAllMcpPermissions(
  permission: McpPermission,
): McpServerEntry[] {
  const next = read().map((e) =>
    e.enabled ? { ...e, permission } : e,
  );
  write(next);
  return next;
}

export function subscribeMcpServers(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("connect-mcp-servers-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("connect-mcp-servers-changed", handler);
    window.removeEventListener("storage", handler);
  };
}

/** Servers currently enabled — for granting to bots / @ MCP routing. */
export function listEnabledMcpServers(): McpServerEntry[] {
  return read().filter((e) => e.enabled && e.permission !== "deny");
}

/** Prefix for composer `@` chips that refer to an MCP server (not an agent). */
export const MCP_MENTION_PREFIX = "mcp:";

export function isMcpMentionValue(value: string | undefined): boolean {
  return typeof value === "string" && value.startsWith(MCP_MENTION_PREFIX);
}

export function mcpMentionValue(serverId: string): string {
  return `${MCP_MENTION_PREFIX}${serverId}`;
}

export function mcpIdFromMentionValue(value: string): string | null {
  if (!isMcpMentionValue(value)) return null;
  return value.slice(MCP_MENTION_PREFIX.length) || null;
}

/**
 * Ranked search over the MCP Sammlung for composer `@` mentions.
 * Enabled servers float first; matches name, id, description, and category.
 */
export function searchMcpCatalog(
  query: string,
  limit = 12,
): McpServerEntry[] {
  const needle = query.trim().toLowerCase();
  const all = listMcpServers();
  const scored = all
    .map((server) => {
      const name = server.name.toLowerCase();
      const id = server.id.toLowerCase();
      const desc = server.description.toLowerCase();
      const category = (
        MCP_CATEGORY_LABELS[server.category] ?? server.category
      ).toLowerCase();
      if (!needle) {
        return { server, score: server.enabled ? 2 : 1 };
      }
      let score = 0;
      if (name === needle || id === needle) score += 100;
      else if (name.startsWith(needle) || id.startsWith(needle)) score += 60;
      else if (name.includes(needle) || id.includes(needle)) score += 40;
      else if (desc.includes(needle) || category.includes(needle)) score += 20;
      else return null;
      if (server.enabled) score += 10;
      if (server.permission !== "deny") score += 2;
      return { server, score };
    })
    .filter((row): row is { server: McpServerEntry; score: number } =>
      Boolean(row),
    )
    .sort((a, b) => b.score - a.score || a.server.name.localeCompare(b.server.name));

  return scored.slice(0, limit).map((row) => row.server);
}

