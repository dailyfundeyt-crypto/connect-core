-- 0045_engine_types.sql
-- Stufe 2: Neue Agent-Engine-Typen
--
-- ALTER TYPE agent_type ADD VALUE 'app_instance';
-- ALTER TYPE agent_type ADD VALUE 'browser_profile';

-- Neue Tabelle: Agent-App-Instanzen (Slots mit E-Mail/Profil-Name)
-- Ein Agent kann mehrere Instanzen einer App haben (z.B. 3x Codex mit verschiedenen Accounts)
CREATE TABLE IF NOT EXISTS agent_app_instances (
    id           text        NOT NULL DEFAULT gen_random_uuid()::text,
    agent_id     text        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    app_id       text        NOT NULL, -- "codex" | "ottermind" | "manus" | "figma" | "cursor" | "perplexity" | ...
    slot         integer     NOT NULL DEFAULT 1,
    name         text        NOT NULL DEFAULT '',
    email        text        NOT NULL DEFAULT '',
    enabled      boolean     NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT agent_app_instances_pkey PRIMARY KEY (id),
    CONSTRAINT agent_app_instances_agent_slot_unique UNIQUE (agent_id, app_id, slot)
);

CREATE INDEX IF NOT EXISTS agent_app_instances_agent_id_idx ON agent_app_instances(agent_id);

-- Geplante Spalte in agents.configuration:
-- {
--   "cli": {
--     "kind": "antigravity" | "codex" | "claude",
--     "model": "auto" | "gemini-3.8-flash-high" | ...,
--     "allowWrite": false
--   },
--   "appInstance": {
--     "appId": "codex" | "ottermind" | "manus" | ...,
--     "defaultSlot": 1
--   },
--   "browserProfile": {
--     "startUrl": "https://...",
--     "allowWrite": false
--   }
-- }
