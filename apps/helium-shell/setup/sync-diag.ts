// sync-diag.ts - read-only diff Connect App DB (5544) vs Supabase for one user. No secrets printed.
// env: SYNC_APP_URL, SYNC_SB_URL, DIAG_EMAIL ; prints JSON to stdout
import { SQL } from "bun";
function connect(url: string) {
  const u = new URL(url);
  const local = ["127.0.0.1", "localhost"].includes(u.hostname);
  return new SQL({ hostname: u.hostname, port: Number(u.port || 5432), database: decodeURIComponent(u.pathname.slice(1)),
    username: decodeURIComponent(u.username), password: decodeURIComponent(u.password), tls: !local, max: 1,
    idleTimeout: 20, connectionTimeout: 20, prepare: false } as any);
}
const db = { app: connect(process.env.SYNC_APP_URL!), sb: connect(process.env.SYNC_SB_URL!) };
type Side = keyof typeof db;
const q = async (s: Side, t: string, p?: any[]) => (await (p ? db[s].unsafe(t, p) : db[s].unsafe(t))) as any[];
const email = process.env.DIAG_EMAIL || "dailyfunde.yt@gmail.com";
const out: any = { at: new Date().toISOString(), email };
const users: any = {};
for (const s of ["app", "sb"] as Side[]) {
  await q(s, "set time zone 'UTC'");
  const r = await q(s, "select id, email, created_at from users where lower(email)=lower($1)", [email]);
  users[s] = r.map((x) => ({ id: x.id, idShort: String(x.id).slice(0, 6) + "…", created: x.created_at }));
}
out.users = { app: users.app.map((x: any) => x.idShort), sb: users.sb.map((x: any) => x.idShort),
  sameId: users.app[0]?.id && users.app[0]?.id === users.sb[0]?.id };
const uid = users.app[0]?.id ?? users.sb[0]?.id;
const tables: any = {};
for (const s of ["app", "sb"] as Side[]) {
  for (const r of await q(s, "select tablename t from pg_tables where schemaname='public' order by 1")) {
    const c = (await q(s, `select count(*)::int n from public."${r.t}"`))[0].n;
    (tables[r.t] ??= {})[s] = c;
  }
}
out.tables = tables;
// per-row diff for synced tables
const SYNC = ["agents", "agent_profiles", "channels", "channel_agents", "channel_memberships", "intelligence_channel_mappings",
  "agent_preferences", "user_instructions", "skills", "skill_tools", "routines", "connect_media", "connect_workspace_kv",
  "connect_chat_threads", "connect_chat_messages", "connect_agent_settings"];
async function pk(s: Side, t: string) {
  return (await q(s, `select a.attname c from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
    where i.indisprimary and i.indrelid=('public.'||quote_ident($1))::regclass order by a.attnum`, [t])).map((x) => x.c);
}
const label = (r: any) => r?.name ?? r?.title ?? r?.key ?? r?.label ?? "";
const diff: any = {};
for (const t of SYNC) {
  if (!tables[t]?.app && tables[t]?.app !== 0) { diff[t] = { note: "fehlt in App" }; continue; }
  if (!tables[t]?.sb && tables[t]?.sb !== 0) { diff[t] = { note: "fehlt online" }; continue; }
  const k = await pk("app", t);
  const ke = `jsonb_build_array(${k.map((c: string) => `x."${c}"::text`).join(",")})::text`;
  const rows: any = {};
  for (const s of ["app", "sb"] as Side[]) {
    const r = await q(s, `select ${ke} k, md5(to_jsonb(x)::text) h, to_jsonb(x) j from public."${t}" x`);
    rows[s] = new Map(r.map((x) => [x.k, x]));
  }
  const onlyApp: string[] = [], onlySb: string[] = [], differ: string[] = [];
  let same = 0;
  const own = (j: any) => !uid || ["user_id", "owner_id", "created_by"].every((c) => !(c in j) || j[c] == null || j[c] === uid) && (t !== "connect_workspace_kv" || String(j.key).startsWith(`u:${uid}:`) || !String(j.key).startsWith("u:"));
  for (const [key, a] of rows.app) {
    const b = rows.sb.get(key);
    if (!own(a.j)) continue;
    const name = t === "connect_workspace_kv" ? String(a.j.key).replace(`u:${uid}:`, "u:Xx3D:") : `${key} ${label(a.j)}`.slice(0, 90);
    if (!b) onlyApp.push(name); else if (a.h !== b.h) differ.push(name + (a.j.updated_at && b.j.updated_at ? ` (App ${String(a.j.updated_at).slice(0, 16)} / online ${String(b.j.updated_at).slice(0, 16)})` : "")); else same++;
  }
  for (const [key, b] of rows.sb) if (!rows.app.has(key) && own(b.j)) onlySb.push(t === "connect_workspace_kv" ? String(b.j.key).replace(`u:${uid}:`, "u:Xx3D:") : `${key} ${label(b.j)}`.slice(0, 90));
  diff[t] = { same, onlyApp, onlySb, differ };
}
out.diff = diff;
// workspace detail
const kv = async (s: Side, key: string) => {
  const r = await q(s, "select value, updated_at from connect_workspace_kv where key=$1", [`u:${uid}:${key}`]);
  if (!r[0]) return undefined;
  let v = r[0].value; if (typeof v === "string") { try { v = JSON.parse(v); } catch {} }
  return v;
};
const ws: any = {};
for (const s of ["app", "sb"] as Side[]) {
  const comp = await kv(s, "connect.companies.custom");
  const lab = await kv(s, "connect.level3.browser");
  const tabs = await kv(s, "connect.agent-browser-tabs");
  const proj = await kv(s, "connect.projects");
  ws[s] = {
    companies: Array.isArray(comp) ? comp.map((c: any) => `${c.name ?? "?"} (${c.id})`) : comp === undefined ? "fehlt" : typeof comp,
    labPerCompany: lab && typeof lab === "object" ? Object.fromEntries(Object.entries(lab).map(([cid, st]: any) => [cid, {
      links: (st?.customApps ?? []).length, groups: (st?.tabGroups ?? []).length,
      linkNames: (st?.customApps ?? []).map((a: any) => a.label).slice(0, 40) }])) : lab === undefined ? "fehlt" : typeof lab,
    agentTabs: tabs && typeof tabs === "object" ? Object.fromEntries(Object.entries(tabs).map(([aid, v]: any) => [aid.slice(0, 12), (v?.tabs ?? []).length])) : tabs === undefined ? "fehlt" : typeof tabs,
    projects: Array.isArray(proj) ? proj.length : proj === undefined ? "fehlt" : typeof proj,
  };
}
out.workspace = ws;
console.log(JSON.stringify(out, null, 1));
for (const s of ["app", "sb"] as Side[]) await db[s].close();
