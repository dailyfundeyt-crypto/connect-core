/**
 * A40 — Aufbau der T3-Testinstanz.
 *
 * Baut die Connect-Brücke in-process gegen den Mock-Sidecar und stellt die
 * Bausteine bereit, die die E2E-Szenarien brauchen:
 *
 *   - Flag-Steuerung (ein Ort, an dem alle Flags gesetzt werden)
 *   - Brücke (Threads, Scheduler, Control, Usage, Rotation)
 *   - Routen (Hono) für HTTP-Szenarien
 *
 * Wichtig: Diese Testinstanz benutzt **kein** Stefans Helium-Profil, keine
 * Cookies, keine Tokens und keine echte Datenbank. Der Mock-Sidecar kennt
 * keine Anmeldedaten (siehe `mock-sidecar.ts`).
 */

import { T3ControlService } from "../../../apps/server/src/t3-bridge/control";
import { getT3Flag } from "../../../apps/server/src/t3-bridge/contracts";
import { createMockSocketFactory, T3MockSidecar } from "./mock-sidecar";

/**
 * Setzt die T3-Flags für einen Testlauf.
 *
 * `all` schaltet alles ein. Für einzelne Flags wird der Name (ohne `no-`)
 * oder `no-<name>` benutzt. Der Aufrufer bekommt eine Funktion zurück, die
 * den Ausgangszustand wiederherstellt — so bleibt ein Testlauf ohne
 * Nebenwirkungen für die folgenden.
 */
export function setT3Flags(flags: string): () => void {
  const original = process.env.CONNECT_FLAGS_T3;
  const originalGlobal = (globalThis as { __CONNECT_FLAGS_T3?: unknown })
    .__CONNECT_FLAGS_T3;
  process.env.CONNECT_FLAGS_T3 = flags;
  (globalThis as { __CONNECT_FLAGS_T3?: unknown }).__CONNECT_FLAGS_T3 = undefined;
  return () => {
    if (original === undefined) delete process.env.CONNECT_FLAGS_T3;
    else process.env.CONNECT_FLAGS_T3 = original;
    (globalThis as { __CONNECT_FLAGS_T3?: unknown }).__CONNECT_FLAGS_T3 =
      originalGlobal;
  };
}

/**
 * Schaltet die Flags über die Runtime-Injektion (das, was der Browser tut).
 *
 * Die Umgebungsvariable reicht für den Server, aber die App liest die
 * Runtime-Injektion zuerst. Für Szenarien, die den Browser-Realismus prüfen
 * sollen, ist das der richtige Weg.
 */
export function setT3GlobalFlags(
  flags: Partial<Record<string, boolean>>,
): () => void {
  const holder = globalThis as { __CONNECT_FLAGS_T3?: unknown };
  const original = holder.__CONNECT_FLAGS_T3;
  holder.__CONNECT_FLAGS_T3 = flags;
  return () => {
    holder.__CONNECT_FLAGS_T3 = original;
  };
}

/** Der Mock-Sidecar plus alles, was die Brücke für einen Test braucht. */
export type T3TestInstance = {
  readonly sidecar: T3MockSidecar;
  readonly control: T3ControlService;
  readonly rpcClient: import("../../../apps/server/src/t3-bridge/rpc").T3RpcClient;
  readonly restoreFlags: () => void;
  close: () => void;
};

/**
 * Baut eine T3-Testinstanz.
 *
 * Der Sidecar läuft auf `http://127.0.0.1:3773` — das ist die Adresse, die der
 * echte Sidecar benutzt. Der Port wird **nicht** gebunden: die WebSocket-Fabrik
 * wird injiziert, also entsteht kein Netzsocket und keine Portbelegung.
 */
export async function createT3TestInstance(
  options: { readonly flags?: string } = {},
): Promise<T3TestInstance> {
  const restoreFlags = setT3Flags(options.flags ?? "all");
  const sidecar = new T3MockSidecar();
  const socketFactory = createMockSocketFactory(sidecar);

  const { T3RpcClient } = await import(
    "../../../apps/server/src/t3-bridge/rpc"
  );
  const rpcClient = new T3RpcClient({
    origin: "http://127.0.0.1:3773",
    wsTicket: "a40-test-ticket",
    webSocketFactory: socketFactory,
    requestTimeoutMs: 5_000,
    connectTimeoutMs: 5_000,
  });

  await rpcClient.connect();

  const control = new T3ControlService({
    rpcClient: rpcClient as never,
    enforceBridgeFlag: false,
  });

  return {
    sidecar,
    control,
    rpcClient,
    restoreFlags,
    close: () => {
      rpcClient.close();
      restoreFlags();
    },
  };
}

/** Liest ein Flag in der Testinstanz. */
export const flagEnabled = (name: Parameters<typeof getT3Flag>[0]): boolean =>
  getT3Flag(name);
