/**
 * Store Service (Lane 8)
 * Manages Store catalog, publishing, versioning, installs per company, and reviews.
 * Dual-persistence: Local Postgres 5544 + resilient in-memory cache.
 */

import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import type { StoreItem } from "@connect/contracts/api";
import {
  calculateManifestHash,
  generateVerificationSignature,
  resolveCategoryForType,
  validateAndCanonizeManifest,
} from "./manifest";
import type {
  StoreCategory,
  StoreInstallInfo,
  StoreItemDetail,
  StoreManifest,
  StorePackageType,
  StoreReviewSummary,
  StoreVersionSummary,
} from "./types";

const POSTGRES_URL_5544 =
  (process.env.DATABASE_URL ?? "");

export class StoreService {
  private items: Map<string, StoreItemDetail> = new Map();
  private versions: Map<string, StoreVersionSummary[]> = new Map();
  private installs: Map<string, StoreInstallInfo[]> = new Map(); // key = itemId:companyId
  private reviews: Map<string, StoreReviewSummary[]> = new Map();
  private sqlClient: ReturnType<typeof postgres> | null = null;
  private dbConnected = false;

  constructor() {
    this.seedDefaults();
    void this.initDatabase();
  }

  private getSql(): ReturnType<typeof postgres> | null {
    if (!this.sqlClient) {
      try {
        const dbUrl =
          process.env.DATABASE_URL && process.env.DATABASE_URL.includes("5544")
            ? process.env.DATABASE_URL
            : POSTGRES_URL_5544;
        this.sqlClient = postgres(dbUrl, { max: 5, idle_timeout: 10, connect_timeout: 3 });
      } catch {
        this.sqlClient = null;
      }
    }
    return this.sqlClient;
  }

  private async initDatabase(): Promise<void> {
    const sql = this.getSql();
    if (!sql) return;

    try {
      // Ensure tables exist if migration 0080 hasn't been executed yet by runner
      await sql`
        CREATE TABLE IF NOT EXISTS store_items (
          id text PRIMARY KEY,
          name text NOT NULL,
          display_name text NOT NULL,
          description text NOT NULL,
          version text NOT NULL,
          category text NOT NULL DEFAULT 'agent',
          author text NOT NULL,
          icon_url text,
          downloads_count integer NOT NULL DEFAULT 0,
          rating real NOT NULL DEFAULT 5.0,
          pricing_type text NOT NULL DEFAULT 'free',
          price text,
          badge text,
          tags jsonb NOT NULL DEFAULT '[]'::jsonb,
          screenshots jsonb NOT NULL DEFAULT '[]'::jsonb,
          permissions_required jsonb NOT NULL DEFAULT '[]'::jsonb,
          entry_point text,
          is_verified boolean NOT NULL DEFAULT true,
          created_at timestamp with time zone NOT NULL DEFAULT now(),
          updated_at timestamp with time zone NOT NULL DEFAULT now()
        );
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS store_versions (
          id text PRIMARY KEY,
          item_id text NOT NULL,
          version text NOT NULL,
          manifest jsonb NOT NULL,
          changelog text,
          package_hash text NOT NULL,
          signature text,
          created_at timestamp with time zone NOT NULL DEFAULT now()
        );
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS store_installs (
          id text PRIMARY KEY,
          item_id text NOT NULL,
          version_id text NOT NULL,
          company_id text NOT NULL,
          installed_by text NOT NULL,
          permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
          status text NOT NULL DEFAULT 'active',
          auto_start boolean NOT NULL DEFAULT false,
          installed_at timestamp with time zone NOT NULL DEFAULT now(),
          updated_at timestamp with time zone NOT NULL DEFAULT now()
        );
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS store_reviews (
          id text PRIMARY KEY,
          item_id text NOT NULL,
          user_id text NOT NULL,
          user_name text NOT NULL,
          rating integer NOT NULL DEFAULT 5,
          comment text NOT NULL,
          created_at timestamp with time zone NOT NULL DEFAULT now()
        );
      `;

      this.dbConnected = true;
      await this.loadFromDatabase();
    } catch {
      // Fallback silently to in-memory mode
      this.dbConnected = false;
    }
  }

  private async loadFromDatabase(): Promise<void> {
    const sql = this.getSql();
    if (!sql || !this.dbConnected) return;

    try {
      const rows = await sql`SELECT * FROM store_items`;
      for (const row of rows) {
        const item: StoreItemDetail = {
          id: row.id,
          name: row.name,
          displayName: row.display_name,
          description: row.description,
          version: row.version,
          category: row.category as StoreCategory,
          itemType: (row.category === "mcp"
            ? "mcp"
            : row.category === "skill"
              ? "skill"
              : row.category === "template"
                ? "company"
                : "tool") as StorePackageType,
          author: row.author,
          iconUrl: row.icon_url,
          downloadsCount: Number(row.downloads_count) || 0,
          rating: Number(row.rating) || 5.0,
          pricingType: row.pricing_type || "free",
          price: row.price,
          badge: row.badge,
          tags: Array.isArray(row.tags) ? row.tags : [],
          screenshots: Array.isArray(row.screenshots) ? row.screenshots : [],
          permissionsRequired: Array.isArray(row.permissions_required) ? row.permissions_required : [],
          entryPoint: row.entry_point,
          isVerified: Boolean(row.is_verified),
          isInstalled: false,
          autoStart: false,
          installedCompanyIds: [],
          createdAt: new Date(row.created_at).toISOString(),
          updatedAt: new Date(row.updated_at).toISOString(),
        };
        this.items.set(item.id, item);
      }

      // Load installs
      const installRows = await sql`SELECT * FROM store_installs WHERE status = 'active'`;
      for (const iRow of installRows) {
        const install: StoreInstallInfo = {
          id: iRow.id,
          itemId: iRow.item_id,
          versionId: iRow.version_id,
          companyId: iRow.company_id,
          installedBy: iRow.installed_by,
          permissions: Array.isArray(iRow.permissions) ? iRow.permissions : [],
          status: iRow.status as "active" | "disabled" | "uninstalled",
          autoStart: Boolean(iRow.auto_start),
          installedAt: new Date(iRow.installed_at).toISOString(),
          updatedAt: new Date(iRow.updated_at).toISOString(),
        };
        const key = `${install.itemId}:${install.companyId}`;
        const existing = this.installs.get(key) ?? [];
        this.installs.set(key, [...existing, install]);

        const itm = this.items.get(install.itemId);
        if (itm) {
          if (!itm.installedCompanyIds.includes(install.companyId)) {
            itm.installedCompanyIds.push(install.companyId);
          }
        }
      }
    } catch {
      // Memory fallback retains defaults
    }
  }

  private seedDefaults(): void {
    const defaultItems: Array<StoreItemDetail & { manifest: StoreManifest }> = [
      // ─── 1. MCP Servers ──────────────────────────────────────────────
      {
        id: "mcp-filesystem",
        name: "filesystem-mcp",
        displayName: "Filesystem MCP Server",
        description: "Sicherer Zugriff auf lokale Verzeichnisse, Dateien und Projekt-Quellcode mit granularen Berechtigungen.",
        version: "1.4.0",
        category: "mcp",
        itemType: "mcp",
        author: "ModelContextProtocol",
        iconUrl: "IconFolder",
        downloadsCount: 1420,
        rating: 4.9,
        pricingType: "free",
        badge: "VERIFIZIERT",
        tags: ["mcp", "filesystem", "system", "local"],
        screenshots: ["https://picsum.photos/seed/mcpfs/800/450"],
        permissionsRequired: ["storage:local", "company:read"],
        entryPoint: "npx -y @modelcontextprotocol/server-filesystem",
        isVerified: true,
        installedCompanyIds: ["flux"],
        createdAt: "2026-09-15T10:00:00Z",
        updatedAt: "2026-10-20T12:00:00Z",
        manifest: {
          id: "mcp-filesystem",
          name: "filesystem-mcp",
          displayName: "Filesystem MCP Server",
          version: "1.4.0",
          type: "mcp",
          category: "mcp",
          description: "Sicherer Zugriff auf lokale Verzeichnisse und Dateien.",
          author: "ModelContextProtocol",
          entryPoint: "npx -y @modelcontextprotocol/server-filesystem",
          permissions: ["storage:local", "company:read"],
        },
      },
      {
        id: "mcp-github",
        name: "github-mcp",
        displayName: "GitHub MCP Connector",
        description: "Repositories durchsuchen, Commits analysieren, Pull Requests erstellen und Issues direkt steuern.",
        version: "2.1.0",
        category: "mcp",
        itemType: "mcp",
        author: "GitHub Inc.",
        iconUrl: "IconBrandGithub",
        downloadsCount: 2890,
        rating: 4.8,
        pricingType: "free",
        badge: "POPULÄR",
        tags: ["mcp", "github", "git", "devops"],
        screenshots: ["https://picsum.photos/seed/mcpgit/800/450"],
        permissionsRequired: ["network:outbound"],
        entryPoint: "npx -y @modelcontextprotocol/server-github",
        isVerified: true,
        installedCompanyIds: ["flux"],
        createdAt: "2026-09-18T10:00:00Z",
        updatedAt: "2026-10-21T09:00:00Z",
        manifest: {
          id: "mcp-github",
          name: "github-mcp",
          displayName: "GitHub MCP Connector",
          version: "2.1.0",
          type: "mcp",
          category: "mcp",
          description: "Repositories, Commits, PRs und Issues steuern.",
          author: "GitHub Inc.",
          entryPoint: "npx -y @modelcontextprotocol/server-github",
          permissions: ["network:outbound"],
        },
      },
      {
        id: "mcp-postgres",
        name: "postgres-mcp",
        displayName: "PostgreSQL Database Engine",
        description: "Tabellen inspizieren, SQL-Abfragen ausführen und Migrationen über Standard-MCP-Verbindung testen.",
        version: "1.2.3",
        category: "mcp",
        itemType: "mcp",
        author: "Helium Team",
        iconUrl: "IconDatabase",
        downloadsCount: 1150,
        rating: 5.0,
        pricingType: "free",
        badge: "OFFIZIELL",
        tags: ["mcp", "sql", "postgres", "database"],
        screenshots: ["https://picsum.photos/seed/mcppg/800/450"],
        permissionsRequired: ["storage:local", "network:outbound"],
        entryPoint: "postgres://127.0.0.1:5544/connect",
        isVerified: true,
        installedCompanyIds: [],
        createdAt: "2026-09-22T10:00:00Z",
        updatedAt: "2026-10-19T14:00:00Z",
        manifest: {
          id: "mcp-postgres",
          name: "postgres-mcp",
          displayName: "PostgreSQL Database Engine",
          version: "1.2.3",
          type: "mcp",
          category: "mcp",
          description: "Postgres-Tabellen und SQL-Abfragen.",
          author: "Helium Team",
          entryPoint: "postgres://127.0.0.1:5544/connect",
          permissions: ["storage:local", "network:outbound"],
        },
      },
      {
        id: "mcp-brave-search",
        name: "brave-search-mcp",
        displayName: "Brave Web Search API",
        description: "Recherchiere im Live-Web mit der unabhängigen Brave Search API für agentische Rechercheaufgaben.",
        version: "1.0.5",
        category: "mcp",
        itemType: "mcp",
        author: "Brave Software",
        iconUrl: "IconWorld",
        downloadsCount: 3200,
        rating: 4.7,
        pricingType: "free",
        badge: "NEU",
        tags: ["mcp", "search", "web", "research"],
        screenshots: ["https://picsum.photos/seed/mcpsearch/800/450"],
        permissionsRequired: ["network:outbound"],
        entryPoint: "npx -y @modelcontextprotocol/server-brave-search",
        isVerified: true,
        installedCompanyIds: [],
        createdAt: "2026-10-01T10:00:00Z",
        updatedAt: "2026-10-22T08:00:00Z",
        manifest: {
          id: "mcp-brave-search",
          name: "brave-search-mcp",
          displayName: "Brave Web Search API",
          version: "1.0.5",
          type: "mcp",
          category: "mcp",
          description: "Websuche und Faktenprüfung.",
          author: "Brave Software",
          entryPoint: "npx -y @modelcontextprotocol/server-brave-search",
          permissions: ["network:outbound"],
        },
      },

      // ─── 2. Tools & Apps ──────────────────────────────────────────────
      {
        id: "tool-flux-multiposter",
        name: "flux-multiposter",
        displayName: "Flux Social MultiPoster",
        description: "Zentrales Dashboard zum gleichzeitigen Erstellen und Veröffentlichen von Content auf LinkedIn, X und Instagram.",
        version: "2.4.1",
        category: "plugin",
        itemType: "tool",
        author: "Stefan Kunc",
        iconUrl: "IconShare",
        downloadsCount: 3420,
        rating: 5.0,
        pricingType: "free",
        badge: "BELIEBT",
        tags: ["tool", "social", "flux", "multiposter"],
        screenshots: ["https://picsum.photos/seed/fluxmp/800/450"],
        permissionsRequired: ["network:outbound", "storage:local", "company:write"],
        entryPoint: "@/company-apps/modules/flux",
        isVerified: true,
        installedCompanyIds: ["flux"],
        createdAt: "2026-09-10T10:00:00Z",
        updatedAt: "2026-10-20T16:00:00Z",
        manifest: {
          id: "tool-flux-multiposter",
          name: "flux-multiposter",
          displayName: "Flux Social MultiPoster",
          version: "2.4.1",
          type: "tool",
          category: "plugin",
          description: "Multi-Kanal Social Media Studio.",
          author: "Stefan Kunc",
          entryPoint: "@/company-apps/modules/flux",
          permissions: ["network:outbound", "storage:local", "company:write"],
        },
      },
      {
        id: "tool-browser-controller",
        name: "browser-controller",
        displayName: "Helium CDP Browser Automation",
        description: "Fernsteuerung isolierter Chrome- & Helium-Browser via CDP: Screenshots, Klicks, Datenerfassung ohne Stefan-Profil.",
        version: "3.0.0",
        category: "plugin",
        itemType: "tool",
        author: "OpenBot Swarm",
        iconUrl: "IconBrowser",
        downloadsCount: 2100,
        rating: 4.9,
        pricingType: "free",
        badge: "SWARM CORE",
        tags: ["tool", "browser", "cdp", "automation"],
        screenshots: ["https://picsum.photos/seed/browserctrl/800/450"],
        permissionsRequired: ["system:shell", "agent:execute"],
        entryPoint: "/agent-hub/browser",
        isVerified: true,
        installedCompanyIds: ["flux"],
        createdAt: "2026-09-25T10:00:00Z",
        updatedAt: "2026-10-21T11:00:00Z",
        manifest: {
          id: "tool-browser-controller",
          name: "browser-controller",
          displayName: "Helium CDP Browser Automation",
          version: "3.0.0",
          type: "tool",
          category: "plugin",
          description: "Headless und Live-Browser-Steuerung per CDP.",
          author: "OpenBot Swarm",
          entryPoint: "/agent-hub/browser",
          permissions: ["system:shell", "agent:execute"],
        },
      },
      {
        id: "tool-code-sandbox",
        name: "code-sandbox",
        displayName: "Isolated Code Sandbox",
        description: "Führe TypeScript-, Python- und Shell-Snippets in sicheren, ephemeren Containern mit Sofortauswertung aus.",
        version: "1.8.0",
        category: "plugin",
        itemType: "tool",
        author: "Stefan Kunc",
        iconUrl: "IconTerminal2",
        downloadsCount: 1830,
        rating: 4.9,
        pricingType: "free",
        badge: "VERIFIZIERT",
        tags: ["tool", "terminal", "sandbox", "python"],
        screenshots: ["https://picsum.photos/seed/codesandbox/800/450"],
        permissionsRequired: ["system:shell", "storage:local"],
        entryPoint: "/sandbox",
        isVerified: true,
        installedCompanyIds: [],
        createdAt: "2026-09-30T10:00:00Z",
        updatedAt: "2026-10-18T10:00:00Z",
        manifest: {
          id: "tool-code-sandbox",
          name: "code-sandbox",
          displayName: "Isolated Code Sandbox",
          version: "1.8.0",
          type: "tool",
          category: "plugin",
          description: "Ausführungsumgebung für sichere Scripts.",
          author: "Stefan Kunc",
          entryPoint: "/sandbox",
          permissions: ["system:shell", "storage:local"],
        },
      },
      {
        id: "tool-data-visualizer",
        name: "data-visualizer",
        displayName: "Interactive Charts & BI Visualizer",
        description: "Erstelle aus SQL- oder CSV-Daten dynamische Dashboards, Heatmaps, XY-Charts und exportierbare Grafiken.",
        version: "1.1.2",
        category: "plugin",
        itemType: "tool",
        author: "Helium Labs",
        iconUrl: "IconChartBar",
        downloadsCount: 970,
        rating: 4.8,
        pricingType: "free",
        badge: "NEU",
        tags: ["tool", "charts", "bi", "visualizer"],
        screenshots: ["https://picsum.photos/seed/dataviz/800/450"],
        permissionsRequired: ["storage:local"],
        entryPoint: "/bi",
        isVerified: true,
        installedCompanyIds: [],
        createdAt: "2026-10-05T10:00:00Z",
        updatedAt: "2026-10-17T15:00:00Z",
        manifest: {
          id: "tool-data-visualizer",
          name: "data-visualizer",
          displayName: "Interactive Charts & BI Visualizer",
          version: "1.1.2",
          type: "tool",
          category: "plugin",
          description: "Business Intelligence und Charts.",
          author: "Helium Labs",
          entryPoint: "/bi",
          permissions: ["storage:local"],
        },
      },

      // ─── 3. Skills ────────────────────────────────────────────────────
      {
        id: "skill-prompt-optimizer",
        name: "prompt-optimizer",
        displayName: "System-Prompt & Context Optimizer",
        description: "Optimiert Agent-Systemprompts für maximale Befolgung, minimale Token-Nutzung und deterministische Outputs.",
        version: "1.5.0",
        category: "skill",
        itemType: "skill",
        author: "OpenBot Swarm",
        iconUrl: "IconSparkles",
        downloadsCount: 2560,
        rating: 5.0,
        pricingType: "free",
        badge: "TOP-BEWERTET",
        tags: ["skill", "prompts", "optimization", "llm"],
        screenshots: ["https://picsum.photos/seed/promptopt/800/450"],
        permissionsRequired: ["agent:execute"],
        entryPoint: "skills/prompt-optimizer",
        isVerified: true,
        installedCompanyIds: ["flux"],
        createdAt: "2026-09-12T10:00:00Z",
        updatedAt: "2026-10-21T18:00:00Z",
        manifest: {
          id: "skill-prompt-optimizer",
          name: "prompt-optimizer",
          displayName: "System-Prompt & Context Optimizer",
          version: "1.5.0",
          type: "skill",
          category: "skill",
          description: "Systemprompts verfeinern und testen.",
          author: "OpenBot Swarm",
          entryPoint: "skills/prompt-optimizer",
          permissions: ["agent:execute"],
        },
      },
      {
        id: "skill-document-analyzer",
        name: "document-analyzer",
        displayName: "Deep PDF & Document Synthesis",
        description: "Parst mehrseitige PDF-Verträge, Handbücher und Bilanzen; extrahiert Schlüsselklauseln mit präzisen Quellennachweisen.",
        version: "2.0.4",
        category: "skill",
        itemType: "skill",
        author: "OpenBot Swarm",
        iconUrl: "IconFileText",
        downloadsCount: 1940,
        rating: 4.9,
        pricingType: "free",
        badge: "EMPFOHLEN",
        tags: ["skill", "pdf", "documents", "analysis"],
        screenshots: ["https://picsum.photos/seed/docanalyzer/800/450"],
        permissionsRequired: ["agent:execute", "storage:local"],
        entryPoint: "skills/document-analyzer",
        isVerified: true,
        installedCompanyIds: [],
        createdAt: "2026-09-20T10:00:00Z",
        updatedAt: "2026-10-16T12:00:00Z",
        manifest: {
          id: "skill-document-analyzer",
          name: "document-analyzer",
          displayName: "Deep PDF & Document Synthesis",
          version: "2.0.4",
          type: "skill",
          category: "skill",
          description: "Extrahierung und Analyse komplexer Dokumente.",
          author: "OpenBot Swarm",
          entryPoint: "skills/document-analyzer",
          permissions: ["agent:execute", "storage:local"],
        },
      },
      {
        id: "skill-crm-lead-enricher",
        name: "crm-lead-enricher",
        displayName: "Automated B2B Lead Enrichment",
        description: "Reichert Firmen-Leads vollautomatisch mit Website-Analysen, LinkedIn-Metadaten und Tech-Stack-Erkennung an.",
        version: "1.3.1",
        category: "skill",
        itemType: "skill",
        author: "Kunc GmbH",
        iconUrl: "IconBriefcase",
        downloadsCount: 1890,
        rating: 5.0,
        pricingType: "free",
        badge: "ENTERPRISE",
        tags: ["skill", "b2b", "sales", "crm", "enrichment"],
        screenshots: ["https://picsum.photos/seed/crmleads/800/450"],
        permissionsRequired: ["network:outbound", "agent:execute"],
        entryPoint: "skills/crm-lead-enricher",
        isVerified: true,
        installedCompanyIds: [],
        createdAt: "2026-10-02T10:00:00Z",
        updatedAt: "2026-10-22T06:00:00Z",
        manifest: {
          id: "skill-crm-lead-enricher",
          name: "crm-lead-enricher",
          displayName: "Automated B2B Lead Enrichment",
          version: "1.3.1",
          type: "skill",
          category: "skill",
          description: "B2B Lead Recherche und Anreicherung.",
          author: "Kunc GmbH",
          entryPoint: "skills/crm-lead-enricher",
          permissions: ["network:outbound", "agent:execute"],
        },
      },

      // ─── 4. Companys ──────────────────────────────────────────────────
      {
        id: "company-spark-academy",
        name: "spark-academy",
        displayName: "Spark Lern- & Schulungswelt",
        description: "Vollständiger Schulungs-Workspace mit adaptiven Quizzen, Mitarbeiterkursen, Wissens-Memory und Fortschrittskontrolle.",
        version: "2.0.0",
        category: "template",
        itemType: "company",
        author: "Spark Lernwelt GmbH",
        iconUrl: "IconSchool",
        downloadsCount: 840,
        rating: 4.9,
        pricingType: "subscription",
        price: "19 €/Mo",
        badge: "VERIFIED TEMPLATE",
        tags: ["company", "education", "training", "quiz"],
        screenshots: ["https://picsum.photos/seed/sparkaca/800/450"],
        permissionsRequired: ["company:write", "company:read"],
        entryPoint: "/company/spark",
        isVerified: true,
        installedCompanyIds: ["flux"],
        createdAt: "2026-09-01T10:00:00Z",
        updatedAt: "2026-10-15T09:00:00Z",
        manifest: {
          id: "company-spark-academy",
          name: "spark-academy",
          displayName: "Spark Lern- & Schulungswelt",
          version: "2.0.0",
          type: "company",
          category: "template",
          description: "Schulungs- und Lern-Workspace.",
          author: "Spark Lernwelt GmbH",
          entryPoint: "/company/spark",
          permissions: ["company:write", "company:read"],
        },
      },
      {
        id: "company-tech-venture",
        name: "tech-venture",
        displayName: "Tech Venture & SaaS Incubator",
        description: "Komplett vorkonfigurierte Firma für Software-Projekte: GitHub-Pipelines, Code-Review-Bots, CI/CD-Swarm und Bugtracker.",
        version: "1.4.0",
        category: "template",
        itemType: "company",
        author: "Kunc GmbH",
        iconUrl: "IconRocket",
        downloadsCount: 1230,
        rating: 5.0,
        pricingType: "free",
        badge: "BELIEBT",
        tags: ["company", "startup", "dev", "saas"],
        screenshots: ["https://picsum.photos/seed/techventure/800/450"],
        permissionsRequired: ["company:write"],
        entryPoint: "/company/venture",
        isVerified: true,
        installedCompanyIds: [],
        createdAt: "2026-09-14T10:00:00Z",
        updatedAt: "2026-10-19T17:00:00Z",
        manifest: {
          id: "company-tech-venture",
          name: "tech-venture",
          displayName: "Tech Venture & SaaS Incubator",
          version: "1.4.0",
          type: "company",
          category: "template",
          description: "Entwicklungs- und SaaS-Workspace.",
          author: "Kunc GmbH",
          entryPoint: "/company/venture",
          permissions: ["company:write"],
        },
      },
      {
        id: "company-media-agency",
        name: "media-agency",
        displayName: "Creative Media & Content Studio",
        description: "Studio-Workspace für Agenturen mit Social-Multiposter, Bildgenerierungs-Bots, Kampagnen-Kalender und Kundenfreigaben.",
        version: "1.2.0",
        category: "template",
        itemType: "company",
        author: "Creative Minds",
        iconUrl: "IconPalette",
        downloadsCount: 690,
        rating: 4.8,
        pricingType: "subscription",
        price: "29 €/Mo",
        badge: "NEU",
        tags: ["company", "agency", "creative", "social"],
        screenshots: ["https://picsum.photos/seed/mediaagency/800/450"],
        permissionsRequired: ["company:write"],
        entryPoint: "/company/media",
        isVerified: true,
        installedCompanyIds: [],
        createdAt: "2026-10-08T10:00:00Z",
        updatedAt: "2026-10-20T11:00:00Z",
        manifest: {
          id: "company-media-agency",
          name: "media-agency",
          displayName: "Creative Media & Content Studio",
          version: "1.2.0",
          type: "company",
          category: "template",
          description: "Content und Social Studio Workspace.",
          author: "Creative Minds",
          entryPoint: "/company/media",
          permissions: ["company:write"],
        },
      },

      // ─── 5. Agents / CLI (Swarm-v3 Lane 4) ───────────────────────────
      {
        id: "agent-transcriber-cli",
        name: "instagram-transcriber-agent",
        displayName: "Instagram Transcriber (Antigravity CLI)",
        description: "Automatisierter Connect-Agent mit sicherem Browser-Zugriff zur Transkription von Instagram-Reels via getthescript.app. Extrahiert Tools in Spark-Ordner.",
        version: "1.0.0",
        category: "agent",
        itemType: "agent",
        author: "Stefan Kunc",
        iconUrl: "IconSparkles",
        downloadsCount: 520,
        rating: 5.0,
        pricingType: "free",
        badge: "VERIFIZIERT",
        tags: ["antigravity-cli", "instagram", "spark", "transcription", "curator", "swarm-v3"],
        screenshots: ["https://picsum.photos/seed/transcriber/800/450"],
        permissionsRequired: [
          "network:outbound",
          "storage:local",
          "agent:execute",
          "mcp:tools",
          "company:read",
        ],
        entryPoint: "/api/agents/templates/transcriber",
        isVerified: true,
        installedCompanyIds: ["flux"],
        createdAt: "2026-10-22T12:00:00Z",
        updatedAt: "2026-10-22T12:00:00Z",
        manifest: {
          id: "agent-transcriber-cli",
          name: "instagram-transcriber-agent",
          displayName: "Instagram Transcriber (Antigravity CLI)",
          version: "1.0.0",
          type: "agent",
          category: "agent",
          description: "Automatisierter Connect-Agent zur Transkription von Instagram-Reels.",
          author: "Stefan Kunc",
          entryPoint: "/api/agents/templates/transcriber",
          permissions: [
            "network:outbound",
            "storage:local",
            "agent:execute",
            "mcp:tools",
            "company:read",
          ],
        },
      },
    ];

    for (const item of defaultItems) {
      this.items.set(item.id, item);

      // Version history
      const hash = calculateManifestHash(item.manifest as unknown as Record<string, unknown>);
      const versionSummary: StoreVersionSummary = {
        id: `v-${item.id}-${item.version}`,
        version: item.version,
        changelog: "Erste offizielle Veröffentlichung im Swarm-v2 Play Store.",
        packageHash: hash,
        signature: generateVerificationSignature(hash, item.author),
        createdAt: item.createdAt,
      };
      this.versions.set(item.id, [versionSummary]);

      // Seed reviews
      this.reviews.set(item.id, [
        {
          id: `rev-${item.id}-1`,
          userId: "user-stefan",
          userName: "Stefan Kunc",
          rating: 5,
          comment: "Funktioniert hervorragend und fügt sich nahtlos in die Connect-App ein!",
          createdAt: "2026-10-21T14:30:00Z",
        },
        {
          id: `rev-${item.id}-2`,
          userId: "user-alex",
          userName: "Alex M.",
          rating: (item.rating ?? 5.0) >= 4.9 ? 5 : 4,
          comment: "Sehr sauber integriert, Rechte vor der Installation einsehbar.",
          createdAt: "2026-10-22T08:15:00Z",
        },
      ]);
    }
  }

  public listItems(query: {
    category?: string;
    type?: string;
    search?: string;
    companyId?: string;
  }): { items: StoreItem[]; total: number } {
    let list = Array.from(this.items.values());

    // Filter by type or category
    if (query.type && query.type !== "all") {
      list = list.filter((i) => i.itemType === query.type);
    } else if (query.category && query.category !== "all") {
      // Allow mapping "mcp", "tool" / "plugin", "skill", "company" / "template", "agent"
      if (query.category === "mcps" || query.category === "mcp") {
        list = list.filter((i) => i.category === "mcp" || i.itemType === "mcp");
      } else if (query.category === "tools" || query.category === "tool" || query.category === "plugin") {
        list = list.filter((i) => i.category === "plugin" || i.itemType === "tool");
      } else if (query.category === "skills" || query.category === "skill") {
        list = list.filter((i) => i.category === "skill" || i.itemType === "skill");
      } else if (query.category === "companys" || query.category === "company" || query.category === "template") {
        list = list.filter((i) => i.category === "template" || i.itemType === "company");
      } else {
        list = list.filter((i) => i.category === query.category);
      }
    }

    // Filter by search keyword
    if (query.search && query.search.trim().length > 0) {
      const q = query.search.toLowerCase().trim();
      list = list.filter(
        (i) =>
          i.displayName.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.author.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // Map installed state per specified companyId
    const targetCompany = query.companyId || "flux";
    const mapped: StoreItem[] = list.map((item) => {
      const isInstalled = item.installedCompanyIds.includes(targetCompany);
      return {
        id: item.id,
        name: item.name,
        displayName: item.displayName,
        description: item.description,
        version: item.version,
        category: item.category,
        author: item.author,
        iconUrl: item.iconUrl,
        isInstalled,
        downloadsCount: item.downloadsCount,
        rating: item.rating,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    return { items: mapped, total: mapped.length };
  }

  public getItem(id: string, companyId?: string): StoreItemDetail | null {
    const itm = this.items.get(id);
    if (!itm) return null;

    const targetCompany = companyId || "flux";
    const isInstalled = itm.installedCompanyIds.includes(targetCompany);

    return {
      ...itm,
      isInstalled,
      versions: this.versions.get(id) || [],
      reviews: this.reviews.get(id) || [],
    };
  }

  public async publishItem(
    rawManifest: unknown,
    changelog = "Initial release",
    author = "Stefan Kunc",
  ): Promise<{ success: boolean; item?: StoreItemDetail; error?: string }> {
    const validation = validateAndCanonizeManifest(rawManifest);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join("; ") };
    }

    const m = validation.manifest;
    const now = new Date().toISOString();
    const existing = this.items.get(m.id);

    const detail: StoreItemDetail = {
      id: m.id,
      name: m.name,
      displayName: m.displayName,
      description: m.description,
      version: m.version,
      category: m.category || resolveCategoryForType(m.type),
      itemType: m.type,
      author: m.author || author,
      iconUrl: m.icon || "IconPackage",
      downloadsCount: existing ? existing.downloadsCount : 0,
      rating: existing ? existing.rating : 5.0,
      pricingType: m.pricing?.type || "free",
      price: m.pricing?.price,
      badge: "NEU",
      tags: m.tags || [m.type],
      screenshots: m.screenshots || [],
      permissionsRequired: m.permissions || [],
      entryPoint: m.entryPoint,
      isVerified: true,
      isInstalled: false,
      autoStart: false,
      installedCompanyIds: existing ? existing.installedCompanyIds : [],
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    this.items.set(m.id, detail);

    const versionSummary: StoreVersionSummary = {
      id: `v-${m.id}-${m.version}`,
      version: m.version,
      changelog,
      packageHash: validation.hash,
      signature: m.signature,
      createdAt: now,
    };

    const currentVersions = this.versions.get(m.id) || [];
    this.versions.set(m.id, [versionSummary, ...currentVersions]);

    // Save to Postgres 5544 asynchronously if available
    const sql = this.getSql();
    if (sql && this.dbConnected) {
      try {
        await sql`
          INSERT INTO store_items (
            id, name, display_name, description, version, category, author, icon_url,
            downloads_count, rating, pricing_type, price, badge, tags, screenshots,
            permissions_required, entry_point, is_verified, created_at, updated_at
          ) VALUES (
            ${detail.id}, ${detail.name}, ${detail.displayName}, ${detail.description},
            ${detail.version}, ${detail.category}, ${detail.author}, ${detail.iconUrl ?? null},
            ${detail.downloadsCount}, ${detail.rating ?? 5.0}, ${detail.pricingType}, ${detail.price ?? null},
            ${detail.badge ?? null}, ${sql.json(detail.tags)}, ${sql.json(detail.screenshots)},
            ${sql.json(detail.permissionsRequired)}, ${detail.entryPoint ?? null}, ${detail.isVerified},
            ${detail.createdAt}, ${detail.updatedAt}
          )
          ON CONFLICT (id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            description = EXCLUDED.description,
            version = EXCLUDED.version,
            updated_at = EXCLUDED.updated_at;
        `;

        await sql`
          INSERT INTO store_versions (
            id, item_id, version, manifest, changelog, package_hash, signature, created_at
          ) VALUES (
            ${versionSummary.id}, ${detail.id}, ${versionSummary.version},
            ${sql.json(m as any)}, ${versionSummary.changelog ?? null}, ${versionSummary.packageHash},
            ${versionSummary.signature ?? null}, ${versionSummary.createdAt}
          )
          ON CONFLICT (id) DO NOTHING;
        `;
      } catch {
        // Silently preserve in-memory
      }
    }

    return { success: true, item: detail };
  }

  public async installItem(
    itemId: string,
    companyId: string,
    installedBy = "Stefan Kunc",
    permissions?: string[],
  ): Promise<{ success: boolean; install?: StoreInstallInfo; error?: string }> {
    const item = this.items.get(itemId);
    if (!item) {
      return { success: false, error: `Store item "${itemId}" not found` };
    }

    if (!item.installedCompanyIds.includes(companyId)) {
      item.installedCompanyIds.push(companyId);
      item.downloadsCount += 1;
      item.updatedAt = new Date().toISOString();
    }

    const installId = `inst-${itemId}-${companyId}-${Date.now()}`;
    const now = new Date().toISOString();
    const grantedPermissions = permissions || item.permissionsRequired;

    const installInfo: StoreInstallInfo = {
      id: installId,
      itemId,
      versionId: `v-${itemId}-${item.version}`,
      companyId,
      installedBy,
      permissions: grantedPermissions,
      status: "active",
      autoStart: false,
      installedAt: now,
      updatedAt: now,
    };

    const key = `${itemId}:${companyId}`;
    this.installs.set(key, [installInfo]);

    // Save to Postgres
    const sql = this.getSql();
    if (sql && this.dbConnected) {
      try {
        await sql`
          INSERT INTO store_installs (
            id, item_id, version_id, company_id, installed_by, permissions,
            status, auto_start, installed_at, updated_at
          ) VALUES (
            ${installInfo.id}, ${installInfo.itemId}, ${installInfo.versionId},
            ${installInfo.companyId}, ${installInfo.installedBy},
            ${sql.json(installInfo.permissions)}, ${installInfo.status},
            ${installInfo.autoStart}, ${installInfo.installedAt}, ${installInfo.updatedAt}
          );
        `;

        await sql`
          UPDATE store_items SET downloads_count = downloads_count + 1 WHERE id = ${itemId};
        `;
      } catch {
        // Keep in memory
      }
    }

    return { success: true, install: installInfo };
  }

  public async uninstallItem(
    itemId: string,
    companyId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const item = this.items.get(itemId);
    if (!item) {
      return { success: false, error: `Store item "${itemId}" not found` };
    }

    item.installedCompanyIds = item.installedCompanyIds.filter((cid) => cid !== companyId);
    item.updatedAt = new Date().toISOString();

    const key = `${itemId}:${companyId}`;
    this.installs.delete(key);

    const sql = this.getSql();
    if (sql && this.dbConnected) {
      try {
        await sql`
          DELETE FROM store_installs WHERE item_id = ${itemId} AND company_id = ${companyId};
        `;
      } catch {
        // Keep in memory
      }
    }

    return { success: true };
  }

  public async toggleAutoStart(
    itemId: string,
    companyId: string,
    autoStart: boolean,
  ): Promise<{ success: boolean; autoStart: boolean }> {
    const key = `${itemId}:${companyId}`;
    const list = this.installs.get(key);
    if (list && list.length > 0) {
      list[0].autoStart = autoStart;
      list[0].updatedAt = new Date().toISOString();
    }

    const sql = this.getSql();
    if (sql && this.dbConnected) {
      try {
        await sql`
          UPDATE store_installs SET auto_start = ${autoStart}, updated_at = now()
          WHERE item_id = ${itemId} AND company_id = ${companyId};
        `;
      } catch {
        // Keep in memory
      }
    }

    return { success: true, autoStart };
  }

  public async addReview(
    itemId: string,
    review: { userId: string; userName: string; rating: number; comment: string },
  ): Promise<{ success: boolean; review?: StoreReviewSummary; error?: string }> {
    const item = this.items.get(itemId);
    if (!item) {
      return { success: false, error: `Store item "${itemId}" not found` };
    }

    const reviewSummary: StoreReviewSummary = {
      id: `rev-${itemId}-${randomBytes(4).toString("hex")}`,
      userId: review.userId,
      userName: review.userName,
      rating: Math.max(1, Math.min(5, review.rating)),
      comment: review.comment,
      createdAt: new Date().toISOString(),
    };

    const currentReviews = this.reviews.get(itemId) || [];
    const updatedReviews = [reviewSummary, ...currentReviews];
    this.reviews.set(itemId, updatedReviews);

    // Recalculate average rating
    const avg =
      updatedReviews.reduce((sum, r) => sum + r.rating, 0) / updatedReviews.length;
    item.rating = Math.round(avg * 10) / 10;
    item.updatedAt = new Date().toISOString();

    const sql = this.getSql();
    if (sql && this.dbConnected) {
      try {
        await sql`
          INSERT INTO store_reviews (
            id, item_id, user_id, user_name, rating, comment, created_at
          ) VALUES (
            ${reviewSummary.id}, ${itemId}, ${reviewSummary.userId},
            ${reviewSummary.userName}, ${reviewSummary.rating},
            ${reviewSummary.comment}, ${reviewSummary.createdAt}
          );
        `;

        await sql`
          UPDATE store_items SET rating = ${item.rating} WHERE id = ${itemId};
        `;
      } catch {
        // Keep in memory
      }
    }

    return { success: true, review: reviewSummary };
  }

  public getCategories(): Array<{
    id: string;
    label: string;
    count: number;
    description: string;
  }> {
    const all = Array.from(this.items.values());
    return [
      {
        id: "all",
        label: "Alle Kategorien",
        count: all.length,
        description: "Vollständiger Store-Katalog für Antigravity & Helium",
      },
      {
        id: "mcps",
        label: "MCPs",
        count: all.filter((i) => i.itemType === "mcp").length,
        description: "Model Context Protocol Server für Werkzeuge und Datenquellen",
      },
      {
        id: "tools",
        label: "Tools & Apps",
        count: all.filter((i) => i.itemType === "tool").length,
        description: "Ausführbare Connect-Module, Dashboards und Workflows",
      },
      {
        id: "skills",
        label: "Skills",
        count: all.filter((i) => i.itemType === "skill").length,
        description: "Agenten-Fertigkeiten, Prompts, Extraktoren und Heuristiken",
      },
      {
        id: "companys",
        label: "Companys",
        count: all.filter((i) => i.itemType === "company").length,
        description: "Vorkonfigurierte Firmen-Workspaces und Organisations-Templates",
      },
      {
        id: "agents",
        label: "Agenten / CLI",
        count: all.filter((i) => i.itemType === "agent" || i.category === "agent").length,
        description: "Autonome Spezialagenten, CLI-Worker und Kurationstools",
      },
    ];
  }
}

// Singleton Store Service instance
let globalStoreService: StoreService | null = null;

export function getStoreService(): StoreService {
  if (!globalStoreService) {
    globalStoreService = new StoreService();
  }
  return globalStoreService;
}
