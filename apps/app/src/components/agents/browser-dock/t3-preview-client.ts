/**
 * A32 — Low-Level-Client für T3s Browser-Vorschau.
 *
 * EIGENTÜMER: A32.
 *
 * T3 liefert die Vorschau seines serverseitigen Browsers als WebSocket
 * (`apps/server/src/preview/ServerBrowserStream.ts`, nur gelesen):
 *   - Binärframes: JPEG-Bilder
 *   - JSON-Frames:  `viewport`, `control`, `probe`, `clipboard`, …
 *
 * Connect-Wunsch an A37/A03 (siehe Bericht A32): Der Server muss den
 * Sidecar-Stream unter `/api/t3/preview-stream/ws` durchreichen. Bis dahin
 * meldet dieser Client sauber „nicht erreichbar" statt zu raten.
 *
 * Keine Secrets im Browser: der Aufruf läuft mit `credentials: "include"`
 * über die Better-Auth-Session, der Bridge-Token bleibt serverseitig.
 *
 * Bewusst ohne Import aus `apps/server/src/` — die App hat keinen Alias
 * auf den Server.
 */

export type T3PreviewControlFrame = {
  _tag: "control";
  canOperate: boolean;
  controller: "agent" | "you" | "another-viewer" | "unclaimed";
  generation: number;
  dialog: {
    type: string;
    message: string;
    defaultValue: string;
  } | null;
};

export type T3PreviewViewportFrame = {
  _tag: "viewport";
  width: number;
  height: number;
};

export type T3PreviewJsonFrame =
  | T3PreviewControlFrame
  | T3PreviewViewportFrame
  | { _tag: string; [key: string]: unknown };

export type T3PreviewHandle = {
  /** Stream beenden. */
  close: () => void;
};

export type T3PreviewCallbacks = {
  /** Ein JPEG-Frame (Blob) wurde empfangen. */
  onFrame: (blob: Blob) => void;
  /** Ein JSON-Frame wurde empfangen. */
  onJson?: (frame: T3PreviewJsonFrame) => void;
  /** Der Stream ist ausgelaufen oder nicht erreichbar. */
  onError?: (message: string) => void;
  /** Der Stream wurde geschlossen. */
  onClose?: () => void;
};

/**
 * Route, unter der Connect den T3-Stream bereitstellen soll.
 * Wunsch an A37 — sie existiert heute noch nicht.
 */
export const T3_PREVIEW_STREAM_PATH = "/api/t3/preview-stream/ws";

/**
 * Öffnet den T3-Preview-Stream.
 *
 * `threadId`/`tabId` sind T3-Bezeichner. Fehlen sie oder ist der Server
 * nicht erreichbar, wird `onError` gerufen und **kein** Stream offen gelassen.
 */
export function openT3PreviewStream(
  input: {
    threadId: string | null;
    tabId: string | null;
    interactive?: boolean;
  },
  callbacks: T3PreviewCallbacks,
): T3PreviewHandle | null {
  if (typeof window === "undefined") return null;
  if (!input.threadId || !input.tabId) {
    callbacks.onError?.(
      "T3-Vorschau braucht Thread und Tab — bitte den Browser im T3-Fenster öffnen.",
    );
    return null;
  }
  if (typeof WebSocket === "undefined") {
    callbacks.onError?.("Dieser Browser unterstützt keine WebSockets.");
    return null;
  }

  const params = new URLSearchParams({
    threadId: input.threadId,
    tabId: input.tabId,
    interactive: input.interactive === false ? "false" : "true",
  });
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${scheme}//${window.location.host}${T3_PREVIEW_STREAM_PATH}?${params}`;

  let closed = false;
  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
  } catch {
    callbacks.onError?.("T3-Vorschau konnte nicht verbunden werden.");
    return null;
  }
  socket.binaryType = "blob";

  socket.onmessage = (event: MessageEvent) => {
    if (closed) return;
    if (typeof event.data === "string") {
      try {
        const parsed = JSON.parse(event.data) as T3PreviewJsonFrame;
        callbacks.onJson?.(parsed);
      } catch {
        /* kein JSON — ignorieren */
      }
      return;
    }
    if (event.data instanceof Blob) {
      callbacks.onFrame(event.data);
    }
  };
  socket.onerror = () => {
    if (closed) return;
    callbacks.onError?.(
      "T3-Vorschau nicht erreichbar — die Brücke stellt den Preview-Stream noch nicht bereit.",
    );
  };
  socket.onclose = () => {
    if (closed) return;
    callbacks.onClose?.();
  };

  return {
    close: () => {
      closed = true;
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    },
  };
}
