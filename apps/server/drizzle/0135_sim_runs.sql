-- Lane 7 Migration 0135: Zukunfts-Simulation (Swarm-v3)
-- Runs, Entities, Relations, Ticks, Injections, Reports

CREATE TABLE IF NOT EXISTS sim_runs (
  id text PRIMARY KEY,
  name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  engine text NOT NULL DEFAULT 'native' CHECK (engine IN ('native', 'mirofish')),
  seed jsonb NOT NULL DEFAULT '{}'::jsonb,
  budget_tokens integer NOT NULL DEFAULT 50000,
  used_tokens integer NOT NULL DEFAULT 0,
  max_ticks integer NOT NULL DEFAULT 10,
  current_tick integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS sim_runs_status_idx ON sim_runs (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sim_runs_engine_idx ON sim_runs (engine);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sim_runs_created_idx ON sim_runs (created_at DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS sim_entities (
  run_id text NOT NULL REFERENCES sim_runs(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, id)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS sim_entities_run_idx ON sim_entities (run_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sim_entities_type_idx ON sim_entities (type);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS sim_relations (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES sim_runs(id) ON DELETE CASCADE,
  source text NOT NULL,
  target text NOT NULL,
  type text NOT NULL,
  weight numeric(6, 3) NOT NULL DEFAULT 1.0,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS sim_relations_run_idx ON sim_relations (run_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sim_relations_source_idx ON sim_relations (run_id, source);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sim_relations_target_idx ON sim_relations (run_id, target);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS sim_ticks (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES sim_runs(id) ON DELETE CASCADE,
  tick integer NOT NULL,
  event text,
  state_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  timestamp timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS sim_ticks_run_tick_idx ON sim_ticks (run_id, tick);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS sim_injections (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES sim_runs(id) ON DELETE CASCADE,
  tick integer,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS sim_injections_run_idx ON sim_injections (run_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS sim_reports (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES sim_runs(id) ON DELETE CASCADE,
  summary text NOT NULL,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  projections jsonb NOT NULL DEFAULT '{}'::jsonb,
  markdown text,
  privacy text NOT NULL DEFAULT 'private' CHECK (privacy IN ('private', 'shareable')),
  disclaimer text NOT NULL DEFAULT 'Simulation, keine Prognosegarantie',
  council_session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS sim_reports_run_idx ON sim_reports (run_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sim_reports_created_idx ON sim_reports (created_at DESC);
