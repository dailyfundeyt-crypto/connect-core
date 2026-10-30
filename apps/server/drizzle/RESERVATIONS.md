# Migration Reservations (Drizzle) – Swarm-v2

Letzte Basismigration vor Swarm-v2: `0046_agent_profile_columns.sql`.

## Reservierte Migrationsnummernbereiche je Lane

| Bereich | Zuordnung | Thema / Zweck |
|---|---|---|
| `0047` – `0049` | **Phase 0 (Contracts / Reserve)** | Basisverträge & Schema-Reserven |
| `0050` – `0054` | **Lane 1** | Navigation, App-Accounts (Multi-Login) |
| `0055` – `0059` | **Lane 2** | Focus-Modus, Firmenverwaltung, Grok-Bot |
| `0060` – `0064` | **Lane 3** | Brain-Struktur, `brain_insights`, Zugriffslogs (`brain_access_log`) |
| `0065` – `0069` | **Lane 5** | Social Posts, Articles, Media, Bot Listings / Rentals |
| `0070` – `0074` | **Lane 6** | Swarm Tasks, Projects, Task Claims, Donations |
| `0075` – `0079` | **Lane 4 (Reserve)** | Settings, Design-Tokens / Preferences |
| `0080` – `0084` | **Lane 8** | Store Items, Store Versions, Installs, Reviews |
| `0085` – `0089` | **Lane 9** | Onboarding State, Security / Audit |
| `0090` – `0094` | **Lane 10** | External MCP Grants (`mcp_grants`), Email Agents (`email_agents`) |
| `0095` – `0099` | **Integration & QA** | Zusammenführung, Schema-Fixes, Finalisierung |

## Wichtige Regeln für alle Lanes
1. **Keine Änderungen an `apps/server/drizzle/meta/_journal.json`**:
   Journal-Einträge trägt **NUR die Integration** am Ende zusammen!
2. Jede Lane legt nur ihre eigene `.sql`-Datei in `apps/server/drizzle/` an (z. B. `0050_app_accounts.sql`).
3. Notiere neue Migrationen und schema-relevante Hinweise in `swarm-v2/handoff/laneX.md`.
4. Niemals fremde Migrationsnummern verwenden oder bestehende Migrationen vor `0047` modifizieren.

---

# Migration Reservations (Drizzle) – Swarm-v3

Letzte Basismigration vor Swarm-v3 (Stand 22.10.2026): `0092_email_agents.sql` (Swarm-v2 reservierte bis `0099`).
Swarm-v3 startet bei Migration **`0100`**.

## Reservierte Migrationsnummernbereiche je Lane (Swarm-v3)

| Bereich | Zuordnung | Thema / Zweck |
|---|---|---|
| `0100` – `0104` | **Phase 0 (Contracts / Reserve)** | Gemeinsame Verträge, Basis-Stubs, Schema-Reserven |
| `0105` – `0109` | **Lane 1 (Reserve)** | Dark Mode als Standard, Steuerungs-Toggle |
| `0110` – `0114` | **Lane 2** | Unternehmens-Apps pro Firma (`company_app_toggles`) |
| `0115` – `0119` | **Lane 3** | Spark-MCP: Browser-Ordner (`browser_folders`), Links & Notizen |
| `0120` – `0124` | **Lane 4** | Transcriber-Agent (Instagram→Spark) + Marketplace Listings |
| `0125` – `0129` | **Lane 5** | Persona- & Gedächtnis-Engine (`agent_personas`, `agent_memories`) |
| `0130` – `0134` | **Lane 6** | Council/Debatten-Engine (`council_sessions`, `seats`, `turns`, `votes`, `decisions`) |
| `0135` – `0139` | **Lane 7** | Zukunfts-Simulation (`sim_runs`, `sim_entities`, `sim_relations`, `sim_ticks`, `sim_reports`) |
| `0140` – `0144` | **Lane 8** | Swarm-/connect-mcp-/Gemini-CLI-Integration (`swarm_runs`, `swarm_jobs`) |
| `0145` – `0149` | **Lane 9 (Reserve)** | UI: Council-Room, Simulations-Studio, Entscheidungen |
| `0150` – `0154` | **Lane 10** | Wissens-Brains ($100M-Frameworks), `seat_brains`, Tests, Sicherheit |
| `0155` – `0159` | **Integration & QA** | Zusammenführung, Schema-Fixes, Finalisierung |

## Wichtige Regeln für Swarm-v3 Lanes
1. **Keine Änderungen an `apps/server/drizzle/meta/_journal.json`**:
   Journal-Einträge trägt **NUR die Integration** (Phase 99) ein!
2. Jede Lane legt nur ihre eigene `.sql`-Datei im zugewiesenen Bereich in `apps/server/drizzle/` an (z. B. `0110_company_app_toggles.sql`).
3. Notiere neue Migrationen und schema-relevante Hinweise in `swarm-v3/handoff/laneX.md`.
4. Niemals fremde Migrationsnummern verwenden oder Migrationen vor `0100` modifizieren.

---

# Migration Reservations (Drizzle) – Conductor & CLI-Usage

Letzte Basismigration vor Conductor (Stand 22.10.2026): `0092_email_agents.sql` (Swarm-v3 reservierte bis `0159`).
Conductor startet bei Migration **`0160`**.

## Reservierte Migrationsnummernbereiche je Lane (Conductor)

| Bereich | Zuordnung | Thema / Zweck |
|---|---|---|
| `0160` – `0164` | **Lane 1** | Usage-Datenmodell & Collector Codex/Claude (`cli_accounts`, `cli_usage_samples`, `cli_quota_windows`) |
| `0165` – `0169` | **Lane 2** | Usage für Antigravity/Gemini/Hermes/Freebuff, `failure-patterns.ts` (Reserve) |
| `0170` – `0174` | **Lane 3** | Conductor-Kern (`conductor_config`, `conductor_runtime_status`, `conductor_checkpoints`, `conductor_transfers`, `conductor_events`) |
| `0175` – `0179` | **Lane 4** | API, SSE & connect-mcp-Tools (Reserve) |
| `0180` – `0184` | **Lane 5** | Dashboard „Nutzung & Conductor“ (Reserve) |
| `0185` – `0189` | **Integration & QA** | Zusammenführung, Schema-Fixes, Finalisierung, Journal-Eintrag (ZULETZT) |

## Wichtige Regeln für Conductor Lanes
1. **Keine Änderungen an `apps/server/drizzle/meta/_journal.json`**:
   Journal-Einträge trägt **NUR die Integration** (ZULETZT) am Ende ein!
2. Jede Lane legt nur ihre eigene `.sql`-Datei im zugewiesenen Bereich in `apps/server/drizzle/` an (z. B. `0160_cli_accounts.sql`).
3. Notiere neue Migrationen und schema-relevante Hinweise in `conductor/handoff/laneX.md`.
4. Niemals fremde Migrationsnummern verwenden oder Migrationen vor `0160` modifizieren.

---

# Migration Reservations (Drizzle) – Hitodama & Spark-Learn

- **Hitodama**: Belegt Bereich **`0190` – `0219`**.
- **Spark-Learn**: Startet bei Migration **`0220`**.

## Reservierte Migrationsnummernbereiche je Lane (Spark-Learn)

| Bereich | Zuordnung | Migration / Tabellen | Thema / Zweck |
|---|---|---|---|
| `0220` | **Lane 1** | `0220_spark_chunks.sql` | `spark_chunks`, `spark_index_state` (Vektorindex/bytea, Chunker) |
| `0221` | **Lane 3** | `0221_spark_concepts.sql` | `spark_concepts`, `spark_concept_edges` (Evidenz-Kanten, Cluster, Touren) |
| `0222` | **Lane 4** | `0222_spark_study.sql` | `spark_cards`, `spark_reviews` (FSRS-Felder), `spark_learn_goals` |
| `0223` | **Lane 5** | `0223_spark_youtube.sql` | `spark_yt_videos` (Video-Metadaten, Transkripte, Notiz-Pfade) |
| `0224` | **Lane 6** | `0224_spark_proposals.sql` | `spark_proposals` (Inbox, Rationale, Diff, Status) |
| `0225` – `0229` | **Reserve** | – | Spark-Learn Reserven & ZULETZT-Integration |

## Wichtige Regeln für Spark-Learn Lanes
1. **Keine Änderungen an `apps/server/drizzle/meta/_journal.json`**:
   Journal-Einträge trägt **NUR die Integration (ZULETZT)** am Ende ein!
2. Jede Lane legt nur ihre eigene `.sql`-Datei im zugewiesenen Bereich in `apps/server/drizzle/` an.
3. Notiere neue Migrationen und schema-relevante Hinweise in `spark-learn/HANDOFF-agent-N.md`.
4. Niemals Migrationsnummern vor `0220` oder fremder Lanes verwenden.

---

# Migration Reservations (Drizzle) – v06 (Wellen W0 bis W4)

| Bereich | Zuordnung | Migration / Zweck |
|---|---|---|
| `0440` – `0445` | **W3: Social & Swarm (A24/A27)** | `social_posts`, `research_projects`, `bot_donations`, `project_tasks` |
| `0480` | **W3: Onboarding (A25)** | `user_onboarding` (v06 State) |
| `0500` – `0501` | **W3: Project-Swarm (A27)** | `task_leases`, `0501_swarm_runs` (Legacy-Kollision mit 0140) |
| `0510` | **W3: PC-Apps (A28)** | `pc_apps` |
| `0530` | **W3: Future-Sim (A30)** | `future_sim_runs` |
| `0560` – `0569` | **W3: Integration A33** | `0560_project_swarm_runs.sql` (Auflösung 0501: dedizierte `project_swarm_runs`-Tabelle & additive `project_id`-Spalte) |
| `0570` – `0599` | **W4: Rollout & Finale Integration (A40)** | Reserve Welle 4 & Finalisierung |

---

# Migration Reservations (Drizzle) – T3-Integration (A05)

Letzte Basismigration vor T3-Integration: `0560_project_swarm_runs.sql`.
A05 belegt Nummern aus dem W4-Reserve-Block (`0570`–`0599`).

## Belegte Nummern durch A05

| Nummer | Datei | Inhalt |
|---|---|---|
| `0570` | `0570_t3_tables.sql` | Alle 11 neuen T3-Tabellen: `t3_thread_map`, `agent_workspace`, `usage_ledger`, `company_usage_settings`, `company_usage_rollup`, `machine`, `agent_machine`, `machine_settings`, `machine_install_consent`, `agent_avatar`, `context_generation` |
| `0571` | `0571_t3_seed_cua_consent.sql` | Seed: CUA-Consent für Eigentümer (recorded_by=admin), machine_settings mode=shared |

## Wichtige Regeln (A05)
1. Keine Änderungen an `apps/server/drizzle/meta/_journal.json` — trägt NUR A40 ein.
2. Nur additive Migrationen (CREATE TABLE IF NOT EXISTS, keine DROP/ALTER).
3. Gegen Live-Postgres 5544 erst nach Freigabe durch A40 ausführen.
4. Sicherung RESERVATIONS.md angelegt: `RESERVATIONS.md.bak-helium-20261029-A05`.




