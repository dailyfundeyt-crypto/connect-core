/**
 * T3-Bridge — Datenbank-Schema (alle neuen Tabellen).
 *
 * EIGENTÜMER: A05 (Datenbank-Schema). Keine andere Lane darf diese Datei ändern.
 *
 * Alle Tabellen sind additiv (CREATE TABLE IF NOT EXISTS in den Migrationen).
 * Keine bestehende Tabelle wird verändert.
 *
 * Abhängige Typen: `apps/server/src/t3-bridge/contracts.ts` (A01, nur gelesen).
 *
 * Feature-Flag: Alle Tabellen existieren in der DB unabhängig vom Flag;
 * die Applikationsschicht (A37/Routen) prüft `connect.t3.bridge` vor dem Zugriff.
 * So bleibt das alte Verhalten exakt erhalten, wenn das Flag aus ist.
 *
 * Migrationsnummern (reserviert in RESERVATIONS.md W4-Block):
 *   0570 — alle T3-Tabellen
 *   0571 — Seed: CUA-Consent für Stefan
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Hilfsfunktionen (lokal, analog zu core.ts)
// ---------------------------------------------------------------------------

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Modus der Maschinen-Einstellungen: alle Agenten teilen eine Maschine
 * (`shared`) oder jeder Agent hat eine eigene (`per_agent`).
 */
export const machineModeEnum = pgEnum("t3_machine_mode", [
  "shared",
  "per_agent",
]);

/**
 * Art einer Cua-Maschine.
 * `local` = Host-Maschine, `sandbox` = isolierte CUA-Sandbox.
 */
export const machineKindEnum = pgEnum("t3_machine_kind", ["local", "sandbox"]);

/**
 * Betriebsstatus einer Cua-Maschine.
 */
export const machineStatusEnum = pgEnum("t3_machine_status", [
  "sleeping",
  "starting",
  "running",
  "stopped",
  "error",
]);

/**
 * Wer einen Consent-Eintrag protokolliert hat.
 * `user` = Klick in der UI, `admin` = administrativ eingetragen.
 */
export const consentRecordedByEnum = pgEnum("t3_consent_recorded_by", [
  "user",
  "admin",
]);

/**
 * Aggregations-Zeitraum für den Usage-Rollup-Cache.
 */
export const usageRangeEnum = pgEnum("t3_usage_range", ["7d", "30d", "all"]);

// ---------------------------------------------------------------------------
// 1. t3_thread_map
// ---------------------------------------------------------------------------

/**
 * Zuordnung Connect-Agent ↔ T3-Thread (eine Zeile pro aktiver Generation).
 *
 * T3 ist die Quelle für Turn-Inhalt. Connect speichert hier nur die
 * Zuordnung, damit nach einem Neustart der richtige Thread fortgesetzt wird.
 *
 * `generation` zählt Kontextfenster: steigt bei jeder Rotation (A15).
 * Ein Agent kann mehrere Generationen haben (History), aber nur eine „aktuelle"
 * (ohne `superseded_at`).
 *
 * Aus A01 contracts.ts: T3ThreadMap.
 */
export const t3ThreadMap = pgTable(
  "t3_thread_map",
  {
    agentId: text("agent_id").notNull(),
    channelId: text("channel_id"),
    /** T3-interne Thread-Id. */
    t3ThreadId: text("t3_thread_id").notNull(),
    /** Kontextfenster-Zähler (0 = erstes Fenster). */
    generation: integer("generation").notNull().default(0),
    /** T3-Provider für diesen Thread. */
    provider: text("provider").notNull(),
    /** Optionales Modell-Override. */
    model: text("model"),
    /** T3-Projekt-Id (Arbeitsordner). */
    projectId: text("project_id"),
    /** Arbeitsverzeichnis auf dem Host. */
    cwd: text("cwd"),
    /**
     * Wann dieser Thread durch einen neueren ersetzt wurde (Soft-Ablösung).
     * NULL = aktueller Thread.
     */
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /**
     * Pro Agent + Generation genau einen Eintrag – verhindert doppelte
     * Rotationen bei Race-Conditions.
     */
    uniqueIndex("t3_thread_map_agent_gen_unique").on(
      table.agentId,
      table.generation
    ),
    index("t3_thread_map_agent_idx").on(table.agentId),
    index("t3_thread_map_t3_thread_idx").on(table.t3ThreadId),
  ]
);

// ---------------------------------------------------------------------------
// 2. agent_workspace
// ---------------------------------------------------------------------------

/**
 * Lokaler Arbeitsordner eines Agenten.
 *
 * T3-Prozesse arbeiten in einem dedizierten Verzeichnis unter
 * `%LOCALAPPDATA%\ConnectAgents\workspaces\<agentSlug>`.
 * Diese Tabelle merkt sich den Pfad, damit die Bridge ihn nach einem
 * Neustart ohne Dateisystem-Scan wiederfinden kann.
 *
 * Ein Agent hat genau einen Eintrag (agent_id = PK).
 */
export const agentWorkspace = pgTable("agent_workspace", {
  agentId: text("agent_id").primaryKey(),
  /** Absoluter Pfad des Arbeitsordners. */
  path: text("path").notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// 3. usage_ledger
// ---------------------------------------------------------------------------

/**
 * Nutzungs-Ledger: eine Zeile pro T3-Turn-Token-Event.
 *
 * T3 rechnet nach Provider/Modell. Connect speichert hier Agent-Id und
 * Firmen-Id dazu, um „pro Agent" und „pro Firma" auswerten zu können.
 *
 * Append-only: Zeilen werden nie gelöscht oder geändert.
 * Aggregation erfolgt über `company_usage_rollup` (Cache).
 *
 * Aus A01 contracts.ts: UsageLedgerRow.
 */
export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: text("agent_id"),
    companyId: text("company_id"),
    /** T3-Treiber-Id oder `legacy` / `cloud`. */
    provider: text("provider").notNull(),
    /** Modell-Name (z. B. `gpt-4o`, `claude-opus-4`). */
    model: text("model").notNull().default(""),
    /** Ungecachte Eingabe-Tokens. */
    inputTokens: integer("input_tokens").notNull().default(0),
    /** Gelesene Cache-Tokens (günstiger Anteil). */
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    /** Neu geschriebene Cache-Tokens. */
    cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
    /** Ausgabe-Tokens. */
    outputTokens: integer("output_tokens").notNull().default(0),
    /** Reasoning-Tokens (o1/o3-Modelle). */
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    /** Kosten in US-Dollar (0.0 = unbekannt). */
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    /** Eingesparte Kosten durch Cache. */
    cacheSavingsUsd: doublePrecision("cache_savings_usd").notNull().default(0),
    /** T3-Turn-Id, aus dem diese Zeile stammt. */
    turnId: text("turn_id"),
    /** Tag (YYYY-MM-DD) für Tages-Aggregation. */
    day: text("day").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("usage_ledger_agent_day_idx").on(table.agentId, table.day),
    index("usage_ledger_company_day_idx").on(table.companyId, table.day),
    index("usage_ledger_provider_idx").on(table.provider),
    index("usage_ledger_day_idx").on(table.day),
    index("usage_ledger_created_at_idx").on(table.createdAt),
  ]
);

// ---------------------------------------------------------------------------
// 4. company_usage_settings
// ---------------------------------------------------------------------------

/**
 * Firmen-Einstellungen zur öffentlichen Nutzungsanzeige.
 *
 * Eine Zeile pro Firma (company_id = PK).
 * Standard: öffentlich sichtbar, Kosten verborgen.
 *
 * Aus A01 contracts.ts: CompanyUsageSettings.
 */
export const companyUsageSettings = pgTable("company_usage_settings", {
  companyId: text("company_id").primaryKey(),
  /**
   * Token-Summen auf dem öffentlichen Firmenprofil zeigen.
   * Standard true (Opt-out), aus A01 §11 Frage 5 – offen.
   */
  public: boolean("public").notNull().default(true),
  /**
   * Kostenbetrag in USD auf dem öffentlichen Firmenprofil zeigen.
   * Standard false – Kosten sind sensibel.
   */
  showCost: boolean("show_cost").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// 5. company_usage_rollup
// ---------------------------------------------------------------------------

/**
 * Vorberechneter Aggregations-Cache für öffentliche Firmen-Nutzung.
 *
 * A20 schreibt stündlich einen Snapshot; `/api/companies/:id/public-usage`
 * liest nur aus dieser Tabelle (kein Live-Scan des Ledgers pro Request).
 *
 * Pro Firma + Zeitraum genau eine Zeile (PK = company_id + range).
 *
 * Aus A01 contracts.ts: CompanyPublicUsage.
 */
export const companyUsageRollup = pgTable(
  "company_usage_rollup",
  {
    companyId: text("company_id").notNull(),
    /** Aggregations-Zeitraum. */
    range: usageRangeEnum("range").notNull(),
    /** Gesamt-Tokens im Zeitraum (bigint: kann bei 40 Agenten groß werden). */
    totalTokens: bigint("total_tokens", { mode: "number" })
      .notNull()
      .default(0),
    /** Gesamtkosten (falls `show_cost` aktiv). */
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    /** Zeitstempel der letzten Berechnung (Cache-Aktualität). */
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.range] }),
    index("company_usage_rollup_computed_idx").on(table.computedAt),
  ]
);

// ---------------------------------------------------------------------------
// 6. machine
// ---------------------------------------------------------------------------

/**
 * Cua-Maschinen (lokale Sandbox oder Host-Desktop).
 *
 * Shared Default: eine Maschine für alle Agenten.
 * Per-Agent: jeder Agent bekommt eine eigene Maschine (machine_settings).
 *
 * Aus A01 contracts.ts: Machine.
 */
export const machine = pgTable(
  "machine",
  {
    id: text("id").primaryKey(),
    /**
     * Besitzer: null = gemeinsame Standardmaschine, sonst Agent-Id oder
     * Nutzer-Id (text, kein FK – Maschinen dürfen länger leben).
     */
    owner: text("owner"),
    kind: machineKindEnum("kind").notNull().default("local"),
    name: text("name").notNull(),
    status: machineStatusEnum("status").notNull().default("stopped"),
    /** Genau eine Maschine hat dieses Flag gesetzt: die geteilte Standardmaschine. */
    sharedDefault: boolean("shared_default").notNull().default(false),
    /** Cua-Referenz (z. B. `cua sb:dev` oder eine Host-UUID). */
    cuaRef: text("cua_ref"),
    /** Bildschirmbreite in Pixeln (für die Vorschau). */
    width: integer("width"),
    /** Bildschirmhöhe in Pixeln. */
    height: integer("height"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /** Nur eine Maschine darf `shared_default = true` haben. */
    uniqueIndex("machine_shared_default_unique")
      .on(table.id)
      .where(sql`${table.sharedDefault} = true`),
    index("machine_owner_idx").on(table.owner),
    index("machine_status_idx").on(table.status),
  ]
);

// ---------------------------------------------------------------------------
// 7. agent_machine
// ---------------------------------------------------------------------------

/**
 * Zuordnung Agent → Maschine.
 *
 * Im `shared`-Modus zeigt jeder Agent auf dieselbe Maschine (machine.shared_default).
 * Im `per_agent`-Modus hat jeder Agent einen eigenen Eintrag.
 *
 * Kein FK auf `agents` (text, weil Maschinen auch nach Agentenlöschung erhalten bleiben).
 */
export const agentMachine = pgTable(
  "agent_machine",
  {
    agentId: text("agent_id").notNull(),
    machineId: text("machine_id").notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.machineId] }),
    index("agent_machine_agent_idx").on(table.agentId),
    index("agent_machine_machine_idx").on(table.machineId),
  ]
);

// ---------------------------------------------------------------------------
// 8. machine_settings
// ---------------------------------------------------------------------------

/**
 * Deployment-weite Maschinen-Einstellung.
 *
 * Eine Zeile pro Nutzer (owner_user_id = PK).
 * Standard `shared`: alle Agenten eines Nutzers teilen eine Maschine.
 */
export const machineSettings = pgTable("machine_settings", {
  ownerUserId: text("owner_user_id").primaryKey(),
  /** `shared` = eine Maschine für alle Agenten des Nutzers. */
  mode: machineModeEnum("mode").notNull().default("shared"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// 9. machine_install_consent
// ---------------------------------------------------------------------------

/**
 * Audit-Log für CUA-Install-Zustimmungen.
 *
 * APPEND-ONLY: kein DELETE, kein UPDATE. Nur INSERT.
 * Enthält KEINE personenbezogenen Inhaltsdaten – nur Metadaten
 * (wer hat wann zu was zugestimmt, auf welchem Weg).
 *
 * Zeilen bleiben dauerhaft erhalten (Compliance-Log).
 *
 * Feldbezeichnung `recorded_by`:
 *   - `user`  = Klick in der UI (sichtbare Opt-in-Karte).
 *   - `admin` = Administrativ eingetragen (z. B. telefonische Zustimmung,
 *               Chat-Protokoll). KEIN vorgetäuschter Klick.
 */
export const machineInstallConsent = pgTable(
  "machine_install_consent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Nutzer-Id (text, kein FK: Log bleibt auch bei Nutzerlöschung). */
    userId: text("user_id").notNull(),
    /** Umfang der Zustimmung. */
    scope: text("scope").notNull().default("cua_install"),
    /** Freitext-Quelle (z. B. `owner consent via chat 2026-10-29`). */
    source: text("source").notNull(),
    /** Wer hat den Eintrag protokolliert. */
    recordedBy: consentRecordedByEnum("recorded_by").notNull(),
    /** Zeitpunkt der Zustimmung (UTC). */
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("machine_install_consent_user_idx").on(table.userId),
    index("machine_install_consent_scope_idx").on(table.scope),
    index("machine_install_consent_recorded_at_idx").on(table.recordedAt),
  ]
);

// ---------------------------------------------------------------------------
// 10. agent_avatar
// ---------------------------------------------------------------------------

/**
 * Maskottchen-Avatar eines Agenten.
 *
 * Shapes und Colors kommen aus contracts.ts (AvatarShape, AvatarColor).
 * Werte werden hier als text gespeichert – so bleibt die Tabelle stabil,
 * wenn A01 neue Werte ergänzt, ohne eine DB-Migration zu erfordern.
 *
 * Ein Agent hat genau einen Avatar (agent_id = PK).
 *
 * Aus A01 contracts.ts: AgentAvatar.
 */
export const agentAvatar = pgTable("agent_avatar", {
  agentId: text("agent_id").primaryKey(),
  /**
   * Form des Avatars (circle, pebble, squircle, capsule, triangle,
   * hexagon, cloud, drop, diamond, star, flower, pumpkin).
   */
  shape: text("shape").notNull().default("circle"),
  /**
   * Farbe des Avatars (white, ink, brown, red, orange, amber, green,
   * turquoise, blue, violet, pink, gray, cream). Standard: orange.
   */
  color: text("color").notNull().default("orange"),
  /**
   * Gesichtsausdruck (neutral, happy, thinking, wink, wide, alert,
   * sleep, surprised). Null = Standardausdruck des Avatars.
   */
  expression: text("expression"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// 11. context_generation
// ---------------------------------------------------------------------------

/**
 * Kontextwechsel-Protokoll eines Agenten.
 *
 * Jeder Eintrag beschreibt eine Rotation des Kontextfensters (Idee I5,
 * Flag `connect.t3.contextRotation`): ab welchem Token-Stand umgeschaltet
 * wurde, und die vom Sub-Agenten erzeugte Zusammenfassung des alten Threads.
 *
 * Append-only: Zeilen werden nie gelöscht (alte Threads bleiben lesbar).
 *
 * Aus A01 contracts.ts: ConnectChatContextSwitchItem.
 */
export const contextGeneration = pgTable(
  "context_generation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: text("agent_id").notNull(),
    /** Der T3-Thread-Id dieses (jetzt abgeschlossenen) Kontextfensters. */
    threadId: text("thread_id").notNull(),
    /** Token-Zähler zum Zeitpunkt der Rotation. */
    tokensAtSwitch: integer("tokens_at_switch").notNull(),
    /**
     * Vom Sub-Agenten erzeugte Zusammenfassung des alten Threads.
     * Sichtbar und editierbar in der Connect-UI (A15).
     */
    summaryText: text("summary_text"),
    createdAt: createdAt(),
  },
  (table) => [
    index("context_generation_agent_idx").on(table.agentId),
    index("context_generation_thread_idx").on(table.threadId),
  ]
);

// ---------------------------------------------------------------------------
// Inferred Types (für die Applikationsschicht)
// ---------------------------------------------------------------------------

export type DbT3ThreadMap = typeof t3ThreadMap.$inferSelect;
export type NewDbT3ThreadMap = typeof t3ThreadMap.$inferInsert;

export type DbAgentWorkspace = typeof agentWorkspace.$inferSelect;
export type NewDbAgentWorkspace = typeof agentWorkspace.$inferInsert;

export type DbUsageLedger = typeof usageLedger.$inferSelect;
export type NewDbUsageLedger = typeof usageLedger.$inferInsert;

export type DbCompanyUsageSettings = typeof companyUsageSettings.$inferSelect;
export type NewDbCompanyUsageSettings =
  typeof companyUsageSettings.$inferInsert;

export type DbCompanyUsageRollup = typeof companyUsageRollup.$inferSelect;
export type NewDbCompanyUsageRollup = typeof companyUsageRollup.$inferInsert;

export type DbMachine = typeof machine.$inferSelect;
export type NewDbMachine = typeof machine.$inferInsert;

export type DbAgentMachine = typeof agentMachine.$inferSelect;
export type NewDbAgentMachine = typeof agentMachine.$inferInsert;

export type DbMachineSettings = typeof machineSettings.$inferSelect;
export type NewDbMachineSettings = typeof machineSettings.$inferInsert;

export type DbMachineInstallConsent =
  typeof machineInstallConsent.$inferSelect;
export type NewDbMachineInstallConsent =
  typeof machineInstallConsent.$inferInsert;

export type DbAgentAvatar = typeof agentAvatar.$inferSelect;
export type NewDbAgentAvatar = typeof agentAvatar.$inferInsert;

export type DbContextGeneration = typeof contextGeneration.$inferSelect;
export type NewDbContextGeneration = typeof contextGeneration.$inferInsert;
