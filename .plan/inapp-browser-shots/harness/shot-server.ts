// Nachbau für Screenshots (helium-inappbrowser): echte local-apps.ts, Login gemockt, nur 127.0.0.1.
// MODE=vercel: kein /apps-Proxy (wie die Vercel-Vorschau ohne Tunnel).
import * as path from "node:path";
import { existsSync } from "node:fs";
const REPO = "C:/Users/Kunc GmbH/Downloads/OpenBot-v2-Helium";
const { Hono } = await import(`${REPO}/apps/server/node_modules/hono/dist/index.js`).catch(() => import(`${REPO}/node_modules/hono/dist/index.js`));
const LA = await import(`${REPO}/apps/server/src/connect/local-apps.ts`);
const dist = process.env.DIST!;
const port = Number(process.env.PORT_SHOT ?? 3197);
const vercel = process.env.MODE === "vercel";
const now = new Date().toISOString();
const companies = [
  { id: "spark", name: "Spark", description: "", agentIds: [], accent: "linear-gradient(145deg,#f59e0b,#ea580c 55%,#1e293b)" },
  { id: "connect", name: "Connect", description: "", agentIds: [], accent: "linear-gradient(145deg,#0369a1,#4f46e5 55%,#1e293b)" },
  { id: "flux", name: "Flux", description: "", agentIds: [], accent: "linear-gradient(145deg,#7c3aed,#db2777 50%,#1e293b)" },
  { id: "hyper", name: "Hyper", description: "", agentIds: [], accent: "linear-gradient(145deg,#15803d,#0f766e 50%,#1e293b)" },
  { id: "anaylsis", name: "Anaylsis", description: "", agentIds: [], accent: "linear-gradient(145deg,#ca8a04,#ea580c 45%,#1e293b)" },
];
const app = (id: string, label: string, url: string, icon = "googlechrome") => ({ id, kind: "browser", label, blurb: "Eigene App", url, icon, tint: "#4285F4", builtin: false });
const level3 = {
  spark: {
    companyId: "spark", activeTool: "lovable", browsing: true, connections: [], starred: false, engine: "full", updatedAt: now,
    "connect.level3.migrated.v2-cleared-defaults": true,
    customApps: [
      app("custom-example", "Example Domain", "https://example.com"),
      app("custom-github", "GitHub", "https://github.com", "github"),
      app("custom-local", "Spark Dashboard", "http://localhost:5199"),
    ],
    tabGroups: [],
  },
};
const workspace: Record<string, unknown> = {
  "connect.companies.custom": companies,
  "connect.activeCompanyId": "spark",
  "connect.level3.browser": level3,
  "connect.company.siteUrl": process.env.SITES ? JSON.parse(process.env.SITES) : { connect: "https://www.wikipedia.org", spark: "https://app.notion.com" },
  "connect.locale": "de",
  "connect.account": { userId: "shot", email: "vorschau@local", name: "Stefan" },
};
const fakeDb = {
  select: () => ({ from: () => ({ where: async () => [{ key: "u:shot:connect.level3.browser", value: workspace["connect.level3.browser"] }] }) }),
};
const requireUser = async (c: any, next: any) => {
  c.set("actor", { id: "shot", email: "vorschau@local", name: "Stefan", role: "admin" });
  await next();
};
const h = new Hono();
if (!vercel) h.use("*", LA.localAppRefererRedirect());
if (!vercel) LA.installLocalAppProxy(h, requireUser, fakeDb);
LA.installEmbedCheck(h, requireUser);
const me = { user: { id: "shot", email: "vorschau@local", name: "Stefan", image: null, roles: ["admin"], isAdmin: true, onboarding: { completedAt: now } } };
h.get("/api/me", (c: any) => c.json(me));
h.get("/api/connect/workspace", (c: any) => c.json({ workspace }));
h.put("/api/connect/workspace", async (c: any) => {
  const body = await c.req.json().catch(() => ({}));
  for (const [k, v] of Object.entries(body.workspace ?? {})) if (k !== "connect.account") workspace[k] = v;
  return c.json({ ok: true, workspace: body.workspace ?? {}, conflicts: 0 });
});
h.post("/api/connect/open-chrome", (c: any) => { console.log("open-chrome (Nachbau)"); return c.json({ ok: true }); });
h.get("/api/agents", (c: any) => c.json({ agents: [] }));
h.get("/api/channels", (c: any) => c.json({ channels: [], nextCursor: null }));
const seen = new Set<string>();
h.all("/api/*", (c: any) => {
  if (!seen.has(c.req.path)) { seen.add(c.req.path); console.log("unmocked", c.req.method, c.req.path); }
  return c.json({}, 404);
});
h.get("*", (c: any) => {
  const p = c.req.path;
  const file = path.join(dist, p);
  if (p !== "/" && existsSync(file) && !file.endsWith(path.sep)) return new Response(Bun.file(file));
  return new Response(Bun.file(path.join(dist, "index.html")), { headers: { "content-type": "text/html; charset=utf-8" } });
});
Bun.serve({ port, hostname: "127.0.0.1", fetch: (r: Request) => h.fetch(r) });
console.log("shot-server", port, vercel ? "VERCEL" : "TUNNEL");
