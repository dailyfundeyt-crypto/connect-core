/**
 * Eigene MCPs zuschaltbar (Phase C - Schritt 16):
 * 1. Flux (E-Commerce/Warenverwaltung)
 * 2. Spark (Wissen)
 * 3. Hyper (Trading)
 * 4. Analyse (Social Automatisierung)
 * 5. Connect-MCP
 * 6. Connect-Browser
 *
 * Pro Agent an/aus - wird in seine CLI-Config (CODEX_HOME, CLAUDE_CONFIG_DIR, HERMES_HOME, ANTIGRAVITY_HOME) eingetragen.
 */

export type CustomMcpTool = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type CustomMcpDefinition = {
  id: string;
  scope: string;
  name: string;
  shortTitle: string;
  category: string;
  description: string;
  icon: string;
  color: string;
  badge: string;
  endpointPath: string;
  tools: CustomMcpTool[];
};

export const CUSTOM_MCPS: CustomMcpDefinition[] = [
  {
    id: "flux",
    scope: "flux",
    name: "Flux (E-Commerce/Warenverwaltung)",
    shortTitle: "Flux",
    category: "E-Commerce/Warenverwaltung",
    description: "Produkte, Warenwirtschaft, Lagerbestände, Bestellungen und Lieferprozesse verwalten.",
    icon: "shopping-bag",
    color: "#8B5CF6", // purple
    badge: "E-Commerce",
    endpointPath: "/api/connect-mcp/flux/jsonrpc",
    tools: [
      {
        name: "flux_list_products",
        description: "Listet alle Produkte und Waren im Shop- und Warenwirtschaftskatalog auf.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Maximale Anzahl zurückzugebender Produkte (Standard: 20)" },
            search: { type: "string", description: "Optionaler Suchbegriff nach Name oder SKU" },
          },
        },
      },
      {
        name: "flux_get_inventory",
        description: "Ruft den aktuellen Lager- und Bestandsstatus für ein bestimmtes Produkt oder alle Artikel ab.",
        inputSchema: {
          type: "object",
          properties: {
            sku: { type: "string", description: "Artikelnummer (SKU) oder Produkt-ID" },
          },
        },
      },
      {
        name: "flux_create_order",
        description: "Legt eine neue Bestellung oder einen Einkaufsbeleg in Flux an.",
        inputSchema: {
          type: "object",
          properties: {
            customer: { type: "string", description: "Kundenname oder Kunden-ID" },
            items: { type: "array", description: "Liste bestellter Positionen mit SKU und Menge" },
            totalAmount: { type: "number", description: "Gesamtbetrag der Bestellung" },
          },
          required: ["items"],
        },
      },
      {
        name: "flux_update_stock",
        description: "Aktualisiert den Lagerbestand eines Artikels in der Warenverwaltung.",
        inputSchema: {
          type: "object",
          properties: {
            sku: { type: "string", description: "Artikelnummer (SKU)" },
            quantityDelta: { type: "number", description: "Veränderung des Bestands (+/-)" },
            reason: { type: "string", description: "Grund der Bestandsänderung (z.B. Wareneingang, Inventur)" },
          },
          required: ["sku", "quantityDelta"],
        },
      },
      {
        name: "flux_track_delivery",
        description: "Verfolgt den aktuellen Versand- und Lieferstatus einer Bestellung.",
        inputSchema: {
          type: "object",
          properties: {
            orderId: { type: "string", description: "Bestell- oder Liefernummer" },
          },
          required: ["orderId"],
        },
      },
    ],
  },
  {
    id: "spark",
    scope: "spark",
    name: "Spark (Wissen)",
    shortTitle: "Spark",
    category: "Wissen",
    description: "Obsidian-Brain, Wissensnotizen, Markdown-Dateien und Recherchen durchsuchen und verwalten.",
    icon: "brain",
    color: "#F59E0B", // amber
    badge: "Wissen & Brain",
    endpointPath: "/api/connect-mcp/spark/jsonrpc",
    tools: [
      {
        name: "spark_list_notes",
        description: "Listet alle Wissensnotizen und Markdown-Dokumente im Obsidian-Brain auf.",
        inputSchema: {
          type: "object",
          properties: {
            folder: { type: "string", description: "Optionaler Unterordner im Brain" },
            limit: { type: "number", description: "Maximale Anzahl Notizen" },
          },
        },
      },
      {
        name: "spark_read_note",
        description: "Liest den vollen Inhalt einer Wissensnotiz aus dem Brain.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relativer Pfad oder Name der Notiz (z.B. MOC/01-Start.md)" },
          },
          required: ["path"],
        },
      },
      {
        name: "spark_write_note",
        description: "Schreibt oder aktualisiert eine Notiz oder Recherche-Ergebnis im Obsidian-Brain.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Dateipfad der Notiz" },
            content: { type: "string", description: "Markdown-Inhalt der Notiz" },
            append: { type: "boolean", description: "An vorhandene Datei anhängen statt überschreiben" },
          },
          required: ["path", "content"],
        },
      },
      {
        name: "spark_search_knowledge",
        description: "Durchsucht das gesamte Obsidian-Brain semantisch und per Volltextsuche.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Suchbegriff oder Fragestellung" },
          },
          required: ["query"],
        },
      },
    ],
  },
  {
    id: "hyper",
    scope: "hyper",
    name: "Hyper (Trading)",
    shortTitle: "Hyper",
    category: "Trading",
    description: "Kryptowährungen, Live-Marktkurse, Portfolio-Überwachung und Paper-Trading.",
    icon: "chart-candlestick",
    color: "#10B981", // emerald
    badge: "Trading & Krypto",
    endpointPath: "/api/connect-mcp/hyper/jsonrpc",
    tools: [
      {
        name: "hyper_crypto_quote",
        description: "Ruft aktuelle Live-Kurse, 24h-Volumen und Preisänderung für Krypto-Symbole ab.",
        inputSchema: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Krypto-Symbol (z.B. BTC, ETH, SOL)" },
          },
          required: ["symbol"],
        },
      },
      {
        name: "hyper_market_summary",
        description: "Liefert eine aggregierte Marktanalyse mit Makro-Sentiment und Top-Movern.",
        inputSchema: {
          type: "object",
          properties: {
            market: { type: "string", description: "Marktbereich (z.B. crypto, global, macro)" },
          },
        },
      },
      {
        name: "hyper_paper_trade",
        description: "Platziert eine simulierte Paper-Trading Order (Kauf/Verkauf) ohne echtes Kapital.",
        inputSchema: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Handelspaar (z.B. BTC/USDT)" },
            side: { type: "string", description: "buy oder sell" },
            amount: { type: "number", description: "Order-Betrag oder Anzahl Einheiten" },
            orderType: { type: "string", description: "market oder limit" },
          },
          required: ["symbol", "side", "amount"],
        },
      },
      {
        name: "hyper_get_positions",
        description: "Zeigt offene Trading-Positionen, Portfolio-Aufteilung und PnL-Werte an.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  },
  {
    id: "analyse",
    scope: "analyse",
    name: "Analyse (Social Automatisierung)",
    shortTitle: "Analyse",
    category: "Social Automatisierung",
    description: "Social Media Automatisierung: Trendscouting, Post-Entwürfe, Planer und Engagement-Metriken.",
    icon: "chart-bar",
    color: "#0EA5E9", // sky
    badge: "Social Automatisierung",
    endpointPath: "/api/connect-mcp/analyse/jsonrpc",
    tools: [
      {
        name: "analyse_social_trends",
        description: "Analysiert aktuelle Trends, virale Themen und relevante Hashtags.",
        inputSchema: {
          type: "object",
          properties: {
            platform: { type: "string", description: "Plattform (z.B. x, linkedin, youtube)" },
            category: { type: "string", description: "Themengebiet oder Nische" },
          },
        },
      },
      {
        name: "analyse_create_draft",
        description: "Erstellt einen neuen Post-Entwurf für Social-Media-Kanäle.",
        inputSchema: {
          type: "object",
          properties: {
            platform: { type: "string", description: "Zielplattform (x, linkedin, etc.)" },
            content: { type: "string", description: "Text des Beitrags" },
            mediaUrls: { type: "array", description: "Optionale Bild- oder Video-Links" },
          },
          required: ["platform", "content"],
        },
      },
      {
        name: "analyse_queue_post",
        description: "Reiht einen vorbereiteten Social-Media-Post in die Veröffentlichungs-Queue ein.",
        inputSchema: {
          type: "object",
          properties: {
            draftId: { type: "string", description: "ID des Entwurfs" },
            scheduledAt: { type: "string", description: "Geplanter Zeitpunkt im ISO-Format" },
          },
          required: ["draftId"],
        },
      },
      {
        name: "analyse_get_metrics",
        description: "Gibt Performance-, Reichweiten- und Interaktionsstatistiken vergangener Posts zurück.",
        inputSchema: {
          type: "object",
          properties: {
            days: { type: "number", description: "Zeitraum in Tagen (Standard: 7)" },
          },
        },
      },
    ],
  },
  {
    id: "connect-mcp",
    scope: "connect-mcp",
    name: "Connect-MCP",
    shortTitle: "Connect-MCP",
    category: "Connect Plattform",
    description: "Globaler Connect-MCP-Server: Alle Agenten, Swarm-Orchestrierung und Steuerungs-Tools.",
    icon: "network",
    color: "#3B82F6", // blue
    badge: "Connect Plattform",
    endpointPath: "/api/connect-mcp/jsonrpc",
    tools: [
      {
        name: "connect_list_agents",
        description: "Ruft alle verfügbaren Agenten und Bots der Plattform mit ihren Profilen ab.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "connect_chat_with_agent",
        description: "Führt einen Dialog-Turn mit einem anderen Agenten im Swarm aus.",
        inputSchema: {
          type: "object",
          properties: {
            agentId: { type: "string", description: "Ziel-Agenten-ID" },
            prompt: { type: "string", description: "Nachricht an den Agenten" },
          },
          required: ["agentId", "prompt"],
        },
      },
      {
        name: "connect_query_agent",
        description: "Stellt eine einzelne Informationsabfrage an einen spezialisierten Agenten.",
        inputSchema: {
          type: "object",
          properties: {
            agentId: { type: "string", description: "Agenten-ID" },
            question: { type: "string", description: "Frage an den Agenten" },
          },
          required: ["agentId", "question"],
        },
      },
      {
        name: "connect_run_task",
        description: "Startet einen autonomen CLI-Auftrag auf einem Agenten.",
        inputSchema: {
          type: "object",
          properties: {
            agentId: { type: "string", description: "Agenten-ID" },
            taskPrompt: { type: "string", description: "Detaillierte Aufgabenstellung" },
          },
          required: ["agentId", "taskPrompt"],
        },
      },
      {
        name: "connect_get_status",
        description: "Ruft den Gesamtzustand des Connect-Systems und aller laufenden Agenten ab.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  },
  {
    id: "connect-browser",
    scope: "browser",
    name: "Connect-Browser",
    shortTitle: "Connect-Browser",
    category: "Browser",
    description: "Helium Browser-Automatisierung pro Agent: Tabs öffnen, navigieren, klicken, Screenshots.",
    icon: "world",
    color: "#EC4899", // pink
    badge: "Helium Browser",
    endpointPath: "/api/connect-mcp/browser/jsonrpc",
    tools: [
      {
        name: "browser_open_tab",
        description: "Öffnet eine Webseite in einem neuen Tab im isolierten Helium-Profil des Agenten.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "Ziel-URL (http:// oder https://)" },
          },
          required: ["url"],
        },
      },
      {
        name: "browser_list_tabs",
        description: "Listet alle geöffneten Browser-Tabs im Profil dieses Agenten auf.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "browser_action",
        description: "Führt eine Aktion im aktiven Browser-Tab aus (navigate, click, type, screenshot).",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", description: "navigate | click | type | screenshot | evaluate" },
            selector: { type: "string", description: "CSS-Selektor oder Ziel-Element" },
            value: { type: "string", description: "Text für Eingaben oder URL für Navigation" },
          },
          required: ["action"],
        },
      },
      {
        name: "browser_close_tab",
        description: "Schließt einen geöffneten Browser-Tab.",
        inputSchema: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "Tab-ID" },
          },
          required: ["tabId"],
        },
      },
    ],
  },
];

export function getCustomMcp(id: string): CustomMcpDefinition | undefined {
  const clean = id.toLowerCase().trim();
  return CUSTOM_MCPS.find(
    (m) =>
      m.id.toLowerCase() === clean ||
      m.scope.toLowerCase() === clean ||
      (clean === "analysis" && m.id === "analyse"),
  );
}

export function isCustomMcpId(id: string): boolean {
  return Boolean(getCustomMcp(id));
}
