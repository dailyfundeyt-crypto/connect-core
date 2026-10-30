import fs from "fs";
import path from "path";
import type { CompanyToolToggle } from "../../contracts/v06/company-tools";

// In-Memory-Speicher fuer Tests und Fallback
const inMemoryToggles = new Map<string, Map<string, CompanyToolToggle>>();

export function resetMemoryToggles(): void {
  inMemoryToggles.clear();
}

function getDatabaseUrl(): string | null {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    return process.env.DATABASE_URL;
  }
  try {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const envPath = path.join(localAppData, "ConnectApp", "data", "connect.env");
      if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, "utf8").split("\n");
        let pass = "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("CONNECT_APP_DB_PASSWORD=")) {
            pass = trimmed.substring("CONNECT_APP_DB_PASSWORD=".length).trim();
            if ((pass.startsWith('"') && pass.endsWith('"')) || (pass.startsWith("'") && pass.endsWith("'"))) {
              pass = pass.slice(1, -1);
            }
          }
        }
        if (pass) {
          return `postgres://connect:${pass}@127.0.0.1:5544/connect`;
        }
      }
    }
  } catch {
    // Fallback ignorieren
  }
  return null;
}

let sqlClient: any = null;

function getSql(): any {
  if (sqlClient) return sqlClient;
  const url = getDatabaseUrl();
  if (!url) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const postgresMod = require("postgres");
    const postgres = postgresMod.default || postgresMod;
    sqlClient = postgres(url, { max: 2, idle_timeout: 5, connect_timeout: 3 });
    return sqlClient;
  } catch {
    return null;
  }
}

/**
 * Liest gespeicherte Toggles fuer ein Unternehmen aus DB oder In-Memory.
 */
export async function getStoredCompanyToolToggles(
  companyId: string,
  dbOverride?: any,
): Promise<Map<string, CompanyToolToggle>> {
  const result = new Map<string, CompanyToolToggle>();

  // 1. Memory Zuerst einlesen
  const memMap = inMemoryToggles.get(companyId);
  if (memMap) {
    for (const [k, v] of memMap.entries()) {
      result.set(k, { ...v });
    }
  }

  // 2. Falls DB verfuegbar, DB-Werte ueberschreiben / ergaenzen
  const sql = dbOverride || getSql();
  if (sql) {
    try {
      const rows = await sql`
        SELECT company_id, tool_id, enabled, updated_at
        FROM company_tool_toggles
        WHERE company_id = ${companyId}
      `;
      for (const row of rows) {
        result.set(row.tool_id, {
          companyId: row.company_id,
          toolId: row.tool_id,
          enabled: Boolean(row.enabled),
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
        });
      }
    } catch {
      // Bei DB-Fehler (Tabelle noch nicht migriert o.ae.) Memory-Store nutzen
    }
  }

  return result;
}

/**
 * Setzt oder aktualisiert einen Toggle in DB und In-Memory.
 */
export async function saveCompanyToolToggle(
  companyId: string,
  toolId: string,
  enabled: boolean,
  dbOverride?: any,
): Promise<CompanyToolToggle> {
  const now = new Date().toISOString();
  const toggle: CompanyToolToggle = {
    companyId,
    toolId,
    enabled,
    updatedAt: now,
  };

  // In Memory speichern
  let companyMap = inMemoryToggles.get(companyId);
  if (!companyMap) {
    companyMap = new Map();
    inMemoryToggles.set(companyId, companyMap);
  }
  companyMap.set(toolId, toggle);

  // In DB speichern, falls verfuegbar
  const sql = dbOverride || getSql();
  if (sql) {
    try {
      await sql`
        INSERT INTO company_tool_toggles (company_id, tool_id, enabled, updated_at)
        VALUES (${companyId}, ${toolId}, ${enabled}, ${new Date()})
        ON CONFLICT (company_id, tool_id)
        DO UPDATE SET
          enabled = EXCLUDED.enabled,
          updated_at = EXCLUDED.updated_at
      `;
    } catch {
      // In-Memory dient als Rueckfall-Sicherheit
    }
  }

  return toggle;
}
