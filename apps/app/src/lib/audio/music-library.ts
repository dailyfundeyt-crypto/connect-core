import { useEffect, useState } from "react";
import { BRAIN_FM_TRACKS, type BrainFmTrack } from "@/lib/audio/brainfm-tracks";
import { scheduleConnectWorkspacePush } from "@/lib/companies/workspace-sync";

/**
 * Musik-Bibliothek (Executor helium-music, 17.10.2026): vorgefertigte Brain.fm-Ordner,
 * eigene Songs vom PC (lokaler Server /api/music/local, auch über den QR-Tunnel) und eigene
 * Ordner/Playlists. Playlists sind reine Zuordnungen (Titel-IDs) im Workspace
 * (connect.music.playlists) → PC und Handy zeigen dasselbe. Es werden keine Dateien bewegt.
 */

export const MUSIC_PLAYLISTS_KEY = "connect.music.playlists";
export const MUSIC_PLAYLISTS_EVENT = "connect-music-playlists-changed";
export const PC_PREFIX = "pc:";

export type MusicPlaylist = { id: string; name: string; trackIds: string[] };
export type LocalMusicTrack = { id: string; title: string; filename: string; folder: string; size: number; mtime: number; type: string };
export type LocalMusicState = { status: "loading" | "ok" | "unavailable"; tracks: LocalMusicTrack[]; folders: string[] };

const ZONE_ORDER = ["alpha", "beta", "gamma", "theta", "delta", "bonus"] as const;
const ZONE_NAMES: Record<string, string> = { alpha: "Alpha", beta: "Beta", gamma: "Gamma", theta: "Theta", delta: "Delta", bonus: "Bonus" };

/** Vorgefertigte Ordner (Zonen) – bleiben immer verfügbar. */
export function builtinFolders(): { id: string; name: string; tracks: BrainFmTrack[] }[] {
  return ZONE_ORDER.map((z) => ({ id: `zone:${z}`, name: ZONE_NAMES[z] ?? z, tracks: BRAIN_FM_TRACKS.filter((t) => t.zone === z) })).filter((f) => f.tracks.length > 0);
}

export function localToTrack(t: LocalMusicTrack): BrainFmTrack {
  return {
    id: `${PC_PREFIX}${t.id}`,
    title: t.title,
    zone: "bonus",
    zoneLabel: "PC-Musik",
    zoneHz: "PC",
    promptTitle: t.filename,
    description: t.folder,
    audioUrl: `/api/music/local/file/${encodeURIComponent(t.id)}`,
    color: "#22c55e",
  };
}

export function resolveTrack(id: string, local: LocalMusicTrack[]): BrainFmTrack | null {
  if (id.startsWith(PC_PREFIX)) {
    const l = local.find((x) => `${PC_PREFIX}${x.id}` === id);
    return l ? localToTrack(l) : null;
  }
  return BRAIN_FM_TRACKS.find((t) => t.id === id) ?? null;
}

// ── Playlists ────────────────────────────────────────────────────────────────

function normalize(raw: unknown): MusicPlaylist[] {
  if (!Array.isArray(raw)) return [];
  const out: MusicPlaylist[] = [];
  for (const p of raw as Partial<MusicPlaylist>[]) {
    if (!p || typeof p.id !== "string" || typeof p.name !== "string") continue;
    const ids = Array.isArray(p.trackIds) ? p.trackIds.filter((x): x is string => typeof x === "string") : [];
    out.push({ id: p.id, name: p.name, trackIds: [...new Set(ids)] });
  }
  return out;
}

export function getPlaylists(): MusicPlaylist[] {
  if (typeof window === "undefined") return [];
  try {
    return normalize(JSON.parse(window.localStorage.getItem(MUSIC_PLAYLISTS_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function setPlaylists(next: MusicPlaylist[]) {
  try {
    window.localStorage.setItem(MUSIC_PLAYLISTS_KEY, JSON.stringify(normalize(next)));
  } catch {
    /* quota */
  }
  window.dispatchEvent(new Event(MUSIC_PLAYLISTS_EVENT));
  scheduleConnectWorkspacePush();
}

export function subscribePlaylists(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === MUSIC_PLAYLISTS_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(MUSIC_PLAYLISTS_EVENT, cb);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(MUSIC_PLAYLISTS_EVENT, cb);
  };
}

export function usePlaylists(): MusicPlaylist[] {
  const [p, setP] = useState(() => getPlaylists());
  useEffect(() => subscribePlaylists(() => setP(getPlaylists())), []);
  return p;
}

const newId = () => `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function createPlaylist(name: string, trackIds: string[] = []): MusicPlaylist {
  const p = { id: newId(), name: name.trim() || "Neuer Ordner", trackIds };
  setPlaylists([...getPlaylists(), p]);
  return p;
}
export function renamePlaylist(id: string, name: string) {
  setPlaylists(getPlaylists().map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)));
}
/** Entfernt nur die Zuordnung (keine Dateien). */
export function deletePlaylist(id: string) {
  setPlaylists(getPlaylists().filter((p) => p.id !== id));
}
export function addToPlaylist(id: string, trackIds: string[]) {
  setPlaylists(getPlaylists().map((p) => (p.id === id ? { ...p, trackIds: [...new Set([...p.trackIds, ...trackIds])] } : p)));
}
export function removeFromPlaylist(id: string, trackId: string) {
  setPlaylists(getPlaylists().map((p) => (p.id === id ? { ...p, trackIds: p.trackIds.filter((t) => t !== trackId) } : p)));
}
export function moveTrack(fromId: string, toId: string, trackId: string) {
  setPlaylists(
    getPlaylists().map((p) =>
      p.id === fromId ? { ...p, trackIds: p.trackIds.filter((t) => t !== trackId) } : p.id === toId ? { ...p, trackIds: [...new Set([...p.trackIds, trackId])] } : p,
    ),
  );
}

// ── PC-Musik ─────────────────────────────────────────────────────────────────

let localCache: LocalMusicState | null = null;
let localPending: Promise<LocalMusicState> | null = null;

export function fetchLocalMusic(force = false): Promise<LocalMusicState> {
  if (!force && localCache) return Promise.resolve(localCache);
  localPending ??= fetch(`/api/music/local${force ? "?refresh=1" : ""}`, { credentials: "include" })
    .then(async (r) => {
      const ct = r.headers.get("content-type") ?? "";
      if (!r.ok || !ct.includes("json")) return { status: "unavailable" as const, tracks: [], folders: [] };
      const j = (await r.json()) as { tracks?: LocalMusicTrack[]; folders?: string[] };
      return { status: "ok" as const, tracks: Array.isArray(j.tracks) ? j.tracks : [], folders: Array.isArray(j.folders) ? j.folders : [] };
    })
    .catch(() => ({ status: "unavailable" as const, tracks: [], folders: [] }))
    .then((s) => {
      localCache = s;
      localPending = null;
      return s;
    });
  return localPending;
}

export function useLocalMusic(): [LocalMusicState, () => void] {
  const [s, setS] = useState<LocalMusicState>(() => localCache ?? { status: "loading", tracks: [], folders: [] });
  useEffect(() => {
    let alive = true;
    void fetchLocalMusic().then((n) => alive && setS(n));
    return () => {
      alive = false;
    };
  }, []);
  const refresh = () => {
    setS((p) => ({ ...p, status: "loading" }));
    void fetchLocalMusic(true).then(setS);
  };
  return [s, refresh];
}

/** Aktuelle Wiedergabe-Warteschlange (für Weiter/Zurück im gewählten Ordner). */
let queue: BrainFmTrack[] = [];
export function setMusicQueue(tracks: BrainFmTrack[]) {
  queue = tracks.filter((t) => t.audioUrl);
}
export function getMusicQueue(): BrainFmTrack[] {
  return queue.length ? queue : BRAIN_FM_TRACKS;
}

/** Kopiert einen im Browser (IndexedDB) hochgeladenen Song auf den PC (Musik\Connect). */
export async function uploadToPc(blob: Blob, filename: string): Promise<boolean> {
  const fd = new FormData();
  fd.append("file", blob, filename);
  try {
    const r = await fetch("/api/music/local/upload", { method: "POST", body: fd, credentials: "include" });
    return r.ok;
  } catch {
    return false;
  }
}
