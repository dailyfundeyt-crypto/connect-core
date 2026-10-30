CREATE TABLE IF NOT EXISTS "social_articles" (
  "id" text PRIMARY KEY NOT NULL,
  "author_id" text NOT NULL,
  "author_name" text NOT NULL,
  "author_avatar" text,
  "company_id" text,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "summary" text,
  "content" text NOT NULL,
  "cover_image_url" text,
  "published" boolean DEFAULT false NOT NULL,
  "published_at" timestamp with time zone,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "attached_bot_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bot_listings" (
  "id" text PRIMARY KEY NOT NULL,
  "bot_id" text NOT NULL,
  "owner_id" text NOT NULL,
  "company_id" text,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "category" text DEFAULT 'general' NOT NULL,
  "listing_type" text DEFAULT 'both' NOT NULL,
  "buy_price" numeric(10, 2),
  "price_per_month" numeric(10, 2),
  "rental_status" text DEFAULT 'available' NOT NULL,
  "capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "clean_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bot_rentals" (
  "id" text PRIMARY KEY NOT NULL,
  "listing_id" text NOT NULL REFERENCES "bot_listings"("id") ON DELETE CASCADE,
  "renter_id" text NOT NULL,
  "renter_name" text NOT NULL,
  "duration_days" integer DEFAULT 30 NOT NULL,
  "status" text DEFAULT 'angefragt' NOT NULL,
  "monthly_price" numeric(10, 2),
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bot_purchases" (
  "id" text PRIMARY KEY NOT NULL,
  "listing_id" text NOT NULL REFERENCES "bot_listings"("id") ON DELETE CASCADE,
  "buyer_id" text NOT NULL,
  "buyer_name" text NOT NULL,
  "status" text DEFAULT 'angefragt' NOT NULL,
  "price" numeric(10, 2),
  "clean_config_export" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_articles_slug_idx" ON "social_articles" ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_articles_company_idx" ON "social_articles" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_listings_bot_id_idx" ON "bot_listings" ("bot_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_listings_category_idx" ON "bot_listings" ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_rentals_listing_idx" ON "bot_rentals" ("listing_id");
