import { z } from "zod";

/* ========================================================================== */
/* Core Constants & Common Types                                              */
/* ========================================================================== */

/** Default application theme is dark */
export const THEME_DEFAULT = "dark" as const;
export const ThemeDefaultSchema = z.literal("dark");
export type ThemeDefault = z.infer<typeof ThemeDefaultSchema>;

/** LLM Provider abstraction */
export const LLM_PROVIDERS = ["gemini-cli", "api", "mock"] as const;
export const LlmProviderSchema = z.enum(LLM_PROVIDERS);
export type LlmProvider = z.infer<typeof LlmProviderSchema>;

/** Simulation Engine options */
export const SIMULATION_ENGINES = ["native", "mirofish"] as const;
export const SimulationEngineSchema = z.enum(SIMULATION_ENGINES);
export type SimulationEngine = z.infer<typeof SimulationEngineSchema>;

/** Privacy level */
export const PRIVACY_LEVELS = ["private", "shareable"] as const;
export const PrivacySchema = z.enum(PRIVACY_LEVELS);
export type Privacy = z.infer<typeof PrivacySchema>;

/** Reference to a knowledge source location */
export const KnowledgeSourceRefSchema = z.object({
  sourceId: z.string(),
  section: z.string().optional(),
  chapter: z.string().optional(),
  lineStart: z.number().int().optional(),
  lineEnd: z.number().int().optional(),
  chunkId: z.string().optional(),
});
export type KnowledgeSourceRef = z.infer<typeof KnowledgeSourceRefSchema>;

/**
 * Resolves privacy level: defaults to 'private' whenever any source reference
 * points to '100m-money-models'.
 */
export function resolvePrivacy(
  sourceRefs?: (string | KnowledgeSourceRef)[]
): Privacy {
  if (!sourceRefs || sourceRefs.length === 0) return "shareable";
  const hasPrivate100m = sourceRefs.some((ref) => {
    if (typeof ref === "string") {
      return ref.toLowerCase().includes("100m-money-models") || ref.toLowerCase().includes("100m-book");
    }
    return (
      ref.sourceId?.toLowerCase().includes("100m-money-models") ||
      ref.sourceId?.toLowerCase().includes("100m-book")
    );
  });
  return hasPrivate100m ? "private" : "shareable";
}

/* ========================================================================== */
/* Lane 2: Company Apps Toggle                                                */
/* ========================================================================== */

export const CompanyAppToggleSchema = z.object({
  companyId: z.string(),
  appId: z.string(),
  enabled: z.boolean().default(true),
  sort: z.number().int().default(0),
  appName: z.string().optional(),
  appLogo: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type CompanyAppToggle = z.infer<typeof CompanyAppToggleSchema>;

/* ========================================================================== */
/* Lane 3: Spark MCP Browser Folders, Links & Notes                           */
/* ========================================================================== */

export const BrowserFolderKindSchema = z.enum(["normal", "settings"]);
export type BrowserFolderKind = z.infer<typeof BrowserFolderKindSchema>;

export const BrowserFolderSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable().optional(),
  name: z.string(),
  kind: BrowserFolderKindSchema.default("normal"),
  ownerScope: z.string().optional(),
  instructionNoteId: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type BrowserFolder = z.infer<typeof BrowserFolderSchema>;

export const FolderLinkSchema = z.object({
  id: z.string(),
  folderId: z.string(),
  url: z.string().url(),
  title: z.string(),
  noteId: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type FolderLink = z.infer<typeof FolderLinkSchema>;

export const FolderNoteSchema = z.object({
  folderId: z.string(),
  noteId: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  createdAt: z.string().optional(),
});
export type FolderNote = z.infer<typeof FolderNoteSchema>;

/* ========================================================================== */
/* Lane 4: Transcriber Agent                                                  */
/* ========================================================================== */

export const TranscriberToolExtractedSchema = z.object({
  name: z.string(),
  url: z.string().optional(),
  purpose: z.string(),
});
export type TranscriberToolExtracted = z.infer<typeof TranscriberToolExtractedSchema>;

export const TranscriberJobStatusSchema = z.enum([
  "pending",
  "transcribing",
  "extracting",
  "completed",
  "failed",
]);
export type TranscriberJobStatus = z.infer<typeof TranscriberJobStatusSchema>;

export const TranscriberJobSchema = z.object({
  id: z.string(),
  url: z.string(),
  status: TranscriberJobStatusSchema.default("pending"),
  transcript: z.string().optional(),
  toolsExtracted: z.array(TranscriberToolExtractedSchema).optional(),
  targetFolderId: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type TranscriberJob = z.infer<typeof TranscriberJobSchema>;

/* ========================================================================== */
/* Lane 5: Persona- & Gedächtnis-Engine                                       */
/* ========================================================================== */

export const AgentPersonaSchema = z.object({
  agentId: z.string(),
  pillar: z.string(),
  ownedQuestion: z.string(),
  values: z.union([z.record(z.string(), z.unknown()), z.array(z.string())]),
  riskProfile: z.string(),
  voice: z.string(),
  brainFolderId: z.string().optional(),
  sourceRefs: z.array(z.string()).optional(),
  knowledgeSources: z.array(z.string()).optional(),
  frameworkFocus: z.string().optional(),
});
export type AgentPersona = z.infer<typeof AgentPersonaSchema>;

export const AgentMemoryTypeSchema = z.enum(["episodic", "semantic"]);
export type AgentMemoryType = z.infer<typeof AgentMemoryTypeSchema>;

export const AgentMemorySchema = z.object({
  id: z.string(),
  agentId: z.string(),
  type: AgentMemoryTypeSchema,
  content: z.string(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  confidence: z.number().min(0).max(1).default(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().optional(),
});
export type AgentMemory = z.infer<typeof AgentMemorySchema>;

/* ========================================================================== */
/* Lane 6: Council / Debatten-Engine                                          */
/* ========================================================================== */

export const CouncilSessionModeSchema = z.enum(["quick", "full"]);
export type CouncilSessionMode = z.infer<typeof CouncilSessionModeSchema>;

export const CouncilSessionStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);
export type CouncilSessionStatus = z.infer<typeof CouncilSessionStatusSchema>;

export const CouncilSessionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.union([z.array(z.string()), z.array(z.record(z.string(), z.unknown()))]),
  context: z.string().optional(),
  mode: CouncilSessionModeSchema.default("full"),
  status: CouncilSessionStatusSchema.default("pending"),
  chairQuestions: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type CouncilSession = z.infer<typeof CouncilSessionSchema>;

export const CouncilSeatSchema = z.object({
  sessionId: z.string(),
  agentId: z.string(),
  role: z.string().optional(),
  weight: z.number().default(1),
});
export type CouncilSeat = z.infer<typeof CouncilSeatSchema>;

export const CouncilTurnSchema = z.object({
  id: z.string().optional(),
  sessionId: z.string(),
  round: z.number().int(),
  agentId: z.string(),
  content: z.string(),
  stance: z.string().optional(),
  citations: z.array(z.string()).optional(),
  isDevilsAdvocate: z.boolean().optional(),
  createdAt: z.string().optional(),
  timestamp: z.string().optional(),
});
export type CouncilTurn = z.infer<typeof CouncilTurnSchema>;

export const CouncilVoteSchema = z.object({
  sessionId: z.string(),
  agentId: z.string(),
  option: z.string(),
  score: z.number().min(0).max(10),
  weight: z.number().default(1),
  ruinFlag: z.boolean().default(false),
  rationale: z.string().optional(),
});
export type CouncilVote = z.infer<typeof CouncilVoteSchema>;

export const DecisionRecordSchema = z.object({
  sessionId: z.string(),
  verdict: z.string(),
  rationale: z.string(),
  dissent: z.string().optional(),
  confidence: z.number().min(0).max(1),
  recordMd: z.string(),
  createdAt: z.string().optional(),
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

/* ========================================================================== */
/* Lane 7: Simulation                                                         */
/* ========================================================================== */

export const SimulationRunStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);
export type SimulationRunStatus = z.infer<typeof SimulationRunStatusSchema>;

export const SimulationRunSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  seed: z.record(z.string(), z.unknown()).optional(),
  status: SimulationRunStatusSchema.default("pending"),
  engine: SimulationEngineSchema.default("native"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type SimulationRun = z.infer<typeof SimulationRunSchema>;

export const SimEntitySchema = z.object({
  runId: z.string(),
  id: z.string(),
  name: z.string(),
  type: z.string(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type SimEntity = z.infer<typeof SimEntitySchema>;

export const SimRelationSchema = z.object({
  runId: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.string(),
  weight: z.number().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type SimRelation = z.infer<typeof SimRelationSchema>;

export const SimTickSchema = z.object({
  runId: z.string(),
  tick: z.number().int(),
  event: z.string().optional(),
  stateSummary: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().optional(),
});
export type SimTick = z.infer<typeof SimTickSchema>;

export const SimInjectionSchema = z.object({
  runId: z.string(),
  tick: z.number().int().optional(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
});
export type SimInjection = z.infer<typeof SimInjectionSchema>;

export const SimReportSchema = z.object({
  runId: z.string(),
  summary: z.string(),
  recommendations: z.array(z.string()),
  projections: z.record(z.string(), z.unknown()).optional(),
  markdown: z.string().optional(),
  createdAt: z.string().optional(),
});
export type SimReport = z.infer<typeof SimReportSchema>;

/* ========================================================================== */
/* Lane 8: Swarm Job & Execution                                              */
/* ========================================================================== */

export const SwarmJobTypeSchema = z.enum([
  "council_turn",
  "sim_tick",
  "transcribe",
  "persona_turn",
  "generic",
]);
export type SwarmJobType = z.infer<typeof SwarmJobTypeSchema>;

export const SwarmJobStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);
export type SwarmJobStatus = z.infer<typeof SwarmJobStatusSchema>;

export const SwarmJobSchema = z.object({
  id: z.string(),
  type: SwarmJobTypeSchema,
  status: SwarmJobStatusSchema.default("pending"),
  priority: z.number().default(0),
  payload: z.record(z.string(), z.unknown()).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type SwarmJob = z.infer<typeof SwarmJobSchema>;

/* ========================================================================== */
/* Lane 10: Wissens-Brains                                                    */
/* ========================================================================== */

export const SeatBrainSchema = z.object({
  id: z.string(),
  agentId: z.string().optional(),
  name: z.string(),
  frameworks: z.array(z.string()),
  principles: z.array(z.string()),
  positions: z.array(z.string()),
  sources: z.array(KnowledgeSourceRefSchema),
  privacy: PrivacySchema.default("private"),
});
export type SeatBrain = z.infer<typeof SeatBrainSchema>;
