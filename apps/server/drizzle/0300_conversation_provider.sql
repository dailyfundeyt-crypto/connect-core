-- Migration 0300: Unified Session Conversation Provider & Browser Profile
-- Agent: A07 (Wave 1)
-- Bereich: 0300-0309
-- Additiv und nullable: Verknüpfung von Chat-Konversationen mit CLI-Provider und Browser-Profil

-- 1. Kanäle / Channels (Primäre Entität für Bot-Konversationen)
ALTER TABLE IF EXISTS "channels" ADD COLUMN IF NOT EXISTS "provider" text;
ALTER TABLE IF EXISTS "channels" ADD COLUMN IF NOT EXISTS "browser_profile_id" text;

--> statement-breakpoint

-- 2. Chat-Threads (Lokaler / Copilot-Chatstore)
ALTER TABLE IF EXISTS "connect_chat_threads" ADD COLUMN IF NOT EXISTS "provider" text;
ALTER TABLE IF EXISTS "connect_chat_threads" ADD COLUMN IF NOT EXISTS "browser_profile_id" text;

--> statement-breakpoint

-- 3. Chat-Nachrichten: Kennzeichnung der Quelle ('chat' | 'cli')
ALTER TABLE IF EXISTS "connect_chat_messages" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'chat';

--> statement-breakpoint

-- 4. Explizite conversations-Tabelle (für v06 Unified Session)
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" text PRIMARY KEY NOT NULL,
  "agent_id" text,
  "user_id" text,
  "provider" text DEFAULT 'antigravity',
  "browser_profile_id" text,
  "title" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "conversations_agent_id_idx" ON "conversations" ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_provider_idx" ON "conversations" ("provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_browser_profile_idx" ON "conversations" ("browser_profile_id");

--> statement-breakpoint

-- 5. Unified Messages Tabelle für gemeinsame Chat- und CLI-Historie
CREATE TABLE IF NOT EXISTS "conversation_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "conversation_id" text NOT NULL,
  "seq" integer DEFAULT 0 NOT NULL,
  "role" text NOT NULL CHECK ("role" IN ('user', 'assistant', 'system')),
  "source" text DEFAULT 'chat' NOT NULL CHECK ("source" IN ('chat', 'cli')),
  "content" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "conversation_messages_conv_seq_idx" ON "conversation_messages" ("conversation_id", "seq");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_messages_created_at_idx" ON "conversation_messages" ("created_at" ASC);
