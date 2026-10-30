/**
 * T3-Bridge — Turn-Steuerung & Freigaben: Zentraler Service (Lane A13).
 *
 * Verantwortlich für:
 *  1. Turn-Steuerung: `interrupt`, `steer` (aktiv oder Warteschlange)
 *  2. Freigaben: `respondToRuntimeRequest` mit exakter Wire-Übersetzung
 *  3. Richtlinie je Agent (Stefan 29.10.):
 *     "Agent arbeitet frei im eigenen Arbeitsordner ohne Rückfrage;
 *      für alles außerhalb erscheint eine Freigabe-Karte."
 */

import { randomUUID } from "node:crypto";
import {
  getT3Flag,
  toT3ApprovalDecisionWire,
  type ConnectChatApprovalItem,
  type T3ApprovalDecision,
  type T3ApprovalResponse,
  type T3Capabilities,
  type T3ControlResponse,
  type T3ProviderId,
} from "../contracts.js";
import { getGlobalScheduler, type T3Scheduler } from "../scheduler/index.js";
import {
  getGlobalThreadService,
  type T3ThreadService,
} from "../threads/index.js";
import { getAgentWorkspaceManager } from "../workspaces/index.js";
import {
  getProviderControlCapabilities,
  toT3Capabilities,
} from "./capabilities.js";
import {
  AgentApprovalPolicyEngine,
  DEFAULT_APPROVAL_OPTIONS,
} from "./policy.js";
import {
  MemoryApprovalStore,
  toConnectChatApprovalItem,
  type IApprovalStore,
} from "./store.js";
import type {
  ApprovalEvaluationResult,
  IAgentWorkspaceResolver,
  IT3RpcControlClient,
  IT3SchedulerControl,
  IT3ThreadControlService,
  PendingApprovalRecord,
  ProviderControlCapabilities,
} from "./types.js";

export type T3ControlServiceOptions = {
  readonly rpcClient?: IT3RpcControlClient;
  readonly threadService?: IT3ThreadControlService;
  readonly scheduler?: IT3SchedulerControl;
  readonly workspaceResolver?:
    | IAgentWorkspaceResolver
    | ((agentId: string) => Promise<string | null>);
  readonly policyEngine?: AgentApprovalPolicyEngine;
  readonly store?: IApprovalStore;
  /** Standard true: prüft `connect.t3.bridge` Flag. Nur für gezielte Tests abschaltbar. */
  readonly enforceBridgeFlag?: boolean;
};

export class T3ControlService {
  readonly #rpcClient?: IT3RpcControlClient;
  readonly #threadService?: IT3ThreadControlService;
  readonly #scheduler?: IT3SchedulerControl;
  readonly #workspaceResolver?:
    | IAgentWorkspaceResolver
    | ((agentId: string) => Promise<string | null>);
  readonly #policyEngine: AgentApprovalPolicyEngine;
  readonly #store: IApprovalStore;
  readonly #enforceBridgeFlag: boolean;

  constructor(options: T3ControlServiceOptions = {}) {
    this.#rpcClient = options.rpcClient;
    this.#threadService = options.threadService;
    this.#scheduler = options.scheduler;
    this.#workspaceResolver = options.workspaceResolver;
    this.#policyEngine = options.policyEngine ?? new AgentApprovalPolicyEngine();
    this.#store = options.store ?? new MemoryApprovalStore();
    this.#enforceBridgeFlag = options.enforceBridgeFlag ?? true;
  }

  /**
   * True, wenn das Feature-Flag `bridge` aktiv ist (oder EnforceFlag deaktiviert ist).
   */
  isBridgeEnabled(): boolean {
    if (!this.#enforceBridgeFlag) return true;
    return getT3Flag("bridge");
  }

  /* -------------------------------------------------------------------------------------- *
   * 1. Turn-Steuerung: Interrupt & Steer
   * -------------------------------------------------------------------------------------- */

  /**
   * Bricht den laufenden Turn eines Agenten ab (`POST .../interrupt`).
   *
   * Ablauf:
   *  1. Prüft Feature-Flag `bridge`.
   *  2. Ermittelt aktiven Thread und Provider des Agenten.
   *  3. Prüft Provider-Fähigkeit `canInterrupt`.
   *  4. Bricht anstehende Turns in der Scheduler-Queue ab.
   *  5. Sendet `rpcClient.interruptTurn(...)` an den Sidecar.
   */
  async interrupt(
    agentId: string,
    reason: string = "Vom Nutzer unterbrochen",
  ): Promise<T3ControlResponse> {
    if (!this.isBridgeEnabled()) {
      return {
        ok: false,
        supported: false,
        reason: "T3-Brücke ist über Feature-Flag 'bridge' deaktiviert.",
      };
    }

    if (!agentId || !agentId.trim()) {
      return {
        ok: false,
        supported: false,
        reason: "agentId fehlt.",
      };
    }

    // 1. Thread-Informationen abrufen
    const threadInfo = await this.#getAgentThreadInfo(agentId);
    const provider = threadInfo?.provider ?? "unknown";
    const caps = getProviderControlCapabilities(provider);

    // 2. Provider-Fähigkeit prüfen
    if (!caps.canInterrupt) {
      return {
        ok: false,
        supported: false,
        reason: `Provider '${provider}' unterstützt keinen Abbruch (interrupt).`,
      };
    }

    // 3. Scheduler-Queue für diesen Agenten bereinigen (A08)
    const scheduler = this.#getScheduler();
    if (scheduler && typeof scheduler.cancelTurnsForAgent === "function") {
      scheduler.cancelTurnsForAgent(agentId, reason);
    }

    // 4. Laufenden Turn über RPC abbrechen (A03)
    const rpc = this.#getRpcClient();
    if (rpc && threadInfo?.t3ThreadId) {
      const activeRunId = threadInfo.activeRunId || `run-${agentId}`;
      try {
        await rpc.interruptTurn({
          commandId: randomUUID(),
          threadId: threadInfo.t3ThreadId,
          runId: activeRunId,
          reason,
        });
      } catch (err) {
        // Falls der RPC-Aufruf scheitert (z. B. Run war schon beendet)
        const msg = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          supported: true,
          reason: `Fehler beim Senden des Abbruchs: ${msg}`,
        };
      }
    }

    return {
      ok: true,
      supported: true,
    };
  }

  /**
   * Steuert den laufenden Turn nach (`POST .../steer`).
   *
   * Stefan / Masterplan Vorgabe:
   *  "POST …/steer (nur wenn Provider es kann, sonst Warteschlange)."
   *
   * Ablauf:
   *  1. Prüft Feature-Flag `bridge`.
   *  2. Ermittelt Provider des Agenten.
   *  3. Wenn `canSteer === true`:
   *     Aktives Steeren im Turn (`rpcClient.steerTurn(...)`).
   *  4. Wenn `canSteer === false`:
   *     Einreihung in die Warteschlange (`threadService.sendMessage` bzw. Scheduler).
   */
  async steer(
    agentId: string,
    text: string,
  ): Promise<T3ControlResponse & { queued?: boolean; mode?: "active" | "queued" }> {
    if (!this.isBridgeEnabled()) {
      return {
        ok: false,
        supported: false,
        reason: "T3-Brücke ist über Feature-Flag 'bridge' deaktiviert.",
      };
    }

    if (!agentId || !agentId.trim()) {
      return {
        ok: false,
        supported: false,
        reason: "agentId fehlt.",
      };
    }

    if (!text || !text.trim()) {
      return {
        ok: false,
        supported: false,
        reason: "Nachsteuer-Text darf nicht leer sein.",
      };
    }

    const threadInfo = await this.#getAgentThreadInfo(agentId);
    const provider = threadInfo?.provider ?? "unknown";
    const caps = getProviderControlCapabilities(provider);

    // Fall A: Provider unterstützt aktives Steeren im Turn (z. B. Codex, Claude, OpenCode, Pi, Muse)
    if (caps.canSteer) {
      const rpc = this.#getRpcClient();
      if (rpc && threadInfo?.t3ThreadId) {
        const messageId = randomUUID();
        const targetRunId = threadInfo.activeRunId ?? undefined;
        try {
          await rpc.steerTurn({
            commandId: randomUUID(),
            threadId: threadInfo.t3ThreadId,
            messageId,
            text,
            targetRunId,
          });
          return {
            ok: true,
            supported: true,
            mode: "active",
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            ok: false,
            supported: true,
            reason: `Fehler beim aktiven Nachsteuern: ${msg}`,
          };
        }
      }
      return {
        ok: true,
        supported: true,
        mode: "active",
      };
    }

    // Fall B: Provider kann KEIN aktives Steeren (z. B. Cursor, Grok, Hermes, Antigravity, Freebuff)
    // -> Stefan-Regel: "sonst Warteschlange"
    if (caps.canQueueSteer) {
      const threadSvc = this.#getThreadService();
      if (threadSvc && typeof threadSvc.sendMessage === "function") {
        try {
          await threadSvc.sendMessage({
            agentId,
            text: `[Nachsteuerung]: ${text}`,
            clientMessageId: `steer-${randomUUID()}`,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            ok: false,
            supported: false,
            queued: false,
            reason: `Fehler beim Einreihen in die Warteschlange: ${msg}`,
          };
        }
      }
      return {
        ok: true,
        supported: false,
        queued: true,
        mode: "queued",
        reason: `Provider '${provider}' unterstützt kein aktives Steeren während des Laufs; Nachricht wurde in die Warteschlange eingereiht.`,
      };
    }

    // Fall C: Weder aktiv noch Warteschlange
    return {
      ok: false,
      supported: false,
      reason: `Provider '${provider}' unterstützt weder aktives Nachsteuern noch Warteschlange.`,
    };
  }

  /* -------------------------------------------------------------------------------------- *
   * 2. Freigaben (Approvals)
   * -------------------------------------------------------------------------------------- */

  /**
   * Beantwortet eine Runtime-Freigabe-Anfrage (`POST .../approvals/:requestId`).
   *
   * Nutzt exakt das Wire-Mapping aus `contracts.ts`:
   *  allow        -> accept
   *  allow_always -> acceptAlways
   *  deny         -> decline
   */
  async respondToApproval(params: {
    readonly agentId: string;
    readonly requestId: string;
    readonly decision: T3ApprovalDecision;
    readonly feedback?: string;
    readonly answers?: Record<string, string>;
  }): Promise<T3ApprovalResponse> {
    const { agentId, requestId, decision, feedback, answers } = params;

    if (!this.isBridgeEnabled()) {
      return {
        ok: false,
        error: "T3-Brücke ist über Feature-Flag 'bridge' deaktiviert.",
      };
    }

    if (!agentId || !requestId) {
      return {
        ok: false,
        error: "agentId und requestId sind Pflichtfelder.",
      };
    }

    if (!["allow", "deny", "allow_always"].includes(decision)) {
      return {
        ok: false,
        error: `Ungültige Entscheidung '${decision}'. Erlaubt: allow, deny, allow_always.`,
      };
    }

    // 1. Thread ermitteln
    const threadInfo = await this.#getAgentThreadInfo(agentId);
    const threadId = threadInfo?.t3ThreadId ?? `thread-${agentId}`;

    // 2. Wire-Entscheidung bilden (Regel A01 / A06)
    const wireDecision = toT3ApprovalDecisionWire(decision);

    // 3. Wenn allow_always gewählt wurde: Ziel in Session-Policy merken
    if (decision === "allow_always") {
      const existing = await this.#store.getApproval(agentId, requestId);
      const target =
        existing?.targetPath || existing?.command || existing?.prompt;
      if (target) {
        this.#policyEngine.grantSessionApproval(agentId, target);
      }
    }

    // 4. Im lokalen Store als aufgelöst markieren
    await this.#store.resolveApproval(
      agentId,
      requestId,
      decision,
      feedback,
      answers,
    );

    // 5. Über RPC an T3 Sidecar senden
    const rpc = this.#getRpcClient();
    if (rpc) {
      try {
        await rpc.respondToRuntimeRequest({
          commandId: randomUUID(),
          threadId,
          requestId,
          decision: wireDecision,
          feedback,
          answers,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          error: `Fehler bei RPC respondToRuntimeRequest: ${msg}`,
        };
      }
    }

    return { ok: true };
  }

  /**
   * Liefert alle aktuell ausstehenden Freigaben eines Agenten.
   */
  async getPendingApprovals(agentId: string): Promise<ConnectChatApprovalItem[]> {
    if (!this.isBridgeEnabled()) return [];
    const records = await this.#store.getPendingApprovals(agentId);
    return records.map(toConnectChatApprovalItem);
  }

  /**
   * Registriert eine neue Freigabe-Anfrage (z. B. aus T3-Events oder Translate-Schicht),
   * prüft sie gegen die Arbeitsordner-Richtlinie und entscheidet:
   *  - Im eigenen Arbeitsordner: Auto-Approval erlaubt
   *  - Außerhalb: Freigabe-Karte erforderlich (wird nie automatisch erteilt)
   */
  async registerAndEvaluateApproval(params: {
    readonly agentId: string;
    readonly requestId: string;
    readonly requestKind: string;
    readonly prompt: string;
    readonly title?: string;
    readonly detail?: string;
    readonly targetPath?: string;
    readonly command?: string;
    readonly cwd?: string;
  }): Promise<{
    readonly autoApproved: boolean;
    readonly item: ConnectChatApprovalItem;
    readonly evaluation: ApprovalEvaluationResult;
  }> {
    const {
      agentId,
      requestId,
      requestKind,
      prompt,
      title = requestKind,
      detail,
      targetPath,
      command,
      cwd,
    } = params;

    // 1. Arbeitsordner des Agenten ermitteln
    const workspace = await this.resolveAgentWorkspace(agentId);

    // 2. Richtlinie prüfen
    const evaluation = this.#policyEngine.evaluateRequest({
      agentId,
      agentWorkspace: workspace,
      request: {
        kind: requestKind,
        prompt,
        targetPath,
        command,
        cwd,
      },
    });

    const options = evaluation.allowed
      ? DEFAULT_APPROVAL_OPTIONS
      : evaluation.suggestedOptions;

    const record: PendingApprovalRecord = {
      id: randomUUID(),
      agentId,
      requestId,
      requestKind,
      title,
      detail,
      prompt,
      targetPath,
      command,
      cwd,
      status: evaluation.allowed ? "allowed" : "waiting",
      blocking: !evaluation.allowed,
      options,
      createdAt: new Date().toISOString(),
    };

    // 3. Fallunterscheidung Auto-Approve vs Freigabe-Karte
    if (evaluation.allowed) {
      // Liegt strikt im eigenen Arbeitsordner: sofort als allow auflösen
      await this.#store.saveApproval({
        ...record,
        status: "allowed",
        resolvedAt: new Date().toISOString(),
        resolvedDecision: "allow",
      });

      // RPC benachrichtigen (sofern rpc vorhanden)
      await this.respondToApproval({
        agentId,
        requestId,
        decision: "allow",
      }).catch(() => null);

      return {
        autoApproved: true,
        item: toConnectChatApprovalItem(record),
        evaluation,
      };
    }

    // Liegt AUSSERHALB: Freigabe-Karte bleibt offen, blocking: true
    // AKZEPTANZKRITERIUM: Freigabe außerhalb des Arbeitsordners wird nie automatisch erteilt!
    await this.#store.saveApproval(record);

    return {
      autoApproved: false,
      item: toConnectChatApprovalItem(record),
      evaluation,
    };
  }

  /* -------------------------------------------------------------------------------------- *
   * 3. Capabilities & Hilfsfunktionen
   * -------------------------------------------------------------------------------------- */

  /**
   * Liefert die Steuerungs-Fähigkeiten für einen Agenten oder eine Provider-ID.
   */
  async getCapabilities(
    agentIdOrProvider: string,
  ): Promise<
    T3Capabilities & {
      providerId: string;
      canQueueSteer: boolean;
      supportsSteeringByInterruptRestart: boolean;
      note?: string;
    }
  > {
    let providerId = agentIdOrProvider;

    // Falls eine agentId übergeben wurde, versuchen wir den aktiven Provider zu finden
    const threadInfo = await this.#getAgentThreadInfo(agentIdOrProvider).catch(
      () => null,
    );
    if (threadInfo?.provider) {
      providerId = threadInfo.provider;
    }

    const caps = getProviderControlCapabilities(providerId);
    const standardCaps = toT3Capabilities(caps);

    return {
      ...standardCaps,
      providerId: caps.providerId,
      canQueueSteer: caps.canQueueSteer,
      supportsSteeringByInterruptRestart:
        caps.supportsSteeringByInterruptRestart,
      note: caps.note,
    };
  }

  /**
   * Ermittelt den zugewiesenen Arbeitsordner eines Agenten.
   */
  async resolveAgentWorkspace(agentId: string): Promise<string | null> {
    if (typeof this.#workspaceResolver === "function") {
      return this.#workspaceResolver(agentId);
    }
    if (
      this.#workspaceResolver &&
      typeof this.#workspaceResolver.resolveWorkspace === "function"
    ) {
      return this.#workspaceResolver.resolveWorkspace(agentId);
    }

    // Fallback: A07 AgentWorkspaceManager
    const manager = getAgentWorkspaceManager();
    if (manager) {
      const ws = await manager.get(agentId).catch(() => null);
      if (ws?.path) return ws.path;
    }

    return null;
  }

  /**
   * Bereinigt gespeicherte Freigaben und Session-Rechte für einen Agenten.
   */
  async clearApprovalsForAgent(agentId: string): Promise<number> {
    this.#policyEngine.clearSessionGrants(agentId);
    return this.#store.clearApprovalsForAgent(agentId);
  }

  /* -------------------------------------------------------------------------------------- *
   * Private Abhängigkeiten-Auflösung
   * -------------------------------------------------------------------------------------- */

  async #getAgentThreadInfo(agentId: string): Promise<{
    agentId: string;
    t3ThreadId: string;
    provider: T3ProviderId;
    activeRunId?: string | null;
  } | null> {
    const threadSvc = this.#getThreadService();
    if (threadSvc && typeof threadSvc.getActiveThread === "function") {
      const active = await threadSvc.getActiveThread(agentId).catch(() => null);
      if (active) {
        return {
          agentId: active.agentId,
          t3ThreadId: active.t3ThreadId,
          provider: active.provider,
        };
      }
    }
    return null;
  }

  #getRpcClient(): IT3RpcControlClient | null {
    return this.#rpcClient ?? null;
  }

  #getThreadService(): IT3ThreadControlService | null {
    if (this.#threadService) return this.#threadService;
    try {
      return getGlobalThreadService();
    } catch {
      return null;
    }
  }

  #getScheduler(): IT3SchedulerControl | null {
    if (this.#scheduler) return this.#scheduler;
    try {
      return getGlobalScheduler();
    } catch {
      return null;
    }
  }
}
