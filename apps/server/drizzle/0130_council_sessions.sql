-- Lane 6 Migration 0130: Council / Debatten-Engine (Roast-Room-Prinzip)
-- Tabellen: council_sessions, council_seats, council_turns, council_votes, council_decisions

CREATE TABLE IF NOT EXISTS council_sessions (
  id text PRIMARY KEY,
  question text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  context text,
  mode text NOT NULL DEFAULT 'full' CHECK (mode IN ('quick', 'full')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  chair_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS council_sessions_status_idx ON council_sessions (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS council_sessions_created_idx ON council_sessions (created_at DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS council_seats (
  session_id text NOT NULL REFERENCES council_sessions(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  role text,
  weight double precision NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, agent_id)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS council_seats_agent_idx ON council_seats (agent_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS council_turns (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES council_sessions(id) ON DELETE CASCADE,
  round integer NOT NULL,
  agent_id text NOT NULL,
  content text NOT NULL,
  stance text,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_devils_advocate boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS council_turns_session_idx ON council_turns (session_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS council_turns_session_round_idx ON council_turns (session_id, round);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS council_turns_agent_idx ON council_turns (agent_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS council_votes (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES council_sessions(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  option text NOT NULL,
  score double precision NOT NULL CHECK (score >= 0.0 AND score <= 10.0),
  weight double precision NOT NULL DEFAULT 1.0,
  ruin_flag boolean NOT NULL DEFAULT false,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS council_votes_session_idx ON council_votes (session_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS council_votes_session_opt_idx ON council_votes (session_id, option);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS council_votes_agent_idx ON council_votes (agent_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS council_decisions (
  session_id text PRIMARY KEY REFERENCES council_sessions(id) ON DELETE CASCADE,
  verdict text NOT NULL,
  rationale text NOT NULL,
  dissent text,
  confidence double precision NOT NULL DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  record_md text NOT NULL,
  privacy text NOT NULL DEFAULT 'private' CHECK (privacy IN ('private', 'shareable')),
  spark_note_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS council_decisions_privacy_idx ON council_decisions (privacy);
