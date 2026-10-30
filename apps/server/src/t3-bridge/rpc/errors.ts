/**
 * T3-WS-RPC — Fehlertypen des Clients.
 *
 * Lane: A03 (Welle W1).
 *
 * Alle Fehler des Clients tragen `_tag`, damit sie ohne `instanceof` über
 * Lane-Grenzen hinweg erkannt werden können (Connect nutzt an vielen Stellen
 * Fehler-Objekte statt Klassen).
 */

/** Basis-Fehler des T3-Clients. */
export type T3RpcError = {
  readonly _tag: string;
  readonly message: string;
  readonly [key: string]: unknown;
};

/** Der Sidecar ist nicht erreichbar (Connection refused, Timeout beim Öffnen). */
export type T3RpcTransportError = T3RpcError & {
  readonly _tag: "T3RpcTransportError";
  readonly origin: string;
  readonly cause?: unknown;
};

/** Der Server hat die Anfrage nicht rechtzeitig beantwortet. */
export type T3RpcTimeoutError = T3RpcError & {
  readonly _tag: "T3RpcTimeoutError";
  readonly method: string;
  readonly timeoutMs: number;
};

/** Der Server hat einen typisierten RPC-Fehler zurückgegeben. */
export type T3RpcRemoteError = T3RpcError & {
  readonly _tag: "T3RpcRemoteError";
  readonly method: string;
  readonly error: unknown;
  /** Der `_tag` des T3-Fehlers, z. B. `EnvironmentAuthorizationError`. */
  readonly remoteTag: string | null;
};

/** Der Server hat einen Defect geschickt (kein typisierter Fehler). */
export type T3RpcDefectError = T3RpcError & {
  readonly _tag: "T3RpcDefectError";
  readonly method: string;
  readonly defect: unknown;
};

/** Der Server hat die WS-Verbindung geschlossen. */
export type T3RpcClosedError = T3RpcError & {
  readonly _tag: "T3RpcClosedError";
  readonly code: number | null;
  readonly reason: string | null;
};

/** Der Client ist nicht verbunden (kein Socket, kein laufender Request). */
export type T3RpcNotConnectedError = T3RpcError & {
  readonly _tag: "T3RpcNotConnectedError";
  readonly origin: string;
};

/** Die Authentifizierung am Sidecar ist fehlgeschlagen. */
export type T3RpcAuthError = T3RpcError & {
  readonly _tag: "T3RpcAuthError";
  readonly status: number | null;
  readonly cause?: unknown;
};

/** Die Contract-Version des Sidecars passt nicht zu der erwarteten. */
export type T3RpcContractMismatchError = T3RpcError & {
  readonly _tag: "T3RpcContractMismatchError";
  readonly expected: string;
  readonly actual: string | null;
};

/** Der Aufrufer hat die Operation abgebrochen (Timeout, close(), abort). */
export type T3RpcAbortError = T3RpcError & {
  readonly _tag: "T3RpcAbortError";
  readonly method: string;
};

/** Jeder Fehler des T3-Clients. */
export type T3RpcClientError =
  | T3RpcTransportError
  | T3RpcTimeoutError
  | T3RpcRemoteError
  | T3RpcDefectError
  | T3RpcClosedError
  | T3RpcNotConnectedError
  | T3RpcAuthError
  | T3RpcContractMismatchError
  | T3RpcAbortError;

/** Prüft, ob ein Wert ein Fehler des T3-Clients ist. */
export function isT3RpcError(value: unknown): value is T3RpcClientError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { _tag?: unknown })._tag === "string" &&
    (value as { message?: unknown }).message !== undefined
  );
}

/** Liest den `_tag` eines typisierten T3-Fehlers aus einem RPC-Fehlerobjekt. */
export function readRemoteTag(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const tag = (error as { _tag?: unknown })._tag;
  return typeof tag === "string" ? tag : null;
}
