import { AgentMemory, AgentMemorySchema, AgentMemoryType, mockAgentMemories } from "../../contracts/swarm-v3";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { SQL } from "bun";

/* ========================================================================== */
/* Database Connection Helper                                                 */
/* ========================================================================== */

function getConnectEnv(): Record<string, string> {
  const base = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "ConnectApp", "data")
    : join(homedir(), ".connect-app");
  const file = join(base, "connect.env");
  const env: Record<string, string> = {};
  if (existsSync(file)) {
    try {
      for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const idx = line.indexOf("=");
        if (idx <= 0) continue;
        let val = line.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        env[line.substring(0, idx).trim()] = val;
      }
    } catch {
      // Ignored
    }
  }
  return env;
}

let sqlClient: SQL | null = null;
function getSqlClient(): SQL | null {
  if (sqlClient) return sqlClient;
  try {
    const env = getConnectEnv();
    const dbPassword = env.CONNECT_APP_DB_PASSWORD || "";
    const port = Number(process.env.PG_PORT || "5544");
    sqlClient = new SQL({
      adapter: "postgres",
      hostname: "127.0.0.1",
      port,
      username: "connect",
      password: dbPassword,
      database: "connect",
      tls: false,
      prepare: false,
      max: 3,
      idleTimeout: 30,
    } as any);
    return sqlClient;
  } catch {
    return null;
  }
}

/* ========================================================================== */
/* In-Memory Store Seeded with Mock Data                                      */
/* ========================================================================== */

const memoryStore = new Map<string, AgentMemory[]>();

for (const mem of mockAgentMemories) {
  const existing = memoryStore.get(mem.agentId) || [];
  existing.push(mem);
  memoryStore.set(mem.agentId, existing);
}

export interface RecallOptions {
  type?: AgentMemoryType;
  asOfDate?: Date;
  minConfidence?: number;
}

/* ========================================================================== */
/* Memory Service Implementation                                              */
/* ========================================================================== */

export class MemoryService {
  /**
   * Stores a new episodic or semantic memory for an agent.
   */
  static async remember(
    memory: Omit<AgentMemory, "id" | "createdAt"> & { id?: string; createdAt?: string }
  ): Promise<AgentMemory> {
    const id = memory.id || `mem_${randomUUID().slice(0, 8)}`;
    const createdAt = memory.createdAt || new Date().toISOString();
    const fullMemory: AgentMemory = {
      ...memory,
      id,
      createdAt,
    };

    const validated = AgentMemorySchema.parse(fullMemory);

    // Save in memory store
    const agentList = memoryStore.get(validated.agentId) || [];
    agentList.push(validated);
    memoryStore.set(validated.agentId, agentList);

    // Attempt DB save
    const client = getSqlClient();
    if (client) {
      try {
        await client.unsafe(
          `INSERT INTO agent_memories (id, agent_id, type, content, valid_from, valid_to, confidence, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
           ON CONFLICT (id) DO UPDATE SET
             content = EXCLUDED.content,
             valid_from = EXCLUDED.valid_from,
             valid_to = EXCLUDED.valid_to,
             confidence = EXCLUDED.confidence,
             metadata = EXCLUDED.metadata`,
          [
            validated.id,
            validated.agentId,
            validated.type,
            validated.content,
            validated.validFrom ? new Date(validated.validFrom).toISOString() : null,
            validated.validTo ? new Date(validated.validTo).toISOString() : null,
            validated.confidence,
            JSON.stringify(validated.metadata || {}),
            new Date(validated.createdAt!).toISOString(),
          ] as never[]
        );
      } catch {
        // Fallback to memory store succeeded
      }
    }

    return validated;
  }

  /**
   * Recalls memories for a SPECIFIC agent with strict agent isolation.
   * Query match scoring, temporal validity, and confidence filtering.
   */
  static async recall(
    agentId: string,
    query?: string,
    k: number = 5,
    options: RecallOptions = {}
  ): Promise<AgentMemory[]> {
    const asOf = options.asOfDate || new Date();
    const asOfTime = asOf.getTime();
    const minConf = options.minConfidence ?? 0;

    let candidateMemories: AgentMemory[] = [];

    // Try DB first
    const client = getSqlClient();
    if (client) {
      try {
        const rows = (await client.unsafe(
          `SELECT id, agent_id as "agentId", type, content, valid_from as "validFrom", 
                  valid_to as "validTo", confidence, metadata, created_at as "createdAt"
           FROM agent_memories 
           WHERE agent_id = $1
           ORDER BY created_at DESC`,
          [agentId] as never[]
        )) as unknown as any[];

        if (rows && rows.length > 0) {
          candidateMemories = rows
            .map((r) => {
              const parsed = AgentMemorySchema.safeParse({
                ...r,
                validFrom: r.validFrom ? new Date(r.validFrom).toISOString() : undefined,
                validTo: r.validTo ? new Date(r.validTo).toISOString() : undefined,
                createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
              });
              return parsed.success ? parsed.data : null;
            })
            .filter((m): m is AgentMemory => m !== null);
        }
      } catch {
        // Fallback to memory store
      }
    }

    // Fallback if DB returned nothing or wasn't reachable
    if (candidateMemories.length === 0) {
      candidateMemories = [...(memoryStore.get(agentId) || [])];
    }

    // Strict Agent Isolation check
    candidateMemories = candidateMemories.filter((m) => m.agentId === agentId);

    // Filter by type if requested
    if (options.type) {
      candidateMemories = candidateMemories.filter((m) => m.type === options.type);
    }

    // Filter by confidence
    candidateMemories = candidateMemories.filter((m) => m.confidence >= minConf);

    // Filter by Temporal Validity (concept of 'temporal memory')
    candidateMemories = candidateMemories.filter((m) => {
      if (m.validFrom && new Date(m.validFrom).getTime() > asOfTime) {
        return false;
      }
      if (m.validTo && new Date(m.validTo).getTime() < asOfTime) {
        return false;
      }
      return true;
    });

    // Score & Rank memories
    if (!query || query.trim() === "") {
      // Sort by confidence DESC, then createdAt DESC
      candidateMemories.sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
      return candidateMemories.slice(0, k);
    }

    // Query relevance matching
    const queryTokens = query
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2);

    const scored = candidateMemories.map((m) => {
      const contentLower = m.content.toLowerCase();
      let matches = 0;
      for (const token of queryTokens) {
        if (contentLower.includes(token)) {
          matches++;
        }
      }
      if (queryTokens.length > 0 && matches === 0) {
        return { memory: m, score: 0 };
      }
      const textScore = queryTokens.length > 0 ? matches / queryTokens.length : 1;
      const finalScore = textScore * 0.7 + m.confidence * 0.3;
      return { memory: m, score: finalScore };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored
      .filter((s) => s.score > 0)
      .slice(0, k)
      .map((s) => s.memory);
  }

  /**
   * Reflection Engine:
   * Condenses episodic debate/simulation experiences into consolidated semantic beliefs with confidence.
   */
  static async reflect(agentId: string): Promise<AgentMemory[]> {
    const episodes = await this.recall(agentId, undefined, 50, { type: "episodic" });
    if (episodes.length === 0) {
      return [];
    }

    // Cluster themes or patterns from episodes
    const themes: Record<string, { count: number; texts: string[] }> = {};
    for (const ep of episodes) {
      const lower = ep.content.toLowerCase();
      let matchedTheme = "Allgemeine Beobachtung";
      if (lower.includes("offer") || lower.includes("angebot") || lower.includes("conversion")) {
        matchedTheme = "Angebotsstruktur & Conversion";
      } else if (lower.includes("ruin") || lower.includes("risiko") || lower.includes("verlust")) {
        matchedTheme = "Risiko & Ruin-Vermeidung";
      } else if (lower.includes("cash") || lower.includes("liquidität") || lower.includes("marge")) {
        matchedTheme = "Liquidität & Cashflow";
      } else if (lower.includes("kunde") || lower.includes("feedback") || lower.includes("churn")) {
        matchedTheme = "Kundenbeziehung & Churn";
      }

      if (!themes[matchedTheme]) {
        themes[matchedTheme] = { count: 0, texts: [] };
      }
      themes[matchedTheme].count++;
      themes[matchedTheme].texts.push(ep.content);
    }

    const createdBeliefs: AgentMemory[] = [];

    for (const [theme, data] of Object.entries(themes)) {
      // Calculate consolidated confidence based on sample count
      const confidence = Math.min(0.99, Math.max(0.7, 0.65 + data.count * 0.08));
      const summaryText = `[Reflektierte Überzeugung: ${theme}] Aus ${data.count} Episoden abgeleitet: ${data.texts[0]} (Bestätigt durch wiederholte Debatten).`;

      const belief = await this.remember({
        agentId,
        type: "semantic",
        content: summaryText,
        confidence,
        validFrom: new Date().toISOString(),
        metadata: {
          reflectedFromEpisodes: data.count,
          theme,
        },
      });

      createdBeliefs.push(belief);
    }

    return createdBeliefs;
  }

  /**
   * Clears memories for a given agent (useful for test isolations).
   */
  static clearLocalMemories(agentId?: string): void {
    if (agentId) {
      memoryStore.delete(agentId);
    } else {
      memoryStore.clear();
    }
  }
}
