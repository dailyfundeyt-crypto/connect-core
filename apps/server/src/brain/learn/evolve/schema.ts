/**
 * Drizzle Database Schema for Spark-Learn Proposals & Evolve (Lane 6)
 * Migration: 0224_spark_proposals
 */

import { index, pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { jsonb } from "../../../db/schema/json";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const sparkProposals = pgTable(
  "spark_proposals",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    diff: text("diff"),
    rationale: text("rationale").notNull(),
    sources: jsonb("sources").notNull().default([]),
    status: text("status").notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    appliedBackupPath: text("applied_backup_path"),
    createdBy: text("created_by").notNull().default("spark_gardener"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("spark_proposals_status_idx").on(table.status),
    index("spark_proposals_kind_idx").on(table.kind),
    index("spark_proposals_created_at_idx").on(table.createdAt),
  ],
);

export const sparkProposalFeedback = pgTable(
  "spark_proposal_feedback",
  {
    id: text("id").primaryKey(),
    proposalId: text("proposal_id").notNull(),
    kind: text("kind").notNull(),
    approved: boolean("approved").notNull(),
    feedbackNotes: text("feedback_notes"),
    score: integer("score"),
    features: jsonb("features").notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("spark_proposal_feedback_kind_idx").on(table.kind),
  ],
);

export const sparkProposalLearning = pgTable(
  "spark_proposal_learning",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").notNull(),
    updatedAt: updatedAt(),
  },
);

export type SparkProposalRow = typeof sparkProposals.$inferSelect;
export type SparkProposalInsert = typeof sparkProposals.$inferInsert;
export type SparkProposalFeedbackRow = typeof sparkProposalFeedback.$inferSelect;
export type SparkProposalFeedbackInsert = typeof sparkProposalFeedback.$inferInsert;
export type SparkProposalLearningRow = typeof sparkProposalLearning.$inferSelect;
export type SparkProposalLearningInsert = typeof sparkProposalLearning.$inferInsert;
