/**
 * Connect Store Installation Service (v06)
 * Installiert Listings in Firmen je kind (Tool, MCP, Skill, Company) mit Berechtigungs-Bestaetigung.
 */

import fs from "fs";
import path from "path";
import type { StoreListing, StoreKind } from "../../contracts/v06/store";
import type { StoreInstallRecord, PackagePermission } from "./manifest";
import { getStoreListingById } from "./listings";
import { setCompanyToolToggleState } from "../company-tools/service";

// In-Memory Speicher fuer Installationen (fuer Tests und Fallback)
const inMemoryInstalls = new Map<string, StoreInstallRecord>();

// In-Memory MCP- und Skill-Registries fuer Test- und Fallback-Verifikation
export const inMemoryInstalledMcp = new Map<string, any>();
export const inMemoryInstalledSkills = new Map<string, any>();
export const inMemoryInstalledCompanies = new Map<string, any>();

export function resetMemoryInstalls(): void {
  inMemoryInstalls.clear();
  inMemoryInstalledMcp.clear();
  inMemoryInstalledSkills.clear();
  inMemoryInstalledCompanies.clear();
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
    // Ignorieren
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

export interface InstallPackageOptions {
  listingId: string;
  targetCompanyId: string;
  userId?: string;
  confirmPermissions?: boolean;
  acceptedPermissions?: string[];
  dbOverride?: any;
}

export interface InstallPackageResult {
  ok: boolean;
  listingId?: string;
  companyId?: string;
  kind?: StoreKind;
  version?: string;
  requireConfirmation?: boolean;
  permissions?: PackagePermission[];
  permissionsAccepted?: string[];
  installedItem?: any;
  message?: string;
  error?: string;
}

/**
 * Ermittelt die deklarierten Berechtigungen eines Listings.
 */
export function getListingPermissions(listing: StoreListing): PackagePermission[] {
  const spec = (listing.installSpec as Record<string, any>) || {};
  if (Array.isArray(spec.permissions)) {
    return spec.permissions;
  }
  return [];
}

/**
 * Führt die Installation eines Listings in eine Firma durch.
 */
export async function installPackage(options: InstallPackageOptions): Promise<InstallPackageResult> {
  const { listingId, targetCompanyId, userId = "admin", dbOverride } = options;

  if (!listingId || !targetCompanyId) {
    return { ok: false, error: "listingId and targetCompanyId are required." };
  }

  // 1. Listing abrufen
  const listing = await getStoreListingById(listingId, dbOverride);
  if (!listing) {
    return { ok: false, error: `Store listing '${listingId}' not found.` };
  }

  // 2. Status-Prüfung: Nur 'published' Listings dürfen installiert werden
  if (listing.status !== "published") {
    return {
      ok: false,
      error: `Listing '${listing.name}' cannot be installed because it is currently in status '${listing.status}'.`,
    };
  }

  // 3. Berechtigungsabfrage
  const declaredPermissions = getListingPermissions(listing);
  if (declaredPermissions.length > 0) {
    const hasConfirmation =
      options.confirmPermissions === true ||
      (Array.isArray(options.acceptedPermissions) && options.acceptedPermissions.length > 0);

    if (!hasConfirmation) {
      return {
        ok: false,
        requireConfirmation: true,
        listingId: listing.id,
        companyId: targetCompanyId,
        permissions: declaredPermissions,
        message: "Berechtigungen müssen vor der Installation bestätigt werden.",
      };
    }
  }

  const spec = (listing.installSpec as Record<string, any>) || {};
  let installedItem: any = null;

  // 4. Kind-spezifische Installation
  switch (listing.kind) {
    case "tool": {
      // Tool in Company-Tools registrieren & aktivieren
      const toolId = spec.toolId || listing.slug;
      try {
        const toggle = await setCompanyToolToggleState(targetCompanyId, toolId, true, dbOverride);
        installedItem = { toolId, enabled: true, toggle, name: spec.name || listing.name };
      } catch (err: any) {
        // Fallback falls company-tools DB nicht erreichbar ist
        installedItem = { toolId, enabled: true, name: spec.name || listing.name };
      }
      break;
    }

    case "mcp": {
      // MCP-Server registrieren
      const serverId = spec.serverId || listing.slug;
      const mcpEntry = {
        id: serverId,
        title: spec.title || listing.name,
        vendor: spec.vendor || "Community",
        url: spec.url || `mcp://${serverId}`,
        transport: spec.transport || "stdio",
        command: spec.command,
        args: spec.args || [],
        env: spec.env || {},
        installedAt: new Date().toISOString(),
        companyId: targetCompanyId,
      };

      inMemoryInstalledMcp.set(`${targetCompanyId}:${serverId}`, mcpEntry);

      const sql = dbOverride || getSql();
      if (sql) {
        try {
          await sql`
            INSERT INTO mcp_servers (id, title, vendor, url, provenance)
            VALUES (${serverId}, ${mcpEntry.title}, ${mcpEntry.vendor}, ${mcpEntry.url}, 'custom')
            ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, url = EXCLUDED.url
          `;
        } catch {
          // Tabelle existiert ggf. noch nicht
        }
      }

      installedItem = mcpEntry;
      break;
    }

    case "skill": {
      // Skill registrieren
      const skillSlug = spec.slug || listing.slug;
      const skillEntry = {
        id: `skill-${skillSlug}`,
        slug: skillSlug,
        title: spec.title || listing.name,
        summary: spec.summary || listing.summary,
        instructions: spec.instructions || listing.description,
        tools: spec.tools || [],
        origin: "catalogue",
        installedBy: userId,
        companyId: targetCompanyId,
        installedAt: new Date().toISOString(),
      };

      inMemoryInstalledSkills.set(`${targetCompanyId}:${skillSlug}`, skillEntry);

      const sql = dbOverride || getSql();
      if (sql) {
        try {
          await sql`
            INSERT INTO skills (id, slug, title, summary, instructions, origin, installed_by, created_at, updated_at)
            VALUES (
              ${skillEntry.id},
              ${skillEntry.slug},
              ${skillEntry.title},
              ${skillEntry.summary},
              ${skillEntry.instructions},
              'catalogue',
              ${userId},
              NOW(),
              NOW()
            )
            ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary
          `;
        } catch {
          // DB Fallback
        }
      }

      installedItem = skillEntry;
      break;
    }

    case "company": {
      // Vorlage für Firma importieren
      const companyId = targetCompanyId;
      const companyEntry = {
        id: companyId,
        name: spec.name || listing.name,
        description: spec.description || listing.summary,
        accent: spec.accent || "linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)",
        tools: Array.isArray(spec.tools) ? spec.tools : ["analysis", "flux", "brain", "connect-sozial"],
        agentIds: Array.isArray(spec.agentIds) ? spec.agentIds : ["analyst", "coder"],
        importedFromTemplate: listing.slug,
        importedAt: new Date().toISOString(),
      };

      inMemoryInstalledCompanies.set(companyId, companyEntry);

      // Zugehörige Tools aktivieren
      if (Array.isArray(spec.tools)) {
        for (const tId of spec.tools) {
          try {
            await setCompanyToolToggleState(companyId, tId, true, dbOverride);
          } catch {
            // Ignorieren
          }
        }
      }

      installedItem = companyEntry;
      break;
    }

    default:
      return { ok: false, error: `Unsupported package kind: ${(listing as any).kind}` };
  }

  // 5. Installations-Datensatz erstellen und persistieren
  const installRecordId = `inst-${targetCompanyId}-${listing.slug}`;
  const acceptedList = options.acceptedPermissions || declaredPermissions;

  const installRecord: StoreInstallRecord = {
    id: installRecordId,
    listingId: listing.id,
    companyId: targetCompanyId,
    version: listing.version,
    installedBy: userId,
    installedAt: new Date().toISOString(),
    status: "active",
    permissionsAccepted: acceptedList,
    metadata: {
      kind: listing.kind,
      name: listing.name,
      slug: listing.slug,
    },
  };

  inMemoryInstalls.set(`${targetCompanyId}:${listing.id}`, installRecord);

  const sql = dbOverride || getSql();
  if (sql) {
    try {
      await sql`
        INSERT INTO store_installs (
          id, listing_id, company_id, version, installed_by, installed_at,
          status, permissions_accepted, metadata
        ) VALUES (
          ${installRecord.id},
          ${installRecord.listingId},
          ${installRecord.companyId},
          ${installRecord.version},
          ${installRecord.installedBy},
          NOW(),
          'active',
          ${JSON.stringify(installRecord.permissionsAccepted)},
          ${JSON.stringify(installRecord.metadata || {})}
        )
        ON CONFLICT (id) DO UPDATE SET
          version = EXCLUDED.version,
          status = 'active',
          permissions_accepted = EXCLUDED.permissions_accepted,
          installed_at = NOW()
      `;
    } catch {
      // Fallback
    }
  }

  return {
    ok: true,
    listingId: listing.id,
    companyId: targetCompanyId,
    kind: listing.kind,
    version: listing.version,
    permissionsAccepted: acceptedList,
    installedItem,
    message: `Package '${listing.name}' successfully installed into company '${targetCompanyId}'.`,
  };
}

/**
 * Ruft alle in einer Firma installierten Store-Pakete ab.
 */
export async function listCompanyInstalls(
  companyId: string,
  dbOverride?: any,
): Promise<StoreInstallRecord[]> {
  const sql = dbOverride || getSql();
  if (sql) {
    try {
      const rows = await sql`
        SELECT id, listing_id, company_id, version, installed_by, installed_at,
               status, permissions_accepted, metadata
        FROM store_installs
        WHERE company_id = ${companyId} AND status = 'active'
        ORDER BY installed_at DESC
      `;
      if (rows && rows.length > 0) {
        return rows.map((r: any) => ({
          id: r.id,
          listingId: r.listing_id,
          companyId: r.company_id,
          version: r.version,
          installedBy: r.installed_by,
          installedAt: r.installed_at ? new Date(r.installed_at).toISOString() : new Date().toISOString(),
          status: r.status,
          permissionsAccepted: Array.isArray(r.permissions_accepted) ? r.permissions_accepted : [],
          metadata: r.metadata || {},
        }));
      }
    } catch {
      // Fallback
    }
  }

  const results: StoreInstallRecord[] = [];
  for (const item of inMemoryInstalls.values()) {
    if (item.companyId === companyId && item.status === "active") {
      results.push(item);
    }
  }
  return results;
}
