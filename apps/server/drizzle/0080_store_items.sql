-- Migration 0080: Store Items, Versions, Installs, Reviews (Lane 8)
-- Swarm-v2 Play-Store Infrastructure for MCPs, Tools/Apps, Skills, Companys

CREATE TABLE IF NOT EXISTS store_items (
  id text PRIMARY KEY,
  name text NOT NULL,
  display_name text NOT NULL,
  description text NOT NULL,
  version text NOT NULL,
  category text NOT NULL DEFAULT 'agent',
  author text NOT NULL,
  icon_url text,
  downloads_count integer NOT NULL DEFAULT 0,
  rating real NOT NULL DEFAULT 5.0,
  pricing_type text NOT NULL DEFAULT 'free',
  price text,
  badge text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  screenshots jsonb NOT NULL DEFAULT '[]'::jsonb,
  permissions_required jsonb NOT NULL DEFAULT '[]'::jsonb,
  entry_point text,
  is_verified boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS store_versions (
  id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES store_items(id) ON DELETE CASCADE,
  version text NOT NULL,
  manifest jsonb NOT NULL,
  changelog text,
  package_hash text NOT NULL,
  signature text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS store_installs (
  id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES store_items(id) ON DELETE CASCADE,
  version_id text NOT NULL,
  company_id text NOT NULL,
  installed_by text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  auto_start boolean NOT NULL DEFAULT false,
  installed_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS store_reviews (
  id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES store_items(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  user_name text NOT NULL,
  rating integer NOT NULL DEFAULT 5,
  comment text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS store_items_category_idx ON store_items (category);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS store_versions_item_id_idx ON store_versions (item_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS store_installs_company_id_idx ON store_installs (company_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS store_installs_item_company_idx ON store_installs (item_id, company_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS store_reviews_item_id_idx ON store_reviews (item_id);
