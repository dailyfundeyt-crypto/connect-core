import { doublePrecision, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { jsonb } from "../../db/schema/json";

export const agentMemories = pgTable(
  "agent_memories",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    type: text("type").notNull(), // 'episodic' | 'semantic'
    content: text("content").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
    confidence: doublePrecision("confidence").notNull().default(1.0),
    metadata: jsonb("metadata").notNull().default({}),
    embedding: text("embedding"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_memories_agent_idx").on(table.agentId),
    index("agent_memories_agent_type_idx").on(table.agentId, table.type),
    index("agent_memories_valid_time_idx").on(table.agentId, table.validFrom, table.validTo),
  ]
);

export type AgentMemoryDbRow = typeof agentMemories.$inferSelect;
export type NewAgentMemoryDbRow = typeof agentMemories.$inferInsert;
