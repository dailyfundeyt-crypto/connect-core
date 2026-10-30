import postgres from "postgres";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function getConnectEnv(): Record<string, string> {
  const base = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "ConnectApp", "data")
    : "";
  const file = join(base, "connect.env");
  const env: Record<string, string> = {};
  if (existsSync(file)) {
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      let val = line.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
      }
      env[line.substring(0, idx).trim()] = val;
    }
  }
  return env;
}

async function testConnection() {
  const env = getConnectEnv();
  const dbPassword = env.CONNECT_APP_DB_PASSWORD || "";
  const port = Number(env.CONNECT_APP_DB_PORT || process.env.PG_PORT || "5544");
  const user = env.CONNECT_APP_DB_USER || "connect";
  const database = env.CONNECT_APP_DB_NAME || "connect";

  try {
    const sql = postgres({
      host: "127.0.0.1",
      port,
      user,
      password: dbPassword,
      database,
      connect_timeout: 3,
    });
    const result = await sql`SELECT 1 as connected;`;
    console.log(`Connected successfully to port ${port} as user ${user}! Result count:`, result.length);
    await sql.end();
  } catch (err: any) {
    console.log("Connection failed:", err.message);
  }
}

testConnection();
