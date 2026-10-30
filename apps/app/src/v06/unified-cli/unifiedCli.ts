/**
 * Reine Logik für die vereinheitlichte CLI-/Chat-Sitzung (A15, Flag FLAGS_V06.cliUnifiedSession).
 * Ohne React und ohne Netzwerk, damit sie einzeln testbar ist.
 */
import type { CliProviderId, CliSessionRef } from "@/contracts/v06/cli";
import { API_PATHS_V06 } from "@/contracts/v06/api-paths";
import { FLAGS_V06 } from "@/contracts/v06/flags";

export const CLI_PROVIDER_IDS: readonly CliProviderId[] = [
  "antigravity",
  "codex",
  "claude",
  "gemini",
  "freebuff",
];

export const CLI_PROVIDER_LABELS: Record<CliProviderId, string> = {
  antigravity: "Antigravity",
  codex: "Codex",
  claude: "Claude",
  gemini: "Gemini",
  freebuff: "Freebuff",
};

/** Flag-Default aus dem Contract. Der Server entscheidet über den echten Wert (403 bei aus). */
export const CLI_UNIFIED_SESSION_FLAG_DEFAULT: boolean = FLAGS_V06.cliUnifiedSession;

export function isCliProviderId(value: unknown): value is CliProviderId {
  return typeof value === "string" && (CLI_PROVIDER_IDS as readonly string[]).includes(value);
}

/** Pfad für GET /api/v06/cli/sessions/:conversationId. */
export function cliSessionPath(conversationId: string): string {
  return API_PATHS_V06.cliSession(conversationId);
}

/** Pfad für GET/POST /api/v06/cli/sessions/:conversationId/messages. */
export function cliMessagesPath(conversationId: string): string {
  return `${API_PATHS_V06.cliSession(conversationId)}/messages`;
}

export const CLI_SWITCH_PROVIDER_PATH: string = API_PATHS_V06.cliSwitchProvider;

/** Zustand des gemeinsamen Anbieter-Wählers. */
export interface ProviderSwitchState {
  /** Anbieter, der laut Server aktiv ist. Bleibt bei Fehlern unverändert. */
  committed: CliProviderId;
  /** Gewünschter Anbieter während eines laufenden Wechsels. */
  pending: CliProviderId | null;
  busy: boolean;
  error: string | null;
}

export function initialSwitchState(provider: CliProviderId): ProviderSwitchState {
  return { committed: provider, pending: null, busy: false, error: null };
}

export function beginSwitch(state: ProviderSwitchState, to: CliProviderId): ProviderSwitchState {
  if (state.busy || to === state.committed) return state;
  return { ...state, pending: to, busy: true, error: null };
}

/** Erfolg: neuer Anbieter wird übernommen. */
export function succeedSwitch(state: ProviderSwitchState, session: CliSessionRef): ProviderSwitchState {
  return { committed: session.provider, pending: null, busy: false, error: null };
}

/** Fehler: alter Wert wird wiederhergestellt, Fehlertext steht für den Toast bereit. */
export function failSwitch(state: ProviderSwitchState, message: string): ProviderSwitchState {
  return { ...state, pending: null, busy: false, error: message };
}

/** Anzeigewert: während des Wechsels der gewünschte, sonst der bestätigte. */
export function displayedProvider(state: ProviderSwitchState): CliProviderId {
  return state.pending ?? state.committed;
}

export interface SwitchProviderBody {
  conversationId: string;
  from: CliProviderId;
  to: CliProviderId;
}

/** Erwartete Antwort von POST /api/v06/cli/switch-provider. */
export type SwitchProviderResponse =
  | { ok: true; session: CliSessionRef }
  | { ok: false; error: string };

/** Liest die Antwort defensiv, damit kaputte Antworten nicht als Erfolg zählen. */
export function parseSwitchResponse(raw: unknown): SwitchProviderResponse {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Ungültige Antwort vom Server." };
  }
  const data = raw as { ok?: unknown; error?: unknown; session?: unknown };
  if (data.ok === true) {
    const session = data.session as Partial<CliSessionRef> | undefined;
    if (session && isCliProviderId(session.provider) && typeof session.conversationId === "string") {
      return { ok: true, session: session as CliSessionRef };
    }
    return { ok: false, error: "Anbieterwechsel ohne gültige Sitzung beantwortet." };
  }
  return {
    ok: false,
    error: typeof data.error === "string" && data.error ? data.error : "Anbieterwechsel fehlgeschlagen.",
  };
}

/** Erkennt die Meldung „CLI-Broker nicht gestartet" (agent-terminal-manager.ts). */
export function isBrokerNotStarted(message: string | null | undefined): boolean {
  if (!message) return false;
  return /CLI-Broker\s+nicht\s+gestartet|cli-broker-start\.ps1|CLI-Broker Verbindungsfehler/i.test(message);
}

/** Hilfe-Link für den Broker. Relativ zur Doku im Repo. */
export const CLI_BROKER_HELP_HREF = "docs/v06/reports/A06.md";

export interface UnifiedMessageLike {
  id: string;
  role: "user" | "assistant" | "system";
  source: "chat" | "cli";
  content: string;
  createdAt: string;
}

/** Markiert CLI-Nachrichten für die Chat-Ansicht (Terminal-Icon). */
export function isCliMessage(message: Pick<UnifiedMessageLike, "source">): boolean {
  return message.source === "cli";
}

/** Chat und CLI zeigen dieselbe Historie: nach Erstellungszeit sortiert, Duplikate per id entfernt. */
export function mergeConversationMessages<T extends UnifiedMessageLike>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const byId = new Map<string, T>();
  for (const message of [...current, ...incoming]) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => {
    const at = Date.parse(a.createdAt);
    const bt = Date.parse(b.createdAt);
    return (Number.isNaN(at) ? 0 : at) - (Number.isNaN(bt) ? 0 : bt);
  });
}
