// Nur lesen + ein Modell-Aufruf: fuehrt EINEN Hermes-Turn mit dem Server-Code aus (wie Connect /api/copilotkit, ohne Login).
import { readFileSync } from "node:fs";
import { SQL } from "bun";
const env = Object.fromEntries(readFileSync(process.env.LOCALAPPDATA + "\\ConnectApp\\data\\connect.env", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
for (const k of ["OPENAI_API_KEY"]) process.env[k] = env[k];
const S = "../../apps/connect-app/runtime/connect/apps/server/src/";
const { registeredAgentFromRow, builtInAgentConfiguration, runtimeModelForEnvironment } = await import(S + "copilot.ts");
const { BuiltInAgent } = await import("../../apps/connect-app/runtime/connect/node_modules/@copilotkit/runtime/dist/v2/index.mjs").catch(async () => await import(S + "../node_modules/@copilotkit/runtime/v2"));
const sql = new SQL(`postgres://connect:${encodeURIComponent(env.CONNECT_APP_DB_PASSWORD)}@127.0.0.1:5544/connect`);
const name = process.argv[2] ?? "Man";
const [row] = await sql`select id, name, type::text as type, configuration, '' as title, '' as "roleDescription" from agents where name = ${name}`;
const settings = await sql`select * from agent_settings where agent_id = ${row.id}`.catch((e) => [{ err: String(e) }]);
console.log("agent", row.id, "settings.model", JSON.stringify(settings[0]?.model ?? settings[0]?.err ?? null));
const agent = registeredAgentFromRow(row);
const model = runtimeModelForEnvironment({ provider: "openai", defaultModel: "gpt-5.5" }, { OPENAI_API_KEY: "x" });
console.log("model", model.provider + "/" + model.defaultModel);
const { createCliModel } = await import(S + "agent-hub/cli-model.ts");
const override = process.env.USE_CODEX ? { model: createCliModel({ kind: "codex", model: process.env.USE_CODEX, agentId: row.id }), apiKey: "cli-login", label: "codex-cli" } : null;
const cfg = builtInAgentConfiguration(agent, model, env.OPENAI_API_KEY, [], undefined, undefined, undefined, undefined, override);
const a = new BuiltInAgent(cfg);
let text = ""; const t0 = Date.now();
await new Promise((res, rej) => a.run({ threadId: "hermes-test-" + Date.now(), runId: "r1", messages: [{ id: "m1", role: "user", content: process.argv[3] ?? "Antworte kurz auf Deutsch: Wer bist du und welches Modell nutzt du?" }], tools: process.env.TOOLTEST ? [{ name: "uhrzeit_holen", description: "Gibt die aktuelle Uhrzeit in Berlin zurueck.", parameters: { type: "object", properties: {}, required: [] } }] : [], context: [], state: {}, forwardedProps: {} }).subscribe({ next: (e) => { if (process.env.DBG) console.log("EV", e.type, JSON.stringify(e).slice(0,300)); if (e.type === "TEXT_MESSAGE_CHUNK" && e.delta) text += e.delta; if (e.type === "TEXT_MESSAGE_CONTENT") text += e.delta; if (e.type === "RUN_ERROR") console.log("RUN_ERROR", e.message); }, error: rej, complete: res }));
console.log("ms", Date.now() - t0); console.log("ANTWORT:", text);
await sql.close();




