/**
 * Per-note editor preferences.
 *
 * Stored in `localStorage` under `connect.vault.prefs.v1` as a flat map keyed by
 * the file's relative path. Anything not in the map uses the default below,
 * which is what a freshly opened file gets. The page width drives the rendered
 * column of `VaultNoteEditor`; favourite / lock / history are surfaced in the
 * editor toolbar.
 *
 * History snapshots live next to the path: each save pushes the *previous*
 * content into a capped ring buffer so "Änderungsverlauf" can show the last few
 * versions of a note without depending on git.
 */

export const VAULT_PREFS_KEY = "connect.vault.prefs.v1";

export const PAGE_WIDTHS = ["narrow", "medium", "wide", "full"] as const;
export type PageWidth = (typeof PAGE_WIDTHS)[number];

export type VaultPrefs = {
  /** Page width in pixels; rendered by `VaultNoteEditor`. */
  width: PageWidth;
  /** Pinned to the sidebar — sorted to the top, surfaced in the tree. */
  favorite: boolean;
  /** Soft lock: edits are blocked until the user unlocks. */
  locked: boolean;
  /**
   * Last few versions of the note content, newest first. Capped at 10 entries
   * so the localStorage footprint stays bounded.
   */
  history: { at: string; content: string }[];
};

export const DEFAULT_PREFS: VaultPrefs = {
  width: "medium",
  favorite: false,
  locked: false,
  history: [],
};

const HISTORY_CAP = 10;

type Stored = Record<string, VaultPrefs>;

/**
 * One bag of prefs is shared by every caller in the process. In the browser
 * the bag lives in `localStorage`; in Node (tests, scripts) the module
 * falls back to an in-process `Map` so the same code can run headlessly
 * without a polyfill.
 */
let inMemoryStore: Map<string, string> | null = null;

function getStore(): Storage | null {
  if (typeof window !== "undefined") return window.localStorage;
  if (typeof globalThis !== "undefined" && globalThis.localStorage) {
    return globalThis.localStorage as Storage;
  }
  if (!inMemoryStore) inMemoryStore = new Map();
  return {
    getItem: (key) => (inMemoryStore!.has(key) ? inMemoryStore!.get(key)! : null),
    setItem: (key, value) => {
      inMemoryStore!.set(key, String(value));
    },
    removeItem: (key) => {
      inMemoryStore!.delete(key);
    },
    clear: () => inMemoryStore!.clear(),
    key: (i) => Array.from(inMemoryStore!.keys())[i] ?? null,
    get length() {
      return inMemoryStore!.size;
    },
  } as Storage;
}

function read(): Stored {
  const store = getStore();
  if (!store) return {};
  try {
    const raw = store.getItem(VAULT_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as Stored;
  } catch {
    return {};
  }
}

function write(value: Stored): void {
  const store = getStore();
  if (!store) return;
  try {
    store.setItem(VAULT_PREFS_KEY, JSON.stringify(value));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("connect: vault-prefs"));
    }
  } catch {
    /* quota — fall back to next save */
  }
}

/** Reads the prefs for `path`, filling missing fields with `DEFAULT_PREFS`. */
export function getVaultPrefs(path: string): VaultPrefs {
  const all = read();
  const found = all[path];
  if (!found) return { ...DEFAULT_PREFS };
  return {
    ...DEFAULT_PREFS,
    ...found,
    history: Array.isArray(found.history) ? found.history.slice(0, HISTORY_CAP) : [],
  };
}

/** Patches one note's prefs and writes back. */
export function setVaultPrefs(path: string, patch: Partial<VaultPrefs>): VaultPrefs {
  const all = read();
  const next: VaultPrefs = {
    ...(all[path] ?? DEFAULT_PREFS),
    ...patch,
    history: Array.isArray(patch.history)
      ? patch.history.slice(0, HISTORY_CAP)
      : (all[path]?.history ?? DEFAULT_PREFS.history).slice(0, HISTORY_CAP),
  };
  all[path] = next;
  write(all);
  return next;
}

/**
 * Pushes the current content into the history before it is replaced.
 *
 * Only kept when the new content actually differs, so pressing save repeatedly
 * does not fill the ring buffer with the same text. Snapshots older than the
 * cap are dropped from the tail.
 */
export function pushVaultHistory(
  path: string,
  previousContent: string,
): VaultPrefs {
  const current = getVaultPrefs(path);
  if (current.history[0]?.content === previousContent) return current;
  const history = [
    { at: new Date().toISOString(), content: previousContent },
    ...current.history,
  ].slice(0, HISTORY_CAP);
  return setVaultPrefs(path, { history });
}

/** Listens for prefs changes — used by the editor to re-render when toggled. */
export function subscribeVaultPrefs(handler: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const event = () => handler();
  window.addEventListener("connect: vault-prefs", event);
  window.addEventListener("storage", event);
  return () => {
    window.removeEventListener("connect: vault-prefs", event);
    window.removeEventListener("storage", event);
  };
}

/**
 * Reads all entries once. The sidebar uses it to compute a `favorite` sort
 * without subscribing to every individual path.
 */
export function listVaultPrefs(): Stored {
  return read();
}

/**
 * Which widths mean which pixel caps in the editor.
 *
 * "narrow" matches what the editor already had (760px max-width). "medium" is
 * a sensible middle ground for prose with code blocks. "wide" widens to 960px,
 * which is comfortable for tables. "full" removes the cap so a table can use
 * the whole page.
 */
export const PAGE_WIDTH_PX: Record<PageWidth, string> = {
  narrow: "640px",
  medium: "760px",
  wide: "960px",
  full: "100%",
};