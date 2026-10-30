/**
 * T3-Bridge / Translate — Öffentliches Modul-Interface (A06).
 *
 * Eigentümer: A06. Nur innerhalb von `t3-bridge/translate/` ändern.
 *
 * Alle Exporte, die A12 (Streaming) und andere Konsumenten benötigen,
 * stammen aus dieser Datei. Keine direkten Importe von Untermodulen nötig.
 */

// Kernübersetzer
export { translateEvent, translateEvents } from "./translate";
export type { T3DomainEvent } from "./translate";

// Coalescing
export { coalesceTextDelta, flushTextBuffer } from "./coalesce";

// Ausgaben-Kürzung
export { truncateCommandOutput } from "./truncate";

// Typen & Kontext
export {
  DEFAULT_TRUNCATION_OPTIONS,
  makeTranslatorContext,
} from "./types";
export type {
  CommandOutputTruncationOptions,
  TextCoalescingBuffer,
  TranslationResult,
  TranslatorContext,
} from "./types";
