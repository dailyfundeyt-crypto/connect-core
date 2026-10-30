/**
 * index.ts — Öffentliche Modul-Fassade für Token-Sparen (A14)
 *
 * Alle anderen Lanes importieren ausschließlich von hier:
 *   `import { TokenSavingOptimizer, ... } from "../token-saving";`
 */

export * from "./types";
export * from "./token-estimator";
export * from "./rules/truncate-output";
export * from "./rules/deduplicate-tool-outputs";
export * from "./rules/attachment-path";
export * from "./rules/compact-system-prompt";
export * from "./rules/economy-model";
export * from "./t3-mechanisms";
export * from "./ledger-client";
export * from "./optimizer";
