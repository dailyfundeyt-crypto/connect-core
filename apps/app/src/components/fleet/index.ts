/**
 * Flotten-Ansicht, 40-Agenten-Anlage & Ideen-Backlog (Lane A36).
 *
 * Öffentliche Fassade dieser Lane. A39 (Frontend-Verdrahtung) hängt die
 * `<FleetView />` in die Navigation ein; die Komponente selbst ist für sich
 * benutzbar.
 */

export { FleetView } from "./fleet-view";

export {
  FleetBatchCreateDialog,
} from "./fleet-batch-create-dialog";

export {
  FleetGrid,
  FleetTable,
  cliLabel,
} from "./fleet-table";

export { FleetLoadCard } from "./fleet-load-card";

export {
  FLEET_STATUS_DOT_CLASS,
  FLEET_STATUS_LABEL,
  FLEET_STATUS_ORDER,
  FLEET_STATUS_TEXT_CLASS,
  countByStatus,
  toFleetStatus,
  type FleetStatus,
} from "./fleet-status";

export {
  formatFleetActivity,
  formatFleetCost,
  formatFleetGb,
  formatFleetPercent,
  formatFleetTokens,
  formatQueuePosition,
} from "./fleet-format";

export {
  FLEET_AVATAR_COLORS,
  FLEET_AVATAR_SHAPES,
  buildFleetPreview,
  hashFleetIdea,
  previewAvatar,
  previewWorkspaceSlug,
  type FleetAvatarColor,
  type FleetAvatarShape,
  type FleetPreviewRow,
} from "./fleet-preview";

export {
  FLEET_BASE_PATH,
  FLEET_CLI_IDS,
  FLEET_CLI_LABELS,
  batchCreateAgents,
  fetchFleetOverview,
  previewIdeas,
  type FleetAgentRow,
  type FleetBatchCreated,
  type FleetBatchFailed,
  type FleetBatchResult,
  type FleetCliId,
  type FleetIdea,
  type FleetIdeaSkip,
  type FleetLimits,
  type FleetLoad,
  type FleetOverview,
  type FleetSummary,
} from "./fleet-client";
