/**
 * T3-Bridge — Kontext-Rotation alle 100 000 Tokens (Lane A15): Typdefinitionen
 *
 * EIGENTÜMER: A15 (Kontext-Rotation).
 * Liest Verträge aus apps/server/src/t3-bridge/contracts.ts (A01).
 *
 * Zweck: Idee I5 — Immer im selben Gespräch bleiben, aber bei 100 000 Tokens
 * (bzw. agentspezifischer Schwelle) automatisch ein frisches Kontextfenster starten.
 *
 * Regeln:
 *  - Schwelle standardmäßig 100 000 Tokens, pro Agent über ContextPolicy konfigurierbar.
 *  - Rotation erfolgt NUR nach Turn-Ende, NIE mitten im laufenden Turn.
 *  - Summarizer (A16) komprimiert den bisherigen Verlauf in feste 7 Pflichtabschnitte.
 *  - Abbruch/Fehler des Summarizers verhindert den Wechsel; der alte Thread läuft weiter.
 *  - t3_thread_map.generation steigt um 1, context_generation protokolliert den Wechsel.
 *  - Event `context.rotated` wird an den Chat gestreamt (A22).
 *  - Alter Thread bleibt dauerhaft erhalten und lesbar.
 */

import type {
  ConnectChatContextSwitchItem,
  ConnectChatEvent,
  ConnectChatItem,
  ConnectChatTurnEndItem,
  ConnectChatUsage,
  ContextPolicy,
  T3ProviderId,
  T3ThreadMap,
  T3ThreadSnapshot,
} from "../../contracts.js";
import type {
  HandoffSections,
  SummarizerInput,
  SummarizerResult,
} from "../summarizer/types.js";
import type { ContextGenerationRecord, IThreadMapStore } from "../../threads/types.js";

export type {
  ConnectChatContextSwitchItem,
  ConnectChatEvent,
  ConnectChatItem,
  ConnectChatTurnEndItem,
  ConnectChatUsage,
  ContextGenerationRecord,
  ContextPolicy,
  HandoffSections,
  IThreadMapStore,
  SummarizerInput,
  SummarizerResult,
  T3ProviderId,
  T3ThreadMap,
  T3ThreadSnapshot,
};

/* ---------------------------------------------------------------------------------------- *
 * Token-Zähler & Zustände
 * ---------------------------------------------------------------------------------------- */

/**
 * Zustand des Token-Zählers für einen Thread in seiner aktuellen Generation.
 */
export interface ThreadTokenState {
  readonly agentId: string;
  readonly threadId: string;
  readonly generation: number;
  /** Kumulierte Tokens im aktuellen Kontextfenster. */
  readonly tokens: number;
  /** Anzahl der abgeschlossenen Turns in dieser Generation. */
  readonly turnCount: number;
  /** ID des letzten Turns, der Tokens beigetragen hat. */
  readonly lastTurnId?: string | null;
  /** Gibt an, ob während eines aktiven Turns die Schwelle erreicht wurde. */
  readonly pendingRotation: boolean;
  /** Zeitstempel der letzten Aktualisierung (ISO-8601). */
  readonly lastUpdatedAt: string;
}

/**
 * Eingabe-Formate für Nutzungsdaten eines Turns.
 */
export type TurnUsageInput =
  | ConnectChatUsage
  | number
  | {
      readonly uncachedInputTokens?: number;
      readonly cachedInputTokens?: number;
      readonly cacheCreationTokens?: number;
      readonly outputTokens?: number;
      readonly reasoningTokens?: number;
      readonly totalTokens?: number;
      readonly tokens?: number;
    };

/* ---------------------------------------------------------------------------------------- *
 * Entscheidungen & Ergebnisse
 * ---------------------------------------------------------------------------------------- */

/**
 * Bewertung, ob ein Thread rotiert werden muss.
 */
export type RotationDecision = {
  readonly shouldRotate: boolean;
  readonly currentTokens: number;
  readonly thresholdTokens: number;
  readonly isTurnActive: boolean;
  readonly reason:
    | "threshold_reached"
    | "threshold_not_reached"
    | "turn_in_progress"
    | "flag_disabled"
    | "no_active_thread";
};

/**
 * Das Ereignis, das bei erfolgreicher Kontext-Rotation erzeugt und an den Chat gesendet wird.
 */
export interface ContextRotatedEvent {
  readonly type: "context.rotated";
  readonly agentId: string;
  readonly previousThreadId: string;
  readonly newThreadId: string;
  readonly generation: number;
  readonly tokensAtSwitch: number;
  readonly summary: string;
  readonly sections?: HandoffSections;
  readonly item: ConnectChatContextSwitchItem;
  readonly createdAt: string;
}

/**
 * Ausführliches Ergebnis eines Rotationsversuchs.
 */
export type RotationResult =
  | {
      readonly success: true;
      readonly rotated: true;
      readonly agentId: string;
      readonly previousThreadId: string;
      readonly newThreadId: string;
      readonly generation: number;
      readonly tokensAtSwitch: number;
      readonly summary: string;
      readonly sections?: HandoffSections;
      readonly event: ContextRotatedEvent;
      readonly chatEvent: ConnectChatEvent;
    }
  | {
      readonly success: true;
      readonly rotated: false;
      readonly agentId: string;
      readonly currentThreadId: string | null;
      readonly generation: number;
      readonly currentTokens: number;
      readonly thresholdTokens: number;
      readonly reason:
        | "threshold_not_reached"
        | "turn_in_progress"
        | "flag_disabled"
        | "no_active_thread";
    }
  | {
      readonly success: false;
      readonly rotated: false;
      readonly agentId: string;
      readonly currentThreadId: string;
      readonly generation: number;
      readonly currentTokens: number;
      readonly error: string;
      readonly warning: string;
    };

/* ---------------------------------------------------------------------------------------- *
 * Schnittstellen (Abhängigkeiten & Mocks)
 * ---------------------------------------------------------------------------------------- */

/**
 * RPC-Schnittstelle zur Interaktion mit dem T3-Sidecar (A03 / T3RpcClient).
 */
export interface IRpcRotationClient {
  createThread(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly projectId: string;
    readonly title: string;
    readonly provider: T3ProviderId;
    readonly model: string;
    readonly cwd?: string | null;
    readonly interactionMode?: string;
  }): Promise<unknown>;

  startTurn?(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly messageId: string;
    readonly text: string;
    readonly provider?: T3ProviderId;
    readonly model?: string;
    readonly dispatchMode?: { readonly type: "start_immediately" };
  }): Promise<unknown>;

  getThreadSnapshot?(input: {
    readonly threadId: string;
  }): Promise<unknown>;
}

/**
 * Schnittstelle zum Aufruf des Komprimierungs-Sub-Agenten (A16).
 */
export interface ISummarizerService {
  summarize(input: SummarizerInput): Promise<SummarizerResult>;
}

/**
 * Event-Publisher zur Übermittlung an den SSE-Stream (A12) und Chat (A22).
 */
export interface IEventPublisher {
  publish(agentId: string, event: ConnectChatEvent): void;
  emitRotatedEvent?(event: ContextRotatedEvent): void;
}

/**
 * Schnittstelle zur Ermittlung und Anpassung der ContextPolicy je Agent.
 */
export interface IContextPolicyResolver {
  getPolicy(agentId: string): Promise<ContextPolicy> | ContextPolicy;
  setPolicy(agentId: string, policy: Partial<ContextPolicy>): void;
}

/**
 * Konfigurationsoptionen für den ContextRotationManager.
 */
export interface ContextRotationManagerOptions {
  readonly store?: IThreadMapStore;
  readonly rpcClient?: IRpcRotationClient;
  readonly summarizer?: ISummarizerService;
  readonly eventPublisher?: IEventPublisher;
  readonly policyResolver?: IContextPolicyResolver;
  readonly bypassFlagCheckForTests?: boolean;
  readonly defaultThresholdTokens?: number;
  readonly onRotationWarning?: (warning: string, details?: unknown) => void;
  readonly onRotated?: (event: ContextRotatedEvent) => void;
}
