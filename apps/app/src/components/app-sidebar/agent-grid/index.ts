/**
 * Öffentliche Fassade des Agenten-Rasters (Lane A28).
 *
 * EIGENTÜMER: A28. Andere Lanes importieren nur von hier.
 */

export { AgentGrid, default as AgentGridDefault } from "./agent-grid";
export {
  AgentGridItem,
  type AgentGridItemData,
} from "./agent-grid-item";
export { AgentFolderRow } from "./agent-folder-row";
export { GridAvatar, shapePath } from "./grid-avatar";
export { deriveAgentAvatar, hashString } from "./derive-avatar";
export {
  STATUS_DOT_CLASS,
  STATUS_LABEL,
  toGridStatus,
  type GridAgentStatus,
} from "./status";
