CREATE TABLE IF NOT EXISTS "social_posts" (
  "id" text PRIMARY KEY NOT NULL,
  "author_id" text NOT NULL,
  "author_type" text DEFAULT 'user' NOT NULL,
  "author_name" text NOT NULL,
  "author_avatar" text,
  "company_id" text,
  "content" text NOT NULL,
  "media_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "likes_count" integer DEFAULT 0 NOT NULL,
  "comments_count" integer DEFAULT 0 NOT NULL,
  "reply_to" text REFERENCES "social_posts"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_media" (
  "id" text PRIMARY KEY NOT NULL,
  "filename" text NOT NULL,
  "original_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "url" text NOT NULL,
  "uploaded_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_likes" (
  "id" text PRIMARY KEY NOT NULL,
  "post_id" text NOT NULL REFERENCES "social_posts"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "social_likes_post_user_unique" UNIQUE ("post_id", "user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_comments" (
  "id" text PRIMARY KEY NOT NULL,
  "post_id" text NOT NULL REFERENCES "social_posts"("id") ON DELETE CASCADE,
  "author_id" text NOT NULL,
  "author_type" text DEFAULT 'user' NOT NULL,
  "author_name" text NOT NULL,
  "author_avatar" text,
  "content" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_created_at_idx" ON "social_posts" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_author_idx" ON "social_posts" ("author_id", "author_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_company_idx" ON "social_posts" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_comments_post_id_idx" ON "social_comments" ("post_id", "created_at" ASC);
