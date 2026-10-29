/**
 * Smoke-Test: erzeugt einen Connect-MCP-Token und löst ihn wieder auf.
 * Wird mit `bun run scripts/mcp-smoke-test.ts` ausgeführt.
 *
 * Vorbedingungen:
 *   - Postgres läuft auf $DATABASE_URL oder postgres://connect:connect@localhost:5544/connect
 *   - Server muss laufen, damit `connect_mcp_tokens`-Tabelle existieren kann
 *     (alternativ: erst ein Request an den Server, der die Tabelle anlegt)
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createConnectMcpToken, resolveConnectMcpToken, listConnectMcpTokens } from "../src/connect-mcp/tokens";

const url = process.env.DATABASE_URL || "postgres://connect:connect@localhost:5544/connect";

async function main() {
  console.log(`[smoke] connecting to ${url}`);
  const sql = postgres(url);
  // Wir casten auf `any` weil der Server-`Database`-Type Bun-SQL erwartet
  // und der Smoke-Test mit postgres-js läuft (das Schema wird hier nicht
  // gebraucht — wir nutzen nur `db.execute(sql\`...\`)`).
  const db = drizzle(sql) as unknown as import("../src/db/client").Database;

  console.log("[smoke] creating probe token (60s lifetime)...");
  const probe = await createConnectMcpToken(db, {
    userId: "dev-local-user",
    label: "Smoke-Test Probe",
    lifetime: "probe",
  });
  console.log(`[smoke] probe token id=${probe.id} expires=${probe.expiresAt}`);
  console.log(`[smoke] probe plaintext=${probe.plaintextToken.slice(0, 12)}…`);

  const resolved = await resolveConnectMcpToken(db, probe.plaintextToken);
  console.log(`[smoke] resolved=${JSON.stringify(resolved)}`);

  console.log("[smoke] creating permanent token...");
  const permanent = await createConnectMcpToken(db, {
    userId: "dev-local-user",
    label: "Smoke-Test Permanent",
    lifetime: "permanent",
  });
  console.log(`[smoke] permanent token id=${permanent.id}`);
  console.log(`[smoke] permanent plaintext=${permanent.plaintextToken}`);
  // Diese Zeile in eine Datei schreiben, damit wir sie im curl nutzen können.
  const fs = await import("node:fs");
  const path = await import("node:path");
  const tokenFile = path.resolve(process.cwd(), "..", "..", ".plan", ".mcp-token");
  fs.writeFileSync(tokenFile, permanent.plaintextToken);
  console.log(`[smoke] wrote token to ${tokenFile}`);

  const all = await listConnectMcpTokens(db, "dev-local-user");
  console.log(`[smoke] tokens for dev-local-user: ${all.length}`);
  for (const t of all) {
    console.log(`  - ${t.id} label="${t.label}" lifetime=${t.lifetime} scope=${t.scope}`);
  }

  console.log("[smoke] OK");
  await sql.end();
}

main().catch((e) => {
  console.error("[smoke] FAILED:", e);
  process.exit(1);
});
