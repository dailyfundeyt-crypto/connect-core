import fs from "fs";
import path from "path";
import type { CompanyAppToggle } from "../../contracts/swarm-v3/types";

export interface AppDefinition {
  appId: string;
  appName: string;
  appLogo?: string;
  description?: string;
  sort: number;
  defaultEnabled: boolean;
}

/**
 * Standard-Apps, die in Connect für jede Company verfügbar sind.
 * Bisher sichtbare Apps sind standardmäßig aktiviert (Bestandsverhalten).
 */
export const CANONICAL_COMPANY_APPS: AppDefinition[] = [
  {
    appId: "connect-sozial",
    appName: "Connect Sozial",
    appLogo: "/brand/connect-logo.png",
    description: "Social-Media-Feed mit Artikeln, AI und Follower-Profilen",
    sort: 10,
    defaultEnabled: true,
  },
  {
    appId: "flux",
    appName: "Flux",
    appLogo: "/brand/flux-logo.png",
    description: "Multiposter, Verkauf und Warenverwaltung",
    sort: 20,
    defaultEnabled: true,
  },
  {
    appId: "analysis",
    appName: "Analysis",
    appLogo: "/brand/analysis-logo.png",
    description: "Feed, Suche, Cohorts und Unternehmensprofile",
    sort: 30,
    defaultEnabled: true,
  },
  {
    appId: "brain",
    appName: "Brain",
    appLogo: "/brand/brain-logo.png",
    description: "Wissensgraph: Notizen, Links und Zeitachse",
    sort: 40,
    defaultEnabled: true,
  },
  {
    appId: "finance",
    appName: "Finance",
    appLogo: "/brand/finance-logo.png",
    description: "Buchhaltung, UStVA, BWA — GoBD-konform",
    sort: 50,
    defaultEnabled: true,
  },
];

let sqlInstance: any = null;

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
    // Ignore fallback
  }
  return null;
}

function getSql(): any {
  if (sqlInstance) return sqlInstance;
  const url = getDatabaseUrl();
  if (!url) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const postgresMod = require("postgres");
    const postgres = postgresMod.default || postgresMod;
    sqlInstance = postgres(url, { max: 2, idle_timeout: 5, connect_timeout: 3 });
    return sqlInstance;
  } catch {
    return null;
  }
}

// In-Memory Fallback für Single-Process oder wenn Postgres temporär nicht antwortet
const inMemoryStore = new Map<string, Map<string, CompanyAppToggle>>();

function getMemoryCompanyMap(companyId: string): Map<string, CompanyAppToggle> {
  let companyMap = inMemoryStore.get(companyId);
  if (!companyMap) {
    companyMap = new Map();
    for (const def of CANONICAL_COMPANY_APPS) {
      companyMap.set(def.appId, {
        companyId,
        appId: def.appId,
        enabled: def.defaultEnabled,
        sort: def.sort,
        appName: def.appName,
        appLogo: def.appLogo,
        updatedAt: new Date().toISOString(),
      });
    }
    inMemoryStore.set(companyId, companyMap);
  }
  return companyMap;
}

/**
 * Liest alle App-Toggles für ein Unternehmen.
 * Standardmäßig sind bisher sichtbare Apps aktiviert.
 */
export async function getCompanyApps(companyId: string): Promise<CompanyAppToggle[]> {
  const sql = getSql();
  if (sql) {
    try {
      const rows = await sql`
        SELECT
          company_id,
          app_id,
          enabled,
          sort,
          app_name,
          app_logo,
          updated_at
        FROM company_app_toggles
        WHERE company_id = ${companyId}
        ORDER BY sort ASC, app_id ASC
      `;

      const existingMap = new Map<string, any>();
      for (const row of rows) {
        existingMap.set(row.app_id, row);
      }

      const result: CompanyAppToggle[] = [];

      // 1. Zuerst vorhandene Zeilen aus DB
      for (const row of rows) {
        const canonical = CANONICAL_COMPANY_APPS.find((a) => a.appId === row.app_id);
        result.push({
          companyId: row.company_id,
          appId: row.app_id,
          enabled: Boolean(row.enabled),
          sort: Number(row.sort ?? 0),
          appName: row.app_name || canonical?.appName || row.app_id,
          appLogo: row.app_logo || canonical?.appLogo || undefined,
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
        });
      }

      // 2. Bekannte Apps, die noch nicht in der DB stehen, als enabled hinzufügen
      for (const def of CANONICAL_COMPANY_APPS) {
        if (!existingMap.has(def.appId)) {
          result.push({
            companyId,
            appId: def.appId,
            enabled: def.defaultEnabled,
            sort: def.sort,
            appName: def.appName,
            appLogo: def.appLogo,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      result.sort((a, b) => a.sort - b.sort);
      return result;
    } catch {
      // Fallback zu MemoryStore bei DB-Fehler
    }
  }

  const memoryMap = getMemoryCompanyMap(companyId);
  const list = Array.from(memoryMap.values());
  list.sort((a, b) => a.sort - b.sort);
  return list;
}

/**
 * Aktualisiert die Toggles für ein Unternehmen.
 */
export async function updateCompanyApps(
  companyId: string,
  updates: Array<{ appId: string; enabled: boolean; sort?: number }>
): Promise<CompanyAppToggle[]> {
  const sql = getSql();
  const now = new Date();

  if (sql) {
    try {
      for (const item of updates) {
        const canonical = CANONICAL_COMPANY_APPS.find((a) => a.appId === item.appId);
        const appName = canonical?.appName || item.appId;
        const appLogo = canonical?.appLogo || null;
        const sortVal = item.sort !== undefined ? item.sort : (canonical?.sort ?? 0);

        await sql`
          INSERT INTO company_app_toggles (
            company_id,
            app_id,
            enabled,
            sort,
            app_name,
            app_logo,
            updated_at
          ) VALUES (
            ${companyId},
            ${item.appId},
            ${item.enabled},
            ${sortVal},
            ${appName},
            ${appLogo},
            ${now}
          )
          ON CONFLICT (company_id, app_id)
          DO UPDATE SET
            enabled = EXCLUDED.enabled,
            sort = COALESCE(EXCLUDED.sort, company_app_toggles.sort),
            updated_at = EXCLUDED.updated_at
        `;
      }
      return await getCompanyApps(companyId);
    } catch {
      // Fallback zu MemoryStore bei DB-Fehler
    }
  }

  const memoryMap = getMemoryCompanyMap(companyId);
  for (const item of updates) {
    const existing = memoryMap.get(item.appId);
    const canonical = CANONICAL_COMPANY_APPS.find((a) => a.appId === item.appId);
    memoryMap.set(item.appId, {
      companyId,
      appId: item.appId,
      enabled: item.enabled,
      sort: item.sort !== undefined ? item.sort : (existing?.sort ?? canonical?.sort ?? 0),
      appName: existing?.appName || canonical?.appName || item.appId,
      appLogo: existing?.appLogo || canonical?.appLogo,
      updatedAt: now.toISOString(),
    });
  }

  const list = Array.from(memoryMap.values());
  list.sort((a, b) => a.sort - b.sort);
  return list;
}
