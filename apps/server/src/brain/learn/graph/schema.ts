/**
 * Drizzle Database Schema for Spark-Learn Knowledge Graph (Lane 3)
 * Migration: 0221_spark_concepts
 *
 * Tables:
 * - spark_concepts: Extracted knowledge concepts with cluster assignments and source notes
 * - spark_concept_edges: Semantic relationships between concepts with evidence chunk links
 * - spark_tours: Guided didactic learning tours through clusters
 */

import { index, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { jsonb } from "../../../db/schema/json";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const sparkConcepts = pgTable(
  "spark_concepts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    clusterId: text("cluster_id"),
    summary: text("summary"),
    sourceNotePaths: jsonb("source_note_paths").notNull().default([]),
    tags: jsonb("tags").notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("spark_concepts_cluster_idx").on(table.clusterId),
    index("spark_concepts_name_idx").on(table.name),
  ],
);

export const sparkConceptEdges = pgTable(
  "spark_concept_edges",
  {
    id: text("id").primaryKey(),
    sourceConceptId: text("source_concept_id").notNull(),
    targetConceptId: text("target_concept_id").notNull(),
    relationType: text("relation_type").notNull().default("relates_to"),
    weight: real("weight").notNull().default(1.0),
    evidenceChunkId: text("evidence_chunk_id"),
    description: text("description"),
    createdAt: createdAt(),
  },
  (table) => [
    index("spark_concept_edges_src_idx").on(table.sourceConceptId),
    index("spark_concept_edges_tgt_idx").on(table.targetConceptId),
    index("spark_concept_edges_evidence_idx").on(table.evidenceChunkId),
  ],
);

export const sparkTours = pgTable(
  "spark_tours",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    clusterId: text("cluster_id"),
    description: text("description"),
    steps: jsonb("steps").notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("spark_tours_cluster_idx").on(table.clusterId),
  ],
);

export type SparkConceptRow = typeof sparkConcepts.$inferSelect;
export type SparkConceptInsert = typeof sparkConcepts.$inferInsert;
export type SparkConceptEdgeRow = typeof sparkConceptEdges.$inferSelect;
export type SparkConceptEdgeInsert = typeof sparkConceptEdges.$inferInsert;
export type SparkTourRow = typeof sparkTours.$inferSelect;
export type SparkTourInsert = typeof sparkTours.$inferInsert;
