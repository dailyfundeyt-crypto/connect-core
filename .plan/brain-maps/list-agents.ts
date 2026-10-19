// Nur lesen: Liste der Connect-Agenten (id, name, typ). Gibt keine Zugangsdaten aus.
import { readFileSync } from "node:fs";
import { SQL } from "bun";
const env = Object.fromEntries(readFileSync(process.env.LOCALAPPDATA + "\\ConnectApp\\data\\connect.env", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const sql = new SQL(`postgres://connect:${encodeURIComponent(env.CONNECT_APP_DB_PASSWORD)}@127.0.0.1:5544/connect`);
const rows = await sql`select id, name, type::text as type from agents order by name`;
console.log(JSON.stringify(rows.map((r) => ({ id: r.id, name: r.name, type: r.type }))));
await sql.close();
