-- Lane 5 Migration 0126: Agent Memories (Swarm-v3 - Episodic, Semantic, Temporal)
CREATE TABLE IF NOT EXISTS agent_memories (
  id text PRIMARY KEY,
  agent_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('episodic', 'semantic')),
  content text NOT NULL,
  valid_from timestamptz,
  valid_to timestamptz,
  confidence double precision NOT NULL DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS agent_memories_agent_idx ON agent_memories (agent_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_memories_agent_type_idx ON agent_memories (agent_id, type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_memories_valid_time_idx ON agent_memories (agent_id, valid_from, valid_to);
