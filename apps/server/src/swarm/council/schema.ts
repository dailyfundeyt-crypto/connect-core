import { boolean, doublePrecision, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { jsonb } from "../../db/schema/json";

export const councilSessions = pgTable(
  "council_sessions",
  {
    id: text("id").primaryKey(),
    question: text("question").notNull(),
    options: jsonb("options").notNull().default([]),
    context: text("context"),
    mode: text("mode").notNull().default("full"), // 'quick' | 'full'
    status: text("status").notNull().default("pending"), // 'pending' | 'in_progress' | 'completed' | 'cancelled'
    chairQuestions: jsonb("chair_questions").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("council_sessions_status_idx").on(table.status),
    index("council_sessions_created_idx").on(table.createdAt),
  ]
);

export const councilSeats = pgTable(
  "council_seats",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => councilSessions.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull(),
    role: text("role"),
    weight: doublePrecision("weight").notNull().default(1.0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.agentId] }),
    index("council_seats_agent_idx").on(table.agentId),
  ]
);

export const councilTurns = pgTable(
  "council_turns",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => councilSessions.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    agentId: text("agent_id").notNull(),
    content: text("content").notNull(),
    stance: text("stance"),
    citations: jsonb("citations").notNull().default([]),
    isDevilsAdvocate: boolean("is_devils_advocate").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("council_turns_session_idx").on(table.sessionId),
    index("council_turns_session_round_idx").on(table.sessionId, table.round),
    index("council_turns_agent_idx").on(table.agentId),
  ]
);

export const councilVotes = pgTable(
  "council_votes",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => councilSessions.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull(),
    option: text("option").notNull(),
    score: doublePrecision("score").notNull(),
    weight: doublePrecision("weight").notNull().default(1.0),
    ruinFlag: boolean("ruin_flag").notNull().default(false),
    rationale: text("rationale"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("council_votes_session_idx").on(table.sessionId),
    index("council_votes_session_opt_idx").on(table.sessionId, table.option),
    index("council_votes_agent_idx").on(table.agentId),
  ]
);

export const councilDecisions = pgTable(
  "council_decisions",
  {
    sessionId: text("session_id")
      .primaryKey()
      .references(() => councilSessions.id, { onDelete: "cascade" }),
    verdict: text("verdict").notNull(),
    rationale: text("rationale").notNull(),
    dissent: text("dissent"),
    confidence: doublePrecision("confidence").notNull().default(1.0),
    recordMd: text("record_md").notNull(),
    privacy: text("privacy").notNull().default("private"),
    sparkNoteId: text("spark_note_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("council_decisions_privacy_idx").on(table.privacy),
  ]
);

export type CouncilSessionDbRow = typeof councilSessions.$inferSelect;
export type NewCouncilSessionDbRow = typeof councilSessions.$inferInsert;
export type CouncilSeatDbRow = typeof councilSeats.$inferSelect;
export type NewCouncilSeatDbRow = typeof councilSeats.$inferInsert;
export type CouncilTurnDbRow = typeof councilTurns.$inferSelect;
export type NewCouncilTurnDbRow = typeof councilTurns.$inferInsert;
export type CouncilVoteDbRow = typeof councilVotes.$inferSelect;
export type NewCouncilVoteDbRow = typeof councilVotes.$inferInsert;
export type CouncilDecisionDbRow = typeof councilDecisions.$inferSelect;
export type NewCouncilDecisionDbRow = typeof councilDecisions.$inferInsert;
