import { z } from "zod";
import {
  BrowserFolderSchema,
  FolderLinkSchema,
  FolderNoteSchema,
  CouncilSessionSchema,
  CouncilTurnSchema,
  CouncilVoteSchema,
  DecisionRecordSchema,
  SimulationRunSchema,
  SimReportSchema,
  AgentPersonaSchema,
} from "./types";

/* ========================================================================== */
/* Canonical Swarm-v3 MCP Tool Names                                         */
/* ========================================================================== */

export const SWARM_V3_MCP_TOOLS = {
  // Spark Browser-Folders, Links & Notes (Lane 3)
  spark: {
    folderCreate: "spark.folder_create",
    folderList: "spark.folder_list",
    folderUpdate: "spark.folder_update",
    folderDelete: "spark.folder_delete",
    linkAdd: "spark.link_add",
    linkMove: "spark.link_move",
    noteCreate: "spark.note_create",
    noteRead: "spark.note_read",
    noteAttach: "spark.note_attach",
  },
  // Council Debate & Decision Protocol (Lane 6)
  council: {
    sessionCreate: "council.session_create",
    sessionGet: "council.session_get",
    turnSubmit: "council.turn_submit",
    voteSubmit: "council.vote_submit",
    decisionGet: "council.decision_get",
  },
  // Future Simulation (Lane 7)
  simulation: {
    runStart: "simulation.run_start",
    runGet: "simulation.run_get",
    tickAdvance: "simulation.tick_advance",
    injectEvent: "simulation.inject_event",
    reportGet: "simulation.report_get",
  },
  // Persona & Individual Agent View (Lane 5)
  persona: {
    get: "persona.get",
  },
} as const;

/* ========================================================================== */
/* Canonical Swarm-v3 MCP Grant Scopes                                       */
/* ========================================================================== */

export const SWARM_V3_GRANT_SCOPES = [
  "spark:folders:write",
  "council:run",
  "simulation:run",
  "brains:private:read",
] as const;

export const SwarmV3GrantScopeSchema = z.enum(SWARM_V3_GRANT_SCOPES);
export type SwarmV3GrantScope = z.infer<typeof SwarmV3GrantScopeSchema>;

/* ========================================================================== */
/* Tool Parameter & Return Schemas                                            */
/* ========================================================================== */

// Spark Tools
export const SparkFolderCreateParamsSchema = z.object({
  parentId: z.string().nullable().optional(),
  name: z.string().min(1),
  kind: z.enum(["normal", "settings"]).default("normal"),
  instructionNoteId: z.string().nullable().optional(),
});
export type SparkFolderCreateParams = z.infer<typeof SparkFolderCreateParamsSchema>;

export const SparkLinkAddParamsSchema = z.object({
  folderId: z.string(),
  url: z.string().url(),
  title: z.string(),
  noteId: z.string().nullable().optional(),
});
export type SparkLinkAddParams = z.infer<typeof SparkLinkAddParamsSchema>;

export const SparkNoteCreateParamsSchema = z.object({
  folderId: z.string(),
  title: z.string(),
  content: z.string(),
});
export type SparkNoteCreateParams = z.infer<typeof SparkNoteCreateParamsSchema>;

// Council Tools
export const CouncilSessionCreateParamsSchema = z.object({
  question: z.string().min(1),
  options: z.union([z.array(z.string()), z.array(z.record(z.string(), z.unknown()))]),
  context: z.string().optional(),
  mode: z.enum(["quick", "full"]).default("full"),
});
export type CouncilSessionCreateParams = z.infer<typeof CouncilSessionCreateParamsSchema>;

export const CouncilTurnSubmitParamsSchema = z.object({
  sessionId: z.string(),
  round: z.number().int(),
  agentId: z.string(),
  content: z.string(),
  stance: z.string().optional(),
});
export type CouncilTurnSubmitParams = z.infer<typeof CouncilTurnSubmitParamsSchema>;

export const CouncilVoteSubmitParamsSchema = z.object({
  sessionId: z.string(),
  agentId: z.string(),
  option: z.string(),
  score: z.number().min(0).max(10),
  weight: z.number().default(1),
  ruinFlag: z.boolean().default(false),
  rationale: z.string().optional(),
});
export type CouncilVoteSubmitParams = z.infer<typeof CouncilVoteSubmitParamsSchema>;

// Simulation Tools
export const SimulationRunStartParamsSchema = z.object({
  name: z.string().optional(),
  seed: z.record(z.string(), z.unknown()).optional(),
  engine: z.enum(["native", "mirofish"]).default("native"),
  planDocIds: z.array(z.string()).optional(),
});
export type SimulationRunStartParams = z.infer<typeof SimulationRunStartParamsSchema>;

export const SimulationInjectEventParamsSchema = z.object({
  runId: z.string(),
  tick: z.number().int().optional(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
});
export type SimulationInjectEventParams = z.infer<typeof SimulationInjectEventParamsSchema>;

// Persona Tools
export const PersonaGetParamsSchema = z.object({
  agentId: z.string(),
});
export type PersonaGetParams = z.infer<typeof PersonaGetParamsSchema>;
