import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AppVariables } from "../auth/guards";
import { backlinksFor, buildGraph, referencedImage } from "./graph";
import {
  BRAIN_AREAS,
  BrainPathError,
  brainRootFromEnv,
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
  saveAgentScopes,
  searchMarkdown,
  vaultRootFor,
} from "./store";

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

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp" };

export function createBrainRoutes(
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  configuredRoot: string | null = brainRootFromEnv(),
) {
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("*", requireUser);
  app.use("*", localOnly);

  const root = () => resolveBrainRoot(configuredRoot);
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
      head: await gitHead(brain.root),
    });
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

  app.get("/log", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json({ ...unavailable(brain.reason), entries: [] });
    const agent = context.req.query("agent");
    const limit = Math.min(Math.max(Number(context.req.query("limit") ?? 50) || 50, 1), 500);
    let entries = await readLog(brain.root);
    if (agent) entries = entries.filter((entry) => entry.agent === agent);
    return context.json({ available: true, entries: entries.reverse().slice(0, limit) });
  });

  app.get("/agents", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json({ ...unavailable(brain.reason), agents: [], areas: [...BRAIN_AREAS] });
    const [config, log, folders] = await Promise.all([readAgents(brain.root), readLog(brain.root), memoryFolders(brain.root)]);
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
      const saved = await saveAgentScopes(brain.root, {
        slug,
        name: body.name as string | undefined,
        kind: body.kind as string | undefined,
        connectAgentId: body.connectAgentId as string | undefined,
        read: body.read,
        write: body.write,
      });
      return context.json({ available: true, ...saved });
    } catch (error) {
      if (error instanceof BrainPathError) return context.json({ error: error.message }, 400);
      throw error;
    }
  });

  return app;
}
