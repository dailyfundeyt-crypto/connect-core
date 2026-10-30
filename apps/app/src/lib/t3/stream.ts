/**
 * T3-Bridge — SSE Stream Client (Lane A21).
 *
 * Verwaltet die Echtzeitverbindung für:
 * - Wort-für-Wort Streaming (Text-Deltas)
 * - Tool-Aufrufe und -Ergebnisse
 * - Freigabe-Anfragen (Approvals)
 * - Kontext-Wechsel (100k Token Generationen)
 * - Turn-Ende und Kosten
 * - Reconnects mit `Last-Event-ID` und Resync-Signalen
 *
 * Speichert KEINE Tokens im Browser.
 */

import { isConnectChatEvent, type ConnectChatEvent } from "./contracts";
import { isT3MockMode, mockSubscribeT3Stream } from "./mock-client";

/* ---------------------------------------------------------------------------------------- *
 * Typen & Optionen
 * ---------------------------------------------------------------------------------------- */

export type StreamEnvelopeInfo = {
  id?: number;
  at?: string;
};

export type SubscribeT3StreamOptions = {
  /** Callback für jedes eintreffende Chat-Event */
  onEvent: (event: ConnectChatEvent, info?: StreamEnvelopeInfo) => void;
  /** Callback bei Kontroll-Signal `resync` (z. B. Log-Lücke -> Thread-Snapshot neu laden) */
  onResync?: (reason: string) => void;
  /** Callback bei erfolgreichem Verbindungsaufbau */
  onReady?: (info: { lastEventId: number; resumed: boolean }) => void;
  /** Callback bei Fehlern */
  onError?: (err: Error) => void;
  /** Erzwingt oder deaktiviert den Mock-Modus */
  mock?: boolean;
  /** Letzte bekannte Event-ID zur nahtlosen Wiederaufnahme */
  lastEventId?: number | string;
  /** AbortSignal für manuellen Verbindungsabbruch */
  signal?: AbortSignal;
};

const API_BASE = "/api";

/* ---------------------------------------------------------------------------------------- *
 * SSE-Chunk-Parser
 * ---------------------------------------------------------------------------------------- */

export type ParsedSseMessage = {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
};

/**
 * Zerlegt einen rohen SSE-Block in strukturierte SSE-Nachrichten.
 */
export function parseSseBlock(block: string): ParsedSseMessage | null {
  const lines = block.split(/\r?\n/);
  let id: string | undefined;
  let event: string | undefined;
  let retry: number | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) {
      // Kommentar oder Leerzeile (z. B. Heartbeat ": hb")
      continue;
    }
    const colonIdx = line.indexOf(":");
    let field: string;
    let value: string;
    if (colonIdx === -1) {
      field = line;
      value = "";
    } else {
      field = line.slice(0, colonIdx);
      value = line.slice(colonIdx + 1);
      if (value.startsWith(" ")) {
        value = value.slice(1);
      }
    }

    if (field === "data") {
      dataLines.push(value);
    } else if (field === "id") {
      id = value;
    } else if (field === "event") {
      event = value;
    } else if (field === "retry") {
      const parsedRetry = parseInt(value, 10);
      if (!Number.isNaN(parsedRetry)) {
        retry = parsedRetry;
      }
    }
  }

  if (dataLines.length === 0 && !id && !event) {
    return null;
  }

  return {
    id,
    event,
    data: dataLines.join("\n"),
    retry,
  };
}

/* ---------------------------------------------------------------------------------------- *
 * Haupt-Abonnement-Funktion
 * ---------------------------------------------------------------------------------------- */

/**
 * Abonniert den SSE-Stream für einen T3-Agenten (`GET /api/t3-agents/:agentId/stream`).
 * Gibt eine `unsubscribe`-Funktion zurück.
 */
export function subscribeT3Stream(
  agentId: string,
  options: SubscribeT3StreamOptions,
): () => void {
  const useMock = options.mock ?? isT3MockMode();
  if (useMock) {
    return mockSubscribeT3Stream(agentId, options.onEvent, options.onError);
  }

  let isClosed = false;
  let abortController: AbortController | null = new AbortController();
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let currentLastEventId: number =
    typeof options.lastEventId === "number"
      ? options.lastEventId
      : options.lastEventId
        ? parseInt(String(options.lastEventId), 10) || 0
        : 0;

  let backoffMs = 1000;
  const maxBackoffMs = 10000;

  // Wenn ein externes Signal übergeben wurde, darauf hören
  if (options.signal) {
    options.signal.addEventListener("abort", () => {
      cleanup();
    });
  }

  const cleanup = () => {
    isClosed = true;
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  };

  const connect = async () => {
    if (isClosed) return;

    abortController = new AbortController();
    const encodedId = encodeURIComponent(agentId);
    const url = `${API_BASE}/t3-agents/${encodedId}/stream`;

    const headers: Record<string, string> = {
      Accept: "text/event-stream",
    };
    if (currentLastEventId > 0) {
      headers["Last-Event-ID"] = String(currentLastEventId);
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
        credentials: "include", // HttpOnly Session-Cookie
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE Verbindung abgelehnt (HTTP ${response.status})`);
      }

      const body = response.body;
      if (!body) {
        throw new Error("Antwort-Body enthält keinen ReadableStream");
      }

      // Verbindung erfolgreich -> Backoff zurücksetzen
      backoffMs = 1000;

      const reader = body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (!isClosed) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE-Nachrichten enden mit \n\n oder \r\n\r\n
        let boundaryIndex: number;
        while ((boundaryIndex = buffer.search(/\r?\n\r?\n/)) !== -1) {
          const match = buffer.match(/\r?\n\r?\n/);
          const delimiterLength = match ? match[0].length : 2;
          const block = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + delimiterLength);

          const parsedMsg = parseSseBlock(block);
          if (parsedMsg) {
            handleParsedMessage(parsedMsg);
          }
        }
      }
    } catch (err) {
      if (isClosed || (err instanceof Error && err.name === "AbortError")) {
        return;
      }

      if (options.onError && err instanceof Error) {
        options.onError(err);
      }

      // Automatischer Reconnect mit Backoff
      scheduleReconnect();
    }
  };

  const scheduleReconnect = () => {
    if (isClosed) return;
    reconnectTimeout = setTimeout(() => {
      connect();
    }, backoffMs);
    backoffMs = Math.min(backoffMs * 1.5, maxBackoffMs);
  };

  const handleParsedMessage = (msg: ParsedSseMessage) => {
    if (msg.id) {
      const parsedId = parseInt(msg.id, 10);
      if (!Number.isNaN(parsedId)) {
        currentLastEventId = parsedId;
      }
    }

    if (!msg.data) return;

    let payload: unknown;
    try {
      payload = JSON.parse(msg.data);
    } catch {
      // Unparseable data ignorieren
      return;
    }

    if (!payload || typeof payload !== "object") return;

    // 1. Resync-Signal
    if (
      msg.event === "resync" ||
      ("type" in payload && (payload as { type?: unknown }).type === "resync")
    ) {
      const reason =
        "reason" in payload && typeof (payload as { reason?: unknown }).reason === "string"
          ? (payload as { reason: string }).reason
          : "stream_resync";
      options.onResync?.(reason);
      return;
    }

    // 2. Ready-Signal
    if (
      msg.event === "ready" ||
      ("type" in payload && (payload as { type?: unknown }).type === "ready")
    ) {
      const lastEventId =
        "lastEventId" in payload && typeof (payload as { lastEventId?: unknown }).lastEventId === "number"
          ? (payload as { lastEventId: number }).lastEventId
          : currentLastEventId;
      const resumed =
        "resumed" in payload && typeof (payload as { resumed?: unknown }).resumed === "boolean"
          ? (payload as { resumed: boolean }).resumed
          : false;
      options.onReady?.({ lastEventId, resumed });
      return;
    }

    // 3. Envelope mit verschachteltem Chat-Event (A12 StreamEnvelope)
    if ("event" in payload && (payload as { event?: unknown }).event) {
      const envelopeEvent = (payload as { event: unknown }).event;
      if (isConnectChatEvent(envelopeEvent)) {
        const envelopeId =
          "id" in payload && typeof (payload as { id?: unknown }).id === "number"
            ? (payload as { id: number }).id
            : currentLastEventId;
        const envelopeAt =
          "at" in payload && typeof (payload as { at?: unknown }).at === "string"
            ? (payload as { at: string }).at
            : undefined;

        options.onEvent(envelopeEvent, { id: envelopeId, at: envelopeAt });
        return;
      }
    }

    // 4. Direktes flaches ConnectChatEvent
    if (isConnectChatEvent(payload)) {
      options.onEvent(payload, { id: currentLastEventId });
    }
  };

  // Start der Verbindung
  connect();

  return cleanup;
}
