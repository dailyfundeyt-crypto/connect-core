/**
 * Drizzle ORM Schema fuer Browser-Profile v06 (A09).
 */

import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const browserProfilesTable = pgTable(
  "browser_profiles",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#00f2fe"),
    status: text("status").notNull().default("active"),
    userDataDir: text("user_data_dir").notNull(),
    cdpPort: integer("cdp_port").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => ({
    agentIdx: index("browser_profiles_agent_id_idx").on(table.agentId),
    statusIdx: index("browser_profiles_status_idx").on(table.status),
  }),
);

export const browserProfileGroupsTable = pgTable(
  "browser_profile_groups",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => browserProfilesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    orderIndex: integer("order_index").notNull().default(0),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    profileIdx: index("browser_profile_groups_profile_id_idx").on(table.profileId),
    parentIdx: index("browser_profile_groups_parent_id_idx").on(table.parentId),
  }),
);

export const browserProfileTabsTable = pgTable(
  "browser_profile_tabs",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => browserProfilesTable.id, { onDelete: "cascade" }),
    groupId: text("group_id").references(() => browserProfileGroupsTable.id, {
      onDelete: "set null",
    }),
    url: text("url").notNull().default("about:blank"),
    title: text("title").notNull().default("Neuer Tab"),
    cdpTargetId: text("cdp_target_id"),
    orderIndex: integer("order_index").notNull().default(0),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    profileIdx: index("browser_profile_tabs_profile_id_idx").on(table.profileId),
    groupIdx: index("browser_profile_tabs_group_id_idx").on(table.groupId),
  }),
);

export type BrowserProfileDbRow = typeof browserProfilesTable.$inferSelect;
export type BrowserProfileGroupDbRow = typeof browserProfileGroupsTable.$inferSelect;
export type BrowserProfileTabDbRow = typeof browserProfileTabsTable.$inferSelect;
