-- Migration 0223: Spark-Learn YouTube Integration (Lane 5)
-- Creates spark_yt_videos for tracking imported YouTube videos, channels, transcripts and notes

CREATE TABLE IF NOT EXISTS "spark_yt_videos" (
  "video_id" text PRIMARY KEY NOT NULL,
  "channel_id" text,
  "channel_title" text,
  "folder" text NOT NULL,
  "title" text NOT NULL,
  "url" text NOT NULL,
  "published_at" timestamp with time zone,
  "transcript_status" text DEFAULT 'missing' NOT NULL,
  "transcript_text" text,
  "transcript_segments" jsonb,
  "note_path" text,
  "watched" boolean DEFAULT false NOT NULL,
  "duration_seconds" integer,
  "raw_metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "spark_yt_videos_folder_idx" ON "spark_yt_videos" ("folder");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spark_yt_videos_channel_id_idx" ON "spark_yt_videos" ("channel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spark_yt_videos_transcript_status_idx" ON "spark_yt_videos" ("transcript_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spark_yt_videos_url_idx" ON "spark_yt_videos" ("url");
