// helium-mobilefix Screenshot-Nachbau: echte Workspace-Daten (nur LESEN aus Postgres 5544), echter Brain-Ordner (nur LESEN),
// Login gemockt, nur 127.0.0.1. MODE=vercel: keine Brain-API (wie Vercel-Vorschau).
import * as path from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { SQL } from "bun";
const REPO = "C:/Users/Kunc GmbH/Downloads/OpenBot-v2-Helium";
const { Hono } = await import(`${REPO}/apps/server/node_modules/hono/dist/index.js`).catch(() => import(`${REPO}/node_modules/hono/dist/index.js`));
const dist = process.env.DIST!;
const port = Number(process.env.PORT_SHOT ?? 3187);
const vercel = process.env.MODE === "vercel";
const env = readFileSync(process.env.LOCALAPPDATA + "\\ConnectApp\\data\\connect.env", "utf8");
const pw = /^CONNECT_APP_DB_PASSWORD=(.*)$/m.exec(env)![1].trim();
const brainRoot = /^CONNECT_BRAIN_PATH=(.*)$/m.exec(env)![1].trim();
const UID = "Xx3DRBa5O38j5I50bcmQxbhvDyHziizu";
const sql = new SQL({ hostname: "127.0.0.1", port: 5544, username: "connect", password: pw, database: "connect" });
const rows = await sql`select key, value from connect_workspace_kv where key like ${"u:" + UID + ":%"}`;
await sql.close();
const workspace: Record<string, unknown> = {};
for (const r of rows) {
  const k = String(r.key).slice(`u:${UID}:`.length);
  let v = r.value; if (typeof v === "string") { try { v = JSON.parse(v); } catch {} }
  workspace[k] = v;
}
if (process.env.ACTIVE) workspace["connect.activeCompanyId"] = process.env.ACTIVE;
workspace["connect.locale"] = "de";
const files: { path: string; size: number; mtime: string }[] = [];
const walk = (dir: string, rel: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(full, r);
    else if (/\.md$/i.test(e.name)) { const s = statSync(full); files.push({ path: r, size: s.size, mtime: s.mtime.toISOString() }); }
  }
};
walk(brainRoot, "");
console.log("brain files", files.length, "workspace keys", Object.keys(workspace).length);
const now = new Date().toISOString();
const me = { user: { id: UID, email: "dailyfunde.yt@gmail.com", name: "Stefan Kunc", image: null, roles: ["admin"], isAdmin: true, onboarding: { completedAt: now } } };
const h = new Hono();
h.get("/api/me", (c: any) => c.json(me));
h.get("/api/connect/workspace", (c: any) => c.json({ workspace }));
h.put("/api/connect/workspace", async (c: any) => { const b = await c.req.json().catch(() => ({})); return c.json({ ok: true, workspace: b.workspace ?? {}, conflicts: 0 }); });
h.get("/api/agents", (c: any) => c.json({ agents: [] }));
h.get("/api/channels", (c: any) => c.json({ channels: [], nextCursor: null }));
h.get("/api/local-apps/info", (c: any) => (vercel ? c.json({}, 404) : c.json({ proxy: true, ports: [] })));
if (!vercel) {
  h.get("/api/brain/status", (c: any) => c.json({ available: true, path: brainRoot, vaultPath: brainRoot, files: files.length, vaultFiles: 0 }));
  h.get("/api/brain/tree", (c: any) => c.json({ available: true, files }));
  h.get("/api/brain/backlinks", (c: any) => c.json({ available: true, backlinks: [] }));
  h.get("/api/brain/file", (c: any) => {
    const p = c.req.query("path") ?? "";
    if (!files.some((f) => f.path === p)) return c.json({ available: true }, 404);
    const full = path.join(brainRoot, ...p.split("/"));
    const s = statSync(full);
    return c.json({ available: true, file: { path: p, content: readFileSync(full, "utf8"), mtime: s.mtime.toISOString(), size: s.size, readOnly: true } });
  });
}
const seen = new Set<string>();
h.all("/api/*", (c: any) => { if (!seen.has(c.req.path)) { seen.add(c.req.path); console.log("unmocked", c.req.method, c.req.path); } return c.json({}, 404); });
h.get("*", (c: any) => {
  const p = decodeURIComponent(c.req.path);
  const file = path.join(dist, p);
  if (p !== "/" && existsSync(file) && statSync(file).isFile()) return new Response(Bun.file(file));
  return new Response(Bun.file(path.join(dist, "index.html")), { headers: { "content-type": "text/html; charset=utf-8" } });
});
Bun.serve({ port, hostname: "127.0.0.1", fetch: (r: Request) => h.fetch(r) });
console.log("shot-server", port, vercel ? "VERCEL" : "TUNNEL");
