import { readFileSync } from "node:fs"; import { SQL } from "bun";
const env = Object.fromEntries(readFileSync(process.env.LOCALAPPDATA + "\\ConnectApp\\data\\connect.env", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const sql = new SQL(`postgres://connect:${encodeURIComponent(env.CONNECT_APP_DB_PASSWORD)}@127.0.0.1:5544/connect`);
const cols = await sql`select column_name from information_schema.columns where table_name='connect_agent_settings'`; console.log(cols.map(c=>c.column_name).join(","));
const rows = await sql`select a.name, s.model from agents a left join connect_agent_settings s on s.agent_id=a.id`;
for (const r of rows) console.log(r.name, JSON.stringify(r.model ? { p: r.model.provider, m: r.model.model, key: !!r.model.credentialId } : null));
await sql.close();

