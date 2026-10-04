/*
 * Connect Shell - Tab-Konfiguration (einzige Datei, die man normalerweise anfasst)
 * ---------------------------------------------------------------------------
 * Tab hinzufügen/ersetzen: einen Eintrag in `tabs` kopieren und anpassen.
 *   id      eindeutiger Schlüssel (a-z, 0-9, -)
 *   title   Beschriftung im Sidebar-Button
 *   url     Ziel-Link (wird beim Klick im Browserfenster geöffnet)
 *   icon    Pfad zu einer lokalen SVG in ./icons/  (null => automatisches Buchstaben-Monogramm)
 *   color   Hintergrundfarbe der Icon-Kachel (beliebiger CSS-Farbwert)
 *   space   id eines Eintrags aus `spaces` (ignoriert, wenn pinned: true)
 *   pinned  true => oben als Favorit angeheftet, in allen Spaces sichtbar
 *   placeholder  true => nur Beispiel, darf ersetzt/gelöscht werden
 *
 * Icons: nur lokale Dateien (Lucide, ISC-Lizenz, siehe icons/LICENSE-lucide.txt)
 * oder Monogramme. Keine offiziellen Marken-Logos, keine Favicon-Hotlinks.
 */
// ============================================================================================
// CONNECT_URL – die EINZIGE Stelle für die Connect-Adresse (Startseite, Neuer Tab, App-Fenster,
// Helium-Startseite). Umstellen (z. B. auf Vercel) NICHT hier von Hand, sondern mit einem Befehl:
//   apps\helium-shell\setup\Set-ConnectUrl.cmd https://<projekt>.vercel.app
// (schreibt diese Zeile, erhöht die Extension-Version, ergänzt manifest.json-Rechte und setzt die
// Helium-Startseite). Danach Helium schließen und "Connect (Helium)" starten.
self.CONNECT_URL = "http://localhost:3101";
// ============================================================================================

self.CONNECT_SHELL_CONFIG = {
  // Startseite (Neuer Tab + angehefteter erster Eintrag)
  startUrl: self.CONNECT_URL + "/",

  // Basis der Connect-Web-App (für die Modus-Leiste oben und die Connect-Links)
  connectUrl: self.CONNECT_URL,

  // Company, die benutzt wird, solange Connect noch keine aktive Company gespeichert hat
  // (Connect liest/schreibt localStorage "connect.activeCompanyId").
  defaultCompanyId: "nordwind",

  // Tab-Sitzung (normale Helium-Fenster) automatisch sichern und beim Start wiederherstellen, falls
  // Helium sie nicht selbst wiederhergestellt hat (session-save.js). false = nur sichern, nie öffnen.
  restoreSession: true,

  // Seed-Companies aus apps/app/src/lib/companies/catalog.ts (eigene Companies: in Connect anlegen)
  companies: [
    { id: "nordwind", name: "Nordwind" },
    { id: "lumen", name: "Lumen" },
    { id: "helm", name: "Helm" },
    { id: "pulse", name: "Pulse" },
  ],

  // Modus-Leiste oben (gleiche Reihenfolge wie Connect / Connect Desktop):
  //   Logo = Home, 1 Focus, 2 Messages, 3 Browser, 4 Unternehmen
  // level => Connect-Modus (localStorage "connect.activeLevel", Route /company/<id>?level=N)
  modes: [
    { id: "home", title: "Connect – Home", icon: "logo" },
    { id: "focus", level: 1, title: "Focus – schnelle Aufgaben", icon: "icons/zap.svg" },
    { id: "messages", level: 2, title: "Messages – deine AIs & Kanäle", icon: "icons/messages-square.svg" },
    { id: "browser", level: 3, title: "Browser – Apps & Tabs zum Bauen", icon: "icons/app-window.svg" },
    { id: "company", level: 4, title: "Unternehmen – feste Firmen-URL", icon: "icons/building-2.svg" },
  ],

  // Links, die die Sidebar im jeweiligen Modus zeigt (path relativ zu connectUrl)
  modeLinks: {
    focus: [
      { title: "Focus öffnen", level: 1, icon: "icons/zap.svg" },
      { title: "Agents", path: "/agents", icon: "icons/messages-square.svg" },
      { title: "Routines", path: "/routines", icon: "icons/zap.svg" },
      { title: "Skills", path: "/skills", icon: "icons/app-window.svg" },
    ],
    messages: [
      { title: "Channels (HQ)", path: "/", icon: "icons/messages-square.svg" },
      { title: "Neuer Channel", path: "/channel/new", icon: "icons/plus.svg" },
      { title: "Agents", path: "/agents", icon: "icons/messages-square.svg" },
      { title: "Market", path: "/market", icon: "icons/building-2.svg" },
    ],
    browser: [
      { title: "Browser (Lab) öffnen", level: 3, icon: "icons/app-window.svg" },
    ],
  },

  // Lokale Automations-Bridge der Connect-Desktop-App (WebView2).
  // Achtung: HttpListener lauscht auf 127.0.0.1 (nicht "localhost").
  bridgeUrl: "http://127.0.0.1:3002",

  // "current" = aktiven Tab umleiten (Standard), "new" = immer neuen Tab öffnen.
  // Existiert bereits ein Tab mit derselben Seite, wird immer zu diesem gewechselt.
  openMode: "current",

  spaces: [
    { id: "dev", name: "Dev", color: "#0EA5E9" },
    { id: "docs", name: "Docs", color: "#A855F7" },
  ],

  tabs: [
    { id: "connect", title: "Connect", url: self.CONNECT_URL + "/", icon: "icons/house.svg", color: "#10B981", pinned: true },

    // ---- Platzhalter: frei austauschbar ----
    { id: "supabase", title: "Supabase", url: "https://supabase.com/dashboard", icon: "icons/database.svg", color: "#16A34A", space: "dev", placeholder: true },
    { id: "vercel", title: "Vercel", url: "https://vercel.com/dashboard", icon: "icons/triangle.svg", color: "#334155", space: "dev", placeholder: true },
    { id: "github", title: "GitHub", url: "https://github.com/", icon: "icons/git-branch.svg", color: "#475569", space: "dev", placeholder: true },
    { id: "render", title: "Render", url: "https://dashboard.render.com/", icon: "icons/server.svg", color: "#6366F1", space: "dev", placeholder: true },
    { id: "cloudflare", title: "Cloudflare", url: "https://dash.cloudflare.com/", icon: "icons/cloud.svg", color: "#EA580C", space: "dev", placeholder: true },
    { id: "notion", title: "Notion", url: "https://www.notion.so/", icon: "icons/notebook-pen.svg", color: "#57534E", space: "docs", placeholder: true },
    // Beispiel ohne Icon-Datei => Monogramm "M" wird automatisch erzeugt
    { id: "mdn", title: "MDN Docs", url: "https://developer.mozilla.org/", icon: null, color: "#0369A1", space: "docs", placeholder: true },
  ],
};
