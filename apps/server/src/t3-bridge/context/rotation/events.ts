/**
 * T3-Bridge — Kontext-Rotation: Events & Chat-Trenner (Lane A15)
 *
 * EIGENTÜMER: A15 (Kontext-Rotation).
 *
 * Definiert und baut das Event `context.rotated` für den Chat, das als
 * `ConnectChatContextSwitchItem` (Trenner „Neues Kontextfenster · Zusammenfassung“, A22)
 * in den Live-Stream (A12) und in den Nachrichtenverlauf (A11) eingespeist wird.
 */

import type {
  ConnectChatContextSwitchItem,
  ConnectChatEvent,
} from "../../contracts.js";
import type { HandoffSections } from "../summarizer/types.js";
import type { ContextRotatedEvent } from "./types.js";

/**
 * Standard-Titel der Trennlinie im Chat (Vorgabe von Stefan: „Neues Kontextfenster · Zusammenfassung“).
 */
export const CONTEXT_SWITCH_BADGE_TITLE = "Neues Kontextfenster · Zusammenfassung";

/**
 * Erzeugt ein ContextRotatedEvent sowie das eingebettete ConnectChatContextSwitchItem.
 */
export function buildContextRotatedEvent(params: {
  readonly agentId: string;
  readonly previousThreadId: string;
  readonly newThreadId: string;
  readonly generation: number;
  readonly tokensAtSwitch: number;
  readonly summary: string;
  readonly sections?: HandoffSections;
  readonly createdAt?: string;
}): ContextRotatedEvent {
  const {
    agentId,
    previousThreadId,
    newThreadId,
    generation,
    tokensAtSwitch,
    summary,
    sections,
  } = params;

  const createdAt = params.createdAt ?? new Date().toISOString();
  const id = `ctx-switch-${agentId}-gen${generation}-${Date.now()}`;

  const item: ConnectChatContextSwitchItem = {
    kind: "context_switch",
    id,
    tokensAtSwitch,
    summary,
    previousThreadId,
    newThreadId,
    createdAt,
  };

  return {
    type: "context.rotated",
    agentId,
    previousThreadId,
    newThreadId,
    generation,
    tokensAtSwitch,
    summary,
    sections,
    item,
    createdAt,
  };
}

/**
 * Wandelt ein ContextRotatedEvent in ein standardkonformes ConnectChatEvent um,
 * das über den StreamHub an Abonnenten gestreamt werden kann.
 */
export function toConnectChatEvent(event: ContextRotatedEvent): ConnectChatEvent {
  return {
    type: "context_switch",
    item: event.item,
  };
}

/**
 * Formatiert einen kompakten Kopf für die Anzeige der Zusammenfassung im Chat.
 */
export function formatHandoffHeader(params: {
  readonly generation: number;
  readonly tokensAtSwitch: number;
}): string {
  const tokensFormatted = new Intl.NumberFormat("de-DE").format(params.tokensAtSwitch);
  return `### ${CONTEXT_SWITCH_BADGE_TITLE} (Generation ${params.generation})\n*Automatisch rotiert nach ${tokensFormatted} Tokens.*\n\n`;
}
