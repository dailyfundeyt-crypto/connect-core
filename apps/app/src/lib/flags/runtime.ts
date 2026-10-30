/**
 * The v06 and T3 flags, as the server resolved them for this process.
 *
 * `CONNECT_FLAGS_V06` and `CONNECT_FLAGS_T3` are server configuration. The browser
 * bundle cannot see them and Vite does not inline them, so without this bookkeeping
 * `getFlag()` / `getT3Flag()` in the app could only ever answer with the compiled
 * defaults — every flag off. That is exactly why finished surfaces stayed invisible:
 * the server was switched on, and the client could not have learned otherwise.
 *
 * Two requests, before the router mounts, into the keys the getters already read.
 * Every existing call site keeps working unchanged; no component needs to fetch
 * flags of its own.
 */
import { API_PATHS_V06 } from "@/contracts/v06/api-paths";
import type { FlagV06Key } from "@/contracts/v06/flags";
import type { T3FeatureFlagName } from "@/lib/t3/contracts";

export type RuntimeFlags = Partial<Record<FlagV06Key, boolean>>;
export type T3RuntimeFlags = Partial<Record<T3FeatureFlagName, boolean>>;

/**
 * How long the first paint waits for the answer.
 *
 * A local round trip is milliseconds; the bound exists so a stopped or wedged server cannot hold
 * the app on a blank screen. On timeout the compiled defaults stand: the product is still usable,
 * the v06 / T3 surfaces are simply off — the same state as before this module existed.
 */
const TIMEOUT_MS = 1200;

const T3_FLAGS_PATH = "/api/t3/flags";

/** Must match the keys `getFlag()` / `getT3Flag()` and the early theme script in index.html read. */
type FlagWindow = Window & {
  __CONNECT_FLAGS_V06?: RuntimeFlags;
  __CONNECT_FLAGS_T3?: T3RuntimeFlags;
};

let inflight: Promise<RuntimeFlags | null> | null = null;

function flagWindow(): FlagWindow | null {
  return typeof window === "undefined" ? null : (window as FlagWindow);
}

/** The server's v06 answer once it has arrived, or null while the app is still asking. */
export function runtimeFlags(): RuntimeFlags | null {
  return flagWindow()?.__CONNECT_FLAGS_V06 ?? null;
}

/** The server's T3 answer once it has arrived, or null while the app is still asking. */
export function runtimeT3Flags(): T3RuntimeFlags | null {
  return flagWindow()?.__CONNECT_FLAGS_T3 ?? null;
}

function isFlagMap(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestJsonFlags(
  win: FlagWindow,
  path: string,
  assign: (payload: Record<string, unknown>) => void,
): Promise<Record<string, unknown> | null> {
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timer = controller === null ? null : setTimeout(() => controller.abort(), TIMEOUT_MS);

  return fetch(path, {
    credentials: "include",
    cache: "no-store",
    ...(controller === null ? {} : { signal: controller.signal }),
  })
    .then(async (response) => (response.ok ? await response.json() : null))
    .then((payload: unknown) => {
      if (!isFlagMap(payload)) return null;
      assign(payload);
      return payload;
    })
    .catch(() => null)
    .finally(() => {
      if (timer !== null) clearTimeout(timer);
    });
}

function requestAllFlags(): Promise<RuntimeFlags | null> {
  const win = flagWindow();
  if (!win) return Promise.resolve(null);

  return Promise.all([
    requestJsonFlags(win, API_PATHS_V06.flags, (payload) => {
      win.__CONNECT_FLAGS_V06 = payload as RuntimeFlags;
    }),
    requestJsonFlags(win, T3_FLAGS_PATH, (payload) => {
      win.__CONNECT_FLAGS_T3 = payload as T3RuntimeFlags;
    }),
  ]).then(([v06]) => (v06 as RuntimeFlags | null) ?? null);
}

/**
 * Ask the server once and hand back its v06 answer, or null when it could not be reached.
 *
 * Repeated calls share the first request, so a second caller cannot start a second round trip and
 * two answers cannot disagree. The T3 snapshot is loaded in the same round.
 */
export function loadRuntimeFlags(): Promise<RuntimeFlags | null> {
  if (!inflight) inflight = requestAllFlags();
  return inflight;
}
