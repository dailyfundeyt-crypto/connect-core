import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AppVariables } from "../auth/guards";
import type { Database } from "../db/client";
import { createLearnRouter } from "./learn/routes";
import { createRenameNotesRouter } from "./rename-note";
import { backlinksFor, buildGraph, referencedImage } from "./graph";
import {
  BRAIN_AREAS,
  BrainPathError,
  brainLocation,
  brainRootFor,
  brainRootFromEnv,
  createBrainFolder,
  deleteBrainFile,
  deleteBrainFolder,
  gitHead,
  isValidSlug,
  listAllMarkdown,
  listMarkdown,
  memoryFolders,
  readAgents,
  readLog,
  readMarkdown,
  resolveBrainRoot,
  safeMarkdownPath,
  saveBrainLocation,
  saveAgentScopes,
  searchMarkdown,
  vaultRootFor,
  writeMarkdown,
  coreOf,
} from "./store";
import { accessFor, dashboard, generateAndWriteAgentMap, getAgentMap, readRoutines, resumeRoutine, runRoutine, startPulse, toggleNeed, worldOf } from "./maps";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const LOOPBACK_IP = /^(127\.|::1$|::ffff:127\.)/;

function hostnameOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The Brain is a folder on this desktop, so it answers only on loopback: the Host header must name
 * loopback (defeats DNS rebinding), a browser Origin, if sent, must too (no cross-site writes), and
 * where the runtime can say who connected, that must be loopback as well.
 */
const localOnly: MiddlewareHandler = async (context, next) => {
  const host = hostnameOf(context.req.header("host"));
  if (!host || !LOOPBACK_HOSTS.has(host)) {
    return context.json({ error: "Brain ist nur lokal erreichbar." }, 403);
  }
  const origin = context.req.header("origin");
  if (origin && origin !== "null") {
    const originHost = hostnameOf(origin);
    if (!originHost || !LOOPBACK_HOSTS.has(originHost)) {
      return context.json({ error: "Brain ist nur lokal erreichbar." }, 403);
    }
  }
  const server = (context.env as { server?: { requestIP?: (r: Request) => { address: string } | null } } | undefined)?.server;
  const address = server?.requestIP?.(context.req.raw)?.address;
  if (address && !LOOPBACK_IP.test(address)) {
    return context.json({ error: "Brain ist nur lokal erreichbar." }, 403);
  }
  await next();
};

type BrainActivity = { reads: number; writes: number; denied: number; last: string | null; lastRead: string | null; lastWrite: string | null };

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };

export function createBrainRoutes(
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  configuredRoot: string | null = brainRootFromEnv(),
  database?: Database,
) {
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("*", requireUser);
  app.use("*", localOnly);

/*
 * The Brain folder *right now*.
 *
 * Read per request instead of captured once, so a folder chosen in the settings
 * screen takes effect without restarting the backend: `brainRootFor` prefers the
 * saved value from `connect.env` and falls back to the value the server was
 * started with.
 */
const root = () => resolveBrainRoot(brainRootFor(configuredRoot));
const unavailable = (reason: string) => ({ available: false as const, reason });

  app.get("/status", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json({ ...unavailable(brain.reason), path: brain.root ?? configuredRoot });
    const [files, all] = await Promise.all([listMarkdown(brain.root), listAllMarkdown(brain.root)]);
    return context.json({
      available: true,
      path: brain.root,
      vaultPath: vaultRootFor(brain.root),
      files: files.length,
      vaultFiles: all.length - files.length,
      head: await gitHead(coreOf(brain.root)),
      core: worldOf(brain.root).prefix,
    });
  });

  app.get("/location", (context) => context.json(brainLocation(configuredRoot)));

  /**
   * Points the Brain at a different folder.
   *
   * Writes the two Brain lines into `connect.env` and leaves every other line
   * alone — that file also holds the database password and the key encryption
   * key, so a full rewrite would lock the user out of their stored credentials.
   */
  app.put("/location", async (context) => {
    if (!(context.req.header("content-type") ?? "").includes("application/json")) {
      return context.json({ error: "JSON erwartet." }, 415);
    }
    const body = (await context.req.json().catch(() => null)) as
      | { path?: unknown; vaultPath?: unknown }
      | null;
    if (!body || typeof body.path !== "string" || !body.path.trim()) {
      return context.json({ error: "Pfad fehlt." }, 400);
    }
    const vaultPath = typeof body.vaultPath === "string" ? body.vaultPath : null;
    try {
      const saved = saveBrainLocation(body.path, vaultPath);
      /*
       * The saved folder is read straight back rather than answered from the
       * request, so a path that resolved to something else than was asked for —
       * a symlink, a short name — shows up here instead of two requests later.
       */
      const brain = await resolveBrainRoot(brainRootFor(configuredRoot));
      return context.json({
        available: brain.available,
        ...saved,
        files: brain.available ? (await listMarkdown(brain.root)).length : 0,
      });
    } catch (error) {
      if (error instanceof BrainPathError) return context.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.get("/tree", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json({ ...unavailable(brain.reason), files: [] });
    return context.json({ available: true, files: await listAllMarkdown(brain.root) });
  });

  app.get("/file", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason), 404);
    try {
      return context.json({ available: true, file: await readMarkdown(brain.root, context.req.query("path") ?? "") });
    } catch (error) {
      if (error instanceof BrainPathError) return context.json({ error: error.message }, 400);
      throw error;
    }
  });

  /**
   * Writes a note as a real `.md` file into the Brain.
   *
   * This is what makes a note from the app show up in Obsidian and in the Brain
   * graph — the app stops being the only place it exists. The body is the
   * markdown the client already produced, not markdown re-derived here, so what
   * the user sees in the editor is exactly what lands on disk.
   *
   * `mode` decides whether an existing file may be replaced: "create" refuses to
   * overwrite, so a second client cannot silently destroy a note.
   */
  app.put("/note", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason), 404);
    if (!(context.req.header("content-type") ?? "").includes("application/json")) {
      return context.json({ error: "JSON erwartet." }, 415);
    }
    const body = (await context.req.json().catch(() => null)) as
      | { path?: unknown; content?: unknown; mode?: unknown }
      | null;
    if (!body) return context.json({ error: "JSON erwartet." }, 400);
    if (typeof body.path !== "string" || typeof body.content !== "string") {
      return context.json({ error: "Pfad und Inhalt fehlen." }, 400);
    }
    const mode = body.mode === "create" ? "create" : "update";
    try {
      const written = await writeMarkdown(brain.root, body.path, body.content, mode);
      return context.json({ available: true, ...written });
    } catch (error) {
      if (error instanceof BrainPathError) return context.json({ error: error.message }, 400);
      throw error;
    }
  });

  /*
   * The Brain's `/note` endpoint already builds parent folders on the way to a
   * file, but a folder created that way comes with a placeholder file the sidebar
   * would render as a real note. This endpoint creates the folder on its own --
   * an empty directory with a `.gitkeep` -- so the rail's "Neuer Notiz-Ordner"
   * lands the user's structure without inventing a file to drag it into existence.
   *
   * Re-creating an existing folder is a no-op (see `createBrainFolder`), so a
   * retried dialog does not error.
   */
  app.put("/folder", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason), 404);
    if (!(context.req.header("content-type") ?? "").includes("application/json")) {
      return context.json({ error: "JSON erwartet." }, 415);
    }
    const body = (await context.req.json().catch(() => null)) as
      | { path?: unknown }
      | null;
    if (!body || typeof body.path !== "string") {
      return context.json({ error: "Pfad fehlt." }, 400);
    }
    try {
      const created = await createBrainFolder(brain.root, body.path);
      return context.json({ available: true, ...created });
    } catch (error) {
      if (error instanceof BrainPathError) return context.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.delete("/folder", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason), 404);
    const pathParam = context.req.query("path");
    if (!pathParam || typeof pathParam !== "string") {
      return context.json({ error: "Pfad fehlt." }, 400);
    }
    try {
      const result = await deleteBrainFolder(brain.root, pathParam);
      return context.json({ available: true, ...result });
    } catch (error) {
      if (error instanceof BrainPathError) return context.json({ error: error.message }, 400);
      throw error;
    }
  });

  /*
   * Delete a single markdown file. Same path contract as `PUT /note`:
   * the URL query must point to an existing `.md` file under the Brain
   * root (no `Vault/`, no `..`, no dotfiles), the safety backup in
   * `.connect-history/` is taken before the unlink so the user can undo
   * from the editor's history, and `BrainPathError` reaches the client
   * as a 400 with the same wording the other endpoints already use.
   */
  app.delete("/note", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason), 404);
    const pathParam = context.req.query("path");
    if (!pathParam || typeof pathParam !== "string") {
      return context.json({ error: "Pfad fehlt." }, 400);
    }
    try {
      const result = await deleteBrainFile(brain.root, pathParam);
      return context.json({ available: true, ...result });
    } catch (error) {
      if (error instanceof BrainPathError) return context.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.get("/graph", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json({ ...unavailable(brain.reason), nodes: [], edges: [] });
    const graph = await buildGraph(brain.root, { agents: context.req.query("agents") === "1" });
    return context.json({ available: true, ...graph });
  });

  app.get("/backlinks", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json({ ...unavailable(brain.reason), backlinks: [] });
    try {
      const target = context.req.query("path") ?? "";
      await safeMarkdownPath(brain.root, target);
      return context.json({ available: true, backlinks: await backlinksFor(brain.root, target.replace(/\\/g, "/")) });
    } catch (error) {
      if (error instanceof BrainPathError) return context.json({ error: error.message }, 400);
      throw error;
    }
  });

  /** Images only, and only ones a Brain note references (![[bild.png]] or ![](bild.png)). */
  app.get("/asset", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason), 404);
    const name = context.req.query("name") ?? "";
    const file = await referencedImage(brain.root, name);
    if (!file) return context.json({ error: "Bild nicht gefunden." }, 404);
    const ext = file.split(".").pop()!.toLowerCase();
    return new Response(Bun.file(file), {
      headers: {
        "content-type": IMAGE_TYPES[ext] ?? "application/octet-stream",
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'",
      },
    });
  });

  app.get("/search", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json({ ...unavailable(brain.reason), hits: [] });
    const q = (context.req.query("q") ?? "").slice(0, 100);
    return context.json({ available: true, hits: await searchMarkdown(brain.root, q) });
  });

  /**
   * Lists the markdown files whose YAML frontmatter declares `template: true`.
   * The picker on the WebApp side uses this to show "Aus Vorlage erstellen"
   * without re-reading every file. A file shows up here if its first
   * frontmatter line after `---` is the literal `template: true`; anything
   * else is treated as a regular note.
   */
  app.get("/templates", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json({ ...unavailable(brain.reason), templates: [] });
    const files = await listAllMarkdown(brain.root);
    const templates: { path: string; mtime: string }[] = [];
    for (const file of files) {
      try {
        const content = await readMarkdown(brain.root, file.path);
        if (content.readOnly) continue;
        const head = content.content.slice(0, 4096);
        if (/^---\s*[\s\S]*?^template:\s*true\s*$/m.test(head)) {
          templates.push({ path: file.path, mtime: file.mtime });
        }
      } catch {
        // A file the Brain can list but not read should not block the rest.
      }
    }
    templates.sort((a, b) => a.path.localeCompare(b.path));
    return context.json({ available: true, templates });
  });

  /**
   * Fetches a remote page on behalf of the editor and returns a Markdown
   * preview. The browser cannot do this directly because of CORS, so the
   * server acts as a one-shot proxy: it pulls the URL, parses the title and
   * the first paragraphs, and hands the user a Markdown snippet ready to
   * drop into a note. The user can still edit the result before saving, so
   * the clip is a starting point rather than a verbatim copy.
   */
  app.get("/webclip", async (context) => {
    const url = (context.req.query("url") ?? "").trim();
    if (!/^https?:\/\//i.test(url)) {
      return context.json({ available: true, ok: false, error: "Ungültige URL" }, 400);
    }
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Connect-Brain-Webclip/1.0" },
        redirect: "follow",
      });
      if (!response.ok) {
        return context.json({ available: true, ok: false, error: `HTTP ${response.status}` });
      }
      const html = await response.text();
      const preview = htmlToMarkdownPreview(html, url);
      return context.json({ available: true, ok: true, ...preview });
    } catch (err) {
      return context.json({
        available: true,
        ok: false,
        error: err instanceof Error ? err.message : "Webclip fehlgeschlagen",
      });
    }
  });

  app.get("/log", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json({ ...unavailable(brain.reason), entries: [] });
    const agent = context.req.query("agent");
    const limit = Math.min(Math.max(Number(context.req.query("limit") ?? 50) || 50, 1), 500);
    let entries = await readLog(coreOf(brain.root));
    if (agent) entries = entries.filter((entry) => entry.agent === agent);
    return context.json({ available: true, entries: entries.reverse().slice(0, limit) });
  });

  app.get("/agents", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json({ ...unavailable(brain.reason), agents: [], areas: [...BRAIN_AREAS] });
    const [config, log, folders] = await Promise.all([readAgents(coreOf(brain.root)), readLog(coreOf(brain.root)), memoryFolders(coreOf(brain.root))]);
    const activity: Record<string, BrainActivity> = {};
    for (const entry of log) {
      const slot = (activity[entry.agent] ??= { reads: 0, writes: 0, denied: 0, last: null, lastRead: null, lastWrite: null });
      const at = `${entry.date} ${entry.time}`;
      if (entry.action === "read") {
        // A read line batches several accesses: "12 Zugriffe (brain_read, …)".
        slot.reads += Number(/^(\d+) Zugriffe/.exec(entry.note)?.[1] ?? 1) || 1;
        if (!slot.lastRead || at > slot.lastRead) slot.lastRead = at;
      } else if (entry.action === "denied") {
        slot.denied++;
      } else {
        slot.writes++;
        if (!slot.lastWrite || at > slot.lastWrite) slot.lastWrite = at;
      }
      if (!slot.last || at > slot.last) slot.last = at;
    }
    return context.json({ available: true, ...config, activity, memoryFolders: folders });
  });

  app.put("/agents/:slug", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason), 404);
    if (!(context.req.header("content-type") ?? "").includes("application/json")) {
      return context.json({ error: "JSON erwartet." }, 415);
    }
    const slug = context.req.param("slug");
    if (!isValidSlug(slug)) return context.json({ error: "Ungültiges Agent-Kürzel." }, 400);
    const body = (await context.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return context.json({ error: "JSON erwartet." }, 400);
    try {
      const saved = await saveAgentScopes(coreOf(brain.root), {
        slug,
        name: body.name as string | undefined,
        kind: body.kind as string | undefined,
        connectAgentId: body.connectAgentId as string | undefined,
        read: body.read,
        write: body.write,
        files: body.files,
      });
      return context.json({ available: true, ...saved });
    } catch (error) {
      if (error instanceof BrainPathError) return context.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.get("/agents/:slug/map", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason), 404);
    const slug = context.req.param("slug");
    if (!isValidSlug(slug)) return context.json({ error: "Ungültiges Agent-Kürzel." }, 400);
    try {
      const map = await getAgentMap(coreOf(brain.root), slug);
      return context.json({ available: true, slug, ...map });
    } catch (error) {
      return context.json({ error: error instanceof Error ? error.message : "Map-Datei konnte nicht geladen werden." }, 404);
    }
  });

  app.post("/agents/:slug/map", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason), 404);
    const slug = context.req.param("slug");
    if (!isValidSlug(slug)) return context.json({ error: "Ungültiges Agent-Kürzel." }, 400);
    try {
      const result = await generateAndWriteAgentMap(coreOf(brain.root), slug);
      // Workspace-Sync falls connectAgentId gefunden wird
      const file = await readAgents(coreOf(brain.root));
      const entry = file.agents.find((a) => a.slug === slug);
      if (entry?.connectAgentId) {
        try {
          const { syncAgentMapToWorkspace } = await import("../agent-hub/agent-terminal-manager");
          await syncAgentMapToWorkspace(entry.connectAgentId, slug);
        } catch {}
      }
      return context.json({ available: true, slug, ...result });
    } catch (error) {
      return context.json({ error: error instanceof Error ? error.message : "Map-Datei konnte nicht erzeugt werden." }, 500);
    }
  });

  /* ---------------------------------------------------------------- MAPS (Screen + Pulse) */
  const jsonBody = async (context: { req: { header: (n: string) => string | undefined; json: () => Promise<unknown> } }) => {
    if (!(context.req.header("content-type") ?? "").includes("application/json")) return null;
    return (await context.req.json().catch(() => null)) as Record<string, unknown> | null;
  };

  app.get("/maps", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason));
    return context.json(await dashboard(brain.root));
  });

  app.get("/access", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason), 404);
    const p = context.req.query("path") ?? "";
    if (!p || p.includes("..") || p.length > 400) return context.json({ error: "Ungueltiger Pfad." }, 400);
    return context.json({ available: true, ...(await accessFor(brain.root, p)) });
  });

  app.post("/pulse/run", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason), 404);
    const body = await jsonBody(context);
    if (!body || typeof body.name !== "string") return context.json({ error: "Name fehlt." }, 400);
    const { routines } = await readRoutines(worldOf(brain.root).core);
    const routine = routines.find((r) => r.name === body.name);
    if (!routine) return context.json({ error: "Routine nicht gefunden." }, 404);
    return context.json({ available: true, ...(await runRoutine(brain.root, routine, "hand")) });
  });

  app.post("/pulse/resume", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason), 404);
    const body = await jsonBody(context);
    if (!body || typeof body.name !== "string") return context.json({ error: "Name fehlt." }, 400);
    await resumeRoutine(brain.root, body.name.slice(0, 60));
    return context.json({ available: true });
  });

  /** Nur Stefan (eingeloggt, lokal): einen Punkt in Braucht-dich ab- oder aufhaken. Agenten haben dafuer kein Tool. */
  app.put("/needs", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason), 404);
    const body = await jsonBody(context);
    if (!body || typeof body.index !== "number" || typeof body.done !== "boolean") return context.json({ error: "index und done fehlen." }, 400);
    try {
      await toggleNeed(worldOf(brain.root).core, body.index, body.done);
      return context.json({ available: true });
    } catch (error) {
      return context.json({ error: (error as Error).message }, 400);
    }
  });

  startPulse(async () => {
    const brain = await root();
    return brain.available ? brain.root : null;
  });

  // Agent 1 (Spark Brain): Notiz-Titel umbenennen → POST /api/brain/notes/rename
  app.route("/notes", createRenameNotesRouter(configuredRoot));

  // Spark-Learn Routes (/api/brain/learn/*)
  app.route("/learn", createLearnRouter(database));

  return app;
}

/**
 * Pulls a title and a few paragraphs from a remote HTML page and turns them
 * into a Markdown snippet. Intentionally simple: the user can edit the
 * result before saving, and the snippet is short enough to fit in a note
 * without scrolling. The server runs this on the user's behalf so the
 * browser does not have to fight CORS for every preview.
 */
function htmlToMarkdownPreview(
  html: string,
  url: string,
): { title: string; markdown: string; siteName: string } {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : url;
  const siteNameMatch = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i.exec(html);
  const siteName = siteNameMatch ? decodeEntities(siteNameMatch[1]) : new URL(url).hostname;

  /*
   * Strip scripts, styles, and other non-content tags before extracting text.
   * We do not bring a full HTML parser in for this; the regex is good enough
   * to drop the obvious noise and keep things short.
   */
  const cleaned = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "");

  /*
   * Capture `<p>…</p>` and `<h2>…</h2>` runs from the body. Each match becomes
   * a line in the snippet. We cap at ten because the goal is a quick summary,
   * not a full copy.
   */
  const matches: { tag: "h" | "p"; text: string }[] = [];
  const blockRegex = /<(h[1-3]|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(cleaned)) !== null) {
    const tag = m[1].toLowerCase();
    const text = decodeEntities(stripTags(m[2])).replace(/\s+/g, " ").trim();
    if (!text || text.length < 4) continue;
    matches.push({ tag: tag.startsWith("h") ? "h" : "p", text: text.slice(0, 400) });
    if (matches.length >= 10) break;
  }

  const markdown = matches
    .map((entry) => (entry.tag === "h" ? `## ${entry.text}` : entry.text))
    .join("\n\n");
  return { title, markdown: markdown || title, siteName };
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
