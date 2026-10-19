// Legt EINEN neuen Agenten "Hermes-Agent" an (gleiche Zeilen wie der Anlegen-Dialog: agents + agent_profiles). Idempotent.
import { readFileSync } from "node:fs"; import { SQL } from "bun"; import { randomUUID } from "node:crypto";
const env = Object.fromEntries(readFileSync(process.env.LOCALAPPDATA + "\\ConnectApp\\data\\connect.env", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const sql = new SQL(`postgres://connect:${encodeURIComponent(env.CONNECT_APP_DB_PASSWORD)}@127.0.0.1:5544/connect`);
const ex = await sql`select id from agents where name='Hermes-Agent'`;
if (ex.length) { console.log("exists", ex[0].id); } else {
  const [owner] = await sql`select owner_user_id from agent_profiles where agent_id='agent_b3a45862-1825-469f-ac71-4f114c34432a'`;
  const id = "agent_" + randomUUID(); const role = "Hermes-Agent: allgemeiner Assistent in Connect (Hermes-Laufzeit). Antworte knapp auf Deutsch.";
  await sql.begin(async (tx) => {
    await tx`insert into agents (id, name, type, configuration) values (${id}, 'Hermes-Agent', 'built_in', ${{ systemPrompt: role }})`;
    await tx`insert into agent_profiles (agent_id, owner_user_id, title, role_description, avatar_seed, visibility) values (${id}, ${owner.owner_user_id}, 'Hermes', ${role}, ${id}, 'private')`;
  });
  console.log("created", id);
}
await sql.close();
