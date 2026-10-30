-- Lane 5 Migration 0125: Agent Personas (Swarm-v3)
CREATE TABLE IF NOT EXISTS agent_personas (
  agent_id text PRIMARY KEY,
  pillar text NOT NULL,
  owned_question text NOT NULL,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_profile text NOT NULL,
  voice text NOT NULL,
  brain_folder_id text,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  knowledge_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  framework_focus text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS agent_personas_pillar_idx ON agent_personas (pillar);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_personas_framework_idx ON agent_personas (framework_focus);
