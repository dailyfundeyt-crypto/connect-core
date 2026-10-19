// Removes the Nordwind seed company from connect_workspace_kv (local 5544 + Supabase).
// Keeps connect.company.siteUrl (contains a URL Stefan set: https://daily-fun.app). APPLY=1 to write.
import { SQL } from "bun";
import { writeFileSync } from "fs";
const B = process.env.B!, APPLY = process.env.APPLY === "1";
function connect(url: string) { const u = new URL(url); const local = ["127.0.0.1","localhost"].includes(u.hostname);
  return new SQL({ hostname: u.hostname, port: Number(u.port||5432), database: decodeURIComponent(u.pathname.slice(1)), username: decodeURIComponent(u.username), password: decodeURIComponent(u.password), tls: !local, max: 1, prepare: false } as any); }
const parse = (v: any): { val: any; asString: boolean } => {
  if (typeof v === "string") { const t = v.trim(); if ((t[0]=="{"&&t.endsWith("}"))||(t[0]=="["&&t.endsWith("]"))) { try { return { val: JSON.parse(t), asString: true }; } catch {} } return { val: v, asString: true }; }
  return { val: v, asString: false };
};
const isNw = (s: any) => typeof s === "string" && s.replace(/"/g,"").trim().toLowerCase() === "nordwind";
const log: any[] = [];
for (const [side, url] of [["local", process.env.APP!], ["supabase", process.env.SB!]] as const) {
  const db = connect(url);
  await db.begin(async (tx: any) => {
    const rows = await tx.unsafe("select key, value from connect_workspace_kv where value::text ilike '%nordwind%' for update") as any[];
    for (const r of rows) {
      const logical = r.key.replace(/^u:[^:]+:/, "");
      if (logical === "connect.company.siteUrl") { log.push({ side, key: r.key, action: "KEPT (Stefans URL daily-fun.app)" }); continue; }
      const { val, asString } = parse(r.value);
      let next: any, action = "";
      if (logical === "connect.activeCompanyId" && isNw(val)) { action = "DELETE row (pointer to nordwind)"; }
      else if (Array.isArray(val)) { next = val.filter((x: any) => !(x && typeof x === "object" && (isNw(x.companyId) || isNw(x.id)))); action = `array ${val.length} -> ${next.length}`; }
      else if (val && typeof val === "object") { next = Object.fromEntries(Object.entries(val).filter(([k]) => !isNw(k))); action = `object keys ${Object.keys(val).length} -> ${Object.keys(next).length}`; }
      else { log.push({ side, key: r.key, action: "SKIP (unknown shape)" }); continue; }
      const archive = /\.from-(app|helium)-\d{8}$/.test(logical);
      const empty = next !== undefined && (Array.isArray(next) ? next.length === 0 : Object.keys(next).length === 0);
      if (next === undefined || (archive && empty)) {
        if (next !== undefined) action += " => DELETE row (archive key, nordwind-only)";
        if (APPLY) await tx.unsafe("delete from connect_workspace_kv where key = $1", [r.key]);
      } else {
        if (JSON.stringify(next).toLowerCase().includes("nordwind")) action += " (WARN: still contains nordwind text)";
        const stored = asString ? JSON.stringify(JSON.stringify(next)) : JSON.stringify(next);
        if (APPLY) await tx.unsafe("update connect_workspace_kv set value = $1::jsonb, updated_at = now() where key = $2", [stored, r.key]);
      }
      log.push({ side, key: r.key, action });
    }
  });
  await db.close();
}
for (const l of log) console.log(`${l.side.padEnd(8)} ${l.key}  ->  ${l.action}`);
writeFileSync(`${B}\\nordwind-removal-${APPLY ? "applied" : "plan"}.json`, JSON.stringify({ at: new Date().toISOString(), log }, null, 1));
