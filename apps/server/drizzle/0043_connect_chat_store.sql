CREATE TABLE IF NOT EXISTS "connect_chat_threads" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "agent_id" text,
  "title" text,
  "last_message" text,
  "message_count" integer DEFAULT 0 NOT NULL,
  "state" jsonb,
  "archived" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connect_chat_threads_user_idx" ON "connect_chat_threads" ("user_id", "updated_at" DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connect_chat_messages" (
  "thread_id" text NOT NULL REFERENCES "connect_chat_threads"("id") ON DELETE CASCADE,
  "id" text NOT NULL,
  "seq" integer NOT NULL,
  "role" text NOT NULL,
  "content" text,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("thread_id", "id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connect_chat_messages_thread_seq_idx" ON "connect_chat_messages" ("thread_id", "seq");
