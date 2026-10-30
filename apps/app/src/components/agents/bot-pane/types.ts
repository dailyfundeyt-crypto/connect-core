/**
 * A27 – Bot-Panel mit Computer-Tab (Grok-Bot-Stil)
 *
 * Gemeinsame Typen für das Bot-Panel.
 * Eigentümer: A27. Nur Dateien in apps/app/src/components/agents/bot-pane/** werden von dieser Lane verändert.
 */

/** Die drei Tabs des Bot-Panels, wie Grok-Bot. */
export type BotPaneTab = "details" | "bibliothek" | "computer";

/** Props, die jede Tab-Seite teilt. */
export interface BotPaneSharedProps {
  agentId: string;
  /** Anzeigename des Bots. */
  name: string;
}
