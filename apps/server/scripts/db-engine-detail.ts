import postgres from "postgres";

const sql = postgres(
  "postgres://connect:f1691e59c1531553fd6002595803b1792d1aedf0201833fb@127.0.0.1:5544/connect"
);

const ids = [
  "agent_62e891c4-b850-4405-a5f3-1d814d9c1495",
  "agent_4ee68358-99dd-4def-9730-b36b0e9a02a3",
  "wizard22-antigravity-741305",
];

for (const id of ids) {
  const rows = await sql`
    select id, name, chosen_cli,
           configuration->'engine'->>'kind' as engine_kind,
           configuration->'engine' as engine_json,
           configuration->'cliAccount'->>'email' as cli_email
      from agents where id = ${id}
  `;
  const r = rows[0];
  if (!r) {
    console.log(`${id}: NOT FOUND`);
    continue;
  }
  console.log(`\n=== ${r.id}  "${r.name ?? ""}" ===`);
  console.log(`  chosen_cli   : ${r.chosen_cli ?? "-"}`);
  console.log(`  engine.kind  : ${r.engine_kind ?? "-"}`);
  console.log(`  engine       : ${JSON.stringify(r.engine_json)}`);
  console.log(`  cli email    : ${r.cli_email ?? "-"}`);
}

await sql.end();