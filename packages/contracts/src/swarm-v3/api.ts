import { z } from "zod";
import {
  CompanyAppToggleSchema,
  BrowserFolderSchema,
  FolderLinkSchema,
  FolderNoteSchema,
  TranscriberJobSchema,
  AgentPersonaSchema,
  AgentMemorySchema,
  CouncilSessionSchema,
  CouncilSeatSchema,
  CouncilTurnSchema,
  CouncilVoteSchema,
  DecisionRecordSchema,
  SimulationRunSchema,
  SimEntitySchema,
  SimRelationSchema,
  SimTickSchema,
  SimInjectionSchema,
  SimReportSchema,
  SwarmJobSchema,
  SeatBrainSchema,
} from "./types";

/* ========================================================================== */
/* Canonical Swarm-v3 API Endpoints & Prefixes                                */
/* ========================================================================== */

export const SWARM_V3_API_PREFIXES = {
  companiesApps: "/api/companies/:id/apps",
  sparkFolders: "/api/spark/folders",
  agentsTemplatesTranscriber: "/api/agents/templates/transcriber",
  personas: "/api/personas",
  council: "/api/council",
  simulation: "/api/simulation",
  swarmRuns: "/api/swarm/runs",
  brains: "/api/brains",
} as const;

export type SwarmV3ApiPrefixKey = keyof typeof SWARM_V3_API_PREFIXES;

/* ========================================================================== */
/* SSE Real-Time Event Format                                                 */
/* ========================================================================== */

export const SseEventSchema = z.object({
  type: z.string(),
  sessionId: z.string(),
  round: z.number().int().optional(),
  agentId: z.string().optional(),
  payload: z.unknown(),
});
export type SseEvent = z.infer<typeof SseEventSchema>;

/* ========================================================================== */
/* Lane 2: Company Apps API DTOs                                              */
/* ========================================================================== */

export const GetCompanyAppsResponseSchema = z.object({
  success: z.boolean(),
  companyId: z.string(),
  apps: z.array(CompanyAppToggleSchema),
});
export type GetCompanyAppsResponse = z.infer<typeof GetCompanyAppsResponseSchema>;

export const UpdateCompanyAppsRequestSchema = z.object({
  apps: z.array(
    z.object({
      appId: z.string(),
      enabled: z.boolean(),
      sort: z.number().int().optional(),
    })
  ),
});
export type UpdateCompanyAppsRequest = z.infer<typeof UpdateCompanyAppsRequestSchema>;

export const UpdateCompanyAppsResponseSchema = z.object({
  success: z.boolean(),
  updatedCount: z.number().int(),
  apps: z.array(CompanyAppToggleSchema),
});
export type UpdateCompanyAppsResponse = z.infer<typeof UpdateCompanyAppsResponseSchema>;

/* ========================================================================== */
/* Lane 3: Spark Folders API DTOs                                             */
/* ========================================================================== */

export const CreateBrowserFolderRequestSchema = z.object({
  parentId: z.string().nullable().optional(),
  name: z.string().min(1),
  kind: z.enum(["normal", "settings"]).default("normal"),
  instructionNoteId: z.string().nullable().optional(),
});
export type CreateBrowserFolderRequest = z.infer<typeof CreateBrowserFolderRequestSchema>;

export const BrowserFolderResponseSchema = z.object({
  success: z.boolean(),
  folder: BrowserFolderSchema,
});
export type BrowserFolderResponse = z.infer<typeof BrowserFolderResponseSchema>;

export const ListBrowserFoldersResponseSchema = z.object({
  success: z.boolean(),
  folders: z.array(BrowserFolderSchema),
});
export type ListBrowserFoldersResponse = z.infer<typeof ListBrowserFoldersResponseSchema>;

export const CreateFolderLinkRequestSchema = z.object({
  folderId: z.string(),
  url: z.string().url(),
  title: z.string(),
  noteId: z.string().nullable().optional(),
});
export type CreateFolderLinkRequest = z.infer<typeof CreateFolderLinkRequestSchema>;

export const FolderLinkResponseSchema = z.object({
  success: z.boolean(),
  link: FolderLinkSchema,
});
export type FolderLinkResponse = z.infer<typeof FolderLinkResponseSchema>;

export const CreateFolderNoteRequestSchema = z.object({
  folderId: z.string(),
  noteId: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
});
export type CreateFolderNoteRequest = z.infer<typeof CreateFolderNoteRequestSchema>;

export const FolderNoteResponseSchema = z.object({
  success: z.boolean(),
  note: FolderNoteSchema,
});
export type FolderNoteResponse = z.infer<typeof FolderNoteResponseSchema>;

/* ========================================================================== */
/* Lane 4: Transcriber API DTOs                                               */
/* ========================================================================== */

export const CreateTranscriberJobRequestSchema = z.object({
  url: z.string().url(),
  targetFolderId: z.string().optional(),
  dryRun: z.boolean().default(false),
});
export type CreateTranscriberJobRequest = z.infer<typeof CreateTranscriberJobRequestSchema>;

export const TranscriberJobResponseSchema = z.object({
  success: z.boolean(),
  job: TranscriberJobSchema,
});
export type TranscriberJobResponse = z.infer<typeof TranscriberJobResponseSchema>;

export const ListTranscriberJobsResponseSchema = z.object({
  success: z.boolean(),
  jobs: z.array(TranscriberJobSchema),
});
export type ListTranscriberJobsResponse = z.infer<typeof ListTranscriberJobsResponseSchema>;

/* ========================================================================== */
/* Lane 5: Personas & Memory API DTOs                                         */
/* ========================================================================== */

export const CreatePersonaRequestSchema = AgentPersonaSchema;
export type CreatePersonaRequest = z.infer<typeof CreatePersonaRequestSchema>;

export const PersonaResponseSchema = z.object({
  success: z.boolean(),
  persona: AgentPersonaSchema,
});
export type PersonaResponse = z.infer<typeof PersonaResponseSchema>;

export const ListPersonasResponseSchema = z.object({
  success: z.boolean(),
  personas: z.array(AgentPersonaSchema),
});
export type ListPersonasResponse = z.infer<typeof ListPersonasResponseSchema>;

export const CreateMemoryRequestSchema = z.object({
  agentId: z.string(),
  type: z.enum(["episodic", "semantic"]),
  content: z.string().min(1),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  confidence: z.number().min(0).max(1).default(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateMemoryRequest = z.infer<typeof CreateMemoryRequestSchema>;

export const MemoryResponseSchema = z.object({
  success: z.boolean(),
  memory: AgentMemorySchema,
});
export type MemoryResponse = z.infer<typeof MemoryResponseSchema>;

export const ListMemoriesResponseSchema = z.object({
  success: z.boolean(),
  memories: z.array(AgentMemorySchema),
});
export type ListMemoriesResponse = z.infer<typeof ListMemoriesResponseSchema>;

/* ========================================================================== */
/* Lane 6: Council API DTOs                                                   */
/* ========================================================================== */

export const CreateCouncilSessionRequestSchema = z.object({
  question: z.string().min(1),
  options: z.union([z.array(z.string()), z.array(z.record(z.string(), z.unknown()))]),
  context: z.string().optional(),
  mode: z.enum(["quick", "full"]).default("full"),
  seatAgentIds: z.array(z.string()).optional(),
});
export type CreateCouncilSessionRequest = z.infer<typeof CreateCouncilSessionRequestSchema>;

export const CouncilSessionResponseSchema = z.object({
  success: z.boolean(),
  session: CouncilSessionSchema,
  seats: z.array(CouncilSeatSchema).optional(),
});
export type CouncilSessionResponse = z.infer<typeof CouncilSessionResponseSchema>;

export const SubmitCouncilTurnRequestSchema = z.object({
  sessionId: z.string(),
  round: z.number().int(),
  agentId: z.string(),
  content: z.string(),
  stance: z.string().optional(),
});
export type SubmitCouncilTurnRequest = z.infer<typeof SubmitCouncilTurnRequestSchema>;

export const CouncilTurnResponseSchema = z.object({
  success: z.boolean(),
  turn: CouncilTurnSchema,
});
export type CouncilTurnResponse = z.infer<typeof CouncilTurnResponseSchema>;

export const SubmitCouncilVoteRequestSchema = z.object({
  sessionId: z.string(),
  agentId: z.string(),
  option: z.string(),
  score: z.number().min(0).max(10),
  weight: z.number().default(1),
  ruinFlag: z.boolean().default(false),
  rationale: z.string().optional(),
});
export type SubmitCouncilVoteRequest = z.infer<typeof SubmitCouncilVoteRequestSchema>;

export const CouncilVoteResponseSchema = z.object({
  success: z.boolean(),
  vote: CouncilVoteSchema,
});
export type CouncilVoteResponse = z.infer<typeof CouncilVoteResponseSchema>;

export const CouncilDecisionResponseSchema = z.object({
  success: z.boolean(),
  decision: DecisionRecordSchema,
});
export type CouncilDecisionResponse = z.infer<typeof CouncilDecisionResponseSchema>;

/* ========================================================================== */
/* Lane 7: Simulation API DTOs                                                */
/* ========================================================================== */

export const StartSimulationRequestSchema = z.object({
  name: z.string().optional(),
  seed: z.record(z.string(), z.unknown()).optional(),
  engine: z.enum(["native", "mirofish"]).default("native"),
  planDocIds: z.array(z.string()).optional(),
});
export type StartSimulationRequest = z.infer<typeof StartSimulationRequestSchema>;

export const SimulationRunResponseSchema = z.object({
  success: z.boolean(),
  run: SimulationRunSchema,
});
export type SimulationRunResponse = z.infer<typeof SimulationRunResponseSchema>;

export const InjectSimEventRequestSchema = z.object({
  runId: z.string(),
  tick: z.number().int().optional(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
});
export type InjectSimEventRequest = z.infer<typeof InjectSimEventRequestSchema>;

export const SimulationReportResponseSchema = z.object({
  success: z.boolean(),
  report: SimReportSchema,
});
export type SimulationReportResponse = z.infer<typeof SimulationReportResponseSchema>;

/* ========================================================================== */
/* Lane 8: Swarm Runs API DTOs                                                */
/* ========================================================================== */

export const CreateSwarmRunRequestSchema = z.object({
  name: z.string().optional(),
  jobType: z.enum(["council_turn", "sim_tick", "transcribe", "persona_turn", "generic"]),
  payload: z.record(z.string(), z.unknown()).optional(),
  provider: z.enum(["gemini-cli", "api", "mock"]).default("gemini-cli"),
});
export type CreateSwarmRunRequest = z.infer<typeof CreateSwarmRunRequestSchema>;

export const SwarmRunResponseSchema = z.object({
  success: z.boolean(),
  runId: z.string(),
  job: SwarmJobSchema,
});
export type SwarmRunResponse = z.infer<typeof SwarmRunResponseSchema>;

export const SwarmJobResponseSchema = z.object({
  success: z.boolean(),
  job: SwarmJobSchema,
});
export type SwarmJobResponse = z.infer<typeof SwarmJobResponseSchema>;

/* ========================================================================== */
/* Lane 10: Brains API DTOs                                                   */
/* ========================================================================== */

export const CreateSeatBrainRequestSchema = SeatBrainSchema;
export type CreateSeatBrainRequest = z.infer<typeof CreateSeatBrainRequestSchema>;

export const SeatBrainResponseSchema = z.object({
  success: z.boolean(),
  brain: SeatBrainSchema,
});
export type SeatBrainResponse = z.infer<typeof SeatBrainResponseSchema>;

export const ListSeatBrainsResponseSchema = z.object({
  success: z.boolean(),
  brains: z.array(SeatBrainSchema),
});
export type ListSeatBrainsResponse = z.infer<typeof ListSeatBrainsResponseSchema>;
