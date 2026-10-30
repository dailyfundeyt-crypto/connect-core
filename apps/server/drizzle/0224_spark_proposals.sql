-- Migration 0224: Spark-Learn Proposal-Queue & Selbstverbesserung (Lane 6)
-- Verwaltet Vorschlaege zur Selbstverbesserung des Vaults mit menschlichem Approval.

CREATE TABLE IF NOT EXISTS "spark_proposals" (
  "id" text PRIMARY KEY NOT NULL,
  "kind" text NOT NULL CHECK ("kind" IN ('new_note', 'add_link', 'move', 'merge', 'tag', 'summary')),
  "payload" jsonb NOT NULL,
  "diff" text,
  "rationale" text NOT NULL,
  "sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL CHECK ("status" IN ('pending', 'approved', 'rejected', 'applied')),
  "rejection_reason" text,
  "applied_backup_path" text,
  "created_by" text DEFAULT 'spark_gardener' NOT NULL,
  "decided_at" timestamp with time zone,
  "applied_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "spark_proposals_status_idx" ON "spark_proposals" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spark_proposals_kind_idx" ON "spark_proposals" ("kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spark_proposals_created_at_idx" ON "spark_proposals" ("created_at" DESC);
--> statement-breakpoint

-- Self-Improvement & Feedback Tracking (Lernen aus menschlichen Approvals / Rejections)
CREATE TABLE IF NOT EXISTS "spark_proposal_feedback" (
  "id" text PRIMARY KEY NOT NULL,
  "proposal_id" text NOT NULL REFERENCES "spark_proposals"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "approved" boolean NOT NULL,
  "feedback_notes" text,
  "score" integer,
  "features" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "spark_proposal_feedback_kind_idx" ON "spark_proposal_feedback" ("kind");
--> statement-breakpoint

-- Gelerntes Wissen / Schwellenwerte der Gaertner-Engine
CREATE TABLE IF NOT EXISTS "spark_proposal_learning" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

INSERT INTO "spark_proposal_learning" ("key", "value")
VALUES 
  ('thresholds', '{"minLinkSimilarity": 0.78, "minDuplicateSimilarity": 0.88, "autoAskHumanImpact": "high"}'::jsonb),
  ('stats', '{"totalProposed": 0, "totalApproved": 0, "totalRejected": 0, "approvalRateByKind": {}}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
