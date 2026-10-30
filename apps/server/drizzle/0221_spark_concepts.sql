-- Migration 0221: Spark-Learn Wissensgraph-Ansicht (Konzepte, Cluster, Touren) (Lane 3)
-- Erstellt spark_concepts, spark_concept_edges (mit evidence_chunk_id) und spark_tours.

CREATE TABLE IF NOT EXISTS "spark_concepts" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "cluster_id" text,
  "summary" text,
  "source_note_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "spark_concepts_cluster_idx" ON "spark_concepts" ("cluster_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spark_concepts_name_idx" ON "spark_concepts" ("name");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "spark_concept_edges" (
  "id" text PRIMARY KEY NOT NULL,
  "source_concept_id" text NOT NULL,
  "target_concept_id" text NOT NULL,
  "relation_type" text DEFAULT 'relates_to' NOT NULL,
  "weight" real DEFAULT 1.0 NOT NULL,
  "evidence_chunk_id" text,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "spark_concept_edges_src_idx" ON "spark_concept_edges" ("source_concept_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spark_concept_edges_tgt_idx" ON "spark_concept_edges" ("target_concept_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spark_concept_edges_evidence_idx" ON "spark_concept_edges" ("evidence_chunk_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "spark_tours" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "cluster_id" text,
  "description" text,
  "steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "spark_tours_cluster_idx" ON "spark_tours" ("cluster_id");
