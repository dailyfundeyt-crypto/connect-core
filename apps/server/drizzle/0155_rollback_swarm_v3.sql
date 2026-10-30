-- Rollback-Skript für Swarm-v3 (Migrationen 0110 bis 0150)
-- Drop aller Tabellen, Views und Indizes in umgekehrter Reihenfolge

-- Lane 10 (0150)
DROP TABLE IF EXISTS book_chunks_100m CASCADE;
DROP TABLE IF EXISTS seat_brains CASCADE;

-- Lane 8 (0140)
DROP TABLE IF EXISTS swarm_cost_usage CASCADE;
DROP TABLE IF EXISTS swarm_jobs CASCADE;
DROP TABLE IF EXISTS swarm_runs CASCADE;

-- Lane 7 (0135)
DROP TABLE IF EXISTS sim_reports CASCADE;
DROP TABLE IF EXISTS sim_injections CASCADE;
DROP TABLE IF EXISTS sim_ticks CASCADE;
DROP TABLE IF EXISTS sim_relations CASCADE;
DROP TABLE IF EXISTS sim_entities CASCADE;
DROP TABLE IF EXISTS sim_runs CASCADE;

-- Lane 6 (0130)
DROP TABLE IF EXISTS council_decisions CASCADE;
DROP TABLE IF EXISTS council_votes CASCADE;
DROP TABLE IF EXISTS council_turns CASCADE;
DROP TABLE IF EXISTS council_seats CASCADE;
DROP TABLE IF EXISTS council_sessions CASCADE;

-- Lane 5 (0126, 0125)
DROP TABLE IF EXISTS agent_memories CASCADE;
DROP TABLE IF EXISTS agent_personas CASCADE;

-- Lane 3 (0115)
DROP VIEW IF EXISTS folders CASCADE;
DROP TABLE IF EXISTS folder_notes CASCADE;
DROP TABLE IF EXISTS folder_links CASCADE;
DROP TABLE IF EXISTS browser_folders CASCADE;

-- Lane 2 (0110)
DROP TABLE IF EXISTS company_app_toggles CASCADE;
