import postgres from "postgres";

const sql = postgres(
  "postgres://connect:f1691e59c1531553fd6002595803b1792d1aedf0201833fb@127.0.0.1:5544/connect"
);

const agentId = process.argv[2] ?? "agent_62e891c4-b850-4405-a5f3-1d814d9c1495";

// Nachrichten des Agenten suchen
const tables = await sql`
  select table_name
    from information_schema.tables
   where table_schema = 'public'
     and (table_name ilike '%message%' or table_name ilike '%chat%' or table_name ilike '%turn%')
   order by table_name
`;
console.log("Kandidaten-Tabellen:", tables.map((t) => t.table_name).join(", "));

for (const t of tables) {
  const name = t.table_name;
  try {
    const cols = await sql.unsafe(`select column_name from information_schema.columns where table_name = $1 and table_schema='public'`, [name]);
    const colNames = cols.map((c) => c.column_name);
    const hasAgent = colNames.some((c) => /agent/i.test(c));
    if (!hasAgent) { console.log(`\n--- ${name}: kein agent-col, skip ---`); continue; }
    const bodyCol = colNames.find((c) => /content|body|text|message/i.test(c)) ?? colNames[0];
    const agentCol = colNames.find((c) => c === "agent_id") ?? colNames.find((c) => /agent/i.test(c))!;
    const timeCol = colNames.find((c) => /created_at|timestamp|time/i.test(c));
    const order = timeCol ? ` order by ${timeCol} asc` : "";
    const rows = await sql.unsafe(
      `select ${agentCol} as a, ${bodyCol} as b${timeCol ? `, ${timeCol} as t` : ""} from ${name} where ${agentCol} = $1${order} limit 8`,
      [agentId]
    );
    if (!rows.length) { console.log(`\n--- ${name}: 0 Zeilen ---`); continue; }
    console.log(`\n=== ${name} (${colNames.join(",")}) ===`);
    for (const r of rows) {
      console.log(`[${r.t ?? "?"}] ${String(r.b).slice(0, 220).replace(/\n/g, " ")}`);
    }
  } catch (e) {
    console.log(`\n--- ${name}: Fehler ${(e as Error).message.slice(0, 120)} ---`);
  }
}

await sql.end();