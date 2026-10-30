/**
 * T3-WS-RPC — Protokoll-Kern (Effect-RPC, JSON-Serialisierung).
 *
 * Lane: A03 (Welle W1).
 *
 * T3 spricht „Effect-RPC" (`effect/rpc`) über WebSockets mit JSON-Serialisierung
 * (`RpcSerialization.layerJson`). Weil die Nachrichten *ohne Framing* über die
 * Leitung gehen, ist jeder WebSocket-Frame genau eine JSON-Nachricht.
 *
 * Nachrichten vom Client (`FromClientEncoded`):
 *   { _tag: "Request",  id, tag, payload, headers }
 *   { _tag: "Ack",      requestId }
 *   { _tag: "Interrupt",requestId, interruptors }
 *   { _tag: "Ping" } / { _tag: "Eof" }
 *
 * Nachrichten vom Server (`FromServerEncoded`):
 *   { _tag: "Chunk",  requestId, values: [...] }   — ein Batch von Stream-Werten
 *   { _tag: "Exit",   requestId, exit: { _tag: "Success", value } | { _tag: "Failure", cause: [...] } }
 *   { _tag: "Defect", defect }
 *   { _tag: "Pong" }
 *
 * Die `exit.cause` trägt typisierte Fehler als `{ _tag: "Fail", error }` und
 * Defects als `{ _tag: "Die", defect }`.
 */

/** Tag einer Client→Server-Nachricht. */
export type T3ClientMessage =
  | {
      readonly _tag: "Request";
      readonly id: string;
      readonly tag: string;
      readonly payload: unknown;
      readonly headers: ReadonlyArray<readonly [string, string]>;
    }
  | { readonly _tag: "Ack"; readonly requestId: string }
  | { readonly _tag: "Interrupt"; readonly requestId: string; readonly interruptors: number[] }
  | { readonly _tag: "Ping" }
  | { readonly _tag: "Eof" };

/** Fehler-Eintrag im `exit.cause` eines typisierten RPC-Fehlers. */
export type T3ExitCauseEntry =
  | { readonly _tag: "Fail"; readonly error: unknown }
  | { readonly _tag: "Die"; readonly defect: unknown }
  | { readonly _tag: "Interrupt"; readonly fiberId?: number | null };

/** Terminale Antwort auf einen Request. */
export type T3Exit =
  | { readonly _tag: "Success"; readonly value: unknown }
  | { readonly _tag: "Failure"; readonly cause: ReadonlyArray<T3ExitCauseEntry> };

/** Tag einer Server→Client-Nachricht. */
export type T3ServerMessage =
  | { readonly _tag: "Chunk"; readonly requestId: string; readonly values: ReadonlyArray<unknown> }
  | { readonly _tag: "Exit"; readonly requestId: string; readonly exit: T3Exit }
  | { readonly _tag: "Defect"; readonly defect: unknown }
  | { readonly _tag: "Pong" }
  | { readonly _tag: "ClientProtocolError"; readonly error: unknown }
  | { readonly _tag: "Request"; readonly id: string; readonly tag: string; readonly payload: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Prüft, ob eine dekodierte Nachricht eine Server-Nachricht ist. */
export function isT3ServerMessage(value: unknown): value is T3ServerMessage {
  if (!isRecord(value)) return false;
  const tag = value._tag;
  return (
    tag === "Chunk" ||
    tag === "Exit" ||
    tag === "Defect" ||
    tag === "Pong" ||
    tag === "ClientProtocolError" ||
    tag === "Request"
  );
}

/**
 * Zerlegt eine rohe WS-Nachricht in Effect-RPC-Nachrichten.
 *
 * Die JSON-Serialisierung von Effect kennt kein Framing, liefert aber ein
 * Array, wenn mehrere Nachrichten in einem Frame stecken. Wir behandeln
 * beides: Einzelobjekt und Array.
 */
export function decodeT3Messages(raw: string): T3ServerMessage[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const candidates = Array.isArray(parsed) ? parsed : [parsed];
  return candidates.filter(isT3ServerMessage);
}

/** Kodiert eine Client-Nachricht als JSON-String (ohne Newline). */
export function encodeT3Message(message: T3ClientMessage): string {
  return JSON.stringify(message);
}

/** Baut eine Request-Nachricht. */
export function t3Request(
  id: string,
  tag: string,
  payload: unknown,
  headers: ReadonlyArray<readonly [string, string]> = [],
): T3ClientMessage {
  return { _tag: "Request", id, tag, payload, headers };
}

/**
 * Liest den Fehler aus einem fehlgeschlagenen Exit.
 *
 * `Fail` trägt den typisierten RPC-Fehler (Effect-Schema-TaggedError, also
 * mit `_tag`), `Die` einen Defekt. Beide werden als `unknown` herausgegeben —
 * der Aufrufer entscheidet, wie er sie behandelt.
 */
export function readT3ExitFailure(exit: T3Exit): {
  readonly error: unknown;
  readonly isDefect: boolean;
} | null {
  if (exit._tag !== "Failure") return null;
  const fail = exit.cause.find((entry) => entry._tag === "Fail");
  if (fail) return { error: fail.error, isDefect: false };
  const die = exit.cause.find((entry) => entry._tag === "Die");
  if (die) return { error: die.defect, isDefect: true };
  return null;
}

/** Liest den Erfolgswert eines Exits (oder `undefined` bei Fehler). */
export function readT3ExitValue(exit: T3Exit): unknown {
  return exit._tag === "Success" ? exit.value : undefined;
}
