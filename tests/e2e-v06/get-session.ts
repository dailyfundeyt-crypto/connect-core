/**
 * Helper to fetch active session token from local PostgreSQL
 * Runs with Bun (which has postgres driver built-in)
 */
import postgres from "postgres";
import * as path from "path";
import * as fs from "fs";

async function main() {
  const localAppData = process.env.LOCALAPPDATA || "";
  const envFile = path.join(localAppData, "ConnectApp", "data", "connect.env");
  let dbPass = "f1691e59c1531553fd6002595803b1792d1aedf0201833fb";
  let secret = "VSz9SpWOhBzBwLPMTSlegGH77Jg5HgVAlIxdna2Nk0C5Co25xKZs2Euulc3YR6h";

  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("BETTER_AUTH_SECRET=")) {
        secret = trimmed.substring("BETTER_AUTH_SECRET=".length).trim();
      } else if (trimmed.startsWith("CONNECT_APP_DB_PASSWORD=")) {
        dbPass = trimmed.substring("CONNECT_APP_DB_PASSWORD=".length).trim();
      }
    }
  }

  let token = "";
  try {
    const sql = postgres(`postgres://connect:${dbPass}@127.0.0.1:5544/connect`, {
      connect_timeout: 3,
      max: 1,
    });
    const rows = await sql`SELECT token FROM sessions ORDER BY expires_at DESC LIMIT 1`;
    await sql.end();
    if (rows && rows.length > 0 && rows[0].token) {
      token = rows[0].token;
    }
  } catch {}

  if (!token) {
    token = "test-session-a39-token";
  }

  // Calculate signature
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(token));
  const signature = Buffer.from(sig).toString("base64");

  console.log(`${token}.${signature}`);
  process.exit(0);
}

main().catch(() => {
  console.log("fallback.sig");
  process.exit(0);
});
