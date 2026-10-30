-- Migration 0220: Spark-Learn Index & Lokale Embeddings (Lane 1)
-- Erstellt spark_chunks und spark_index_state fuer semantische Vektorsuche & Chunks.

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION WHEN OTHERS THEN
    -- Fallback: pgvector ist nicht vorhanden / keine Berechtigung
    NULL;
  END;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "spark_chunks" (
  "id" text PRIMARY KEY NOT NULL,
  "note_path" text NOT NULL,
  "heading" text DEFAULT '' NOT NULL,
  "chunk_idx" integer NOT NULL,
  "text" text NOT NULL,
  "hash" text NOT NULL,
  "line_start" integer NOT NULL,
  "line_end" integer NOT NULL,
  "embedding_bytea" bytea,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "spark_chunks_note_path_idx" ON "spark_chunks" ("note_path");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spark_chunks_hash_idx" ON "spark_chunks" ("hash");
--> statement-breakpoint

-- Falls pgvector verfuegbar ist, Vektorspalte und HNSW-Index hinzufuegen
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    BEGIN
      ALTER TABLE "spark_chunks" ADD COLUMN IF NOT EXISTS "embedding" vector(1024);
      CREATE INDEX IF NOT EXISTS "spark_chunks_embedding_hnsw" ON "spark_chunks" USING hnsw ("embedding" vector_cosine_ops);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "spark_index_state" (
  "id" text PRIMARY KEY NOT NULL DEFAULT 'default',
  "model" text DEFAULT 'bge-m3' NOT NULL,
  "dim" integer DEFAULT 1024 NOT NULL,
  "total_chunks" integer DEFAULT 0 NOT NULL,
  "total_notes" integer DEFAULT 0 NOT NULL,
  "last_indexed_at" timestamp with time zone,
  "is_indexing" boolean DEFAULT false NOT NULL,
  "has_pgvector" boolean DEFAULT false NOT NULL,
  "error" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

INSERT INTO "spark_index_state" ("id", "model", "dim", "total_chunks", "total_notes", "is_indexing", "has_pgvector")
VALUES ('default', 'bge-m3', 1024, 0, 0, false, false)
ON CONFLICT ("id") DO NOTHING;
