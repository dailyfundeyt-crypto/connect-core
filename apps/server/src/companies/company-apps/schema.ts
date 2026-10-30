import { boolean, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Lane 2: Company App Toggles Table
 * Stores enabled state, sort order, and metadata per company and app.
 */
export const companyAppToggles = pgTable(
  "company_app_toggles",
  {
    companyId: text("company_id").notNull(),
    appId: text("app_id").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    appName: text("app_name"),
    appLogo: text("app_logo"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.appId] }),
  ]
);

export type CompanyAppToggleRow = typeof companyAppToggles.$inferSelect;
export type NewCompanyAppToggleRow = typeof companyAppToggles.$inferInsert;
