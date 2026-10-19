import { SQL } from "bun";
import { writeFileSync } from "fs";
const B = process.env.B!;
function connect(url: string) { const u = new URL(url); const local = ["127.0.0.1","localhost"].includes(u.hostname);
  return new SQL({ hostname: u.hostname, port: Number(u.port||5432), database: decodeURIComponent(u.pathname.slice(1)), username: decodeURIComponent(u.username), password: decodeURIComponent(u.password), tls: !local, max: 1, prepare: false } as any); }
const dec = (v: any): any => { if (typeof v === "string") { const t=v.trim(); if ((t[0]=="{"&&t.endsWith("}"))||(t[0]=="["&&t.endsWith("]"))) { try { return dec(JSON.parse(t)); } catch {} } } return v; };
const isNw = (s: any) => typeof s === "string" && s.replace(/"/g,"").toLowerCase() === "nordwind";
for (const [side, url] of [["local", process.env.APP!], ["supabase", process.env.SB!]] as const) {
  const db = connect(url);
  const rows = await db.unsafe("select key, value, updated_at from connect_workspace_kv order by key") as any[];
  writeFileSync(`${B}\\${side}-connect_workspace_kv.json`, JSON.stringify(rows, null, 1));
  console.log(`=== ${side}: ${rows.length} rows`);
  for (const r of rows) {
    const v = dec(r.value);
    if (!JSON.stringify(v).toLowerCase().includes("nordwind")) continue;
    let detail = "";
    if (Array.isArray(v)) { const nw = v.filter((x:any)=> x && (isNw(x.companyId)||isNw(x.id))); detail = `array ${v.length}, nordwind-elems ${nw.length}: ` + nw.map((x:any)=>x.name||x.title||x.id).join(" | ").slice(0,300); }
    else if (v && typeof v === "object") { const ks = Object.keys(v).filter(isNw); detail = `object keys=${Object.keys(v).join(",")}; nordwind=` + JSON.stringify(ks.map(k=>v[k])).slice(0,700); }
    else detail = "scalar " + JSON.stringify(v);
    console.log(`- ${r.key} [${new Date(r.updated_at).toISOString()}] ${detail}`);
  }
  await db.close();
}
