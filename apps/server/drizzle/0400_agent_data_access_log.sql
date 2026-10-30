-- 0400_agent_data_access_log.sql  (A17 – Spark-Übersicht, Bereich 0400-0409)
-- Additive Migration: NUR neue Tabelle + Indizes. Nicht angewendet durch A17
-- (Regel 10: Anwenden macht ausschließlich der Integrations-Agent).
CREATE TABLE IF NOT EXISTS agent_data_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  kind text NOT NULL,
  ref text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

-- Abfrage des Übersichts-Endpunkts: Quellen je Agent, letzte Zugriffe zuerst
CREATE INDEX IF NOT EXISTS idx_agent_data_access_log_agent_at
  ON agent_data_access_log (agent_id, at DESC);

-- Alter Graph bleibt vollständig erhalten: Hinzufügung statt Umbau.
-- ref-Index für die Quellen-Aggregation in agentAccess.ts
CREATE INDEX IF NOT EXISTS idx_agent_data_access_log_ref
  ON agent_data_access_log (ref);
