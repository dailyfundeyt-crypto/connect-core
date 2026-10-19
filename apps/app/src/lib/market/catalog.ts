/**
 * Market-Katalog — kombinierte Listen für Companies, Agents, MCP-Server,
 * Tools (kleine Connect-Module) und Software (klassische Downloads).
 *
 * Persistenz: localStorage unter "connect.market.catalog.v1". Beim ersten
 * Aufruf wird der Katalog mit Demo-Listings gefüllt, danach kann der User
 * Einträge hinzufügen, kaufen, mieten oder entfernen.
 *
 * Jeder Eintrag hat:
 *   • `id`           — stabil, eindeutig
 *   • `kind`         — "company" | "agent" | "mcp" | "tool" | "software"
 *   • `name`         — Anzeigename
 *   • `tagline`      — kurze Beschreibung
 *   • `seller`       — wer es anbietet
 *   • `pricing`      — kostenlos / kauf / miete / abonnement
 *   • `category`     — thematische Kategorie
 *   • `badge`        — optionales Label (NEU, BETA, HOT, …)
 *   • `logoColor`    — Fallback-Akzentfarbe
 *   • `icon`         — Tabler-Icon-Name (siehe KOMPONENTE)
 *   • `installed`    — bereits installiert (für Tool/MCP/Agent)
 *   • `availableInCompanyIds` — in welchen Companies verfügbar
 *   • `details`      — Markdown/Text für Detailansicht
 *   • `download`     — Download-Metadaten (nur software)
 */

import { useCallback, useEffect, useState } from "react";

export type MarketKind = "company" | "agent" | "mcp" | "tool" | "software";

export type MarketPricing =
  | { kind: "free"; label: string }
  | { kind: "buy"; price: string }
  | { kind: "rent"; price: string; period: "Tag" | "Woche" | "Monat" | "Jahr" }
  | { kind: "subscription"; price: string; period: "Monat" | "Jahr" };

export type SoftwareFormat = "zip" | "exe" | "msi" | "dmg" | "appimage" | "tar" | "npm" | "pip" | "binary" | "source";

export type SoftwarePackage = {
  /** Dateigröße in MB, gerundet. */
  sizeMb: number;
  /** Dateiformat / Verpackung. */
  format: SoftwareFormat;
  /** Direkter Download-Pfad. Bei lokalen Paketen: data-URL. */
  url: string;
  /** Dateiname für den Download. */
  fileName: string;
  /** Mindest-OS / Plattform. */
  platform: "Windows" | "macOS" | "Linux" | "Alle" | "Web";
  /** Version. */
  version: string;
  /** SHA-256 (oder Notiz) zur Vertrauensbildung. */
  checksum?: string;
  /** Optionale Abhängigkeiten / Voraussetzungen. */
  requirements?: string[];
};

export type MarketListing = {
  id: string;
  kind: MarketKind;
  name: string;
  tagline: string;
  seller: string;
  pricing: MarketPricing;
  category: string;
  badge?: string;
  logoColor: string;
  icon: string;
  installed: boolean;
  /** Welche Companies haben das Tool/MCP/Agent bereits aktiv installiert. */
  availableInCompanyIds: string[];
  details: string;
  /** Nur für `kind === "software"`. */
  download?: SoftwarePackage;
  /** Datum der Veröffentlichung im Market (ISO). */
  publishedAt?: string;
  /** Eigene Veröffentlichung (durch den eingeloggten User). */
  selfPublished?: boolean;
};

const STORAGE_KEY = "connect.market.catalog.v1";

const SEED: MarketListing[] = [
  // ── Companies ─────────────────────────────────────────────────────
  {
    id: "company-spark",
    kind: "company",
    name: "Spark Lesen / Lernen",
    tagline: "Kurse, Quizze, Lernspiele für Schulen & Selbstlerner.",
    seller: "Spark Lernwelt GmbH",
    pricing: { kind: "subscription", price: "19 €", period: "Monat" },
    category: "Bildung",
    badge: "BETA",
    logoColor: "#f59e0b",
    icon: "IconSchool",
    installed: true,
    availableInCompanyIds: ["flux"],
    details:
      "Spark kombiniert kuratierte Lerninhalte mit adaptiven Quizzen. Geeignet für Schulklassen, Universitäten und Selbstlerner, mit Live-Statistik und Lehrer-Dashboard.",
  },
  {
    id: "company-flux",
    kind: "company",
    name: "Flux E-Commerce",
    tagline: "Verkauf, Lager, Kunden — alles in einem Workspace.",
    seller: "Flux Commerce",
    pricing: { kind: "buy", price: "ab 49 €" },
    category: "Handel",
    logoColor: "#10b981",
    icon: "IconShoppingCart",
    installed: true,
    availableInCompanyIds: ["flux"],
    details:
      "Flux bündelt Produktkatalog, Bestellungen, Kunden und Lieferanten in einer Oberfläche. Inkl. Multi-Channel-Verkauf und Buchhaltung-Export.",
  },
  {
    id: "company-hyper",
    kind: "company",
    name: "Hyper Prop Trading",
    tagline: "Day-Trading-Reports, Risk-Checks und Broker-Bridge.",
    seller: "Hyper Capital",
    pricing: { kind: "subscription", price: "89 €", period: "Monat" },
    category: "Finanzen",
    badge: "HOT",
    logoColor: "#ef4444",
    icon: "IconChartLine",
    installed: true,
    availableInCompanyIds: ["hyper"],
    details:
      "Hyper liefert tägliche PnL-Reports, Risk-Checks vor Trade-Eingabe und eine Broker-Bridge für MT4/MT5, IBKR und Binance.",
  },
  {
    id: "company-connect-bots",
    kind: "company",
    name: "Connect Bots",
    tagline: "Team-Bots für interne Workflows, Onboarding & HR.",
    seller: "Connect",
    pricing: { kind: "free", label: "Kostenlos in Connect" },
    category: "Produktivität",
    logoColor: "#0ea5e9",
    icon: "IconRobot",
    installed: true,
    availableInCompanyIds: ["flux"],
    details:
      "Connect-Bots helfen beim Onboarding neuer Mitarbeiter, beim Beantworten interner HR-Fragen und beim Erinnern an Quartalsziele.",
  },
  {
    id: "company-nordwind",
    kind: "company",
    name: "Nordwind Energie",
    tagline: "Windpark-Verwaltung, Wartung & Ertragsprognose.",
    seller: "Nordwind AG",
    pricing: { kind: "buy", price: "ab 199 €" },
    category: "Industrie",
    logoColor: "#3b82f6",
    icon: "IconWind",
    installed: false,
    availableInCompanyIds: [],
    details:
      "Verwaltet Windparks von der Inbetriebnahme bis zur Wartung. Mit Wetterdaten-Feed, Ertragsprognose und SCADA-Anbindung.",
  },
  {
    id: "company-helm",
    kind: "company",
    name: "Helm Logistik",
    tagline: "Fleet, Routen, Sendungsverfolgung & Fahrer-App.",
    seller: "Helm GmbH",
    pricing: { kind: "subscription", price: "39 €", period: "Monat" },
    category: "Logistik",
    logoColor: "#8b5cf6",
    icon: "IconTruck",
    installed: false,
    availableInCompanyIds: [],
    details:
      "Helm koordiniert Fahrzeuge, plant Routen, versendet Tracking-Links an Empfänger und liefert eCMR-PDFs.",
  },

  // ── Agents ───────────────────────────────────────────────────────
  {
    id: "agent-seo",
    kind: "agent",
    name: "SEO-Agent",
    tagline: "Prüft Websites auf SEO, komplett lokal auf diesem PC.",
    seller: "Connect Marketplace",
    pricing: { kind: "free", label: "Kostenlos" },
    category: "Marketing",
    logoColor: "#22c55e",
    icon: "IconSeo",
    installed: true,
    availableInCompanyIds: ["flux"],
    details:
      "Der SEO-Agent crawlt jede URL, prüft Meta-Tags, H1-Hierarchie, Bilder-Alt-Texte, Ladezeit und gibt eine priorisierte To-do-Liste aus.",
  },
  {
    id: "agent-buchhalter",
    kind: "agent",
    name: "Buchhalter",
    tagline: "Belege scannen, kontieren, DATEV-Export.",
    seller: "Flux Commerce",
    pricing: { kind: "rent", price: "29 €", period: "Monat" },
    category: "Finanzen",
    badge: "NEU",
    logoColor: "#0d9488",
    icon: "IconCalculator",
    installed: false,
    availableInCompanyIds: [],
    details:
      "OCR für Belege, automatische Kontierung nach SKR03/SKR04, GoBD-konformer Export. Lernt deine Konten aus Korrekturen.",
  },
  {
    id: "agent-recruiter",
    kind: "agent",
    name: "Recruiter",
    tagline: "Findet passende Kandidaten, screenet Lebensläufe.",
    seller: "HR Cloud",
    pricing: { kind: "subscription", price: "79 €", period: "Monat" },
    category: "HR",
    logoColor: "#ec4899",
    icon: "IconUserSearch",
    installed: false,
    availableInCompanyIds: [],
    details:
      "Durchsucht Xing, LinkedIn, Stepstone nach deinem Anforderungsprofil. Screening-Fragen werden in natürlicher Sprache beantwortet.",
  },
  {
    id: "agent-trader",
    kind: "agent",
    name: "Risk-Analyst",
    tagline: "Live-Risk-Checks für Prop-Trader.",
    seller: "Hyper Capital",
    pricing: { kind: "rent", price: "49 €", period: "Woche" },
    category: "Trading",
    badge: "HOT",
    logoColor: "#f43f5e",
    icon: "IconChartCandle",
    installed: false,
    availableInCompanyIds: [],
    details:
      "Berechnet Positionsgrößen, Drawdown-Stop und Tages-PnL in Echtzeit. Schickt Push-Nachricht bei Limit-Verletzung.",
  },
  {
    id: "agent-translator",
    kind: "agent",
    name: "Übersetzer",
    tagline: "E-Mails & Chats in 27 Sprachen, mit Ton-Anpassung.",
    seller: "Connect Marketplace",
    pricing: { kind: "free", label: "Kostenlos" },
    category: "Produktivität",
    logoColor: "#06b6d4",
    icon: "IconLanguage",
    installed: false,
    availableInCompanyIds: [],
    details:
      "On-device Übersetzung. Tonalität: formell, locker, technisch. Lernt Fachbegriffe aus deinem Workspace.",
  },

  // ── MCP-Server ───────────────────────────────────────────────────
  {
    id: "mcp-github",
    kind: "mcp",
    name: "GitHub MCP",
    tagline: "Repos, Issues, PRs lesen & schreiben — direkt aus Connect.",
    seller: "GitHub Inc.",
    pricing: { kind: "free", label: "Kostenlos (OAuth)" },
    category: "Entwicklung",
    logoColor: "#1f2937",
    icon: "IconBrandGithub",
    installed: false,
    availableInCompanyIds: [],
    details:
      "Offizieller GitHub MCP-Server. Lese- und Schreibzugriff auf Issues, PRs, Code-Suche, Actions-Logs.",
  },
  {
    id: "mcp-google-drive",
    kind: "mcp",
    name: "Google Drive MCP",
    tagline: "Dateien suchen, lesen, hochladen — in jedem Workspace.",
    seller: "Google",
    pricing: { kind: "free", label: "Kostenlos (OAuth)" },
    category: "Speicher",
    badge: "NEU",
    logoColor: "#3b82f6",
    icon: "IconBrandGoogleDrive",
    installed: false,
    availableInCompanyIds: [],
    details:
      "Greift auf Google Drive zu. Suche nach Dateinamen, Volltextsuche, PDFs lesen, neue Docs erstellen.",
  },
  {
    id: "mcp-notion",
    kind: "mcp",
    name: "Notion MCP",
    tagline: "Notion-Datenbanken lesen & aktualisieren.",
    seller: "Notion Labs",
    pricing: { kind: "subscription", price: "9 €", period: "Monat" },
    category: "Wissen",
    logoColor: "#000000",
    icon: "IconBrandNotion",
    installed: false,
    availableInCompanyIds: [],
    details:
      "Verbindet Notion-Datenbanken. Der Agent kann Seiten lesen, Blöcke anhängen, Status-Properties setzen.",
  },
  {
    id: "mcp-slack",
    kind: "mcp",
    name: "Slack MCP",
    tagline: "Channels, Threads, DMs als Werkzeug für deine Agents.",
    seller: "Slack",
    pricing: { kind: "free", label: "Kostenlos (OAuth)" },
    category: "Kommunikation",
    logoColor: "#4a154b",
    icon: "IconBrandSlack",
    installed: false,
    availableInCompanyIds: [],
    details:
      "Schreibt in Channels, antwortet in Threads, schickt DMs. Sucht Nachrichten und Dateien.",
  },
  {
    id: "mcp-stripe",
    kind: "mcp",
    name: "Stripe MCP",
    tagline: "Payments, Subscriptions, Refunds aus dem Agent.",
    seller: "Stripe",
    pricing: { kind: "free", label: "Pay-as-you-go" },
    category: "Finanzen",
    logoColor: "#635bff",
    icon: "IconCreditCard",
    installed: false,
    availableInCompanyIds: [],
    details:
      "Live-Zugriff auf deine Stripe-Daten. Kunden anlegen, Subscriptions verwalten, Refunds ausstellen.",
  },

  // ── Tools (Connect-interne Module) ───────────────────────────────
  {
    id: "tool-connect-sozial",
    kind: "tool",
    name: "Connect Sozial",
    tagline: "Social-Media-Feed mit Artikeln, AI und Follower-Profilen.",
    seller: "Connect",
    pricing: { kind: "free", label: "In Connect enthalten" },
    category: "Soziales",
    logoColor: "#ec4899",
    icon: "IconNews",
    installed: true,
    availableInCompanyIds: ["flux", "hyper", "spark", "connect-bots"],
    details:
      "Das tägliche Social-Media-Profil deiner Company. Artikel schreiben, liken, kommentieren, Profile folgen.",
  },
  {
    id: "tool-flux",
    kind: "tool",
    name: "Flux",
    tagline: "Verkauf, Lager, Kunden, Multi-Channel-Commerce.",
    seller: "Flux Commerce",
    pricing: { kind: "buy", price: "ab 49 €" },
    category: "Handel",
    logoColor: "#10b981",
    icon: "IconShoppingBag",
    installed: true,
    availableInCompanyIds: ["flux"],
    details:
      "Vollständige E-Commerce-Suite als Connect-Tool. Inkl. Shopify, WooCommerce, eBay-Brücken.",
  },
  {
    id: "tool-analysis",
    kind: "tool",
    name: "Analysis",
    tagline: "Dashboards, Reports, Ad-Performance & Cohorts.",
    seller: "Connect",
    pricing: { kind: "free", label: "In Connect enthalten" },
    category: "Analytics",
    logoColor: "#a855f7",
    icon: "IconChartHistogram",
    installed: true,
    availableInCompanyIds: ["flux", "hyper"],
    details:
      "Datenanalyse-Workbench. SQL-Editor, gespeicherte Queries, Diagramme, geplante Reports per E-Mail.",
  },
  {
    id: "tool-brain",
    kind: "tool",
    name: "Brain",
    tagline: "Wissensgraph: Knoten, Links, Zeitachse, Suche.",
    seller: "Connect",
    pricing: { kind: "free", label: "In Connect enthalten" },
    category: "Wissen",
    logoColor: "#0ea5e9",
    icon: "IconBrain",
    installed: true,
    availableInCompanyIds: ["flux"],
    details:
      "Vernetztes Notiz-System. Markdown-Notizen, Verlinkungen, zeitbasierte Suche, Cluster-Ansicht.",
  },
  {
    id: "tool-finance",
    kind: "tool",
    name: "Finance",
    tagline: "Buchhaltung, UStVA, BWA — GoBD-konform.",
    seller: "Connect",
    pricing: { kind: "rent", price: "29 €", period: "Monat" },
    category: "Finanzen",
    badge: "NEU",
    logoColor: "#0d9488",
    icon: "IconCoin",
    installed: false,
    availableInCompanyIds: [],
    details:
      "Buchhaltung mit DATEV-Export. Inkl. USt-Voranmeldung, BWA, Anlagenverzeichnis, Reisekosten.",
  },
  {
    id: "tool-helmet",
    kind: "tool",
    name: "Helmet",
    tagline: "Compliance, Audit-Trail, DSGVO-Verzeichnis.",
    seller: "Connect",
    pricing: { kind: "subscription", price: "19 €", period: "Monat" },
    category: "Compliance",
    logoColor: "#475569",
    icon: "IconShieldCheck",
    installed: false,
    availableInCompanyIds: [],
    details:
      "DSGVO-Verzeichnis, Audit-Logs, Risiko-Heatmap. Inkl. automatischer Lösch-Worker.",
  },

  // ── Software (klassische Downloads) ──────────────────────────────
  {
    id: "software-helium-cli",
    kind: "software",
    name: "Helium CLI",
    tagline: "Kommandozeilen-Werkzeug für Connect — Build, Deploy, Sync.",
    seller: "Connect",
    pricing: { kind: "free", label: "Open Source (MIT)" },
    category: "Entwicklung",
    badge: "HOT",
    logoColor: "#22c55e",
    icon: "IconTerminal2",
    installed: false,
    availableInCompanyIds: [],
    publishedAt: "2026-09-21",
    selfPublished: false,
    details:
      "Helium CLI bündelt alle Connect-Workflows in einem einzigen Binary. Inkl. Auto-Update, Plugin-API und Offline-Modus.",
    download: {
      sizeMb: 18.4,
      format: "exe",
      url: "/downloads/helium-cli-1.4.2.exe",
      fileName: "helium-cli-1.4.2.exe",
      platform: "Windows",
      version: "1.4.2",
      checksum: "sha256:9c5b…f1a4",
      requirements: ["Windows 10 oder neuer", "PowerShell 5.1+"],
    },
  },
  {
    id: "software-flux-desktop",
    kind: "software",
    name: "Flux Desktop",
    tagline: "Native Desktop-App für Flux POS, Scanner & Drucker.",
    seller: "Flux Commerce",
    pricing: { kind: "buy", price: "89 €" },
    category: "Handel",
    logoColor: "#10b981",
    icon: "IconDeviceDesktop",
    installed: false,
    availableInCompanyIds: [],
    publishedAt: "2026-10-02",
    selfPublished: false,
    details:
      "Native Desktop-App für Windows, macOS und Linux. Kassensystem mit Bondrucker, Barcode-Scanner und GoBD-TSE-Anbindung.",
    download: {
      sizeMb: 142,
      format: "msi",
      url: "/downloads/flux-desktop-3.1.0.msi",
      fileName: "Flux-Desktop-3.1.0.msi",
      platform: "Windows",
      version: "3.1.0",
      requirements: ["64-Bit", ".NET 8 Runtime"],
    },
  },
  {
    id: "software-connect-sync",
    kind: "software",
    name: "Connect Sync Daemon",
    tagline: "Synchronisiert deine Workspaces auf lokale Server.",
    seller: "Connect",
    pricing: { kind: "free", label: "Kostenlos" },
    category: "System",
    logoColor: "#0ea5e9",
    icon: "IconCloudDownload",
    installed: false,
    availableInCompanyIds: [],
    publishedAt: "2026-08-14",
    selfPublished: false,
    details:
      "Lokaler Daemon, der deine Connect-Workspaces als SQLite-Dateien spiegelt. Mit File-Watcher und Webhook-Brücke.",
    download: {
      sizeMb: 42,
      format: "tar",
      url: "/downloads/connect-sync-0.9.7.tar.gz",
      fileName: "connect-sync-0.9.7.tar.gz",
      platform: "Linux",
      version: "0.9.7",
      requirements: ["Linux x86_64", "systemd"],
    },
  },
  {
    id: "software-npm-react-kit",
    kind: "software",
    name: "@connect/react-kit",
    tagline: "React-Komponenten-Bibliothek für Connect-Workspaces.",
    seller: "Connect",
    pricing: { kind: "free", label: "Open Source (MIT)" },
    category: "Entwicklung",
    badge: "NEU",
    logoColor: "#a855f7",
    icon: "IconPackage",
    installed: false,
    availableInCompanyIds: [],
    publishedAt: "2026-10-10",
    selfPublished: false,
    details:
      "React-Komponenten, die zu 100 % mit dem Connect-Look übereinstimmen. Inkl. Tree-Shaking, TypeScript-Typen und Figma-Source.",
    download: {
      sizeMb: 1.2,
      format: "npm",
      url: "https://www.npmjs.com/package/@connect/react-kit",
      fileName: "@connect/react-kit",
      platform: "Alle",
      version: "0.6.0",
      requirements: ["Node 18+", "React 18 oder 19"],
    },
  },
  {
    id: "software-pdf-bridge",
    kind: "software",
    name: "PDF Bridge",
    tagline: "Lokales CLI, das PDFs in durchsuchbares Markdown verwandelt.",
    seller: "Connect",
    pricing: { kind: "rent", price: "9 €", period: "Monat" },
    category: "Produktivität",
    logoColor: "#f97316",
    icon: "IconFileText",
    installed: false,
    availableInCompanyIds: [],
    publishedAt: "2026-09-29",
    selfPublished: false,
    details:
      "PDF Bridge extrahiert Text, Tabellen und Bilder aus PDFs und gibt sauberes Markdown zurück. On-device, ohne Cloud.",
    download: {
      sizeMb: 64,
      format: "appimage",
      url: "/downloads/pdf-bridge-1.2.0.AppImage",
      fileName: "pdf-bridge-1.2.0.AppImage",
      platform: "Linux",
      version: "1.2.0",
      requirements: ["Linux x86_64"],
    },
  },
  {
    id: "software-backup-suite",
    kind: "software",
    name: "Connect Backup Suite",
    tagline: "Inkrementelles Backup deiner lokalen Connect-Installation.",
    seller: "Connect",
    pricing: { kind: "buy", price: "29 €" },
    category: "System",
    logoColor: "#475569",
    icon: "IconArchive",
    installed: false,
    availableInCompanyIds: [],
    publishedAt: "2026-07-04",
    selfPublished: false,
    details:
      "Sichert deine Workspaces, Konfiguration und Marketplace-Listings auf Wunsch nach S3, Azure oder lokaler Festplatte.",
    download: {
      sizeMb: 32,
      format: "msi",
      url: "/downloads/connect-backup-2.0.5.msi",
      fileName: "ConnectBackup-2.0.5.msi",
      platform: "Windows",
      version: "2.0.5",
    },
  },
];

function load(): MarketListing[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED;
    const parsed = JSON.parse(raw) as MarketListing[];
    if (!Array.isArray(parsed) || parsed.length === 0) return SEED;
    return parsed;
  } catch {
    return SEED;
  }
}

function save(listings: MarketListing[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(listings));
  } catch {
    // ignore quota / private mode
  }
}

let listeners: Array<(listings: MarketListing[]) => void> = [];

function notify(listings: MarketListing[]) {
  for (const listener of listeners) listener(listings);
}

export function getMarketListings(): MarketListing[] {
  return load();
}

export function useMarketListings() {
  const [listings, setListings] = useState<MarketListing[]>(() => load());

  useEffect(() => {
    const listener = (next: MarketListing[]) => setListings(next);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  const update = useCallback((updater: (current: MarketListing[]) => MarketListing[]) => {
    const current = load();
    const next = updater(current);
    save(next);
    notify(next);
    setListings(next);
  }, []);

  const install = useCallback(
    (id: string, companyId?: string) => {
      update((current) =>
        current.map((listing) => {
          if (listing.id !== id) return listing;
          if (listing.kind === "company") {
            return { ...listing, installed: true };
          }
          if (companyId) {
            const set = new Set(listing.availableInCompanyIds);
            set.add(companyId);
            return {
              ...listing,
              installed: true,
              availableInCompanyIds: Array.from(set),
            };
          }
          return { ...listing, installed: true };
        }),
      );
    },
    [update],
  );

  const uninstall = useCallback(
    (id: string, companyId?: string) => {
      update((current) =>
        current.map((listing) => {
          if (listing.id !== id) return listing;
          if (listing.kind === "company") {
            return { ...listing, installed: false };
          }
          if (companyId) {
            return {
              ...listing,
              availableInCompanyIds: listing.availableInCompanyIds.filter(
                (c) => c !== companyId,
              ),
            };
          }
          return { ...listing, installed: false };
        }),
      );
    },
    [update],
  );

  const toggleAutoStart = useCallback(
    (id: string, companyId: string) => {
      update((current) =>
        current.map((listing) => {
          if (listing.id !== id) return listing;
          const set = new Set(listing.availableInCompanyIds);
          if (set.has(`${companyId}#auto`)) {
            set.delete(`${companyId}#auto`);
          } else {
            set.add(`${companyId}#auto`);
          }
          return {
            ...listing,
            availableInCompanyIds: Array.from(set),
          };
        }),
      );
    },
    [update],
  );

  const isAutoStart = useCallback(
    (listing: MarketListing, companyId: string): boolean => {
      return listing.availableInCompanyIds.includes(`${companyId}#auto`);
    },
    [],
  );

  /**
   * Eigene Veröffentlichung in den Marketplace.
   *
   *   • `kind: "software"` → setzt `selfPublished`, ergänzt `publishedAt` und
   *     `download.fileName`, falls nicht gesetzt.
   *   • alle anderen Kinds → reichen für `agent` / `mcp` / `tool` / `company`.
   *
   * Die ID wird aus Name + Zufallszahl gebildet, damit wiederholtes
   * Veröffentlichen nicht kollidiert.
   */
  const publish = useCallback(
    (draft: Omit<MarketListing, "id" | "installed" | "availableInCompanyIds">) => {
      const slug =
        draft.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
          .slice(0, 40) || "listing";
      const id = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
      const publishedAt = new Date().toISOString().slice(0, 10);
      const next: MarketListing = {
        ...draft,
        id,
        installed: false,
        availableInCompanyIds: [],
        selfPublished: true,
        publishedAt: draft.publishedAt ?? publishedAt,
        ...(draft.kind === "software" && draft.download
          ? {
              download: {
                ...draft.download,
                fileName:
                  draft.download.fileName ||
                  `${slug}-${draft.download.version || "1.0.0"}.${draft.download.format}`,
              },
            }
          : {}),
      };
      update((current) => [next, ...current]);
      return next;
    },
    [update],
  );

  return {
    listings,
    install,
    uninstall,
    publish,
    toggleAutoStart,
    isAutoStart,
  };
}

export function resetMarket(): void {
  save(SEED);
  notify(SEED);
}
