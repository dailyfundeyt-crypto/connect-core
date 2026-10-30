-- Migration 0570 – T3-Integration: alle neuen Tabellen
-- Eigentümer: A05 (Datenbank-Schema)
-- Strategie: ausschließlich additive CREATE TABLE IF NOT EXISTS + CREATE TYPE IF NOT EXISTS
-- Keine DROP / ALTER an bestehenden Tabellen.
-- Idempotent: kann mehrfach ausgeführt werden.

-- ---------------------------------------------------------------------------
-- Enums (nur anlegen, falls noch nicht vorhanden)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 't3_machine_mode') THEN
    CREATE TYPE t3_machine_mode AS ENUM ('shared', 'per_agent');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 't3_machine_kind') THEN
    CREATE TYPE t3_machine_kind AS ENUM ('local', 'sandbox');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 't3_machine_status') THEN
    CREATE TYPE t3_machine_status AS ENUM ('sleeping', 'starting', 'running', 'stopped', 'error');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 't3_consent_recorded_by') THEN
    CREATE TYPE t3_consent_recorded_by AS ENUM ('user', 'admin');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 't3_usage_range') THEN
    CREATE TYPE t3_usage_range AS ENUM ('7d', '30d', 'all');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. t3_thread_map
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS t3_thread_map (
  agent_id          text        NOT NULL,
  channel_id        text,
  t3_thread_id      text        NOT NULL,
  generation        integer     NOT NULL DEFAULT 0,
  provider          text        NOT NULL,
  model             text,
  project_id        text,
  cwd               text,
  superseded_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  updated_at        timestamptz NOT NULL DEFAULT NOW()
);

-- Einzigartiger aktiver Thread pro Agent+Generation (Race-Condition-Schutz)
CREATE UNIQUE INDEX IF NOT EXISTS t3_thread_map_agent_gen_unique
  ON t3_thread_map (agent_id, generation);

CREATE INDEX IF NOT EXISTS t3_thread_map_agent_idx
  ON t3_thread_map (agent_id);

CREATE INDEX IF NOT EXISTS t3_thread_map_t3_thread_idx
  ON t3_thread_map (t3_thread_id);

-- ---------------------------------------------------------------------------
-- 2. agent_workspace
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_workspace (
  agent_id   text        PRIMARY KEY,
  path       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. usage_ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usage_ledger (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              text,
  company_id            text,
  provider              text        NOT NULL,
  model                 text        NOT NULL DEFAULT '',
  input_tokens          integer     NOT NULL DEFAULT 0,
  cached_input_tokens   integer     NOT NULL DEFAULT 0,
  cache_creation_tokens integer     NOT NULL DEFAULT 0,
  output_tokens         integer     NOT NULL DEFAULT 0,
  reasoning_tokens      integer     NOT NULL DEFAULT 0,
  cost_usd              float8      NOT NULL DEFAULT 0,
  cache_savings_usd     float8      NOT NULL DEFAULT 0,
  turn_id               text,
  day                   text        NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usage_ledger_agent_day_idx
  ON usage_ledger (agent_id, day);

CREATE INDEX IF NOT EXISTS usage_ledger_company_day_idx
  ON usage_ledger (company_id, day);

CREATE INDEX IF NOT EXISTS usage_ledger_provider_idx
  ON usage_ledger (provider);

CREATE INDEX IF NOT EXISTS usage_ledger_day_idx
  ON usage_ledger (day);

CREATE INDEX IF NOT EXISTS usage_ledger_created_at_idx
  ON usage_ledger (created_at);

-- ---------------------------------------------------------------------------
-- 4. company_usage_settings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS company_usage_settings (
  company_id  text        PRIMARY KEY,
  public      boolean     NOT NULL DEFAULT true,
  show_cost   boolean     NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 5. company_usage_rollup
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS company_usage_rollup (
  company_id    text            NOT NULL,
  range         t3_usage_range  NOT NULL,
  total_tokens  bigint          NOT NULL DEFAULT 0,
  cost_usd      float8          NOT NULL DEFAULT 0,
  computed_at   timestamptz     NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, range)
);

CREATE INDEX IF NOT EXISTS company_usage_rollup_computed_idx
  ON company_usage_rollup (computed_at);

-- ---------------------------------------------------------------------------
-- 6. machine
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS machine (
  id               text               PRIMARY KEY,
  owner            text,
  kind             t3_machine_kind    NOT NULL DEFAULT 'local',
  name             text               NOT NULL,
  status           t3_machine_status  NOT NULL DEFAULT 'stopped',
  shared_default   boolean            NOT NULL DEFAULT false,
  cua_ref          text,
  width            integer,
  height           integer,
  last_activity_at timestamptz,
  created_at       timestamptz        NOT NULL DEFAULT NOW(),
  updated_at       timestamptz        NOT NULL DEFAULT NOW()
);

-- Nur eine Maschine darf shared_default = true sein
CREATE UNIQUE INDEX IF NOT EXISTS machine_shared_default_unique
  ON machine (id) WHERE shared_default = true;

CREATE INDEX IF NOT EXISTS machine_owner_idx
  ON machine (owner);

CREATE INDEX IF NOT EXISTS machine_status_idx
  ON machine (status);

-- ---------------------------------------------------------------------------
-- 7. agent_machine
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_machine (
  agent_id    text        NOT NULL,
  machine_id  text        NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agent_id, machine_id)
);

CREATE INDEX IF NOT EXISTS agent_machine_agent_idx
  ON agent_machine (agent_id);

CREATE INDEX IF NOT EXISTS agent_machine_machine_idx
  ON agent_machine (machine_id);

-- ---------------------------------------------------------------------------
-- 8. machine_settings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS machine_settings (
  owner_user_id  text              PRIMARY KEY,
  mode           t3_machine_mode   NOT NULL DEFAULT 'shared',
  updated_at     timestamptz       NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 9. machine_install_consent
-- ---------------------------------------------------------------------------
-- APPEND-ONLY: kein DELETE, kein UPDATE an dieser Tabelle.
-- Enthält KEINE Inhaltsdaten — nur Zustimmungs-Metadaten.

CREATE TABLE IF NOT EXISTS machine_install_consent (
  id          uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text                   NOT NULL,
  scope       text                   NOT NULL DEFAULT 'cua_install',
  source      text                   NOT NULL,
  recorded_by t3_consent_recorded_by NOT NULL,
  recorded_at timestamptz            NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS machine_install_consent_user_idx
  ON machine_install_consent (user_id);

CREATE INDEX IF NOT EXISTS machine_install_consent_scope_idx
  ON machine_install_consent (scope);

CREATE INDEX IF NOT EXISTS machine_install_consent_recorded_at_idx
  ON machine_install_consent (recorded_at);

-- ---------------------------------------------------------------------------
-- 10. agent_avatar
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_avatar (
  agent_id    text        PRIMARY KEY,
  shape       text        NOT NULL DEFAULT 'circle',
  color       text        NOT NULL DEFAULT 'orange',
  expression  text,
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 11. context_generation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS context_generation (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         text        NOT NULL,
  thread_id        text        NOT NULL,
  tokens_at_switch integer     NOT NULL,
  summary_text     text,
  created_at       timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS context_generation_agent_idx
  ON context_generation (agent_id);

CREATE INDEX IF NOT EXISTS context_generation_thread_idx
  ON context_generation (thread_id);
