import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { customType } from "drizzle-orm/pg-core";
import { jsonb } from "./json";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * Connect UI workspace (companies, groups, order) — shared across browsers via
 * the local Postgres that plays the Supabase data-plane role.
 */
export const connectWorkspaceKv = pgTable("connect_workspace_kv", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Uploaded logos / banners / bot avatars as durable bytes (not localStorage). */
export const connectMedia = pgTable("connect_media", {
  id: text("id").primaryKey(),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  byteLength: integer("byte_length").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
