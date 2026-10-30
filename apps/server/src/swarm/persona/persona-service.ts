import { AgentPersona, AgentPersonaSchema, mockAgentPersonas } from "../../contracts/swarm-v3";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { SQL } from "bun";

/* ========================================================================== */
/* Database / Store Connection Helper                                         */
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
      // Fallback to empty env
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
/* In-Memory Store Seeded with Canonical Scaling Debate Personas              */
/* ========================================================================== */

const defaultScalingPersonas: AgentPersona[] = [
  ...mockAgentPersonas,
  {
    agentId: "agent_customer_market",
    pillar: "Market & Customer Value",
    ownedQuestion: "Versteht der Kunde den Wert sofort und ist der Kaufwiderstand minimal?",
    values: { focus: "User Friction Zero", simplicity: "High", clarity: "Maximal" },
    riskProfile: "Pragmatic, customer-centric",
    voice: "Empathisch, nutzerfokussiert, allergisch gegen Jargon und künstliche Komplexität",
    brainFolderId: "folder_brains_customer",
    sourceRefs: ["customer_feedback_archive"],
    knowledgeSources: ["customer_feedback_archive"],
    frameworkFocus: "Value Equation & Perceived Likelihood of Achievement",
  },
  {
    agentId: "agent_operator_team",
    pillar: "Operations & Capacity",
    ownedQuestion: "Kann unser bestehendes Team diesen Prozess ohne Burnout und Qualitätsverlust 10x skalieren?",
    values: { focus: "Process Standardization", automation: "Preferred", bottleneckElimination: "Strict" },
    riskProfile: "Methodical, reliability-focused",
    voice: "Strukturiert, workflow-orientiert, wachsam gegenüber ungetesteten Sonderlocken",
    brainFolderId: "folder_brains_ops",
    sourceRefs: ["team_capacity_metrics"],
    knowledgeSources: ["team_capacity_metrics"],
    frameworkFocus: "Operational Bottlenecks & Delivery Systems",
  },
];

const memoryPersonaStore = new Map<string, AgentPersona>(
  defaultScalingPersonas.map((p) => [p.agentId, p])
);

/* ========================================================================== */
/* Persona Service Implementation                                             */
/* ========================================================================== */

export class PersonaService {
  /**
   * Retrieves a single persona by agentId.
   */
  static async getPersona(agentId: string): Promise<AgentPersona | null> {
    const client = getSqlClient();
    if (client) {
      try {
        const rows = (await client.unsafe(
          `SELECT agent_id as "agentId", pillar, owned_question as "ownedQuestion", "values", 
                  risk_profile as "riskProfile", voice, brain_folder_id as "brainFolderId", 
                  source_refs as "sourceRefs", knowledge_sources as "knowledgeSources", 
                  framework_focus as "frameworkFocus"
           FROM agent_personas WHERE agent_id = $1`,
          [agentId] as never[]
        )) as unknown as AgentPersona[];

        if (rows && rows.length > 0) {
          const validated = AgentPersonaSchema.safeParse(rows[0]);
          if (validated.success) return validated.data;
        }
      } catch {
        // Fallback to in-memory store
      }
    }
    const mem = memoryPersonaStore.get(agentId);
    return mem ? { ...mem } : null;
  }

  /**
   * Retrieves a persona together with its base v2 agent profile information.
   */
  static async getPersonaWithProfile(agentId: string): Promise<{
    persona: AgentPersona | null;
    agentProfile?: {
      id: string;
      name?: string;
      headline?: string;
      role?: string;
      description?: string;
      skills?: unknown[];
      chosenCli?: string;
    };
  }> {
    const persona = await this.getPersona(agentId);
    let agentProfile: any = undefined;

    const client = getSqlClient();
    if (client) {
      try {
        const rows = (await client.unsafe(
          `SELECT id, name, headline, role, description, skills, chosen_cli as "chosenCli"
           FROM agents WHERE id = $1`,
          [agentId] as never[]
        )) as unknown as any[];
        if (rows && rows.length > 0) {
          agentProfile = rows[0];
        }
      } catch {
        // Ignored, agentProfile stays undefined
      }
    }

    return { persona, agentProfile };
  }

  /**
   * Saves or updates a persona.
   */
  static async savePersona(data: AgentPersona): Promise<AgentPersona> {
    const validated = AgentPersonaSchema.parse(data);
    memoryPersonaStore.set(validated.agentId, validated);

    const client = getSqlClient();
    if (client) {
      try {
        await client.unsafe(
          `INSERT INTO agent_personas (agent_id, pillar, owned_question, "values", risk_profile, voice, brain_folder_id, source_refs, knowledge_sources, framework_focus, updated_at)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9::jsonb, $10, NOW())
           ON CONFLICT (agent_id) DO UPDATE SET
             pillar = EXCLUDED.pillar,
             owned_question = EXCLUDED.owned_question,
             "values" = EXCLUDED."values",
             risk_profile = EXCLUDED.risk_profile,
             voice = EXCLUDED.voice,
             brain_folder_id = EXCLUDED.brain_folder_id,
             source_refs = EXCLUDED.source_refs,
             knowledge_sources = EXCLUDED.knowledge_sources,
             framework_focus = EXCLUDED.framework_focus,
             updated_at = NOW()`,
          [
            validated.agentId,
            validated.pillar,
            validated.ownedQuestion,
            JSON.stringify(validated.values),
            validated.riskProfile,
            validated.voice,
            validated.brainFolderId || null,
            JSON.stringify(validated.sourceRefs || []),
            JSON.stringify(validated.knowledgeSources || []),
            validated.frameworkFocus || null,
          ] as never[]
        );
      } catch {
        // Memory store already updated
      }
    }

    return validated;
  }

  /**
   * Lists all registered agent personas.
   */
  static async listPersonas(): Promise<AgentPersona[]> {
    const client = getSqlClient();
    if (client) {
      try {
        const rows = (await client.unsafe(
          `SELECT agent_id as "agentId", pillar, owned_question as "ownedQuestion", "values", 
                  risk_profile as "riskProfile", voice, brain_folder_id as "brainFolderId", 
                  source_refs as "sourceRefs", knowledge_sources as "knowledgeSources", 
                  framework_focus as "frameworkFocus"
           FROM agent_personas ORDER BY agent_id ASC`,
          [] as never[]
        )) as unknown as AgentPersona[];

        if (rows && rows.length > 0) {
          const result: AgentPersona[] = [];
          for (const row of rows) {
            const parsed = AgentPersonaSchema.safeParse(row);
            if (parsed.success) result.push(parsed.data);
          }
          if (result.length > 0) return result;
        }
      } catch {
        // Fallback to in-memory store
      }
    }
    return Array.from(memoryPersonaStore.values());
  }

  /**
   * Deletes a persona by agentId.
   */
  static async deletePersona(agentId: string): Promise<boolean> {
    memoryPersonaStore.delete(agentId);
    const client = getSqlClient();
    if (client) {
      try {
        await client.unsafe(`DELETE FROM agent_personas WHERE agent_id = $1`, [agentId] as never[]);
      } catch {
        // Handled
      }
    }
    return true;
  }

  /**
   * Generates a recommended Persona from an existing Agent Profile & Spark Notes.
   * Analyzes role, description, headline, and notes to suggest pillar, owned question, values, risk, voice,
   * knowledge sources, and framework focus.
   */
  static generatePersona(
    agentProfile: {
      id: string;
      name?: string;
      headline?: string;
      role?: string;
      description?: string;
      skills?: string[];
    },
    notes: string[] = []
  ): AgentPersona {
    const textBlob = [
      agentProfile.name || "",
      agentProfile.headline || "",
      agentProfile.role || "",
      agentProfile.description || "",
      ...(agentProfile.skills || []),
      ...notes,
    ]
      .join(" ")
      .toLowerCase();

    // 1. Finance / Cashflow check
    if (textBlob.includes("cfo") || textBlob.includes("finanz") || textBlob.includes("cash") || textBlob.includes("budget") || textBlob.includes("kosten")) {
      return AgentPersonaSchema.parse({
        agentId: agentProfile.id,
        pillar: "Finance & Runway",
        ownedQuestion: "Haben wir die Liquidität, um diesen Schritt 90 Tage ohne Umsatz durchzuhalten?",
        values: { focus: "Gross Margin", runway: "Minimum 12 Months", unitEconomics: "Strict" },
        riskProfile: "Conservative, risk-averse",
        voice: "Nüchtern, analytisch, zahlenbasiert",
        brainFolderId: "folder_brains_finance",
        sourceRefs: ["internal_accounting"],
        knowledgeSources: ["internal_accounting"],
        frameworkFocus: "Cashflow Projection & Ruin Avoidance",
      });
    }

    // 2. Skeptic / Ruin-Risk check
    if (textBlob.includes("skeptic") || textBlob.includes("risiko") || textBlob.includes("ruin") || textBlob.includes("audit") || textBlob.includes("legal") || textBlob.includes("sicherheit")) {
      return AgentPersonaSchema.parse({
        agentId: agentProfile.id,
        pillar: "Risk & Governance",
        ownedQuestion: "Was ist das Worst-Case-Szenario und zerstört es das Unternehmen?",
        values: { focus: "Non-Zero Ruin Probability", legal: "Compliance First" },
        riskProfile: "Hyper-vigilant",
        voice: "Kritisch, schonungslos, hinterfragend",
        brainFolderId: "folder_brains_governance",
        sourceRefs: ["risk_guidelines"],
        knowledgeSources: ["risk_guidelines"],
        frameworkFocus: "Ruin Problem & Downside Protection",
      });
    }

    // 3. Customer / Market check
    if (textBlob.includes("kunde") || textBlob.includes("customer") || textBlob.includes("ux") || textBlob.includes("nutzer") || textBlob.includes("markt") || textBlob.includes("friction")) {
      return AgentPersonaSchema.parse({
        agentId: agentProfile.id,
        pillar: "Market & Customer Value",
        ownedQuestion: "Versteht der Kunde den Wert sofort und ist der Kaufwiderstand minimal?",
        values: { focus: "Frictionless Onboarding", simplicity: "Maximum" },
        riskProfile: "Pragmatic, customer-centric",
        voice: "Empathisch, nutzerfokussiert, allergisch gegen Jargon",
        brainFolderId: "folder_brains_customer",
        sourceRefs: ["customer_feedback_archive"],
        knowledgeSources: ["customer_feedback_archive"],
        frameworkFocus: "Value Equation & Perceived Likelihood of Achievement",
      });
    }

    // 4. Operations / Team check
    if (textBlob.includes("ops") || textBlob.includes("operat") || textBlob.includes("prozess") || textBlob.includes("team") || textBlob.includes("kapazität") || textBlob.includes("workflow")) {
      return AgentPersonaSchema.parse({
        agentId: agentProfile.id,
        pillar: "Operations & Capacity",
        ownedQuestion: "Kann unser bestehendes Team diesen Prozess ohne Burnout und Qualitätsverlust skalieren?",
        values: { focus: "Standardization", automation: "Preferred", bottleneckElimination: "Strict" },
        riskProfile: "Methodical, reliability-focused",
        voice: "Strukturiert, workflow-orientiert, wachsam gegenüber ungetesteten Prozessen",
        brainFolderId: "folder_brains_ops",
        sourceRefs: ["team_capacity_metrics"],
        knowledgeSources: ["team_capacity_metrics"],
        frameworkFocus: "Operational Bottlenecks & Delivery Systems",
      });
    }

    // 5. Default / Growth / Offer Architect (inspired by Hormozi frameworks)
    return AgentPersonaSchema.parse({
      agentId: agentProfile.id,
      pillar: "Growth & Monetization",
      ownedQuestion: "Wie maximieren wir LTV und Ticketgröße ohne lineare Arbeitszeit?",
      values: { focus: "Grand-Slam-Offers", speed: "High", leverage: "Digital & Automation" },
      riskProfile: "Aggressive, high-upside",
      voice: "Pragmatisch, direkt, quantitativ, fokussiert auf Attraction & Continuity",
      brainFolderId: "folder_brains_hormozi",
      sourceRefs: ["100m-money-models"],
      knowledgeSources: ["100m-money-models"],
      frameworkFocus: "Attraction Offers & Continuity Models",
    });
  }
}
