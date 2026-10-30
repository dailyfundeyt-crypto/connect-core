/**
 * T3-WS-RPC — Typen und Methodenkonstanten.
 *
 * Lane: A03 (Welle W1).
 *
 * Diese Datei spiegelt die *Methodennamen* aus T3s `packages/contracts/src/rpc.ts`
 * (`WS_METHODS`) und `packages/contracts/src/orchestrationV2.ts`
 * (`ORCHESTRATION_V2_WS_METHODS`). Die Payloads selbst werden **nicht** 1:1
 * kopiert: T3 nutzt Effect-Schemas, Connect hat kein Effect. Stattdessen
 * beschreiben die Typen hier die *Bridge-relevanten* Felder, und der Client
 * validiert die Antworten schmal (siehe `guards.ts`).
 *
 * Wichtig: Der T3-Server prüft die Payloads gegen seine Effect-Schemas. Ein
 * Payload, den der Client zu frei schickt, wird vom Server abgelehnt — deshalb
 * sind die Eingabetypen hier bewusst *enger* als T3s Schemas.
 */

import type { T3ProviderId } from "../contracts";

/* ---------------------------------------------------------------------------------------- *
 * Methodennamen (WS_METHODS / ORCHESTRATION_V2_WS_METHODS)
 * ---------------------------------------------------------------------------------------- */

/** Alle WS-Methoden, die der T3-Client benutzt. */
export const T3_WS_METHODS = {
  /* Server / Config */
  serverProbe: "server.probe",
  serverGetConfig: "server.getConfig",
  serverRefreshProviders: "server.refreshProviders",
  subscribeServerConfig: "subscribeServerConfig",
  serverGetUsageSummary: "server.getUsageSummary",

  /* Orchestrierung (orchestration-v2) */
  orchestrationDispatchCommand: "orchestration.dispatchCommand",
  orchestrationGetThreadProjection: "orchestration.getThreadProjection",
  orchestrationSubscribeThread: "orchestration.subscribeThread",
  orchestrationSubscribeShell: "orchestration.subscribeShell",
  orchestrationSearchThread: "orchestration.searchThread",
  orchestrationGetThreadFamily: "orchestration.getThreadFamily",
  orchestrationGetTurnItem: "orchestration.getTurnItem",
  orchestrationLaunchThread: "orchestration.launchThread",
} as const;

export type T3WsMethod = (typeof T3_WS_METHODS)[keyof typeof T3_WS_METHODS];

/**
 * Orchestration-Protokoll-Version, die der T3-Server erwartet.
 *
 * T3 prüft den Query-Parameter `orchestrationProtocol` beim WS-Upgrade und
 * antwortet bei Abweichung mit HTTP 426. Wert aus
 * `packages/contracts/src/environment.ts` (`ORCHESTRATION_PROTOCOL_VERSION`).
 */
export const T3_ORCHESTRATION_PROTOCOL_VERSION = 2;

/** Query-Parameter, den der T3-Server für den Protokollabgleich liest. */
export const T3_ORCHESTRATION_PROTOCOL_PARAM = "orchestrationProtocol";

/** Query-Parameter für das WebSocket-Ticket (kurzlebig, serverseitig gemintet). */
export const T3_WS_TICKET_PARAM = "wsTicket";

/** Pfad des WS-Endpunkts im T3-Server. */
export const T3_WS_PATH = "/ws";

/** HTTP-Pfad, über den ein WebSocket-Ticket gemintet wird. */
export const T3_WS_TICKET_PATH = "/api/auth/websocket-ticket";

/**
 * Contract-Version des Usage-Vertrags, gegen die der Client gebaut wurde.
 * Aus `packages/contracts/src/usage.ts` (`USAGE_CONTRACT_VERSION`).
 */
export const T3_USAGE_CONTRACT_VERSION = 6;

/** Mindest-Version des Usage-Vertrags, die der Client versteht. */
export const T3_USAGE_CONTRACT_VERSION_MIN = 4;

/* ---------------------------------------------------------------------------------------- *
 * Nutzlasten (Eingaben)
 * ---------------------------------------------------------------------------------------- */

/** `server.probe` — leer. */
export type T3ProbeInput = Record<string, never>;

/** `server.getConfig` — leer. */
export type T3GetConfigInput = Record<string, never>;

/**
 * `subscribeServerConfig` — Opt-ins.
 *
 * `usageLimitSources` aktiviert den Strom der Limit-Quellen (A17),
 * `usageLimitsCommand` kündigt an, dass der Client den `/usage-limits`-Befehl
 * versteht. Beide werden nur gesetzt, wenn der Server sie in seinen
 * Capabilities anbietet — sonst ignoriert ein alter Server die Felder oder
 * lehnt sie ab.
 */
export type T3SubscribeServerConfigInput = {
  readonly usageLimitSources?: boolean;
  readonly usageLimitsCommand?: boolean;
};

/** `server.refreshProviders` — optionaler Provider-Filter. */
export type T3RefreshProvidersInput = {
  readonly instanceId?: string;
  readonly cwd?: string;
  readonly fresh?: boolean;
  readonly refreshModels?: boolean;
};

/**
 * `orchestration.getThreadProjection` — Thread-Snapshot.
 */
export type T3GetThreadProjectionInput = {
  readonly threadId: string;
};

/** `orchestration.subscribeThread` — Live-Events eines Threads. */
export type T3SubscribeThreadInput = {
  readonly threadId: string;
  readonly afterSequence?: number;
  readonly requestCompletionMarker?: boolean;
  readonly acceptBoundedSnapshot?: boolean;
  readonly acceptCompactTurnItems?: boolean;
};

/** `orchestration.subscribeShell` — Live-Events aller Threads. */
export type T3SubscribeShellInput = {
  readonly afterSequence?: number;
  readonly requestCompletionMarker?: boolean;
  readonly omitIdleSubagents?: boolean;
  readonly omitOlderSettledThreads?: boolean;
};

/**
 * `orchestration.searchThread` — Volltextsuche in einem Thread.
 */
export type T3SearchThreadInput = {
  readonly threadId: string;
  readonly query: string;
  readonly offset?: number;
  readonly index?: number;
};

/** `orchestration.getThreadFamily` — Thread + Kinder. */
export type T3GetThreadFamilyInput = {
  readonly threadId: string;
};

/** `orchestration.getTurnItem` — ein einzelnes Turn-Item. */
export type T3GetTurnItemInput = {
  readonly threadId: string;
  readonly itemId: string;
  readonly revision?: string;
};

/**
 * `server.getUsageSummary` — Nutzungsübersicht.
 *
 * `sinceDay`/`untilDay` sind `YYYY-MM-DD`, `timeZone` eine IANA-Zone.
 */
export type T3UsageSummaryInput = {
  readonly sinceDay: string;
  readonly untilDay: string;
  readonly timeZone: string;
  readonly resolution?: "day" | "hour";
  readonly sinceTime?: string;
  readonly untilTime?: string;
  readonly awaitRefresh?: boolean;
};

/**
 * Kommandos der Orchestrierung (`orchestration.dispatchCommand`).
 *
 * Der Client kennt nur die Kommandos, die Connect braucht; T3 kennt deutlich
 * mehr. Unbekannte Kommando-Typen werden vom Server abgelehnt.
 *
 * `createdBy` und `creationSource` sind in T3 **Pflicht** (siehe
 * `OrchestrationV2CreationFields` in `packages/contracts/src/orchestrationV2.ts`).
 * Ohne sie lehnt der Server den Command ab („Missing key [createdBy]“).
 */

/** Wer hat den Thread/die Nachricht erzeugt? */
export type T3Actor = "user" | "agent" | "system";

/** Woher kam der Thread/die Nachricht? */
export type T3CreationSource = "web" | "mobile" | "mcp" | "provider" | "server";

/** Entscheidung auf eine Runtime-Anfrage (T3 `ProviderApprovalDecision`). */
export type T3ApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "acceptAlways"
  | "decline"
  | "cancel";

export type T3OrchestrationCommand =
  | {
      readonly type: "thread.create";
      readonly commandId: string;
      readonly threadId: string;
      readonly projectId: string;
      readonly title: string;
      readonly modelSelection: { readonly instanceId: string; readonly model: string };
      readonly runtimeMode: string;
      readonly interactionMode: string;
      readonly branch?: string | null;
      readonly worktreePath?: string | null;
      readonly createdBy: T3Actor;
      readonly creationSource: T3CreationSource;
    }
  | {
      readonly type: "message.dispatch";
      readonly commandId: string;
      readonly threadId: string;
      readonly messageId: string;
      readonly text: string;
      readonly attachments?: ReadonlyArray<unknown>;
      readonly modelSelection?: { readonly instanceId: string; readonly model: string };
      readonly deliveryIntent?: "auto" | "steer" | "restart";
      readonly dispatchMode?:
        | { readonly type: "defer_start" }
        | { readonly type: "steer_active"; readonly targetRunId: string }
        | { readonly type: "restart_active"; readonly targetRunId: string }
        | { readonly type: "queue_after_active" }
        | { readonly type: "start_immediately" };
      readonly createdBy: T3Actor;
      readonly creationSource: T3CreationSource;
    }
  | {
      readonly type: "thread.stop";
      readonly commandId: string;
      readonly threadId: string;
      readonly reason?: string;
      readonly stopDelegatedTasks?: boolean;
    }
  | {
      readonly type: "run.interrupt";
      readonly commandId: string;
      readonly threadId: string;
      readonly runId: string;
      readonly reason?: string;
      readonly holdQueue?: boolean;
    }
  | {
      readonly type: "runtime-request.respond";
      readonly commandId: string;
      readonly threadId: string;
      readonly requestId: string;
      readonly decision?: T3ApprovalDecision;
      readonly feedback?: string;
      readonly answers?: Record<string, unknown>;
    }
  | {
      readonly type: "thread.metadata.update";
      readonly commandId: string;
      readonly threadId: string;
      readonly title?: string;
      readonly regenerateTitle?: boolean;
    }
  | {
      readonly type: "thread.archive";
      readonly commandId: string;
      readonly threadId: string;
    }
  | {
      readonly type: "thread.delete";
      readonly commandId: string;
      readonly threadId: string;
    };

/* ---------------------------------------------------------------------------------------- *
 * Antworten (Ausgaben)
 * ---------------------------------------------------------------------------------------- */

/** `server.probe` — leer. */
export type T3ProbeResult = Record<string, never>;

/**
 * Fähigkeiten des T3-Servers.
 *
 * Nur die Felder, die Connect tatsächlich prüft. `capabilities` ist eine
 * offene Map (T3 schickt viele weitere Fähigkeiten).
 */
export type T3ServerCapabilities = {
  readonly connectionProbe?: boolean;
  readonly usageLimitSources?: boolean;
  readonly environmentThemes?: boolean;
  readonly threadStop?: boolean;
  readonly commandOutputStreaming?: boolean;
  readonly [key: string]: unknown;
};

/** Umgebungsdeskriptor des T3-Servers. */
export type T3EnvironmentDescriptor = {
  readonly environmentId: string;
  readonly label: string;
  readonly serverVersion: string;
  readonly orchestrationProtocolVersion?: number;
  readonly platform?: { readonly os?: string; readonly arch?: string; readonly machine?: string };
  readonly capabilities?: T3ServerCapabilities;
};

/** Ein Provider-Snapshot aus `server.getConfig` (`config.providers`). */
export type T3ServerProvider = {
  readonly instanceId: string;
  readonly driver: string;
  readonly displayName?: string;
  readonly enabled?: boolean;
  readonly installed?: boolean;
  readonly version?: string | null;
  readonly status?: string;
  readonly message?: string;
  readonly availability?: string;
  readonly unavailableReason?: string;
  readonly models?: ReadonlyArray<{
    readonly id?: string;
    readonly model?: string;
    /** T3 liefert Modelle mit `slug` (Anzeigename in `name`). */
    readonly slug?: string;
    readonly name?: string;
    readonly isDefault?: boolean;
    readonly isCustom?: boolean;
    readonly isLegacy?: boolean;
    readonly [key: string]: unknown;
  }>;
  readonly usageLimits?: {
    readonly checkedAt?: string;
    readonly windows?: ReadonlyArray<{
      readonly id?: string;
      readonly kind?: string;
      readonly label?: string;
      readonly usedPercent?: number;
      readonly resetsAt?: string;
    }>;
    readonly unavailable?: { readonly reason?: string; readonly message?: string };
  };
  readonly [key: string]: unknown;
};

/** Antwort von `server.getConfig`. */
export type T3ServerConfig = {
  readonly environment?: T3EnvironmentDescriptor;
  readonly providers?: ReadonlyArray<T3ServerProvider>;
  readonly cwd?: string;
  readonly [key: string]: unknown;
};

/** Ein `subscribeServerConfig`-Event. */
export type T3ServerConfigEvent =
  | { readonly type: "snapshot"; readonly version?: number; readonly config: T3ServerConfig }
  | {
      readonly type: "usageLimitSourcesUpdated";
      readonly version?: number;
      readonly payload?: { readonly sources?: ReadonlyArray<unknown> };
    }
  | { readonly type: string; readonly [key: string]: unknown };

/** Antwort von `orchestration.getThreadProjection`. */
export type T3ThreadProjection = {
  readonly thread?: { readonly id?: string; readonly title?: string; readonly [key: string]: unknown };
  readonly runs?: ReadonlyArray<unknown>;
  readonly providerTurns?: ReadonlyArray<unknown>;
  readonly runtimeRequests?: ReadonlyArray<unknown>;
  readonly messages?: ReadonlyArray<unknown>;
  readonly visibleTurnItems?: ReadonlyArray<unknown>;
  readonly updatedAt?: string;
  readonly [key: string]: unknown;
};

/**
 * Ein `orchestration.subscribeThread`-Element.
 *
 * Der Thread-Stream liefert zwei Formen (live verifiziert):
 *  - `{ kind: "snapshot", snapshotSequence, projection }` — der Anfangszustand
 *  - `{ kind: "event", sequence, event }` — ein Domain-Event
 *
 * A12/A06 übersetzen diese Elemente in Connect-Chat-Events.
 */
export type T3ThreadStreamItem = {
  readonly kind?: "snapshot" | "event";
  readonly sequence?: number;
  readonly snapshotSequence?: number;
  readonly projection?: unknown;
  readonly event?: { readonly type?: string; readonly [key: string]: unknown };
  readonly [key: string]: unknown;
};

/** Ein Nutzungs-Bucket aus `server.getUsageSummary`. */
export type T3UsageBucket = {
  readonly day?: string;
  readonly hourStart?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly totals?: {
    readonly uncachedInputTokens?: number;
    readonly cachedInputTokens?: number;
    readonly cacheCreationTokens?: number;
    readonly outputTokens?: number;
    readonly reasoningTokens?: number;
  };
  readonly costUsd?: number;
  readonly cacheSavingsUsd?: number;
  readonly costSource?: string;
  readonly records?: number;
  readonly sessions?: number;
  readonly [key: string]: unknown;
};

/** Eine Nutzungsquelle aus `server.getUsageSummary`. */
export type T3UsageSource = {
  readonly fingerprint?: {
    readonly hostId?: string;
    readonly provider?: string;
    readonly resolvedHomePath?: string;
  };
  readonly status?: "ok" | "missing" | "partial" | "failed";
  readonly scannedFiles?: number;
  readonly distinctSessions?: number;
  readonly message?: string | null;
  readonly [key: string]: unknown;
};

/** Antwort von `server.getUsageSummary`. */
export type T3UsageSummary = {
  readonly contractVersion?: number;
  readonly readAt?: string;
  readonly timeZone?: string;
  readonly sinceDay?: string;
  readonly untilDay?: string;
  readonly buckets?: ReadonlyArray<T3UsageBucket>;
  readonly sources?: ReadonlyArray<T3UsageSource>;
  readonly pricing?: { readonly status?: string; readonly source?: string; readonly [key: string]: unknown };
  readonly scanDurationMs?: number;
  readonly [key: string]: unknown;
};

/** Ergebnis eines Limit-Quellen-Abrufs. */
export type T3UsageLimitSources = {
  readonly sources?: ReadonlyArray<{
    readonly id?: string;
    readonly kind?: string;
    readonly label?: string;
    readonly checkedAt?: string;
    readonly accounts?: ReadonlyArray<{
      readonly id?: string;
      readonly driver?: string;
      readonly email?: string;
      readonly plan?: string;
      readonly usageLimits?: unknown;
    }>;
  }>;
  readonly [key: string]: unknown;
};

/**
 * Vereinheitlichte Provider-Liste für A04.
 *
 * Der T3-Server liefert Provider unter zwei Schlüsseln: `config.providers`
 * (Snapshot) und `config.usageLimitSources` (Limit-Quellen). Beide werden hier
 * zu einer flachen Liste zusammengeführt.
 */
export type T3ProviderSnapshot = {
  readonly driver: string;
  readonly providerId: T3ProviderId | null;
  readonly instanceId: string | null;
  readonly displayName: string | null;
  readonly enabled: boolean;
  readonly installed: boolean;
  readonly authenticated: boolean | null;
  readonly version: string | null;
  readonly models: string[];
  readonly status: string | null;
  readonly reason: string | null;
  readonly usageWindows: ReadonlyArray<{
    readonly id: string | null;
    readonly kind: string;
    readonly label: string;
    readonly usedPercent: number;
    readonly resetsAt: string | null;
  }>;
};
