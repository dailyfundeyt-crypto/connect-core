/**
 * Research Swarm & Open-Source Projects Types (Lane 6)
 *
 * Spezifikation für dezentrale Forschungsprojekte, rekursive DAG-Aufgabenbäume,
 * atomares Lease-Claiming, Peer-Review, Selbstaufträge und Bot-Spenden.
 */

import type { Project as ContractProject, SwarmTask as ContractSwarmTask } from "../contracts/api";

export type ProjectStatus = "draft" | "active" | "paused" | "completed" | "archived";

export type SwarmTaskResearchStatus =
  | "proposed"
  | "open"
  | "claimed"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected";

export type Project = ContractProject & {
  goal?: string;
  githubRepoUrl?: string;
  nonProfit: boolean;
  maxDepth: number;
  budgetTokens: number;
  usedTokens: number;
  tags?: string[];
  category?: string;
};

export type CreateProjectInput = {
  id?: string;
  title: string;
  description: string;
  goal?: string;
  companyId?: string;
  ownerId: string;
  githubRepoUrl?: string;
  nonProfit?: boolean;
  maxDepth?: number;
  budgetTokens?: number;
  tags?: string[];
  category?: string;
};

export type ResearchTask = ContractSwarmTask & {
  parentTaskId?: string | null;
  depth: number;
  priority?: "low" | "normal" | "high" | "urgent";
  acceptanceCriteria?: string[];
  reviewerId?: string | null;
  reviewComment?: string | null;
  budgetTokens?: number;
  retryCount?: number;
  maxRetries?: number;
};

export type CreateTaskInput = {
  id?: string;
  projectId: string;
  title: string;
  description: string;
  parentTaskId?: string | null;
  depth?: number;
  priority?: "low" | "normal" | "high" | "urgent";
  acceptanceCriteria?: string[];
  budgetTokens?: number;
  status?: SwarmTaskResearchStatus;
};

export type TaskClaim = {
  id: string;
  taskId: string;
  botId: string;
  ownerId?: string;
  claimedAt: string;
  leaseExpiresAt: string;
  status: "active" | "released" | "completed" | "expired";
  heartbeatAt: string;
};

export type TaskResult = {
  id: string;
  taskId: string;
  botId: string;
  resultSummary: string;
  resultUrl?: string;
  outputData?: Record<string, unknown> | null;
  status: "submitted" | "approved" | "rejected";
  reviewerId?: string;
  reviewComment?: string;
  reviewScore?: number;
  submittedAt: string;
  reviewedAt?: string;
};

export type TaskProposal = {
  projectId: string;
  parentTaskId: string;
  title: string;
  description: string;
  proposedByBotId: string;
  estimatedTokens?: number;
  acceptanceCriteria?: string[];
};

export type ProjectDonation = {
  id: string;
  projectId: string;
  donorUserId: string;
  botId: string;
  botName: string;
  budgetCredits: number;
  maxTasksPerDay: number;
  tasksCompleted: number;
  status: "active" | "paused" | "revoked";
  donatedAt: string;
  expiresAt?: string;
};

export type CreateDonationInput = {
  projectId: string;
  donorUserId: string;
  botId: string;
  botName: string;
  budgetCredits?: number;
  maxTasksPerDay?: number;
  durationDays?: number;
};

export type ProjectReport = {
  id: string;
  projectId: string;
  projectTitle: string;
  period: string;
  summary: string;
  completedTasksCount: number;
  activeBotsCount: number;
  keyFindings: string[];
  nextSteps: string[];
  publishedAt: string;
  socialPostId?: string;
};
