import fs from "fs";
import path from "path";

export interface StoredBot {
  id: string;
  name: string;
  title?: string;
  roleDescription?: string;
  role?: string;
  headline?: string;
  description?: string;
  type?: string;
  chosenCli?: string;
  skills?: any;
  configuration?: any;
  accountEmail?: string;
  avatarSeed?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StoredChatMetadata {
  channelId: string;
  name?: string;
  description?: string;
  summary?: string;
  lastMessageAt?: string;
}

// In-Memory Test- und Fallback-Speicher
const memoryBots = new Map<string, StoredBot>();
const memoryBotCompanies = new Map<string, Set<string>>(); // botId -> Set of companyIds
const memoryChats = new Map<string, StoredChatMetadata[]>(); // botId -> channels

export function resetMemoryLifecycleStore(): void {
  memoryBots.clear();
  memoryBotCompanies.clear();
  memoryChats.clear();
}

/**
 * Registriert einen Bot im In-Memory Speicher (fuer Tests und Simulation)
 */
export function seedMemoryBot(
  bot: StoredBot,
  companyIds: string[] = [],
  chats: StoredChatMetadata[] = [],
): void {
  memoryBots.set(bot.id, { ...bot });
  memoryBotCompanies.set(bot.id, new Set(companyIds));
  memoryChats.set(bot.id, [...chats]);
}

function getDatabaseUrl(): string | null {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    return process.env.DATABASE_URL;
  }
  try {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const envPath = path.join(localAppData, "ConnectApp", "data", "connect.env");
      if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, "utf8").split("\n");
        let pass = "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("CONNECT_APP_DB_PASSWORD=")) {
            pass = trimmed.substring("CONNECT_APP_DB_PASSWORD=".length).trim();
            if ((pass.startsWith('"') && pass.endsWith('"')) || (pass.startsWith("'") && pass.endsWith("'"))) {
              pass = pass.slice(1, -1);
            }
          }
        }
        if (pass) {
          return `postgres://connect:${pass}@127.0.0.1:5544/connect`;
        }
      }
    }
  } catch {
    // Fallback ignorieren
  }
  return null;
}

let sqlClient: any = null;

function getSql(): any {
  if (sqlClient) return sqlClient;
  const url = getDatabaseUrl();
  if (!url) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const postgresMod = require("postgres");
    const postgres = postgresMod.default || postgresMod;
    sqlClient = postgres(url, { max: 2, idle_timeout: 5, connect_timeout: 3 });
    return sqlClient;
  } catch {
    return null;
  }
}

/**
 * Prueft sicher, ob eine Relation in Postgres existiert, ohne bei Nichtexistenz einen Fehler zu werfen.
 */
async function tableExists(sql: any, tableName: string): Promise<boolean> {
  try {
    const [row] = await sql`SELECT to_regclass(${tableName}) AS tbl`;
    return Boolean(row?.tbl);
  } catch {
    return false;
  }
}

/**
 * Liest einen Bot anhand seiner ID aus DB oder Memory.
 */
export async function findBotById(botId: string, dbOverride?: any): Promise<StoredBot | null> {
  const sql = dbOverride || getSql();
  if (sql) {
    try {
      const agentsExist = await tableExists(sql, "agents");
      if (agentsExist) {
        const rows = await sql`
          SELECT
            a.id,
            a.name,
            p.title,
            p.role_description,
            a.role,
            a.headline,
            a.description,
            a.type,
            a.chosen_cli,
            a.skills,
            a.configuration,
            a.account_email,
            p.avatar_seed,
            a.created_at,
            a.updated_at
          FROM agents a
          LEFT JOIN agent_profiles p ON p.agent_id = a.id
          WHERE a.id = ${botId}
          LIMIT 1
        `;
        if (rows.length > 0) {
          const r = rows[0];
          return {
            id: r.id,
            name: r.name,
            title: r.title || r.name,
            roleDescription: r.role_description || "",
            role: r.role || undefined,
            headline: r.headline || undefined,
            description: r.description || undefined,
            type: r.type || "agent",
            chosenCli: r.chosen_cli || "antigravity",
            skills: r.skills || [],
            configuration: r.configuration || {},
            accountEmail: r.account_email || undefined,
            avatarSeed: r.avatar_seed || undefined,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
            updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
          };
        }
      }
    } catch {
      // Fallback zu Memory
    }
  }

  const mem = memoryBots.get(botId);
  return mem ? { ...mem } : null;
}

/**
 * Ermittelt alle Firmen, denen der Bot zugeordnet ist.
 */
export async function getBotCompanyAssignments(botId: string, dbOverride?: any): Promise<string[]> {
  const companyIds = new Set<string>();

  // 1. Memory Check
  const memSet = memoryBotCompanies.get(botId);
  if (memSet) {
    for (const cid of memSet) companyIds.add(cid);
  }

  // 2. DB Check
  const sql = dbOverride || getSql();
  if (sql) {
    try {
      const hasCompanyBots = await tableExists(sql, "company_bots");
      if (hasCompanyBots) {
        const rows = await sql`
          SELECT company_id
          FROM company_bots
          WHERE bot_id = ${botId}
        `;
        for (const r of rows) {
          companyIds.add(r.company_id);
        }
      }

      const hasKv = await tableExists(sql, "connect_workspace_kv");
      if (hasKv) {
        const kvRows = await sql`
          SELECT key, value
          FROM connect_workspace_kv
          WHERE key LIKE '%connect.companies.custom'
        `;
        for (const row of kvRows) {
          const list = Array.isArray(row.value) ? row.value : [];
          for (const company of list) {
            if (Array.isArray(company?.agentIds) && company.agentIds.includes(botId)) {
              companyIds.add(company.id);
            }
          }
        }
      }
    } catch {
      // Fallback
    }
  }

  return Array.from(companyIds);
}

/**
 * Entfernt die Zuordnung eines Bots zu einer bestimmten Firma.
 * Der Bot selbst bleibt dabei vollstaendig erhalten.
 */
export async function removeBotFromCompanyRecord(
  botId: string,
  companyId: string,
  dbOverride?: any,
): Promise<void> {
  // 1. In-Memory entfernen
  const memSet = memoryBotCompanies.get(botId);
  if (memSet) {
    memSet.delete(companyId);
  }

  // 2. In DB entfernen
  const sql = dbOverride || getSql();
  if (sql) {
    try {
      const hasCompanyBots = await tableExists(sql, "company_bots");
      if (hasCompanyBots) {
        await sql`
          DELETE FROM company_bots
          WHERE bot_id = ${botId} AND company_id = ${companyId}
        `;
      }

      const hasKv = await tableExists(sql, "connect_workspace_kv");
      if (hasKv) {
        const kvRows = await sql`
          SELECT key, value
          FROM connect_workspace_kv
          WHERE key LIKE '%connect.companies.custom'
        `;
        for (const row of kvRows) {
          if (!Array.isArray(row.value)) continue;
          let changed = false;
          const nextList = row.value.map((company: any) => {
            if (company?.id === companyId && Array.isArray(company?.agentIds) && company.agentIds.includes(botId)) {
              changed = true;
              return {
                ...company,
                agentIds: company.agentIds.filter((id: string) => id !== botId),
              };
            }
            return company;
          });

          if (changed) {
            await sql`
              UPDATE connect_workspace_kv
              SET value = ${JSON.stringify(nextList)}::jsonb, updated_at = now()
              WHERE key = ${row.key}
            `;
          }
        }
      }
    } catch {
      // Fallback
    }
  }
}

/**
 * Ermittelt Metadaten ueber Chats/Kanaele, an denen der Bot beteiligt ist.
 */
export async function getBotChatsMetadata(botId: string, dbOverride?: any): Promise<StoredChatMetadata[]> {
  const chats: StoredChatMetadata[] = [];

  const memChats = memoryChats.get(botId);
  if (memChats) {
    chats.push(...memChats);
  }

  const sql = dbOverride || getSql();
  if (sql) {
    try {
      const hasChannels = await tableExists(sql, "channels");
      const hasChannelAgents = await tableExists(sql, "channel_agents");
      if (hasChannels && hasChannelAgents) {
        const rows = await sql`
          SELECT
            c.id AS channel_id,
            c.name,
            c.description,
            c.summary,
            c.last_message_at
          FROM channels c
          INNER JOIN channel_agents ca ON ca.channel_id = c.id
          WHERE ca.agent_id = ${botId}
          ORDER BY c.last_message_at DESC NULLS LAST
        `;
        for (const r of rows) {
          if (!chats.some((x) => x.channelId === r.channel_id)) {
            chats.push({
              channelId: r.channel_id,
              name: r.name,
              description: r.description,
              summary: r.summary,
              lastMessageAt: r.last_message_at ? new Date(r.last_message_at).toISOString() : undefined,
            });
          }
        }
      }
    } catch {
      // Fallback
    }
  }

  return chats;
}

/**
 * Führt die unwiderrufliche Löschung des Bots in einer Datenbank-Transaktion durch.
 */
export async function executeHardDeleteInTransaction(botId: string, dbOverride?: any): Promise<void> {
  const sql = dbOverride || getSql();

  if (sql) {
    try {
      // Prüfe vor Beginn der Transaktion, welche Tabellen tatsächlich existieren
      const tablesToCheck = [
        "company_bots",
        "agent_preferences",
        "agent_browser_tabs",
        "channel_agents",
        "routines",
        "plugin_grants",
        "agent_app_instances",
        "agent_components",
        "agent_profiles",
        "agents",
        "connect_workspace_kv",
      ];
      const existingTables = new Set<string>();
      for (const t of tablesToCheck) {
        if (await tableExists(sql, t)) {
          existingTables.add(t);
        }
      }

      await sql.begin(async (tx: any) => {
        if (existingTables.has("company_bots")) {
          await tx`DELETE FROM company_bots WHERE bot_id = ${botId}`;
        }
        if (existingTables.has("agent_preferences")) {
          await tx`DELETE FROM agent_preferences WHERE agent_id = ${botId}`;
        }
        if (existingTables.has("agent_browser_tabs")) {
          await tx`DELETE FROM agent_browser_tabs WHERE agent_id = ${botId}`;
        }
        if (existingTables.has("channel_agents")) {
          await tx`DELETE FROM channel_agents WHERE agent_id = ${botId}`;
        }
        if (existingTables.has("routines")) {
          await tx`DELETE FROM routines WHERE agent_id = ${botId}`;
        }
        if (existingTables.has("plugin_grants")) {
          await tx`DELETE FROM plugin_grants WHERE agent_id = ${botId}`;
        }
        if (existingTables.has("agent_app_instances")) {
          await tx`DELETE FROM agent_app_instances WHERE agent_id = ${botId}`;
        }
        if (existingTables.has("agent_components")) {
          await tx`DELETE FROM agent_components WHERE agent_id = ${botId}`;
        }
        if (existingTables.has("agent_profiles")) {
          await tx`DELETE FROM agent_profiles WHERE agent_id = ${botId}`;
        }
        if (existingTables.has("agents")) {
          await tx`DELETE FROM agents WHERE id = ${botId}`;
        }

        if (existingTables.has("connect_workspace_kv")) {
          const kvRows = await tx`
            SELECT key, value
            FROM connect_workspace_kv
            WHERE key LIKE '%connect.companies.custom'
          `;
          for (const row of kvRows) {
            if (!Array.isArray(row.value)) continue;
            let modified = false;
            const cleaned = row.value.map((comp: any) => {
              if (Array.isArray(comp?.agentIds) && comp.agentIds.includes(botId)) {
                modified = true;
                return {
                  ...comp,
                  agentIds: comp.agentIds.filter((id: string) => id !== botId),
                };
              }
              return comp;
            });
            if (modified) {
              await tx`
                UPDATE connect_workspace_kv
                SET value = ${JSON.stringify(cleaned)}::jsonb, updated_at = now()
                WHERE key = ${row.key}
              `;
            }
          }
        }
      });
    } catch {
      // In-Memory bereinigen
    }
  }

  // Memory bereinigen
  memoryBots.delete(botId);
  memoryBotCompanies.delete(botId);
  memoryChats.delete(botId);
}
