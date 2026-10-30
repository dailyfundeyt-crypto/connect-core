import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { jsonb } from "../../db/schema/json";

export const agentPersonas = pgTable(
  "agent_personas",
  {
    agentId: text("agent_id").primaryKey(),
    pillar: text("pillar").notNull(),
    ownedQuestion: text("owned_question").notNull(),
    values: jsonb("values").notNull().default({}),
    riskProfile: text("risk_profile").notNull(),
    voice: text("voice").notNull(),
    brainFolderId: text("brain_folder_id"),
    sourceRefs: jsonb("source_refs").notNull().default([]),
    knowledgeSources: jsonb("knowledge_sources").notNull().default([]),
    frameworkFocus: text("framework_focus"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_personas_pillar_idx").on(table.pillar),
    index("agent_personas_framework_idx").on(table.frameworkFocus),
  ]
);

export type AgentPersonaDbRow = typeof agentPersonas.$inferSelect;
export type NewAgentPersonaDbRow = typeof agentPersonas.$inferInsert;
