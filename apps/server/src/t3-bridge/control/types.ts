/**
 * T3-Bridge — Turn-Steuerung & Freigaben: Typdefinitionen (Lane A13).
 *
 * Verwaltet:
 *  - Turn-Steuerung: Stopp / Interrupt, Nachsteuern / Steer (aktiv oder Queue)
 *  - Provider-Fähigkeiten: Matrix je Provider (Codex, Claude, Grok, Hermes, etc.)
 *  - Freigaben / Approvals: RuntimeRequest Beantwortung mit exaktem Wire-Mapping
 *  - Richtlinie je Agent (Stefan 29.10.):
 *     "Agent arbeitet frei im eigenen Arbeitsordner ohne Rückfrage; für alles außerhalb erscheint eine Freigabe-Karte."
 */

import {
  toT3ApprovalDecisionWire,
  fromT3ApprovalDecisionWire,
  type ConnectChatApprovalItem,
  type ConnectChatItemStatus,
  type T3ApprovalDecision,
  type T3ApprovalDecisionWire,
  type T3ApprovalRequest,
  type T3ApprovalResponse,
  type T3Capabilities,
  type T3ControlAction,
  type T3ControlRequest,
  type T3ControlResponse,
  type T3ProviderId,
} from "../contracts.js";

export {
  toT3ApprovalDecisionWire,
  fromT3ApprovalDecisionWire,
  type ConnectChatApprovalItem,
  type ConnectChatItemStatus,
  type T3ApprovalDecision,
  type T3ApprovalDecisionWire,
  type T3ApprovalRequest,
  type T3ApprovalResponse,
  type T3Capabilities,
  type T3ControlAction,
  type T3ControlRequest,
  type T3ControlResponse,
  type T3ProviderId,
};

/* ---------------------------------------------------------------------------------------- *
 * Provider-Fähigkeiten für Turn-Steuerung
 * ---------------------------------------------------------------------------------------- */

/**
 * Detaillierte Steuerungsfähigkeiten eines T3-Providers.
 * Abgeleitet aus T3 `OrchestrationV2ProviderCapabilities` / den Adapter-Treibern.
 */
export type ProviderControlCapabilities = {
  readonly providerId: T3ProviderId | string;
  /** Kann ein laufender Turn abgebrochen werden? (`run.interrupt`) */
  readonly canInterrupt: boolean;
  /** Kann ein laufender Turn aktiv nachgesteuert werden? (`dispatchMode: steer_active`) */
  readonly canSteer: boolean;
  /** Kann eine Nachsteuerung als Nachricht nach dem aktiven Turn eingereiht werden? (`queue_after_active`) */
  readonly canQueueSteer: boolean;
  /** Kann durch Interrupt + Restart nachgesteuert werden? */
  readonly supportsSteeringByInterruptRestart: boolean;
  /** Kann Runtime-Requests (Freigaben/Fragen) beantworten? */
  readonly canApprove: boolean;
  /** Unterstützt Thread-Rollback? */
  readonly canRollback: boolean;
  /** Unterstützt Thread-Forking? */
  readonly canFork: boolean;
  /** Unterstützt Planungsschritte / Plan-Streams? */
  readonly canPlan: boolean;
  /** Unterstützt Sub-Agenten? */
  readonly canSubagent: boolean;
  /** Unterstützt Kontext-Transfer / Handoff? */
  readonly canContextTransfer: boolean;
  /** Grund / Anmerkung bei Einschränkungen */
  readonly note?: string;
};

/* ---------------------------------------------------------------------------------------- *
 * Richtlinie je Agent (Stefan 29.10.2026)
 * ---------------------------------------------------------------------------------------- */

/**
 * Ergebnis der Prüfung einer angeforderten Aktion gegen die Agenten-Richtlinie.
 *
 * Regel:
 *  - Liegt die Aktion/Datei strikt im eigenen Arbeitsordner des Agenten:
 *    Auto-Approve erlaubt (keine Rückfrage).
 *  - Für alles außerhalb: Freigabe-Karte erforderlich.
 *    WICHTIG: Freigabe außerhalb des Arbeitsordners wird NIE automatisch erteilt!
 */
export type ApprovalEvaluationResult =
  | {
      readonly allowed: true;
      readonly requiresUserApproval: false;
      readonly reason: string;
      readonly normalizedPath?: string;
      readonly command?: string;
    }
  | {
      readonly allowed: false;
      readonly requiresUserApproval: true;
      readonly reason: string;
      readonly violationCode:
        | "outside_workspace"
        | "protected_path"
        | "system_directory"
        | "directory_traversal"
        | "empty_path"
        | "unknown_command";
      readonly suggestedOptions: readonly {
        readonly id: string;
        readonly label: string;
        readonly decision: T3ApprovalDecision;
      }[];
      readonly normalizedPath?: string;
      readonly command?: string;
    };

/**
 * Gespeicherte Freigabe-Anfrage im Zustandsspeicher.
 */
export type PendingApprovalRecord = {
  readonly id: string;
  readonly agentId: string;
  readonly requestId: string;
  readonly threadId?: string;
  readonly runId?: string;
  readonly requestKind: string;
  readonly title: string;
  readonly detail?: string;
  readonly prompt: string;
  readonly targetPath?: string;
  readonly command?: string;
  readonly cwd?: string;
  readonly status: "waiting" | "allowed" | "denied" | "expired";
  readonly blocking: boolean;
  readonly options: readonly {
    readonly id: string;
    readonly label: string;
    readonly decision: T3ApprovalDecision;
  }[];
  readonly createdAt: string;
  readonly resolvedAt?: string;
  readonly resolvedDecision?: T3ApprovalDecision;
  readonly feedback?: string;
  readonly answers?: Record<string, string>;
};

/* ---------------------------------------------------------------------------------------- *
 * Lose Kopplungs-Schnittstellen (für Dependency Injection & Testbarkeit)
 * ---------------------------------------------------------------------------------------- */

export interface IT3RpcControlClient {
  interruptTurn(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly runId: string;
    readonly reason?: string;
  }): Promise<unknown>;

  steerTurn(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly messageId: string;
    readonly text: string;
    readonly targetRunId?: string;
  }): Promise<unknown>;

  respondToRuntimeRequest(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly requestId: string;
    readonly decision?: T3ApprovalDecisionWire;
    readonly feedback?: string;
    readonly answers?: Record<string, unknown>;
  }): Promise<unknown>;

  startTurn?(command: unknown): Promise<unknown>;
}

export interface IT3ThreadControlInfo {
  readonly agentId: string;
  readonly threadId: string;
  readonly provider: T3ProviderId;
  readonly activeRunId?: string | null;
  readonly status?: string;
}

export interface IT3ThreadControlService {
  getActiveThread(agentId: string): Promise<{
    agentId: string;
    t3ThreadId: string;
    provider: T3ProviderId;
  } | null>;
  getThreadSnapshot?(agentId: string): Promise<unknown>;
  sendMessage?(request: unknown): Promise<unknown>;
}

export interface IT3SchedulerControl {
  cancelTurnsForAgent(agentId: string, reason?: string): number;
  cancelTurn?(turnId: string, reason?: string): boolean;
}

export interface IAgentWorkspaceResolver {
  resolveWorkspace(agentId: string): Promise<string | null>;
}
