-- Migration 0421: Outbound-E-Mails - Ausgangs-Warteschlange mit Freigabe-Workflow (A19 / Wave 2)
-- Agent-Requests erzeugen pending_approval; Stefan gibt in der UI frei;
-- erst nach Freigabe (approve) wird der Versand-Adapter angerufen. Kein automatischer Versand.
-- HINWEIS (A19): Nicht angewendet - die Anwendung macht ausschliesslich der Integrations-Agent.
-- Namenswahl "outbound_emails_v06" analog email_agents_v06 (kein Konflikt mit fremden Modulen).

CREATE TABLE IF NOT EXISTS "outbound_emails_v06" (
  "id" text PRIMARY KEY NOT NULL,
  "requested_by_agent_id" text NOT NULL,
  "to" text NOT NULL,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "status" text DEFAULT 'pending_approval' NOT NULL,
  "approved_at" timestamp with time zone,
  "approved_by" text,
  "rejected_reason" text,
  "sent_at" timestamp with time zone,
  "sent_result" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "outbound_emails_v06_status_idx" ON "outbound_emails_v06" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbound_emails_v06_requested_by_idx" ON "outbound_emails_v06" ("requested_by_agent_id");
