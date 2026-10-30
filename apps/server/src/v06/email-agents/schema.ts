/**
 * Drizzle ORM Schema fuer E-Mail-Agenten v06 (A19 / Migration 0420 + 0421).
 *
 * Bewusst eigene Tabellennamen mit Suffix "_v06": die Tabelle "email_agents" bzw.
 * deren sichere Erzeugung gehoert der bestehenden Lane-10-Variante
 * (apps/server/src/connect/email-agents/service.ts). Kein Konflikt, kein Umbau fremder Tabellen.
 */

import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Verzeichnis externer E-Mail-Bots (Migration 0420).
 * "description" ist Pflichtfeld (NOT NULL) - jeder Bot braucht eine Beschreibung, was er tut.
 */
export const emailAgentsV06Table = pgTable(
  "email_agents_v06",
  {
    id: text("id").primaryKey(),
    address: text("address").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    companyIds: jsonb("company_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Ausblenden statt loeschen (Regel 2: niemals loeschen). */
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    addressIdx: index("email_agents_v06_address_idx").on(table.address),
    isActiveIdx: index("email_agents_v06_is_active_idx").on(table.isActive),
  }),
);

/**
 * Ausgangs-Warteschlange (Migration 0421).
 * status: pending_approval -> approved -> sent  |  pending_approval -> rejected.
 * "sent" wird NUR nach menschlicher Freigabe gesetzt - nie automatisch.
 */
export const outboundEmailsV06Table = pgTable(
  "outbound_emails_v06",
  {
    id: text("id").primaryKey(),
    requestedByAgentId: text("requested_by_agent_id").notNull(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("pending_approval"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    rejectedReason: text("rejected_reason"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentResult: text("sent_result"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("outbound_emails_v06_status_idx").on(table.status),
    requestedByIdx: index("outbound_emails_v06_requested_by_idx").on(table.requestedByAgentId),
  }),
);

export type EmailAgentV06DbRow = typeof emailAgentsV06Table.$inferSelect;
export type OutboundEmailV06DbRow = typeof outboundEmailsV06Table.$inferSelect;
