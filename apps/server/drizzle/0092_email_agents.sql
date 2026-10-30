-- Lane 10 Migration 0092: External Email Agents & Message History
CREATE TABLE IF NOT EXISTS email_agents (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  email text NOT NULL,
  company_id text NOT NULL,
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  auto_send_allowed boolean NOT NULL DEFAULT false,
  daily_limit integer NOT NULL DEFAULT 50,
  sent_today integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'paused', 'draft')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS email_agents_company_idx ON email_agents (company_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS email_agents_email_idx ON email_agents (email);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS email_agent_messages (
  id text PRIMARY KEY,
  email_agent_id text NOT NULL REFERENCES email_agents(id) ON DELETE CASCADE,
  sender_email text NOT NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'received', 'rejected')),
  thread_id text,
  task_id text,
  approved_by text,
  approved_at timestamptz,
  sent_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS email_agent_messages_agent_idx ON email_agent_messages (email_agent_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS email_agent_messages_thread_idx ON email_agent_messages (thread_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS email_agent_messages_task_idx ON email_agent_messages (task_id);
