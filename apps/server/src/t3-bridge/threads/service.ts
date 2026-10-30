/**
 * T3-Bridge — Nachrichten & Threads: Hauptservice (A11)
 *
 * ZIEL: Ein Connect-Agent = ein dauerhaftes Gespräch (T3-Thread).
 * Nachricht senden startet einen Turn über den Scheduler (A08).
 *
 * Verwaltet:
 *  - Idempotenz (zweimal dieselbe clientMessageId -> nur ein Turn)
 *  - Workspace-Sicherstellung über A07 (Agent-Arbeitsordner)
 *  - T3-Projekt & Thread-Anlage bzw. Fortsetzung in `t3_thread_map`
 *  - Starten des Turns über den A08-Scheduler mit Provider-Gleichzeitigkeit
 *  - Statusmodell: sending / waiting / running / answered / failed
 *  - Verlauf über alle Kontext-Generationen hinweg (I5)
 */

import { getT3Flag, type T3ProviderId } from "../contracts.js";
import { getGlobalScheduler, type T3Scheduler } from "../scheduler/index.js";
import { ensureAgentWorkspace, type WorkspaceOutcome } from "../workspaces/index.js";
import { assembleHistory, buildThreadSnapshot, type SnapshotRpcSource } from "./history.js";
import { IdempotencyManager } from "./idempotency.js";
import { fromConnectChatItemStatus, toConnectChatItemStatus } from "./status.js";
import { createThreadMapStore } from "./store.js";
import type {
  IThreadMapStore,
  T3MessageHistoryQuery,
  T3MessageHistoryResult,
  T3MessageRecord,
  T3MessageRequest,
  T3MessageResponse,
  T3MessageStatus,
  T3ThreadMap,
  T3ThreadSnapshot,
} from "./types.js";

/**
 * RPC-Schnittstelle, die der Service benötigt.
 * Kompatibel mit T3RpcClient aus apps/server/src/t3-bridge/rpc.
 */
export interface IT3RpcThreadClient extends SnapshotRpcSource {
  ensureProject?(input: {
    readonly projectId: string;
    readonly title: string;
    readonly workspaceRoot: string;
    readonly createWorkspaceRootIfMissing?: boolean;
  }): Promise<{ readonly projectId: string; readonly workspaceRoot: string }>;

  createThread(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly projectId: string;
    readonly title: string;
    readonly provider: T3ProviderId;
    readonly model: string;
    readonly cwd?: string | null;
  }): Promise<unknown>;

  resumeThread?(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly projectId: string;
    readonly title: string;
    readonly provider: T3ProviderId;
    readonly model: string;
    readonly cwd?: string | null;
  }): Promise<unknown>;

  startTurn(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly messageId: string;
    readonly text: string;
    readonly provider?: T3ProviderId;
    readonly model?: string;
    readonly attachments?: ReadonlyArray<unknown>;
    readonly dispatchMode?: { readonly type: "start_immediately" };
  }): Promise<unknown>;
}

export type T3ThreadServiceOptions = {
  readonly rpcClient: IT3RpcThreadClient;
  readonly scheduler?: T3Scheduler;
  readonly store?: IThreadMapStore;
  readonly idempotency?: IdempotencyManager;
  readonly ensureWorkspaceFn?: (input: { agentId: string; agentName?: string }) => Promise<WorkspaceOutcome>;
  readonly defaultProvider?: T3ProviderId;
  readonly defaultModel?: string;
  readonly bypassFlagCheckForTests?: boolean;
};

export class T3ThreadService {
  readonly #rpcClient: IT3RpcThreadClient;
  readonly #scheduler: T3Scheduler;
  readonly #store: IThreadMapStore;
  readonly #idempotency: IdempotencyManager;
  readonly #ensureWorkspaceFn: (input: { agentId: string; agentName?: string }) => Promise<WorkspaceOutcome>;
  readonly #defaultProvider: T3ProviderId;
  readonly #defaultModel: string;
  readonly #bypassFlagCheckForTests: boolean;

  // Aktive Datensätze für Live-Zustände
  readonly #activeRecords = new Map<string, T3MessageRecord>();

  constructor(options: T3ThreadServiceOptions) {
    this.#rpcClient = options.rpcClient;
    this.#scheduler = options.scheduler ?? getGlobalScheduler();
    this.#store = options.store ?? createThreadMapStore();
    this.#idempotency = options.idempotency ?? new IdempotencyManager();
    this.#ensureWorkspaceFn = options.ensureWorkspaceFn ?? ensureAgentWorkspace;
    this.#defaultProvider = options.defaultProvider ?? "codex";
    this.#defaultModel = options.defaultModel ?? "gpt-4o";
    this.#bypassFlagCheckForTests = Boolean(options.bypassFlagCheckForTests);
  }

  /**
   * Prüft, ob die T3-Brücke aktiv ist.
   */
  isBridgeEnabled(): boolean {
    if (this.#bypassFlagCheckForTests) return true;
    return getT3Flag("bridge");
  }

  /**
   * Sendet eine Nachricht an einen Agenten:
   *  1. Idempotenz-Prüfung anhand clientMessageId (kein zweiter Turn bei Doppelaufruf)
   *  2. Workspace (A07) sicherstellen
   *  3. Thread in t3_thread_map finden oder in T3 anlegen
   *  4. Turn im Scheduler (A08) einreihen und via RPC starten
   *  5. Statusmodell (sending -> waiting -> running -> answered / failed)
   */
  async sendMessage(request: T3MessageRequest): Promise<T3MessageResponse> {
    if (!this.isBridgeEnabled()) {
      return {
        threadId: "",
        turnId: null,
        generation: 0,
        status: "error",
        error: "T3-Brücke ist über Feature-Flag 'bridge' deaktiviert.",
      };
    }

    const { agentId, text, clientMessageId } = request;
    if (!clientMessageId) {
      throw new Error("clientMessageId ist ein Pflichtfeld für T3-Nachrichten.");
    }
    if (!text && (!request.attachmentIds || request.attachmentIds.length === 0)) {
      throw new Error("Nachrichtentext oder Anhänge erforderlich.");
    }

    const provider: T3ProviderId = request.provider ?? this.#defaultProvider;
    const model = request.model ?? this.#defaultModel;

    // Idempotente Ausführung absichern
    const { record } = await this.#idempotency.runOnce(clientMessageId, async () => {
      return this.#executeSendMessageTurn({
        agentId,
        text,
        clientMessageId,
        provider,
        model,
        attachmentIds: request.attachmentIds,
      });
    });

    return {
      threadId: record.threadId,
      turnId: record.turnId,
      generation: record.generation,
      status: toConnectChatItemStatus(record.status),
      error: record.error,
    };
  }

  /**
   * Interne Durchführung des Turn-Starts.
   */
  async #executeSendMessageTurn(params: {
    readonly agentId: string;
    readonly text: string;
    readonly clientMessageId: string;
    readonly provider: T3ProviderId;
    readonly model: string;
    readonly attachmentIds?: readonly string[];
  }): Promise<T3MessageRecord> {
    const { agentId, text, clientMessageId, provider, model, attachmentIds } = params;
    const now = new Date().toISOString();

    // 1. Initialer Status: sending
    let status: T3MessageStatus = "sending";

    // 2. Arbeitsordner sicherstellen (A07)
    let cwd: string | null = null;
    const wsResult = await this.#ensureWorkspaceFn({ agentId });
    if (wsResult.ok && "workspace" in wsResult && wsResult.workspace) {
      cwd = wsResult.workspace.path;
    }

    // 3. Thread in t3_thread_map finden oder anlegen
    let threadMap = await this.#store.getActiveThread(agentId);
    const projectId = `connect-agent-${agentId}`;

    if (!threadMap) {
      const threadId = `thread-${agentId}-${Date.now()}`;
      // In T3 sicherstellen & Thread erzeugen
      if (cwd && this.#rpcClient.ensureProject) {
        try {
          await this.#rpcClient.ensureProject({
            projectId,
            title: `Workspace ${agentId}`,
            workspaceRoot: cwd,
            createWorkspaceRootIfMissing: true,
          });
        } catch {
          // Falls ensureProject fehlschlägt oder optional ist
        }
      }

      await this.#rpcClient.createThread({
        commandId: `cmd-create-${threadId}`,
        threadId,
        projectId,
        title: `Gespräch mit Agent ${agentId}`,
        provider,
        model,
        cwd,
      });

      const newMapping: T3ThreadMap = {
        agentId,
        channelId: null,
        t3ThreadId: threadId,
        generation: 0,
        projectId,
        cwd,
        provider,
        model,
        createdAt: now,
        updatedAt: now,
      };

      await this.#store.saveThread(newMapping);
      threadMap = newMapping;
    }

    const t3ThreadId = threadMap.t3ThreadId;
    const generation = threadMap.generation;
    const turnId = `turn-${clientMessageId}`;

    // Datensatz für In-Flight-Tracking anlegen
    let currentRecord: T3MessageRecord = {
      id: clientMessageId,
      agentId,
      threadId: t3ThreadId,
      turnId,
      generation,
      role: "user",
      text,
      status: "waiting", // eingereiht
      attachmentIds,
      createdAt: now,
      updatedAt: now,
    };

    this.#activeRecords.set(clientMessageId, currentRecord);

    // 4. Turn über den Scheduler (A08) einreihen
    const turnPromise = this.#scheduler.enqueueTurn({
      turnId,
      agentId,
      provider,
      threadId: t3ThreadId,
      execute: async () => {
        // Status wechselt auf 'running'
        status = "running";
        currentRecord = { ...currentRecord, status: "running", updatedAt: new Date().toISOString() };
        this.#activeRecords.set(clientMessageId, currentRecord);
        await this.#idempotency.updateStatus(clientMessageId, { status: "running" });

        // T3 Turn über RPC starten
        const turnResult = await this.#rpcClient.startTurn({
          commandId: `cmd-${turnId}`,
          threadId: t3ThreadId,
          messageId: clientMessageId,
          text,
          provider,
          model,
          attachments: attachmentIds?.map((id) => ({ id, type: "attachment" })),
          dispatchMode: { type: "start_immediately" },
        });

        // Nach Start bzw. Abschluss
        status = "answered";
        currentRecord = {
          ...currentRecord,
          status: "answered",
          updatedAt: new Date().toISOString(),
          answeredAt: new Date().toISOString(),
        };
        this.#activeRecords.set(clientMessageId, currentRecord);
        await this.#idempotency.updateStatus(clientMessageId, { status: "answered" });

        return turnResult;
      },
    });

    // Fehlerüberwachung im Hintergrund
    turnPromise.catch((err) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      currentRecord = {
        ...currentRecord,
        status: "failed",
        error: errMsg,
        updatedAt: new Date().toISOString(),
      };
      this.#activeRecords.set(clientMessageId, currentRecord);
      this.#idempotency.updateStatus(clientMessageId, { status: "failed", error: errMsg });
    });

    return currentRecord;
  }

  /**
   * Holt den Gesprächsverlauf über alle Kontext-Generationen hinweg (Aufgabe 2).
   */
  async getMessageHistory(
    agentId: string,
    query?: T3MessageHistoryQuery,
  ): Promise<T3MessageHistoryResult> {
    if (!this.isBridgeEnabled()) {
      return {
        messages: [],
        items: [],
        threadId: null,
        generation: 0,
        tokens: 0,
        nextCursor: null,
        hasMore: false,
      };
    }

    const activeList = Array.from(this.#activeRecords.values()).filter(
      (r) => r.agentId === agentId,
    );

    return assembleHistory({
      agentId,
      store: this.#store,
      rpcSource: this.#rpcClient,
      query,
      activeRecords: activeList,
    });
  }

  /**
   * Holt einen Thread-Snapshot nach A01-Vertrag.
   */
  async getThreadSnapshot(agentId: string): Promise<T3ThreadSnapshot> {
    return buildThreadSnapshot({
      agentId,
      store: this.#store,
      rpcSource: this.#rpcClient,
    });
  }

  /**
   * Rotiert den Thread eines Agenten (für A15 Context-Rotation).
   */
  async rotateThread(params: {
    readonly agentId: string;
    readonly newThreadId: string;
    readonly tokensAtSwitch: number;
    readonly summaryText?: string;
  }): Promise<T3ThreadMap> {
    return this.#store.rotateThread(params);
  }

  /**
   * Liefert den aktiven Thread eines Agenten.
   */
  async getActiveThread(agentId: string): Promise<T3ThreadMap | null> {
    return this.#store.getActiveThread(agentId);
  }
}
