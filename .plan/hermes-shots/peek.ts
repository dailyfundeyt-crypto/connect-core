import { readFileSync } from "node:fs"; import { SQL } from "bun";
const env = Object.fromEntries(readFileSync(process.env.LOCALAPPDATA + "\\ConnectApp\\data\\connect.env", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const sql = new SQL(`postgres://connect:${encodeURIComponent(env.CONNECT_APP_DB_PASSWORD)}@127.0.0.1:5544/connect`);
console.log((await sql`select column_name from information_schema.columns where table_name='agent_profiles'`).map(c=>c.column_name).join(","));
const r = await sql`select a.id,a.name,a.configuration, p.* from agents a join agent_profiles p on p.agent_id=a.id where a.name in ('Man','Stefan')`;
for (const x of r) console.log(JSON.stringify({ ...x, configuration: Object.keys(x.configuration ?? {}), sp: String(x.configuration?.systemPrompt ?? "").slice(0,120) }));
await sql.close();
