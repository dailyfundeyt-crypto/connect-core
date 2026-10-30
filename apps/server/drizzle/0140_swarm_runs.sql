-- Lane 8 Migration 0140: Swarm-v3 Runs, Jobs & Cost/Usage Tracking
CREATE TABLE IF NOT EXISTS swarm_runs (
  id text PRIMARY KEY,
  name text,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  provider text NOT NULL DEFAULT 'gemini-cli' CHECK (provider IN ('gemini-cli', 'api', 'mock')),
  total_jobs integer NOT NULL DEFAULT 0,
  completed_jobs integer NOT NULL DEFAULT 0,
  failed_jobs integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS swarm_runs_status_idx ON swarm_runs (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS swarm_runs_created_idx ON swarm_runs (created_at DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS swarm_jobs (
  id text PRIMARY KEY,
  run_id text REFERENCES swarm_runs(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('council_turn', 'sim_tick', 'transcribe', 'persona_turn', 'generic')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  priority integer NOT NULL DEFAULT 0,
  agent_id text,
  profile_dir text,
  provider text NOT NULL DEFAULT 'gemini-cli',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  retries integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS swarm_jobs_run_idx ON swarm_jobs (run_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS swarm_jobs_status_idx ON swarm_jobs (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS swarm_jobs_type_idx ON swarm_jobs (type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS swarm_jobs_agent_idx ON swarm_jobs (agent_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS swarm_cost_usage (
  id text PRIMARY KEY,
  run_id text REFERENCES swarm_runs(id) ON DELETE CASCADE,
  job_id text REFERENCES swarm_jobs(id) ON DELETE SET NULL,
  agent_id text,
  provider text NOT NULL,
  model text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS swarm_cost_usage_run_idx ON swarm_cost_usage (run_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS swarm_cost_usage_job_idx ON swarm_cost_usage (job_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS swarm_cost_usage_recorded_idx ON swarm_cost_usage (recorded_at DESC);
