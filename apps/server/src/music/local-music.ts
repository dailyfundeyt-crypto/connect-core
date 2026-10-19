import { createHash } from "node:crypto";
import { type Dirent, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Hono, MiddlewareHandler } from "hono";
import type { AppVariables } from "../auth/guards";

/**
 * Eigene Musik vom PC für „Musik & Beats“ (Executor helium-music, 17.10.2026).
 *
 * Nur der lokale Connect-Server (3101, auch über den QR-Tunnel), nie online:
 * GET /api/music/local            → { available, folders, tracks[] }  (mit Login)
 * GET /api/music/local/file/:id   → Audiodatei mit Range-Unterstützung  (mit Login)
 * POST /api/music/local/upload     → kopiert einen im PC-Browser hochgeladenen Song (IndexedDB)
 *                                    nach Musik\Connect, damit ihn das Handy abspielen kann
 *
 * Liest nur: Downloads, Musik (+ OneDrive-Musik) und CONNECT_MUSIC_DIRS (durch ; getrennt),
 * oberste Ebene + eine Unterebene, Code-Projekte werden übersprungen. Es wird nichts
 * verschoben oder gelöscht – Ordner/Playlists sind nur Zuordnungen im Workspace.
 */

type Env = { Variables: AppVariables };

const AUDIO_EXT = new Map([
  [".mp3", "audio/mpeg"],
  [".m4a", "audio/mp4"],
  [".aac", "audio/aac"],
  [".wav", "audio/wav"],
  [".ogg", "audio/ogg"],
  [".opus", "audio/ogg"],
  [".flac", "audio/flac"],
  [".webm", "audio/webm"],
]);
const SKIP_DIR = /^(node_modules|\.git|\.cache|dist|build|target|__pycache__|\$RECYCLE\.BIN)$/i;
const PROJECT_MARKERS = ["package.json", ".git", "Cargo.toml", "pyproject.toml", "go.mod"];
const MAX_TRACKS = 2000;
const CACHE_MS = 60_000;

export type LocalTrack = { id: string; title: string; filename: string; folder: string; size: number; mtime: number; type: string };
type Scan = { at: number; folders: string[]; tracks: LocalTrack[]; paths: Map<string, string> };
let cache: Scan | null = null;
let pending: Promise<Scan> | null = null;

export function musicRoots(): string[] {
  const home = os.homedir();
  const roots = [
    path.join(home, "Downloads"),
    path.join(home, "Music"),
    path.join(home, "OneDrive", "Musik"),
    path.join(home, "OneDrive", "Music"),
    ...(process.env.CONNECT_MUSIC_DIRS ?? "").split(";").map((s) => s.trim()).filter(Boolean),
  ];
  return [...new Set(roots.map((r) => path.resolve(r)))];
}

const idFor = (p: string) => createHash("sha1").update(p.toLowerCase()).digest("base64url").slice(0, 16);
const titleFor = (file: string) => file.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

async function readDir(dir: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function scan(): Promise<Scan> {
  const tracks: LocalTrack[] = [];
  const paths = new Map<string, string>();
  const folders: string[] = [];
  const add = async (full: string, root: string) => {
    if (tracks.length >= MAX_TRACKS) return;
    const type = AUDIO_EXT.get(path.extname(full).toLowerCase());
    if (!type) return;
    try {
      const st = await fs.stat(full);
      if (!st.isFile() || st.size < 10_000) return;
      const id = idFor(full);
      if (paths.has(id)) return;
      paths.set(id, full);
      const rel = path.relative(path.dirname(root), path.dirname(full));
      tracks.push({ id, title: titleFor(path.basename(full)), filename: path.basename(full), folder: rel, size: st.size, mtime: st.mtimeMs, type });
    } catch {
      /* unlesbar */
    }
  };
  for (const root of musicRoots()) {
    const entries = await readDir(root);
    if (entries.length === 0) continue;
    folders.push(root);
    for (const e of entries) {
      const full = path.join(root, e.name);
      if (e.isFile()) await add(full, root);
      else if (e.isDirectory() && !SKIP_DIR.test(e.name) && !e.name.startsWith(".")) {
        const sub = await readDir(full);
        if (sub.some((s) => PROJECT_MARKERS.includes(s.name))) continue;
        for (const s of sub) if (s.isFile()) await add(path.join(full, s.name), root);
      }
    }
  }
  tracks.sort((a, b) => b.mtime - a.mtime);
  return { at: Date.now(), folders, tracks, paths };
}

async function library(force = false): Promise<Scan> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache;
  pending ??= scan().then((s) => {
    cache = s;
    pending = null;
    return s;
  }, (e) => {
    pending = null;
    throw e;
  });
  return pending;
}

export function uploadDir(): string {
  return path.join(os.homedir(), "Music", "Connect");
}

const safeName = (name: string) =>
  path
    .basename(name)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .slice(0, 180) || "song.mp3";

export function installLocalMusicRoutes(app: Hono<Env>, requireUser: MiddlewareHandler<Env>): void {
  app.post("/api/music/local/upload", requireUser, async (c) => {
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") return c.json({ error: "Keine Datei." }, 400);
    const name = safeName(file.name);
    if (!AUDIO_EXT.has(path.extname(name).toLowerCase())) return c.json({ error: "Nur Audiodateien." }, 400);
    if (file.size > 500 * 1024 * 1024) return c.json({ error: "Datei zu groß." }, 413);
    const dir = uploadDir();
    await fs.mkdir(dir, { recursive: true });
    let dest = path.join(dir, name);
    try {
      const st = await fs.stat(dest);
      if (st.size === file.size) {
        cache = null;
        return c.json({ ok: true, id: idFor(dest), existed: true });
      }
      const ext = path.extname(name);
      dest = path.join(dir, `${name.slice(0, -ext.length)} (${Date.now().toString(36)})${ext}`);
    } catch {
      /* frei */
    }
    await Bun.write(dest, file);
    cache = null;
    return c.json({ ok: true, id: idFor(dest), existed: false });
  });

  app.get("/api/music/local", requireUser, async (c) => {
    const lib = await library(c.req.query("refresh") === "1");
    return c.json({ available: true, folders: lib.folders, tracks: lib.tracks });
  });

  app.get("/api/music/local/file/:id", requireUser, async (c) => {
    let lib = await library();
    let file = lib.paths.get(c.req.param("id"));
    if (!file) {
      lib = await library(true);
      file = lib.paths.get(c.req.param("id"));
    }
    if (!file) return c.json({ error: "Titel nicht gefunden." }, 404);
    const type = AUDIO_EXT.get(path.extname(file).toLowerCase()) ?? "application/octet-stream";
    const blob = Bun.file(file);
    const size = blob.size;
    const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header("range") ?? "");
    const headers: Record<string, string> = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      let end = range[1] && range[2] ? Number(range[2]) : size - 1;
      end = Math.min(end, size - 1);
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      start = Math.max(0, start);
      return new Response(blob.slice(start, end + 1), {
        status: 206,
        headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
      });
    }
    return new Response(blob, { status: 200, headers: { ...headers, "Content-Length": String(size) } });
  });
}
