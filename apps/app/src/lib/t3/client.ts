/**
 * T3-Bridge — HTTP-Client & Fetch-Funktionen (Lane A21).
 *
 * Zentraler Einstiegspunkt für alle Frontend-Pakete:
 * - Provider & CLI-Status
 * - Threads, Verlauf und Nachrichten
 * - Turn-Steuerung (Interrupt, Steer) & Freigaben (Approvals)
 * - Usage, Kosten und Limits
 * - Cua-Maschinen (Shared & Per-Agent)
 * - Avatare & Flottenstatus
 *
 * REGELN:
 * 1. Keine Tokens im Browser speichern (Better-Auth-Session via HttpOnly Cookies, credentials: "include").
 * 2. Hinter dem Feature-Flag (A01).
 * 3. Robuster Mock-Adapter für W3-Agenten.
 */

import {
  type AgentAvatar,
  type CompanyPublicUsage,
  type ConnectChatApprovalItem,
  type ConnectChatItem,
  getT3Flag,
  type Machine,
  type MachineListResponse,
  type SchedulerLimits,
  type T3ApprovalRequest,
  type T3ApprovalResponse,
  type T3Capabilities,
  type T3ControlRequest,
  type T3ControlResponse,
  type T3MessageRequest,
  type T3MessageResponse,
  type T3ProviderListResponse,
  type T3StatusResponse,
  type T3ThreadSnapshot,
  type UsageQuery,
  type UsageResponse,
  type FleetAgentState,
} from "./contracts";
import {
  isT3MockMode,
  mockControlMachine,
  mockFetchAgentAvatar,
  mockFetchCompanyPublicUsage,
  mockFetchFleetStatus,
  mockFetchMachine,
  mockFetchMachines,
  mockFetchSchedulerStatus,
  mockFetchT3Capabilities,
  mockFetchT3Messages,
  mockFetchT3PendingApprovals,
  mockFetchT3Providers,
  mockFetchT3Status,
  mockFetchT3ThreadSnapshot,
  mockFetchT3Usage,
  mockInterruptT3Turn,
  mockRespondT3Approval,
  mockSendT3Control,
  mockSendT3Message,
  mockSteerT3Turn,
  mockUpdateAgentAvatar,
} from "./mock-client";

/* ---------------------------------------------------------------------------------------- *
 * Fehler-Klasse
 * ---------------------------------------------------------------------------------------- */

export class T3ClientError extends Error {
  readonly status: number;
  readonly data?: unknown;

  constructor(message: string, status = 500, data?: unknown) {
    super(message);
    this.name = "T3ClientError";
    this.status = status;
    this.data = data;
  }
}

/* ---------------------------------------------------------------------------------------- *
 * Client-Optionen & Hilfsfunktionen
 * ---------------------------------------------------------------------------------------- */

export type T3ClientOptions = {
  /** Erzwingt oder deaktiviert den Mock-Modus für diesen Aufruf */
  mock?: boolean;
  /** AbortSignal für Request-Abbruch */
  signal?: AbortSignal;
};

/** Standard-Präfix für Connect API */
const API_BASE = "/api";

/**
 * Universeller JSON-Request mit HttpOnly-Credentials.
 * Speichert KEINE Tokens im Browser.
 */
async function requestJson<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    fallbackMessage?: string;
  } = {},
): Promise<T> {
  const url = path.startsWith("http") || path.startsWith("/") ? path : `${API_BASE}/${path}`;
  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      credentials: "include",
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }
    throw new T3ClientError(
      options.fallbackMessage ?? `Netzwerkfehler beim Aufruf von ${url}`,
      0,
      err,
    );
  }

  if (!response.ok) {
    let errorData: unknown;
    let message = options.fallbackMessage ?? `Server meldet HTTP ${response.status}`;
    try {
      errorData = await response.json();
      if (
        errorData &&
        typeof errorData === "object" &&
        "error" in errorData &&
        typeof (errorData as { error?: unknown }).error === "string"
      ) {
        message = (errorData as { error: string }).error;
      }
    } catch {
      // Ignorieren falls nicht-JSON
    }
    throw new T3ClientError(message, response.status, errorData);
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return (await response.json()) as T;
}

function shouldUseMock(options?: T3ClientOptions): boolean {
  if (options?.mock !== undefined) return options.mock;
  return isT3MockMode();
}

/* ---------------------------------------------------------------------------------------- *
 * 1. Status & Provider
 * ---------------------------------------------------------------------------------------- */

/**
 * Liest den Status des T3-Sidecars und der Brücke.
 */
export async function fetchT3Status(options?: T3ClientOptions): Promise<T3StatusResponse> {
  if (shouldUseMock(options)) {
    return mockFetchT3Status();
  }
  return requestJson<T3StatusResponse>(`${API_BASE}/t3/status`, {
    signal: options?.signal,
    fallbackMessage: "T3-Status konnte nicht geladen werden.",
  });
}

/**
 * Liest alle verfügbaren T3-Treiber/Provider (Codex, Claude, Cursor, Grok, etc.).
 */
export async function fetchT3Providers(
  options?: T3ClientOptions,
): Promise<T3ProviderListResponse> {
  if (shouldUseMock(options)) {
    return mockFetchT3Providers();
  }
  return requestJson<T3ProviderListResponse>(`${API_BASE}/t3/providers`, {
    signal: options?.signal,
    fallbackMessage: "T3-Provider-Liste konnte nicht geladen werden.",
  });
}

/* ---------------------------------------------------------------------------------------- *
 * 2. Threads & Nachrichten
 * ---------------------------------------------------------------------------------------- */

/**
 * Liest den lückenlosen Thread-Snapshot eines T3-Agenten über alle Kontext-Generationen hinweg.
 */
export async function fetchT3ThreadSnapshot(
  agentId: string,
  options?: T3ClientOptions,
): Promise<T3ThreadSnapshot> {
  if (shouldUseMock(options)) {
    return mockFetchT3ThreadSnapshot(agentId);
  }

  const encodedId = encodeURIComponent(agentId);
  try {
    return await requestJson<T3ThreadSnapshot>(`${API_BASE}/t3-agents/${encodedId}/thread`, {
      signal: options?.signal,
    });
  } catch (err) {
    // Fallback auf Alias-Pfad /api/t3/agents/:id/thread
    if (err instanceof T3ClientError && err.status === 404) {
      return requestJson<T3ThreadSnapshot>(`${API_BASE}/t3/agents/${encodedId}/thread`, {
        signal: options?.signal,
        fallbackMessage: `Thread für Agent '${agentId}' konnte nicht geladen werden.`,
      });
    }
    throw err;
  }
}

/**
 * Liest den paginierten Gesprächsverlauf eines Agenten.
 */
export async function fetchT3Messages(
  agentId: string,
  queryOptions?: { cursor?: string; limit?: number } & T3ClientOptions,
): Promise<{ items: ConnectChatItem[]; nextCursor?: string }> {
  if (shouldUseMock(queryOptions)) {
    return mockFetchT3Messages(agentId, queryOptions);
  }

  const encodedId = encodeURIComponent(agentId);
  const params = new URLSearchParams();
  if (queryOptions?.cursor) params.set("cursor", queryOptions.cursor);
  if (queryOptions?.limit) params.set("limit", String(queryOptions.limit));

  const qs = params.toString() ? `?${params.toString()}` : "";
  return requestJson<{ items: ConnectChatItem[]; nextCursor?: string }>(
    `${API_BASE}/t3-agents/${encodedId}/messages${qs}`,
    {
      signal: queryOptions?.signal,
      fallbackMessage: `Nachrichten für Agent '${agentId}' konnten nicht geladen werden.`,
    },
  );
}

/**
 * Sendet eine Nachricht an einen T3-Agenten und startet einen Turn (idempotent via clientMessageId).
 */
export async function sendT3Message(
  agentId: string,
  request: Omit<T3MessageRequest, "agentId"> & { agentId?: string },
  options?: T3ClientOptions,
): Promise<T3MessageResponse> {
  const fullRequest: T3MessageRequest = {
    ...request,
    agentId,
  };

  if (shouldUseMock(options)) {
    return mockSendT3Message(agentId, fullRequest);
  }

  const encodedId = encodeURIComponent(agentId);
  return requestJson<T3MessageResponse>(`${API_BASE}/t3-agents/${encodedId}/messages`, {
    method: "POST",
    body: fullRequest,
    signal: options?.signal,
    fallbackMessage: `Nachricht an Agent '${agentId}' konnte nicht gesendet werden.`,
  });
}

/* ---------------------------------------------------------------------------------------- *
 * 3. Steuerung & Freigaben (Approvals)
 * ---------------------------------------------------------------------------------------- */

/**
 * Sendet ein Steuerungskommando (interrupt, steer, queue) an den aktiven Turn.
 */
export async function sendT3Control(
  agentId: string,
  request: Omit<T3ControlRequest, "agentId"> & { agentId?: string },
  options?: T3ClientOptions,
): Promise<T3ControlResponse> {
  const fullRequest: T3ControlRequest = {
    ...request,
    agentId,
  };

  if (shouldUseMock(options)) {
    return mockSendT3Control(agentId, fullRequest);
  }

  const encodedId = encodeURIComponent(agentId);
  return requestJson<T3ControlResponse>(`${API_BASE}/t3-agents/${encodedId}/control`, {
    method: "POST",
    body: fullRequest,
    signal: options?.signal,
    fallbackMessage: `Steuerungskommando an Agent '${agentId}' fehlgeschlagen.`,
  });
}

/**
 * Bricht den aktuellen Turn eines Agenten sofort ab.
 */
export async function interruptT3Turn(
  agentId: string,
  reason?: string,
  options?: T3ClientOptions,
): Promise<T3ControlResponse> {
  if (shouldUseMock(options)) {
    return mockInterruptT3Turn(agentId, reason);
  }

  const encodedId = encodeURIComponent(agentId);
  try {
    return await requestJson<T3ControlResponse>(`${API_BASE}/t3-agents/${encodedId}/interrupt`, {
      method: "POST",
      body: reason ? { reason } : {},
      signal: options?.signal,
    });
  } catch {
    // Fallback auf die universelle /control Route
    return sendT3Control(agentId, { action: "interrupt", text: reason }, options);
  }
}

/**
 * Lenkt den aktuellen Turn eines Agenten mitten im Lauf (steer).
 */
export async function steerT3Turn(
  agentId: string,
  text: string,
  options?: T3ClientOptions,
): Promise<T3ControlResponse> {
  if (shouldUseMock(options)) {
    return mockSteerT3Turn(agentId, text);
  }

  const encodedId = encodeURIComponent(agentId);
  try {
    return await requestJson<T3ControlResponse>(`${API_BASE}/t3-agents/${encodedId}/steer`, {
      method: "POST",
      body: { text },
      signal: options?.signal,
    });
  } catch {
    return sendT3Control(agentId, { action: "steer", text }, options);
  }
}

/**
 * Liest die Steuerungs-Fähigkeiten (Capabilities) des aktiven Providers des Agenten.
 */
export async function fetchT3Capabilities(
  agentId: string,
  options?: T3ClientOptions,
): Promise<T3Capabilities> {
  if (shouldUseMock(options)) {
    return mockFetchT3Capabilities(agentId);
  }

  const encodedId = encodeURIComponent(agentId);
  return requestJson<T3Capabilities>(`${API_BASE}/t3-agents/${encodedId}/capabilities`, {
    signal: options?.signal,
    fallbackMessage: `Capabilities für Agent '${agentId}' konnten nicht geladen werden.`,
  });
}

/**
 * Beantwortet eine offene Freigabe-Anfrage (Approval).
 */
export async function respondT3Approval(
  agentId: string,
  request: Omit<T3ApprovalRequest, "agentId"> & { agentId?: string },
  options?: T3ClientOptions,
): Promise<T3ApprovalResponse> {
  const fullRequest: T3ApprovalRequest = {
    ...request,
    agentId,
  };

  if (shouldUseMock(options)) {
    return mockRespondT3Approval(agentId, fullRequest);
  }

  const encodedAgentId = encodeURIComponent(agentId);
  const encodedReqId = encodeURIComponent(fullRequest.requestId);

  try {
    return await requestJson<T3ApprovalResponse>(
      `${API_BASE}/t3-agents/${encodedAgentId}/approvals/${encodedReqId}`,
      {
        method: "POST",
        body: fullRequest,
        signal: options?.signal,
      },
    );
  } catch {
    // Fallback auf generische /approvals Route
    return requestJson<T3ApprovalResponse>(
      `${API_BASE}/t3-agents/${encodedAgentId}/approvals`,
      {
        method: "POST",
        body: fullRequest,
        signal: options?.signal,
        fallbackMessage: `Freigabe-Entscheidung für '${request.requestId}' konnte nicht übermittelt werden.`,
      },
    );
  }
}

/**
 * Liest alle noch offenen Freigaben eines Agenten.
 */
export async function fetchT3PendingApprovals(
  agentId: string,
  options?: T3ClientOptions,
): Promise<ConnectChatApprovalItem[]> {
  if (shouldUseMock(options)) {
    return mockFetchT3PendingApprovals(agentId);
  }

  const encodedId = encodeURIComponent(agentId);
  return requestJson<ConnectChatApprovalItem[]>(`${API_BASE}/t3-agents/${encodedId}/approvals`, {
    signal: options?.signal,
    fallbackMessage: `Offene Freigaben für '${agentId}' konnten nicht geladen werden.`,
  });
}

/* ---------------------------------------------------------------------------------------- *
 * 4. Usage, Kosten & Limits
 * ---------------------------------------------------------------------------------------- */

/**
 * Liest T3-Nutzungsdaten, Kosten und Provider-Limits (Lane A17).
 */
export async function fetchT3Usage(
  query: UsageQuery,
  options?: T3ClientOptions,
): Promise<UsageResponse> {
  if (shouldUseMock(options)) {
    return mockFetchT3Usage(query);
  }

  const params = new URLSearchParams({
    metric: query.metric,
    windowDays: String(query.windowDays),
    groupBy: query.groupBy,
  });

  if (query.agentId) params.set("agentId", query.agentId);
  if (query.companyId) params.set("companyId", query.companyId);
  if (query.provider) params.set("provider", query.provider);
  if (query.model) params.set("model", query.model);
  if (query.timeZone) params.set("timeZone", query.timeZone);

  return requestJson<UsageResponse>(`${API_BASE}/usage?${params.toString()}`, {
    signal: options?.signal,
    fallbackMessage: "Nutzungsdaten konnten nicht geladen werden.",
  });
}

/**
 * Liest die aggregierten öffentlichen Token-Summen einer Firma (Lane A20).
 */
export async function fetchCompanyPublicUsage(
  companyId: string,
  options?: T3ClientOptions,
): Promise<CompanyPublicUsage> {
  if (shouldUseMock(options)) {
    return mockFetchCompanyPublicUsage(companyId);
  }

  const encodedId = encodeURIComponent(companyId);
  return requestJson<CompanyPublicUsage>(`${API_BASE}/companies/${encodedId}/public-usage`, {
    signal: options?.signal,
    fallbackMessage: `Öffentliche Nutzungsdaten für Firma '${companyId}' nicht verfügbar.`,
  });
}

/* ---------------------------------------------------------------------------------------- *
 * 5. Cua-Maschinen
 * ---------------------------------------------------------------------------------------- */

/**
 * Liest alle Cua-Maschinen des Nutzers (Shared und Per-Agent).
 */
export async function fetchMachines(options?: T3ClientOptions): Promise<MachineListResponse> {
  if (shouldUseMock(options)) {
    return mockFetchMachines();
  }
  return requestJson<MachineListResponse>(`${API_BASE}/machines`, {
    signal: options?.signal,
    fallbackMessage: "Maschinenliste konnte nicht geladen werden.",
  });
}

/**
 * Liest eine einzelne Maschine anhand ihrer ID.
 */
export async function fetchMachine(
  machineId: string,
  options?: T3ClientOptions,
): Promise<Machine> {
  if (shouldUseMock(options)) {
    return mockFetchMachine(machineId);
  }
  const encodedId = encodeURIComponent(machineId);
  return requestJson<Machine>(`${API_BASE}/machines/${encodedId}`, {
    signal: options?.signal,
    fallbackMessage: `Maschine '${machineId}' nicht gefunden.`,
  });
}

/**
 * Weckt eine Maschine auf oder versetzt sie in den Ruhezustand (Löschen ist streng verboten!).
 */
export async function controlMachine(
  machineId: string,
  action: "wake" | "sleep",
  options?: T3ClientOptions,
): Promise<{ ok: boolean }> {
  if (shouldUseMock(options)) {
    return mockControlMachine(machineId, action);
  }
  const encodedId = encodeURIComponent(machineId);
  return requestJson<{ ok: boolean }>(`${API_BASE}/machines/${encodedId}/${action}`, {
    method: "POST",
    signal: options?.signal,
    fallbackMessage: `Kommando '${action}' für Maschine '${machineId}' fehlgeschlagen.`,
  });
}

/* ---------------------------------------------------------------------------------------- *
 * 6. Avatare & Flottenstatus
 * ---------------------------------------------------------------------------------------- */

/**
 * Liest den Maskottchen-Avatar eines Agenten.
 */
export async function fetchAgentAvatar(
  agentId: string,
  options?: T3ClientOptions,
): Promise<AgentAvatar> {
  if (shouldUseMock(options)) {
    return mockFetchAgentAvatar(agentId);
  }
  const encodedId = encodeURIComponent(agentId);
  return requestJson<AgentAvatar>(`${API_BASE}/agents/${encodedId}/avatar`, {
    signal: options?.signal,
    fallbackMessage: `Avatar für Agent '${agentId}' konnte nicht geladen werden.`,
  });
}

/**
 * Aktualisiert Form, Farbe oder Ausdruck des Agenten-Avatars.
 */
export async function updateAgentAvatar(
  agentId: string,
  avatarPatch: Partial<AgentAvatar>,
  options?: T3ClientOptions,
): Promise<AgentAvatar> {
  if (shouldUseMock(options)) {
    return mockUpdateAgentAvatar(agentId, avatarPatch);
  }
  const encodedId = encodeURIComponent(agentId);
  return requestJson<AgentAvatar>(`${API_BASE}/agents/${encodedId}/avatar`, {
    method: "PUT",
    body: avatarPatch,
    signal: options?.signal,
    fallbackMessage: `Avatar für Agent '${agentId}' konnte nicht aktualisiert werden.`,
  });
}

/**
 * Liest den aktuellen Flottenzustand aller laufenden T3-Agenten.
 */
export async function fetchFleetStatus(
  options?: T3ClientOptions,
): Promise<{ agents: FleetAgentState[]; limits: SchedulerLimits }> {
  if (shouldUseMock(options)) {
    return mockFetchFleetStatus();
  }
  return requestJson<{ agents: FleetAgentState[]; limits: SchedulerLimits }>(
    `${API_BASE}/t3/fleet`,
    {
      signal: options?.signal,
      fallbackMessage: "Flottenstatus konnte nicht geladen werden.",
    },
  );
}

/**
 * Liest den Scheduler-Status und Limits.
 */
export async function fetchSchedulerStatus(
  options?: T3ClientOptions,
): Promise<{ running: boolean; limits: SchedulerLimits; agents: FleetAgentState[] }> {
  if (shouldUseMock(options)) {
    return mockFetchSchedulerStatus();
  }
  return requestJson<{ running: boolean; limits: SchedulerLimits; agents: FleetAgentState[] }>(
    `${API_BASE}/t3/fleet`,
    {
      signal: options?.signal,
      fallbackMessage: "Scheduler-Status konnte nicht geladen werden.",
    },
  );
}
