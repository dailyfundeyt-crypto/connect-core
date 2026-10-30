-- Lane 10 Migration 0150: Seat Brains & 100M Knowledge Chunk Index (Swarm-v3)
-- Reservierte Migrations-Range: 0150-0154 (Agent 10)
-- Journal meta/_journal.json wird erst von der Integration (Phase 99) aktualisiert.

CREATE TABLE IF NOT EXISTS seat_brains (
  id text PRIMARY KEY,
  agent_id text,
  name text NOT NULL,
  frameworks jsonb NOT NULL DEFAULT '[]'::jsonb,
  principles jsonb NOT NULL DEFAULT '[]'::jsonb,
  positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  privacy text NOT NULL DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS seat_brains_agent_id_idx ON seat_brains (agent_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS seat_brains_privacy_idx ON seat_brains (privacy);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS seat_brains_name_idx ON seat_brains (name);
--> statement-breakpoint

-- Volltext-Tabelle für private $100M-Frameworks Chunks in Postgres (FTS / tsvector)
CREATE TABLE IF NOT EXISTS book_chunks_100m (
  chunk_id text PRIMARY KEY,
  source_id text NOT NULL DEFAULT '100m-money-models',
  section text NOT NULL,
  chapter text NOT NULL,
  line_start integer NOT NULL,
  line_end integer NOT NULL,
  text text NOT NULL,
  sha256 text NOT NULL,
  citation text NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS book_chunks_100m_tsv_idx ON book_chunks_100m USING gin (tsv);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS book_chunks_100m_section_idx ON book_chunks_100m (section);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS book_chunks_100m_chapter_idx ON book_chunks_100m (chapter);
