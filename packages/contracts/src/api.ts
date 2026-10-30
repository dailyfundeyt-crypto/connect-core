import { z } from "zod";

/**
 * Swarm-v2 Canonical API Endpoints and Prefixes
 */
export const API_PREFIXES = {
  sidebar: "/api/sidebar",
  appAccounts: "/api/app-accounts",
  userPreferences: "/api/user/preferences",
  brainStructure: "/api/brain/structure",
  brainAgentAccess: "/api/brain/agent-access",
  socialPosts: "/api/social/posts",
  socialArticles: "/api/social/articles",
  socialListings: "/api/social/listings",
  socialCompany: "/api/social/company",
  socialMedia: "/api/social/media",
  projects: "/api/projects",
  swarmTasks: "/api/swarm/tasks",
  store: "/api/store",
  onboardingState: "/api/onboarding/state",
  mcpGrants: "/api/mcp-grants",
  emailAgents: "/api/email-agents",
} as const;

/* ========================================================================== */
/* Lane 1: App Accounts (Multi-Login)                                         */
/* ========================================================================== */

export const AppAccountSchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: z.string(),
  accountName: z.string(),
  email: z.string().optional(),
  avatarUrl: z.string().optional(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AppAccount = z.infer<typeof AppAccountSchema>;

/* ========================================================================== */
/* Lane 2 & 4: User Theme & Preferences                                       */
/* ========================================================================== */

export const ThemePrefSchema = z.object({
  theme: z.enum(["dark", "light", "system"]).default("dark"),
  accentColor: z.string().optional(),
  focusMode: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
});

export type ThemePref = z.infer<typeof ThemePrefSchema>;

/* ========================================================================== */
/* Lane 3: Brain Structure & Access                                           */
/* ========================================================================== */

export const BrainStructureNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["agent", "doc", "memory", "topic", "company", "custom"]),
  status: z.string().optional(),
  parentId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type BrainStructureNode = z.infer<typeof BrainStructureNodeSchema>;

export const BrainStructureEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
});

export type BrainStructureEdge = z.infer<typeof BrainStructureEdgeSchema>;

export const BrainStructureSchema = z.object({
  companyId: z.string(),
  nodes: z.array(BrainStructureNodeSchema),
  edges: z.array(BrainStructureEdgeSchema),
  lastUpdated: z.string(),
});

export type BrainStructure = z.infer<typeof BrainStructureSchema>;

/* ========================================================================== */
/* Lane 5: Social Posts, Articles & Listings                                  */
/* ========================================================================== */

export const SocialPostSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  authorType: z.enum(["user", "project", "company", "bot"]).default("user"),
  authorName: z.string(),
  authorAvatar: z.string().optional(),
  companyId: z.string().optional(),
  content: z.string(),
  mediaUrls: z.array(z.string()).default([]),
  likesCount: z.number().int().nonnegative().default(0),
  commentsCount: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SocialPost = z.infer<typeof SocialPostSchema>;

export const ArticleSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  title: z.string(),
  slug: z.string(),
  summary: z.string().optional(),
  content: z.string(),
  coverImageUrl: z.string().optional(),
  published: z.boolean().default(false),
  publishedAt: z.string().optional(),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Article = z.infer<typeof ArticleSchema>;

export const BotListingSchema = z.object({
  id: z.string(),
  botId: z.string(),
  ownerId: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  pricePerMonth: z.number().optional(),
  rentalStatus: z.enum(["available", "rented", "requested", "draft"]).default("available"),
  capabilities: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type BotListing = z.infer<typeof BotListingSchema>;

/* ========================================================================== */
/* Lane 6: Projects & Swarm Tasks                                             */
/* ========================================================================== */

export const ProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  companyId: z.string().optional(),
  ownerId: z.string(),
  status: z.enum(["draft", "active", "paused", "completed", "archived"]).default("active"),
  botCount: z.number().int().nonnegative().default(0),
  tasksCount: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Project = z.infer<typeof ProjectSchema>;

export const SwarmTaskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum([
    "proposed",
    "open",
    "claimed",
    "in_progress",
    "submitted",
    "approved",
    "rejected",
  ]).default("open"),
  assignedTo: z.string().optional(),
  leaseExpiresAt: z.string().optional(),
  resultUrl: z.string().optional(),
  resultSummary: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SwarmTask = z.infer<typeof SwarmTaskSchema>;

/* ========================================================================== */
/* Lane 8: Store                                                              */
/* ========================================================================== */

export const StoreItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  version: z.string(),
  category: z.enum(["agent", "skill", "mcp", "template", "plugin"]).default("agent"),
  author: z.string(),
  iconUrl: z.string().optional(),
  isInstalled: z.boolean().default(false),
  downloadsCount: z.number().int().nonnegative().default(0),
  rating: z.number().min(0).max(5).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type StoreItem = z.infer<typeof StoreItemSchema>;

/* ========================================================================== */
/* Lane 9: Onboarding State                                                   */
/* ========================================================================== */

export const OnboardingStateSchema = z.object({
  userId: z.string(),
  step: z.string(),
  completedSteps: z.array(z.string()).default([]),
  isCompleted: z.boolean().default(false),
  themePreference: z.enum(["dark", "light", "system"]).optional(),
  activeCompanyId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  updatedAt: z.string(),
});

export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

/* ========================================================================== */
/* Lane 10: MCP Grants & Email Agents                                         */
/* ========================================================================== */

export const McpGrantSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  agentName: z.string(),
  tokenHash: z.string(),
  scopes: z.array(z.string()).default([]),
  expiresAt: z.string().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type McpGrant = z.infer<typeof McpGrantSchema>;

export const EmailAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  email: z.string(),
  companyId: z.string(),
  autoSendAllowed: z.boolean().default(false),
  dailyLimit: z.number().int().positive().default(50),
  sentToday: z.number().int().nonnegative().default(0),
  status: z.enum(["active", "paused", "draft"]).default("draft"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type EmailAgent = z.infer<typeof EmailAgentSchema>;
