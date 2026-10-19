/**
 * Connect Social in der lokalen App (3101): eigene, ausgehende Verbindung zur zentralen Supabase-DB
 * über %LOCALAPPDATA%\ConnectApp\data\pc-bridge.env (PC_BRIDGE_DATABASE_URL, Transaction-Pooler 6543,
 * prepare:false). Der lokale Nutzer wird über seine E-Mail dem Supabase-Konto zugeordnet.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SQL } from "bun";
import type { Actor, SocialBackend } from "./routes";
import type { Q } from "./store";

function configFile(): string {
  const base = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ConnectApp", "data") : join(homedir(), ".connect-app");
  return join(base, "pc-bridge.env");
}

export function readSocialDatabaseUrl(): string | null {
  const direct = process.env.CONNECT_SOCIAL_DATABASE_URL?.trim();
  if (direct) return direct;
  const fromEnv = process.env.PC_BRIDGE_DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;
  const file = process.env.PC_BRIDGE_ENV_FILE || configFile();
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const match = /^\s*PC_BRIDGE_DATABASE_URL\s*=\s*(.*)\s*$/.exec(line);
    if (match?.[1]) return match[1].replace(/^["']|["']$/g, "").trim() || null;
  }
  return null;
}

/** Bun kann unter Windows keine ganze postgres-URL nehmen (oven-sh/bun#27713) → Teile übergeben. */
function connect(url: string): Q {
  const parsed = new URL(url);
  const params = Object.fromEntries(parsed.searchParams);
  const sslmode = params.sslmode;
  const tls = sslmode === undefined ? true : !["disable", "allow", "prefer"].includes(sslmode);
  const client = new SQL({
    adapter: "postgres",
    hostname: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "postgres",
    ...(tls ? { tls: true } : {}),
    prepare: false,
    max: 3,
    idleTimeout: 30,
  } as never);
  return async (text, values = []) => (await client.unsafe(text, values as never[])) as unknown as Record<string, unknown>[];
}

export function localSocialBackend(): SocialBackend {
  let q: Q | null = null;
  let tried = false;
  const owners = new Map<string, { id: string | null; at: number }>();
  return {
    label: "local→supabase",
    query: () => {
      if (!tried) {
        tried = true;
        const url = readSocialDatabaseUrl();
        if (url) {
          try {
            q = connect(url);
          } catch (error) {
            console.error("[social] Verbindung fehlgeschlagen", error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/[^\s]+/gi, "***") : error);
          }
        }
      }
      return q;
    },
    owner: async (query, actor: Actor) => {
      const email = actor.email?.trim().toLowerCase();
      if (!email) return null;
      const cached = owners.get(email);
      if (cached && Date.now() - cached.at < (cached.id ? 3_600_000 : 60_000)) return cached.id;
      const [row] = await query(`SELECT id FROM users WHERE lower(email) = $1 LIMIT 1`, [email]);
      const id = row ? String(row.id) : null;
      owners.set(email, { id, at: Date.now() });
      return id;
    },
  };
}
