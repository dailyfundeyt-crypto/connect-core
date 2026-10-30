/**
 * T3-Bridge — T3-CLI-Selector (Lane A23).
 *
 * EIGENTÜMER: A23.
 *
 * Öffentliche API für die CLI-Auswahl in Connect (gleiche Stelle, gleicher Look).
 * Drop-in-Ersatz für den Einbau durch A38.
 */

export { T3CliSelector } from "./t3-cli-selector";
export { StatusDot } from "./status-dot";
export {
  T3_SWAP_CLI_CATALOG,
  LEGACY_CLI_CATALOG,
  type T3CliDefinition,
} from "./catalog";
export {
  resolveT3CliStatus,
  buildT3CliOption,
  STATUS_DOT_COLORS,
  STATUS_DEFAULT_LABELS,
} from "./status";
export {
  getSelectedCli,
  setSelectedCli,
  useSelectedCli,
} from "./storage";
export type {
  T3CliEngine,
  T3CliStatus,
  T3CliOption,
  T3CliSelectorProps,
} from "./types";
