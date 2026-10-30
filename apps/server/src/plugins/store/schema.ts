/**
 * Drizzle Schema for Store (Lane 8)
 * Migration 0080: store_items, store_versions, store_installs, store_reviews.
 */

import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { jsonb } from "../../db/schema/json";

export const storeItems = pgTable(
  "store_items",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    displayName: text("display_name").notNull(),
    description: text("description").notNull(),
    version: text("version").notNull(),
    category: text("category").notNull().default("agent"),
    author: text("author").notNull(),
    iconUrl: text("icon_url"),
    downloadsCount: integer("downloads_count").notNull().default(0),
    rating: real("rating").notNull().default(5.0),
    pricingType: text("pricing_type").notNull().default("free"),
    price: text("price"),
    badge: text("badge"),
    tags: jsonb("tags").notNull().default([]),
    screenshots: jsonb("screenshots").notNull().default([]),
    permissionsRequired: jsonb("permissions_required").notNull().default([]),
    entryPoint: text("entry_point"),
    isVerified: boolean("is_verified").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    categoryIdx: index("store_items_category_idx").on(table.category),
  }),
);

export const storeVersions = pgTable(
  "store_versions",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => storeItems.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    manifest: jsonb("manifest").notNull(),
    changelog: text("changelog"),
    packageHash: text("package_hash").notNull(),
    signature: text("signature"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    itemIdIdx: index("store_versions_item_id_idx").on(table.itemId),
  }),
);

export const storeInstalls = pgTable(
  "store_installs",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => storeItems.id, { onDelete: "cascade" }),
    versionId: text("version_id").notNull(),
    companyId: text("company_id").notNull(),
    installedBy: text("installed_by").notNull(),
    permissions: jsonb("permissions").notNull().default([]),
    status: text("status").notNull().default("active"),
    autoStart: boolean("auto_start").notNull().default(false),
    installedAt: timestamp("installed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdIdx: index("store_installs_company_id_idx").on(table.companyId),
    itemCompanyIdx: index("store_installs_item_company_idx").on(
      table.itemId,
      table.companyId,
    ),
  }),
);

export const storeReviews = pgTable(
  "store_reviews",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => storeItems.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull(),
    rating: integer("rating").notNull().default(5),
    comment: text("comment").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    itemIdIdx: index("store_reviews_item_id_idx").on(table.itemId),
  }),
);
