/**
 * API keys → encrypted server vault.
 *
 * Manus, Browser-Use (Anchor), ElevenLabs, Ziel AI and Codex keys used to live only in this browser
 * profile's localStorage, so the App window, the Notch overlay and Helium each had their own (or
 * none) and nothing was backed up. The server now keeps them encrypted in the credentials table
 * (`/api/agent-hub/key-vault`, KEY_ENCRYPTION_KEY); localStorage stays as a synchronous mirror so the
 * existing getters (`getGlobalApiKeys`, `getAgentApiKey`, `getVoiceSettings`) keep working.
 *
 * - On load: server → localStorage. The first time a profile syncs, local keys the server does not
 *   have yet are merged in and uploaded (one-time migration). Afterwards the server wins, so a key
 *   removed in one window is removed everywhere.
 * - On change (the stores' own change events): localStorage → server, debounced.
 */
import { tryClient } from "@/lib/client";

type Slot = { key: string; events: string[] };

const SLOTS: Slot[] = [
  { key: "connect.global-api-keys", events: ["connect-agent-api-keys-changed"] },
  { key: "connect.agent-api-keys", events: ["connect-agent-api-keys-changed"] },
  { key: "connect.voice-settings", events: ["connect-voice-settings-changed"] },
];
const CHANGE_EVENTS = [...new Set(SLOTS.flatMap((slot) => slot.events))];
const MIGRATED_FLAG = "connect.key-vault.migrated.v1";
const PENDING_KEY = "connect.key-vault.pending";
const ENDPOINT = "/api/agent-hub/key-vault";

let hydrated = false;
let hydrating = false;
let applying = false;
let retryTimer: number | null = null;
let retries = 0;
let pushTimer: number | null = null;
const lastServer = new Map<string, string | null>();
/** localStorage as it was when this window started (to tell real edits from no-op change events). */
const atStart = new Map<string, string | null>();

export type KeyVaultState = "idle" | "synced" | "offline" | "forbidden";
let state: KeyVaultState = "idle";
export const keyVaultState = () => state;

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string | null) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}

function parse(raw: string | null): unknown {
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/** True when the value carries no non-empty string anywhere (nothing worth storing). */
function hasSecrets(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.some(hasSecrets);
  if (value && typeof value === "object") return Object.values(value).some(hasSecrets);
  return false;
}

/** Server wins on conflict; local fills what the server lacks; arrays are unioned. */
function merge(server: unknown, local: unknown): unknown {
  if (server === undefined || server === null) return local;
  if (local === undefined || local === null) return server;
  if (Array.isArray(server) && Array.isArray(local)) {
    // Voice keys are { id, label, key, charsUsed }: same id = same key (server copy wins), so usage
    // counters drifting apart in two windows never duplicate an entry.
    const identity = (item: unknown) =>
      item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string"
        ? `id:${(item as { id: string }).id}`
        : item && typeof item === "object" && typeof (item as { key?: unknown }).key === "string"
          ? `key:${(item as { key: string }).key}`
          : JSON.stringify(item);
    const seen = new Set(server.map(identity));
    return [...server, ...local.filter((item) => !seen.has(identity(item)))];
  }
  if (typeof server === "object" && typeof local === "object" && !Array.isArray(server) && !Array.isArray(local)) {
    const out: Record<string, unknown> = { ...(local as Record<string, unknown>) };
    for (const [key, value] of Object.entries(server as Record<string, unknown>)) {
      out[key] = key in out ? merge(value, out[key]) : value;
    }
    return out;
  }
  if (typeof server === "string" && server.trim() === "") return local;
  return server;
}

function pendingSlots(): Set<string> {
  const raw = parse(readLocal(PENDING_KEY));
  return new Set(Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : []);
}

function setPending(slots: Set<string>) {
  writeLocal(PENDING_KEY, slots.size ? JSON.stringify([...slots]) : null);
}

async function pushSlot(key: string): Promise<boolean> {
  // Sent as-is, emptied keys included: an explicit "no key" on the server keeps other windows from
  // re-uploading the key that was just removed.
  const value = readLocal(key);
  if (lastServer.has(key) && lastServer.get(key) === value) return true;
  try {
    const response = await tryClient(`${ENDPOINT}/${encodeURIComponent(key)}`, { method: "PUT", body: { value } });
    if (!response.ok) return false;
    lastServer.set(key, value);
    return true;
  } catch {
    return false;
  }
}

async function pushAll() {
  const pending = pendingSlots();
  for (const slot of SLOTS) {
    const ok = await pushSlot(slot.key);
    if (ok) pending.delete(slot.key);
    else pending.add(slot.key);
  }
  setPending(pending);
}

function schedulePush() {
  if (applying) return;
  if (!hydrated) {
    // Not synced yet: remember which slots this window really changed, the hydrate uploads them.
    const changed = SLOTS.filter((slot) => readLocal(slot.key) !== atStart.get(slot.key)).map((slot) => slot.key);
    if (changed.length) setPending(new Set([...pendingSlots(), ...changed]));
    return;
  }
  if (pushTimer != null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    void pushAll();
  }, 400);
}

function scheduleRetry() {
  if (retryTimer != null || retries >= 120) return;
  retries += 1;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void hydrateKeyVault();
  }, 15_000);
}

/** Pull the vault into localStorage (and migrate local-only keys up once). Safe to call repeatedly. */
export async function hydrateKeyVault(): Promise<void> {
  if (typeof window === "undefined" || hydrated || hydrating) return;
  hydrating = true;
  try {
    let response: Response;
    try {
      response = await tryClient(ENDPOINT);
    } catch {
      state = "offline";
      scheduleRetry();
      return;
    }
    if (response.status === 403) {
      state = "forbidden";
      return;
    }
    if (!response.ok) {
      // 401 before sign-in, 503 while the server boots: try again shortly.
      state = "offline";
      scheduleRetry();
      return;
    }
    const body = (await response.json().catch(() => null)) as { entries?: Record<string, string> } | null;
    const entries = body?.entries ?? {};
    const migrated = readLocal(MIGRATED_FLAG) === "1";
    const pending = pendingSlots();
    const events = new Set<string>();
    const uploads: string[] = [];

    for (const slot of SLOTS) {
      const serverRaw = typeof entries[slot.key] === "string" ? entries[slot.key]! : null;
      const localRaw = readLocal(slot.key);
      lastServer.set(slot.key, serverRaw);
      let next: string | null;
      if (pending.has(slot.key)) {
        // Local edits (removals included) that never reached the server: this window's copy wins.
        next = localRaw ?? serverRaw;
      } else if (!migrated) {
        // First sync of this profile: keep the server's keys, add the ones only this profile had.
        const merged = merge(parse(serverRaw), parse(localRaw));
        next = merged === undefined ? null : typeof merged === "string" ? merged : JSON.stringify(merged);
      } else {
        next = serverRaw ?? localRaw;
      }
      if (next != null && next !== localRaw) {
        applying = true;
        writeLocal(slot.key, next);
        applying = false;
        slot.events.forEach((event) => events.add(event));
      }
      // Upload what differs; when the server has nothing yet, only if there is a real key to keep.
      if (next != null && next !== serverRaw && (serverRaw != null || hasSecrets(parse(next)))) uploads.push(slot.key);
    }

    hydrated = true;
    state = "synced";
    writeLocal(MIGRATED_FLAG, "1");
    applying = true;
    for (const event of events) window.dispatchEvent(new Event(event));
    applying = false;

    const stillPending = new Set<string>();
    for (const key of uploads) if (!(await pushSlot(key))) stillPending.add(key);
    setPending(stillPending);
  } finally {
    hydrating = false;
  }
}

let started = false;

/** Called once from main.tsx. */
export function startKeyVaultSync() {
  if (typeof window === "undefined" || started) return;
  started = true;
  for (const slot of SLOTS) atStart.set(slot.key, readLocal(slot.key));
  for (const event of CHANGE_EVENTS) window.addEventListener(event, schedulePush);
  // Another tab of the same profile wrote a key.
  window.addEventListener("storage", (event) => {
    if (event.key && SLOTS.some((slot) => slot.key === event.key)) schedulePush();
  });
  // Pick up keys another window (Notch overlay, Helium) saved meanwhile.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (hydrated) void refreshKeyVault();
    else void hydrateKeyVault(); // e.g. signed in meanwhile
  });
  void hydrateKeyVault();
}

/** Re-read the vault (server wins) — used when this window comes back into view. */
export async function refreshKeyVault(): Promise<void> {
  if (!hydrated || pendingSlots().size || pushTimer != null) return;
  try {
    const response = await tryClient(ENDPOINT);
    if (!response.ok) return;
    const body = (await response.json().catch(() => null)) as { entries?: Record<string, string> } | null;
    const entries = body?.entries ?? {};
    const events = new Set<string>();
    for (const slot of SLOTS) {
      const serverRaw = typeof entries[slot.key] === "string" ? entries[slot.key]! : null;
      lastServer.set(slot.key, serverRaw);
      if (serverRaw != null && serverRaw !== readLocal(slot.key)) {
        applying = true;
        writeLocal(slot.key, serverRaw);
        applying = false;
        slot.events.forEach((event) => events.add(event));
      }
    }
    applying = true;
    for (const event of events) window.dispatchEvent(new Event(event));
    applying = false;
  } catch {
    /* offline — keep the mirror */
  }
}
