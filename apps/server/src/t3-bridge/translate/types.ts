/**
 * T3-Bridge / Translate — Typen (A06).
 *
 * Eigentümer: A06. Nur innerhalb von `t3-bridge/translate/` ändern.
 *
 * Schnittstellen, die der Übersetzer intern und gegenüber A12 (Streaming) verwendet.
 * Alle öffentlichen Event-Typen kommen aus `contracts.ts` (A01, nur lesen).
 */

import type {
  ConnectChatEvent,
  ConnectChatItem,
  ConnectChatItemStatus,
  ConnectChatUsage,
} from "../contracts";

// ─── Re-Export für Konsumenten, die nur die Translate-Lane importieren ───────

export type {
  ConnectChatEvent,
  ConnectChatItem,
  ConnectChatItemStatus,
  ConnectChatUsage,
};

// ─── Interne Übersetzer-Typen ─────────────────────────────────────────────────

/**
 * Zustand des Text-Coalescing-Puffers.
 * Sammelt eingehende Text-Deltas eines laufenden assistant-message-Items, bis
 * ein nicht-coalescierbares Event kommt oder der Turn endet.
 */
export interface TextCoalescingBuffer {
  /** Aktuell gepuffertes Text-Item-Id. */
  itemId: string;
  /** Gesamttext aller bisher empfangenen Deltas. */
  text: string;
}

/**
 * Einstellungen für die Ausgabe-Kürzung langer Befehlsausgaben.
 *
 * Kopf/Ende werden immer gezeigt; der Rest wird ersetzt durch
 * `"… N Zeilen ausgeblendet …"`.
 */
export interface CommandOutputTruncationOptions {
  /** Wie viele Zeilen am Anfang der Ausgabe sichtbar bleiben (Standard: 10). */
  headLines: number;
  /** Wie viele Zeilen am Ende der Ausgabe sichtbar bleiben (Standard: 10). */
  tailLines: number;
  /** Ausgaben mit weniger Zeilen als dieser Schwelle werden nie gekürzt (Standard: 25). */
  truncationThreshold: number;
}

/** Standardwerte für die Befehlsausgaben-Kürzung. */
export const DEFAULT_TRUNCATION_OPTIONS: CommandOutputTruncationOptions = {
  headLines: 10,
  tailLines: 10,
  truncationThreshold: 25,
};

/**
 * Kontext, den der Übersetzer turnübergreifend pflegt.
 * Pro Connect-Agent-Session ein Exemplar.
 */
export interface TranslatorContext {
  /** Laufender Text-Puffer. `null` = kein offener Text-Stream. */
  textBuffer: TextCoalescingBuffer | null;
  /** Zähler unbekannter Events (niemals gecrasht, stattdessen gezählt). */
  unknownEventCount: number;
  /** Typen der unbekannten Events (für den Bericht). */
  unknownEventTypes: Set<string>;
}

/** Erstellt einen leeren Übersetzer-Kontext. */
export function makeTranslatorContext(): TranslatorContext {
  return {
    textBuffer: null,
    unknownEventCount: 0,
    unknownEventTypes: new Set(),
  };
}

/**
 * Ergebnis einer einzelnen `translateEvent`-Anfrage.
 * Kann null, eins oder mehrere Connect-Events erzeugen.
 */
export type TranslationResult = readonly ConnectChatEvent[];
