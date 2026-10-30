import postgres from "postgres";

const sql = postgres(
  "postgres://connect:f1691e59c1531553fd6002595803b1792d1aedf0201833fb@127.0.0.1:5544/connect"
);

const agentId = "agent_a207d7d4-faa7-45cf-8a92-47758b43a443";

// 1. Update agents configuration and chosen_cli
await sql`
  update agents
  set chosen_cli = 'antigravity',
      configuration = jsonb_set(
        coalesce(configuration, '{}'::jsonb),
        '{cli}',
        '{"kind": "antigravity", "model": "auto", "allowWrite": false}'::jsonb
      ),
      updated_at = now()
  where id = ${agentId}
`;

// 2. Update connect_agent_settings
await sql`
  update connect_agent_settings
  set model = '{"provider": "antigravity-cli", "model": "auto", "keyHint": null, "credentialId": null}'::jsonb,
      updated_at = now()
  where agent_id = ${agentId}
`;

const [agent] = await sql`select id, name, chosen_cli, configuration from agents where id = ${agentId}`;
console.log("UPDATED AGENT:", JSON.stringify(agent, null, 2));

const [settings] = await sql`select * from connect_agent_settings where agent_id = ${agentId}`;
console.log("UPDATED SETTINGS:", JSON.stringify(settings, null, 2));

await sql.end();
