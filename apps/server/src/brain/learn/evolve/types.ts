/**
 * Spark-Learn Evolve: Proposals & Self-Improvement Types (Lane 6)
 */

import { z } from "zod";
import {
  ProposalKindSchema,
  ProposalStatusSchema,
  ProposalSchema,
  type Proposal,
  type ProposalKind,
  type ProposalStatus,
} from "../contracts";

export {
  ProposalKindSchema,
  ProposalStatusSchema,
  ProposalSchema,
  type Proposal,
  type ProposalKind,
  type ProposalStatus,
};

/* ========================================================================== */
/* Specific Proposal Payloads                                                */
/* ========================================================================== */

export const NewNotePayloadSchema = z.object({
  path: z.string().min(1),
  title: z.string().min(1),
  content: z.string(),
  tags: z.array(z.string()).optional(),
  folder: z.string().optional(),
});
export type NewNotePayload = z.infer<typeof NewNotePayloadSchema>;

export const AddLinkPayloadSchema = z.object({
  sourcePath: z.string().min(1),
  targetNote: z.string().min(1),
  contextAnchor: z.string().optional(),
  position: z.enum(["inline", "bottom", "related_section"]).default("inline"),
  linkText: z.string().optional(),
});
export type AddLinkPayload = z.infer<typeof AddLinkPayloadSchema>;

export const MovePayloadSchema = z.object({
  sourcePath: z.string().min(1),
  destinationPath: z.string().min(1),
  keepForwardingNote: z.boolean().default(true),
});
export type MovePayload = z.infer<typeof MovePayloadSchema>;

export const MergePayloadSchema = z.object({
  sourcePath: z.string().min(1),
  targetPath: z.string().min(1),
  mergedContent: z.string().optional(),
  keepSourceAsLink: z.boolean().default(true),
});
export type MergePayload = z.infer<typeof MergePayloadSchema>;

export const TagPayloadSchema = z.object({
  path: z.string().min(1),
  tags: z.array(z.string()).min(1),
  location: z.enum(["frontmatter", "bottom"]).default("frontmatter"),
});
export type TagPayload = z.infer<typeof TagPayloadSchema>;

export const SummaryPayloadSchema = z.object({
  targetPath: z.string().min(1),
  topic: z.string().min(1),
  sourceNotes: z.array(z.string()).min(1),
  summaryContent: z.string().min(1),
});
export type SummaryPayload = z.infer<typeof SummaryPayloadSchema>;

/* ========================================================================== */
/* Gardener Jobs & Results                                                   */
/* ========================================================================== */

export const GardenerJobKindSchema = z.enum([
  "missing_links",
  "duplicates",
  "orphans",
  "folders",
  "summaries",
  "all",
]);
export type GardenerJobKind = z.infer<typeof GardenerJobKindSchema>;

export interface GardenerOptions {
  dryRun?: boolean;
  folderScope?: string;
  maxProposals?: number;
  minSimilarity?: number;
}

export interface GardenerResult {
  job: GardenerJobKind;
  timestamp: string;
  proposalsCreated: number;
  proposals: Proposal[];
  durationMs: number;
  details?: Record<string, unknown>;
}

/* ========================================================================== */
/* Self-Improvement & Feedback                                               */
/* ========================================================================== */

export interface ProposalFeedback {
  id?: string;
  proposalId: string;
  kind: ProposalKind;
  approved: boolean;
  feedbackNotes?: string;
  score?: number;
  features?: Record<string, unknown>;
  createdAt?: string;
}

export interface LearnedThresholds {
  minLinkSimilarity: number;
  minDuplicateSimilarity: number;
  autoAskHumanImpact: "low" | "medium" | "high";
  linkConfidencePenalty: number;
  tagConfidenceThreshold: number;
}

export interface KindApprovalStats {
  approved: number;
  rejected: number;
  rate: number;
}

export interface LearningStats {
  totalProposed: number;
  totalApproved: number;
  totalRejected: number;
  approvalRateByKind: Record<ProposalKind, KindApprovalStats>;
  currentThresholds: LearnedThresholds;
  lastUpdated?: string;
}

/* ========================================================================== */
/* Apply Result                                                              */
/* ========================================================================== */

export interface ApplyResult {
  success: boolean;
  proposalId: string;
  kind: ProposalKind;
  affectedFiles: string[];
  backupFiles: string[];
  commitHash?: string | null;
  error?: string;
  timestamp: string;
}
