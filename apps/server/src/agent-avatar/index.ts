/**
 * T3-Bridge — Avatar-Speicherung & Zufalls-Standard (Lane A31).
 *
 * Öffentliche Fassade dieser Lane: der Standard-Avatar, der Service, die Speicher und die
 * Routen. A37 mountet die Routen, A36 und A30 benutzen den Service.
 */

export {
  AVATAR_EXPRESSIONS,
  type AvatarDefaults,
  type AvatarExpressionName,
  defaultAvatarFor,
  hashAgentId,
  isAvatarExpression,
  randomAvatar,
} from "./defaults";
export {
  type AvatarAgentLookup,
  type CreateAgentAvatarRoutesOptions,
  createAgentAvatarRoutes,
} from "./routes";

export {
  type AgentAvatarPatch,
  AgentAvatarService,
  type AgentAvatarServiceOptions,
  AvatarValidationError,
  createAgentAvatarService,
} from "./service";
export {
  type AgentAvatarStore,
  type AvatarRecord,
  DrizzleAgentAvatarStore,
  MemoryAgentAvatarStore,
} from "./store";
