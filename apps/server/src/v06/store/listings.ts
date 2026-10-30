/**
 * Connect Store Listings Service (v06)
 * Katalog, Suche, Filterung und Persistenz für Store-Listings.
 */

import fs from "fs";
import path from "path";
import type { StoreListing, StoreKind, StoreListingStatus } from "../../contracts/v06/store";

// In-Memory Repository fuer schnelle Abfragen, Fallback und Unit-Tests
const inMemoryListings = new Map<string, StoreListing>();

export function resetMemoryListings(): void {
  inMemoryListings.clear();
  seedInitialListings();
}

/**
 * Liefert Standard-Listings, falls der Store initial leer ist.
 */
export function seedInitialListings(): void {
  const seeds: StoreListing[] = [
    {
      id: "listing-tool-markettrace",
      kind: "tool",
      slug: "markettrace",
      name: "MarketTrace Analysis",
      version: "1.0.0",
      authorId: "stefan",
      iconUrl: "/brand/analysis-logo.png",
      screenshots: ["/brand/analysis-logo.png"],
      summary: "Echtzeit-Finanzdaten, Charts und Markt-Sentiment.",
      description: "Interaktives Tool zur schnellen Visualisierung von Wertpapierkursen und Indizes.",
      installSpec: {
        toolId: "markettrace",
        name: "MarketTrace Analysis",
        logoUrl: "/brand/analysis-logo.png",
        kind: "custom",
        url: "https://markettrace.io",
      },
      priceCents: 0,
      status: "published",
    },
    {
      id: "listing-mcp-github",
      kind: "mcp",
      slug: "github-connector-mcp",
      name: "GitHub Connector MCP",
      version: "1.2.0",
      authorId: "stefan",
      iconUrl: "/brand/connect-logo.png",
      screenshots: ["/brand/connect-logo.png"],
      summary: "Ermöglicht Bots Zugriff auf Repositories, PRs und Issues.",
      description: "Verbindet Connect-Agenten über das Model Context Protocol direkt mit GitHub.",
      installSpec: {
        serverId: "github-connector",
        title: "GitHub Connector",
        vendor: "GitHub",
        url: "mcp://github.com",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      },
      priceCents: 0,
      status: "published",
    },
    {
      id: "listing-skill-social-curator",
      kind: "skill",
      slug: "social-curator",
      name: "Social Content Kurator",
      version: "1.0.0",
      authorId: "stefan",
      iconUrl: "/brand/spark-logo.jpg",
      screenshots: ["/brand/spark-logo.jpg"],
      summary: "Erstellt X- und LinkedIn-Beiträge aus Notizen und Links.",
      description: "Generiert packende Kurzbeiträge mit Hashtags aus dem aktuellen Projektkontext.",
      installSpec: {
        slug: "social-curator",
        title: "Social Content Kurator",
        summary: "Erstellt Social-Posts",
        instructions: "Du bist ein erfahrener Social-Media-Manager. Verfasse klare, engagierende Beiträge.",
        tools: ["brain", "connect-sozial"],
      },
      priceCents: 0,
      status: "published",
    },
    {
      id: "listing-company-startup",
      kind: "company",
      slug: "startup-starter-kit",
      name: "Startup Starter Kit",
      version: "1.0.0",
      authorId: "stefan",
      iconUrl: "/flux-logo.png",
      screenshots: ["/flux-logo.png"],
      summary: "Komplette Firmenvorlage mit Analyst, Coder und Standard-Tools.",
      description: "Optimierte Struktur für moderne Entwickler-Teams mit vorinstallierten Bots und Workflows.",
      installSpec: {
        name: "Startup Tech Labs",
        description: "Agile Softwareentwicklung und KI-Prototyping",
        accent: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
        tools: ["analysis", "flux", "brain", "connect-sozial"],
        agentIds: ["analyst", "coder"],
      },
      priceCents: 0,
      status: "published",
    },
    {
      id: "listing-skill-link-curator",
      kind: "skill",
      slug: "link-curator",
      name: "Link-Kurator (Instagram → Spark)",
      version: "1.0.0",
      authorId: "stefan",
      iconUrl: "/brand/spark-logo.jpg",
      screenshots: ["/brand/spark-logo.jpg"],
      summary: "Extrahiert Tools aus Instagram-Videos via getthescript.app und sortiert Links + Notizen in Spark ein.",
      description:
        "Intelligenter Kurator-Agent auf Basis der Antigravity-CLI. Analysiert Instagram-Reels und -Videos im isolierten Helium-Browser-Profil, transkribiert Inhalte via getthescript.app, filtert Software-Tools heraus und legt Links samt Notizen („wofür welches Tool“) in Spark-Browser-Ordnern ab. Strikter Duplikatschutz und sicherer Dry-Run-Modus.",
      installSpec: {
        slug: "link-curator",
        title: "Link-Kurator (Instagram → Spark)",
        agentId: "agent_link_curator",
        cliCommand: "agy run link-curator",
        cliProvider: "antigravity",
        instructions:
          "Du bist der Link-Kurator-Agent. Du transkribierst Instagram-Reels via getthescript.app im isolierten Browser-Profil und speicherst extrahierte Tools in Spark-Ordnern.",
        tools: ["spark-mcp"],
        browserProfile: "agent_link_curator",
        defaultDryRun: true,
        featureFlag: "linkCurator",
      },
      priceCents: 0,
      status: "published",
    },
  ];

  for (const s of seeds) {
    inMemoryListings.set(s.id, s);
  }
}

// Initial beim Laden ausführen
seedInitialListings();

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
    // Fallback
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

export interface ListStoreOptions {
  q?: string;
  kind?: StoreKind;
  status?: StoreListingStatus;
  authorId?: string;
  includeAllStatus?: boolean;
}

/**
 * Filtert und durchsucht Listings.
 */
export async function listStoreListings(
  options: ListStoreOptions = {},
  dbOverride?: any,
): Promise<StoreListing[]> {
  const sql = dbOverride || getSql();

  // 1. Falls DB vorhanden ist, versuchen aus Postgres zu lesen
  if (sql) {
    try {
      const rows = await sql`
        SELECT id, kind, slug, name, version, author_id, icon_url, screenshots,
               summary, description, install_spec, price_cents, status
        FROM store_listings
        ORDER BY created_at DESC
      `;
      if (rows && rows.length > 0) {
        // Sync in Memory
        for (const r of rows) {
          const item: StoreListing = {
            id: r.id,
            kind: r.kind as StoreKind,
            slug: r.slug,
            name: r.name,
            version: r.version,
            authorId: r.author_id,
            iconUrl: r.icon_url || "",
            screenshots: Array.isArray(r.screenshots) ? r.screenshots : [],
            summary: r.summary || "",
            description: r.description || "",
            installSpec: r.install_spec || {},
            priceCents: Number(r.price_cents) || 0,
            status: r.status as StoreListingStatus,
          };
          inMemoryListings.set(item.id, item);
        }
      }
    } catch {
      // Postgres-Tabelle existiert noch nicht -> In-Memory Fallback
    }
  }

  // 2. Filter auf Memory-Liste anwenden
  let results = Array.from(inMemoryListings.values());

  // Standardmäßig nur freigegebene ('published') anzeigen, außer Status wurde explizit angefragt
  if (!options.includeAllStatus) {
    const targetStatus = options.status || "published";
    results = results.filter((item) => item.status === targetStatus);
  } else if (options.status) {
    results = results.filter((item) => item.status === options.status);
  }

  if (options.kind) {
    results = results.filter((item) => item.kind === options.kind);
  }

  if (options.authorId) {
    results = results.filter((item) => item.authorId === options.authorId);
  }

  if (options.q && options.q.trim().length > 0) {
    const query = options.q.trim().toLowerCase();
    results = results.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.slug.toLowerCase().includes(query) ||
        item.summary.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query),
    );
  }

  return results;
}

/**
 * Ruft ein einzelnes Listing per ID oder Slug ab.
 */
export async function getStoreListingById(
  idOrSlug: string,
  dbOverride?: any,
): Promise<StoreListing | null> {
  if (!idOrSlug) return null;

  // Direkter Cache-Treffer
  const memoryHit = inMemoryListings.get(idOrSlug);
  if (memoryHit) return memoryHit;

  for (const item of inMemoryListings.values()) {
    if (item.slug === idOrSlug) return item;
  }

  // DB-Prüfung
  const sql = dbOverride || getSql();
  if (sql) {
    try {
      const rows = await sql`
        SELECT id, kind, slug, name, version, author_id, icon_url, screenshots,
               summary, description, install_spec, price_cents, status
        FROM store_listings
        WHERE id = ${idOrSlug} OR slug = ${idOrSlug}
        LIMIT 1
      `;
      if (rows && rows.length > 0) {
        const r = rows[0];
        const item: StoreListing = {
          id: r.id,
          kind: r.kind as StoreKind,
          slug: r.slug,
          name: r.name,
          version: r.version,
          authorId: r.author_id,
          iconUrl: r.icon_url || "",
          screenshots: Array.isArray(r.screenshots) ? r.screenshots : [],
          summary: r.summary || "",
          description: r.description || "",
          installSpec: r.install_spec || {},
          priceCents: Number(r.price_cents) || 0,
          status: r.status as StoreListingStatus,
        };
        inMemoryListings.set(item.id, item);
        return item;
      }
    } catch {
      // Ignorieren
    }
  }

  return null;
}

/**
 * Erstellt oder aktualisiert ein Listing.
 */
export async function saveStoreListing(
  listing: StoreListing,
  dbOverride?: any,
): Promise<StoreListing> {
  inMemoryListings.set(listing.id, listing);

  const sql = dbOverride || getSql();
  if (sql) {
    try {
      await sql`
        INSERT INTO store_listings (
          id, kind, slug, name, version, author_id, icon_url, screenshots,
          summary, description, install_spec, price_cents, status, updated_at
        ) VALUES (
          ${listing.id},
          ${listing.kind},
          ${listing.slug},
          ${listing.name},
          ${listing.version},
          ${listing.authorId},
          ${listing.iconUrl},
          ${JSON.stringify(listing.screenshots || [])},
          ${listing.summary},
          ${listing.description},
          ${JSON.stringify(listing.installSpec || {})},
          ${listing.priceCents || 0},
          ${listing.status},
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          version = EXCLUDED.version,
          icon_url = EXCLUDED.icon_url,
          screenshots = EXCLUDED.screenshots,
          summary = EXCLUDED.summary,
          description = EXCLUDED.description,
          install_spec = EXCLUDED.install_spec,
          status = EXCLUDED.status,
          updated_at = NOW()
      `;
    } catch {
      // DB nicht erreichbar -> In-Memory bleibt aktiv
    }
  }

  return listing;
}

/**
 * Aktualisiert den Status eines Listings (z. B. 'review' -> 'published').
 */
export async function setListingStatus(
  id: string,
  status: StoreListingStatus,
  dbOverride?: any,
): Promise<StoreListing | null> {
  const listing = await getStoreListingById(id, dbOverride);
  if (!listing) return null;

  listing.status = status;
  await saveStoreListing(listing, dbOverride);
  return listing;
}
