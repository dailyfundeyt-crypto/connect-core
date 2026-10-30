import postgres from "postgres";

const sql = postgres("postgres://connect:f1691e59c1531553fd6002595803b1792d1aedf0201833fb@127.0.0.1:5544/connect");

async function run() {
  const agents = await sql`SELECT * FROM agents LIMIT 3`;
  console.log("Agents:", agents.map(a => ({ id: a.id, name: a.name })));
  process.exit(0);
}

run();
