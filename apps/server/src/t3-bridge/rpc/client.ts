/**
 * T3-WS-RPC — Der Client.
 *
 * Lane: A03 (Welle W1).
 *
 * Aufgabe: Connect spricht mit dem T3-Sidecar. Der Client kennt die
 * T3-Methoden und übersetzt sie in Bridge-Formate:
 *
 *  - Server-Config / Provider-Liste
 *  - Thread anlegen / fortsetzen
 *  - Turn starten / steuern / abbrechen
 *  - Runtime-Request beantworten
 *  - Thread-Snapshot
 *  - `server.getUsageSummary`
 *  - Usage-Limit-Quellen
 *
 * Der Client ist zustandsbehaftet und muss explizit `close()` gerufen werden.
 *
 * Er ist **nicht** global singleton: A04 (Provider-Registry) und A11/A12
 * (Threads/Stream) teilen sich eine Instanz, aber der Konstruktor bleibt
 * frei, damit Tests einen eigenen Client bauen können.
 */

import { getT3Flag } from "../contracts";
import type { T3ProviderId } from "../contracts";import {
  T3RpcTransport,
  type T3RpcTransportOptions,
  type T3RpcTransportStatus,
  type T3StreamSubscription,
  type T3WebSocketFactory,
} from "./transport";
import {
  T3_ORCHESTRATION_PROTOCOL_VERSION,
  T3_USAGE_CONTRACT_VERSION,
  T3_USAGE_CONTRACT_VERSION_MIN,
  T3_WS_METHODS,
  type T3EnvironmentDescriptor,
  type T3GetThreadProjectionInput,
  type T3OrchestrationCommand,
  type T3ProviderSnapshot,
  type T3RefreshProvidersInput,
  type T3Actor,
  type T3ApprovalDecision,
  type T3CreationSource,
  type T3ServerConfig,
  type T3ServerConfigEvent,
  type T3ServerProvider,
  type T3SubscribeServerConfigInput,
  type T3SubscribeShellInput,
  type T3SubscribeThreadInput,
  type T3ThreadProjection,
  type T3ThreadStreamItem,
  type T3UsageLimitSources,
  type T3UsageSummary,
  type T3UsageSummaryInput,
} from "./types";
import { normalizeProviderList } from "./guards";
import { type T3RpcAuthError, type T3RpcRemoteError } from "./errors";

/** Optionen des T3-Clients. */
export type T3RpcClientOptions = {
  /** Ursprung des T3-Servers, z. B. `http://127.0.0.1:3773`. */
  readonly origin: string;
  /** Bearer-Token für den T3-Sidecar. Bleibt serverseitig (A10). */
  readonly bearerToken?: string | null;
  /** Fertiges WebSocket-Ticket (Alternative zum Bearer-Token). */
  readonly wsTicket?: string | null;
  /** Erzeugt ein WebSocket-Ticket. */
  readonly requestWsTicket?: (origin: string, bearerToken: string) => Promise<string>;
  /** WebSocket-Fabrik (für Tests). */
  readonly webSocketFactory?: T3WebSocketFactory;
  /** Timeout für Unary-Requests (ms). */
  readonly requestTimeoutMs?: number;
  /** Timeout für das Öffnen der Verbindung (ms). */
  readonly connectTimeoutMs?: number;
  /** Reconnect-Basis (ms). */
  readonly reconnectBaseMs?: number;
  /** Reconnect-Obergrenze (ms). */
  readonly reconnectMaxMs?: number;
  /** Maximum Reconnect-Versuche (0 = unendlich). */
  readonly maxReconnectAttempts?: number;
  /** Logger. Bekommt nie Tokens. */
  readonly log?: (message: string, detail?: Record<string, unknown>) => void;
};

/** Zusammenfassung der Vertragsprüfung gegen den Sidecar. */
export type T3ContractStatus = {
  /** Orchestration-Protokoll-Version des Servers (oder null). */
  readonly orchestrationProtocolVersion: number | null;
  /** Vom Client erwartete Version. */
  readonly expectedOrchestrationProtocolVersion: number;
  /** Usage-Contract-Version des Servers (oder null). */
  readonly usageContractVersion: number | null;
  /** Passt der Sidecar zur erwarteten Contract-Version? */
  readonly contractCompatible: boolean;
  /** Abweichungen in Klartext (leer, wenn alles passt). */
  readonly mismatches: string[];
};

/**
 * Der T3-WS-RPC-Client.
 */
export class T3RpcClient {
  readonly #transport: T3RpcTransport;
  readonly #options: T3RpcClientOptions;
  #config: T3ServerConfig | null = null;
  #usageLimitSources: T3UsageLimitSources | null = null;
  #usageContractVersion: number | null = null;

  constructor(options: T3RpcClientOptions) {
    this.#options = options;
    const transportOptions: T3RpcTransportOptions & {
      readonly webSocketFactory?: T3WebSocketFactory;
    } = {
      origin: options.origin,
      bearerToken: options.bearerToken ?? null,
      wsTicket: options.wsTicket ?? null,
      requestWsTicket: options.requestWsTicket,
      requestTimeoutMs: options.requestTimeoutMs,
      connectTimeoutMs: options.connectTimeoutMs,
      reconnectBaseMs: options.reconnectBaseMs,
      reconnectMaxMs: options.reconnectMaxMs,
      maxReconnectAttempts: options.maxReconnectAttempts,
      log: options.log,
    };
    this.#transport = new T3RpcTransport({
      ...transportOptions,
      ...(options.webSocketFactory ? { webSocketFactory: options.webSocketFactory } : {}),
    });
  }

  /** Status der Verbindung. */
  get status(): T3RpcTransportStatus {
    return this.#transport.status;
  }

  /** `true`, wenn der Sidecar verbunden ist. */
  get isConnected(): boolean {
    return this.#transport.isOpen;
  }

  /**
   * Öffnet die Verbindung und liest die Server-Config.
   *
   * Ohne gesetztes Feature-Flag `connect.t3.bridge` tut die Methode nichts —
   * so bleibt Connect ohne das Flag unverändert.
   */
  async connect(): Promise<T3ServerConfig | null> {
    if (!getT3Flag("bridge")) {
      this.#options.log?.("T3-Brücke ist deaktiviert (connect.t3.bridge).");
      return null;
    }
    await this.#transport.connect();
    return this.refreshConfig();
  }

  /** Schließt die Verbindung. */
  close(): void {
    this.#transport.close();
  }

  /* ------------------------------------------------------------------------------------ *
   * Server-Config und Provider
   * ------------------------------------------------------------------------------------ */

  /** Liest `server.getConfig`. */
  async getServerConfig(): Promise<T3ServerConfig> {
    const config = await this.#transport.request(T3_WS_METHODS.serverGetConfig, {});
    if (typeof config !== "object" || config === null) {
      throw new Error("Der T3-Sidecar hat keine Server-Config geliefert.");
    }
    return config as T3ServerConfig;
  }

  /**
   * Aktualisiert die zwischengespeicherte Config und gibt sie zurück.
   */
  async refreshConfig(): Promise<T3ServerConfig> {
    this.#config = await this.getServerConfig();
    return this.#config;
  }

  /** Die zuletzt gelesene Config (ohne Netzwerkzugriff). */
  get cachedConfig(): T3ServerConfig | null {
    return this.#config;
  }

  /** `server.probe` — Heartbeat des Sidecars. */
  async probe(): Promise<void> {
    await this.#transport.request(T3_WS_METHODS.serverProbe, {});
  }

  /** Umgebungsdeskriptor des Sidecars. */
  get environment(): T3EnvironmentDescriptor | null {
    return this.#config?.environment ?? null;
  }

  /**
   * Prüft die Contract-Version des Sidecars.
   *
   * Abweichungen werden **nicht** geworfen, sondern gemeldet — die Brücke soll
   * sichtbar bleiben, auch wenn der Sidecar zu neu oder zu alt ist.
   */
  checkContract(): T3ContractStatus {
    const environment = this.environment;
    const actualProtocol = environment?.orchestrationProtocolVersion ?? null;
    const usageContractVersion = this.#usageContractVersion;
    const mismatches: string[] = [];
    if (actualProtocol !== null && actualProtocol !== expectedProtocolVersion()) {
      mismatches.push(
        `Orchestration-Protokoll: erwartet ${expectedProtocolVersion()}, Server ${actualProtocol}.`,
      );
    }
    if (
      usageContractVersion !== null &&
      (usageContractVersion < T3_USAGE_CONTRACT_VERSION_MIN ||
        usageContractVersion > T3_USAGE_CONTRACT_VERSION)
    ) {
      mismatches.push(
        `Usage-Contract: erwartet ${T3_USAGE_CONTRACT_VERSION_MIN}–${T3_USAGE_CONTRACT_VERSION}, Server ${usageContractVersion}.`,
      );
    }
    return {
      orchestrationProtocolVersion: actualProtocol,
      expectedOrchestrationProtocolVersion: expectedProtocolVersion(),
      usageContractVersion,
      contractCompatible: mismatches.length === 0,
      mismatches,
    };
  }

  /**
   * Liest die Provider-Liste.
   *
   * Verbindet sich bei Bedarf und liest danach `server.getConfig`. Das Ergebnis
   * ist auf die Bridge-Form normalisiert (`T3ProviderSnapshot`), damit A04
   * nicht das T3-Format kennen muss.
   */
  async listProviders(options: { readonly refresh?: boolean } = {}): Promise<T3ProviderSnapshot[]> {
    if (!this.#transport.isOpen) {
      await this.connect();
    }
    const config = options.refresh === true ? await this.refreshConfig() : (this.#config ?? (await this.refreshConfig()));
    return normalizeProviders(config.providers ?? []);
  }

  /**
   * `server.refreshProviders` — erzwingt eine neue Provider-Ermittlung.
   *
   * Der Client löst **nie** einen Login aus; der Server entscheidet, was das
   * für den jeweiligen Treiber bedeutet.
   */
  async refreshProviders(input: T3RefreshProvidersInput = {}): Promise<T3ProviderSnapshot[]> {
    const result = await this.#transport.request(T3_WS_METHODS.serverRefreshProviders, {
      ...input,
    });
    const providers = (result as { providers?: unknown } | null)?.providers;
    if (!Array.isArray(providers)) return [];
    const snapshots = normalizeProviders(providers as T3ServerProvider[]);
    // Die Antwort des Servers ist frischer als der Cache.
    if (this.#config) {
      this.#config = {
        ...this.#config,
        providers: providers as T3ServerProvider[],
      };
    }
    return snapshots;
  }

  /**
   * Abonniert die Server-Config (`subscribeServerConfig`).
   *
   * Der Stream liefert zuerst einen Snapshot, danach Aktualisierungen. T3
   * schickt die Limit-Quellen als eigenes Event `usageLimitSourcesUpdated`
   * (Felder: `version`, `type`, `payload.sources`) — der Client hält sie im
   * Cache, damit `getUsageLimitSources()` ohne zweiten Stream funktioniert.
   */
  subscribeServerConfig(
    input: T3SubscribeServerConfigInput,
    listeners: {
      readonly onEvent: (event: T3ServerConfigEvent) => void;
      readonly onEnd?: (error: unknown) => void;
    },
  ): T3StreamSubscription {
    return this.#transport.subscribe(
      T3_WS_METHODS.subscribeServerConfig,
      { ...input },
      {
        onValue: (value) => {
          const event = value as T3ServerConfigEvent;
          if (event && typeof event === "object") {
            if (event.type === "snapshot" && event.config) {
              this.#config = { ...event.config } as T3ServerConfig;
            }
            if (event.type === "usageLimitSourcesUpdated") {
              const payload = (event as { payload?: unknown }).payload;
              const sources =
                typeof payload === "object" && payload !== null
                  ? (payload as { sources?: unknown }).sources
                  : undefined;
              this.#usageLimitSources = { sources: Array.isArray(sources) ? sources : [] };
            }
          }
          listeners.onEvent(event);
        },
        ...(listeners.onEnd ? { onEnd: (error) => listeners.onEnd?.(error) } : {}),
      },
    );
  }

  /* ------------------------------------------------------------------------------------ *
   * Projekte (Voraussetzung für Threads)
   * ------------------------------------------------------------------------------------ */

  /**
   * Legt bei Bedarf ein T3-Projekt an (oder liefert dessen Workspace-Root).
   *
   * Ein Thread braucht ein existierendes `projectId` — T3 lehnt sonst
   * `message.dispatch` mit „Project not found." ab. Die Projekt-Verwaltung
   * läuft bei T3 über HTTP (`POST /api/projects/mutate`), nicht über die
   * WS-RPC. Der Client bietet sie deshalb hier an, damit A11/A12 nicht
   * selbst HTTP sprechen müssen.
   *
   * @param workspaceRoot Absoluter Pfad zum Arbeitsordner des Agenten.
   */
  async ensureProject(input: {
    readonly projectId: string;
    readonly title: string;
    readonly workspaceRoot: string;
    readonly createWorkspaceRootIfMissing?: boolean;
  }): Promise<{ readonly projectId: string; readonly workspaceRoot: string }> {
    const token = this.#options.bearerToken;
    if (!token) {
      throw {
        _tag: "T3RpcAuthError",
        message:
          "Für die Projekt-Anlage wird ein Bearer-Token für den T3-Sidecar gebraucht.",
        status: null,
      } satisfies T3RpcAuthError;
    }
    const response = await fetch(new URL("/api/projects/mutate", this.#options.origin), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "project.create",
        commandId: `cmd-project-${input.projectId}`,
        projectId: input.projectId,
        title: input.title,
        workspaceRoot: input.workspaceRoot,
        ...(input.createWorkspaceRootIfMissing === undefined
          ? {}
          : { createWorkspaceRootIfMissing: input.createWorkspaceRootIfMissing }),
      }),
    });
    if (!response.ok) {
      throw {
        _tag: "T3RpcRemoteError",
        message: `Der T3-Sidecar hat das Projekt "${input.projectId}" nicht angelegt (HTTP ${response.status}).`,
        method: "projects.mutate",
        error: await response.text(),
        remoteTag: null,
      } satisfies T3RpcRemoteError;
    }
    return { projectId: input.projectId, workspaceRoot: input.workspaceRoot };
  }

  /* ------------------------------------------------------------------------------------ *
   * Threads und Turns
   * ------------------------------------------------------------------------------------ */

  /**
   * Erstellt einen Thread (`orchestration.dispatchCommand` mit `thread.create`).
   *
   * `createdBy`/`creationSource` setzt der Client selbst — T3 verlangt sie
   * als Pflichtfelder. Connect ist für den Nutzer da, deshalb `user`/`mcp`.
   */
  async createThread(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly projectId: string;
    readonly title: string;
    readonly provider: T3ProviderId;
    readonly model: string;
    readonly runtimeMode?: string;
    readonly interactionMode?: string;
    readonly cwd?: string | null;
    readonly branch?: string | null;
    readonly createdBy?: T3Actor;
    readonly creationSource?: T3CreationSource;
  }): Promise<unknown> {
    const payload: T3OrchestrationCommand = {
      type: "thread.create",
      commandId: command.commandId,
      threadId: command.threadId,
      projectId: command.projectId,
      title: command.title,
      modelSelection: { instanceId: command.provider, model: command.model },
      runtimeMode: command.runtimeMode ?? "full-access",
      interactionMode: command.interactionMode ?? "default",
      branch: command.branch ?? null,
      worktreePath: command.cwd ?? null,
      createdBy: command.createdBy ?? "user",
      creationSource: command.creationSource ?? "mcp",
    };
    return this.#dispatch(payload);
  }

  /**
   * Setzt einen Thread fort (legt ihn an, wenn er nicht existiert).
   *
   * T3 kennt „Thread anlegen" und „Nachricht dispatchen" getrennt. Ein
   * Fortsetzen ist deshalb: Thread anlegen (idempotent) und dann den Turn
   * starten. Der Server ignoriert `thread.create` für einen existierenden
   * Thread.
   */
  async resumeThread(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly projectId: string;
    readonly title: string;
    readonly provider: T3ProviderId;
    readonly model: string;
    readonly runtimeMode?: string;
    readonly interactionMode?: string;
    readonly cwd?: string | null;
  }): Promise<unknown> {
    return this.createThread(command);
  }

  /**
   * Startet einen Turn (`message.dispatch`).
   */
  async startTurn(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly messageId: string;
    readonly text: string;
    readonly provider?: T3ProviderId;
    readonly model?: string;
    readonly attachments?: ReadonlyArray<unknown>;
      readonly deliveryIntent?: "auto" | "steer" | "restart";
      /** Wie der Turn startet. Standard: sofort. */
      readonly dispatchMode?:
        | { readonly type: "defer_start" }
        | { readonly type: "steer_active"; readonly targetRunId: string }
        | { readonly type: "restart_active"; readonly targetRunId: string }
        | { readonly type: "queue_after_active" }
        | { readonly type: "start_immediately" };
      readonly createdBy?: T3Actor;
    readonly creationSource?: T3CreationSource;
  }): Promise<unknown> {
    const payload: T3OrchestrationCommand = {
      type: "message.dispatch",
      commandId: command.commandId,
      threadId: command.threadId,
      messageId: command.messageId,
      text: command.text,
      attachments: command.attachments ?? [],
      ...(command.provider && command.model
        ? { modelSelection: { instanceId: command.provider, model: command.model } }
        : {}),
      ...(command.deliveryIntent ? { deliveryIntent: command.deliveryIntent } : {}),
      // `dispatchMode` ist in T3 Pflicht (kein Default im Schema).
      dispatchMode: command.dispatchMode ?? { type: "start_immediately" },
      createdBy: command.createdBy ?? "user",
      creationSource: command.creationSource ?? "mcp",
    };
    return this.#dispatch(payload);
  }

  /**
   * Steuert einen laufenden Turn (`deliveryIntent: "steer"`).
   */
  async steerTurn(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly messageId: string;
    readonly text: string;
    readonly targetRunId?: string;
  }): Promise<unknown> {
    const payload: T3OrchestrationCommand = {
      type: "message.dispatch",
      commandId: command.commandId,
      threadId: command.threadId,
      messageId: command.messageId,
      text: command.text,
      attachments: [],
      deliveryIntent: "steer",
      dispatchMode:
        command.targetRunId !== undefined
          ? { type: "steer_active", targetRunId: command.targetRunId }
          : { type: "queue_after_active" },
      createdBy: "user",
      creationSource: "mcp",
    };
    return this.#dispatch(payload);
  }

  /**
   * Bricht einen Turn ab (`run.interrupt`).
   */
  async interruptTurn(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly runId: string;
    readonly reason?: string;
  }): Promise<unknown> {
    const payload: T3OrchestrationCommand = {
      type: "run.interrupt",
      commandId: command.commandId,
      threadId: command.threadId,
      runId: command.runId,
      ...(command.reason ? { reason: command.reason } : {}),
    };
    return this.#dispatch(payload);
  }

  /**
   * Beantwortet eine Runtime-Anfrage (Freigabe, Rückfrage).
   */
  async respondToRuntimeRequest(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly requestId: string;
    readonly decision?: T3ApprovalDecision;
    readonly feedback?: string;
    readonly answers?: Record<string, unknown>;
  }): Promise<unknown> {
    const payload: T3OrchestrationCommand = {
      type: "runtime-request.respond",
      commandId: command.commandId,
      threadId: command.threadId,
      requestId: command.requestId,
      ...(command.decision ? { decision: command.decision } : {}),
      ...(command.feedback ? { feedback: command.feedback } : {}),
      ...(command.answers ? { answers: command.answers } : {}),
    };
    return this.#dispatch(payload);
  }

  /** Stoppt einen Thread. */
  async stopThread(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly reason?: string;
  }): Promise<unknown> {
    const payload: T3OrchestrationCommand = {
      type: "thread.stop",
      commandId: command.commandId,
      threadId: command.threadId,
      ...(command.reason ? { reason: command.reason } : {}),
    };
    return this.#dispatch(payload);
  }

  /** Dispatcht ein Orchestrierungs-Kommando. */
  async #dispatch(command: T3OrchestrationCommand): Promise<unknown> {
    return this.#transport.request(T3_WS_METHODS.orchestrationDispatchCommand, command);
  }

  /**
   * Thread-Snapshot (`orchestration.getThreadProjection`).
   */
  async getThreadSnapshot(
    input: T3GetThreadProjectionInput,
  ): Promise<T3ThreadProjection> {
    const projection = await this.#transport.request(
      T3_WS_METHODS.orchestrationGetThreadProjection,
      { threadId: input.threadId },
    );
    return (projection ?? {}) as T3ThreadProjection;
  }

  /**
   * Live-Events eines Threads (`orchestration.subscribeThread`).
   */
  subscribeThread(
    input: T3SubscribeThreadInput,
    listeners: {
      readonly onEvent: (event: T3ThreadStreamItem) => void;
      readonly onEnd?: (error: unknown) => void;
    },
  ): T3StreamSubscription {
    return this.#transport.subscribe(
      T3_WS_METHODS.orchestrationSubscribeThread,
      { ...input },
      {
        onValue: (value) => listeners.onEvent(value as T3ThreadStreamItem),
        ...(listeners.onEnd ? { onEnd: (error) => listeners.onEnd?.(error) } : {}),
      },
    );
  }

  /**
   * Live-Events aller Threads (`orchestration.subscribeShell`).
   */
  subscribeShell(
    input: T3SubscribeShellInput,
    listeners: {
      readonly onEvent: (event: unknown) => void;
      readonly onEnd?: (error: unknown) => void;
    },
  ): T3StreamSubscription {
    return this.#transport.subscribe(
      T3_WS_METHODS.orchestrationSubscribeShell,
      { ...input },
      {
        onValue: (value) => listeners.onEvent(value),
        ...(listeners.onEnd ? { onEnd: (error) => listeners.onEnd?.(error) } : {}),
      },
    );
  }

  /* ------------------------------------------------------------------------------------ *
   * Usage
   * ------------------------------------------------------------------------------------ */

  /**
   * `server.getUsageSummary` — Nutzungsübersicht des Sidecars.
   */
  async getUsageSummary(input: T3UsageSummaryInput): Promise<T3UsageSummary> {
    const summary = (await this.#transport.request(T3_WS_METHODS.serverGetUsageSummary, {
      ...input,
    })) as T3UsageSummary;
    if (typeof summary?.contractVersion === "number") {
      this.#usageContractVersion = summary.contractVersion;
    }
    return summary ?? {};
  }

  /**
   * Liest die Usage-Limit-Quellen.
   *
   * T3 liefert die Quellen **nicht** in `server.getConfig`, sondern als
   * Stream-Event `usageLimitSourcesUpdated` von `subscribeServerConfig`
   * (Opt-in `usageLimitSources`). Der Client cached das letzte Event; ohne
   * Subscription ist das Ergebnis leer — nie geraten.
   */
  getUsageLimitSources(): T3UsageLimitSources {
    if (this.#usageLimitSources) return this.#usageLimitSources;
    // Ältere Server legen die Quellen in die Config.
    const sources = (this.#config as { usageLimitSources?: unknown } | null)?.usageLimitSources;
    if (Array.isArray(sources)) return { sources } as T3UsageLimitSources;
    return { sources: [] };
  }

  /**
   * Abonniert die Limit-Quellen (und liefert sie sofort beim ersten Event).
   *
   * Praktisch für A17: einmal abonnieren, dann den Cache lesen.
   */
  watchUsageLimitSources(
    listeners: {
      readonly onSources?: (sources: T3UsageLimitSources) => void;
      readonly onEnd?: (error: unknown) => void;
    } = {},
  ): T3StreamSubscription {
    return this.subscribeServerConfig(
      { usageLimitSources: true },
      {
        onEvent: (event) => {
          if (event?.type === "usageLimitSourcesUpdated") {
            listeners.onSources?.(this.getUsageLimitSources());
          }
        },
        ...(listeners.onEnd ? { onEnd: (error) => listeners.onEnd?.(error) } : {}),
      },
    );
  }

  /**
   * Prüft, ob der Server die Usage-Limit-Quellen anbietet.
   */
  supportsUsageLimitSources(): boolean {
    const capabilities = this.environment?.capabilities;
    return capabilities?.usageLimitSources === true;
  }
}

function expectedProtocolVersion(): number {
  return T3_ORCHESTRATION_PROTOCOL_VERSION;
}

/**
 * Normalisiert die Provider-Liste des Servers auf das Bridge-Format.
 *
 * Die eigentliche Arbeit macht `guards.ts`; diese Funktion ist der
 * kompatible Name, den A04 benutzt.
 */
export function normalizeProviders(providers: ReadonlyArray<T3ServerProvider>): T3ProviderSnapshot[] {
  return normalizeProviderList(providers);
}
