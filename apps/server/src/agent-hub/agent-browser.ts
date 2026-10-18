/**
 * Browser-Manager für Agent-Browser-Tabs (Stufe 1.2).
 *
 * Jeder Agent bekommt einen eigenen Browser-Tab mit **persistentem Profil** —
 * eigene Cookies, LocalStorage, IndexedDB, Service-Worker. So bleibt der
 * Agent nach einem Neustart eingeloggt, ohne dass wir Login-Daten
 * exportieren und reimportieren (das verliert genau die Sachen, die
 * moderne Sites brauchen: IndexedDB, Service-Worker, Push-Permissions).
 *
 * Die Verwaltung läuft über die DB-Tabelle `agent_browser_tabs`. Jeder
 * Datensatz speichert den `tabId`, das Profil-Verzeichnis und Metadaten.
 *
 * **Stufe 1.2 = reale Engine**: `performBrowserAction` macht jetzt echte
 * CDP-Aufrufe (`Page.navigate`, `Input.dispatchMouseEvent`, `Page.reload`)
 * über `agent-cdp.ts` — kein Stub mehr. Der User sieht im Frontend-Panel
 * den echten Screenshot (Live, alle 1,5s neu eingelesen) und kann die
 * Maus / Tastatur benutzen. Die `/api/agent-mcp/:id/browser/screenshot`-
 * Route liefert das JPEG-Backend.
 *
 * Wenn der User `browser/open` ruft, prüfen wir, ob auf dem
 * `cdpPortFor(profileDir)` schon ein Browser antwortet. Wenn nicht, starten
 * wir einen — die `agent-cdp.ts`-Helfer kümmern sich um den Start,
 * isoliertes Profil und `remote-debugging-port`. So bekommt der Agent
 * einen eigenen Browser ohne dass der Connect-User-Session-Tab belegt wird.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { agentBrowserTabs } from "../db/schema";
import {
  cdpCall,
  cdpNavigate,
  cdpPortFor,
  cdpScreenshot,
  cdpViewport,
  ensureAgentChromeRunning,
  waitForCdp,
} from "./agent-cdp";

/** Verzeichnis, in dem alle Browser-Profile landen. */
function profilesRoot(): string {
  const localAppData =
    process.env.LOCALAPPDATA ??
    join(process.env.HOME ?? ".", ".local", "share");
  const base = join(localAppData, "ConnectAgents", "browser-profiles");
  mkdirSync(base, { recursive: true });
  return base;
}

/** Pfad zum Profil eines bestimmten Agent. Wird beim ersten `open` erzeugt. */
function profileDirFor(agentId: string): string {
  const safe = agentId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "agent";
  const dir = join(profilesRoot(), safe);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Marker-Datei, mit der wir erkennen, dass ein Profil schon mal geöffnet war. */
function profileMarkerPath(profileDir: string): string {
  return join(profileDir, ".connect-agent-profile.json");
}

export type BrowserTabRow = {
  tabId: string;
  agentId: string;
  url: string | null;
  title: string | null;
  profileDir: string;
  openedAt: string;
  closedAt: string | null;
};

export type BrowserAction =
  | { kind: "navigate"; url: string }
  | { kind: "click"; selector: string }
  | { kind: "type"; selector: string; text: string; submit?: boolean }
  | { kind: "scroll"; x: number; y: number }
  | { kind: "back" }
  | { kind: "forward" }
  | { kind: "reload" };

export type BrowserActionResult = {
  ok: boolean;
  url: string | null;
  title: string | null;
  screenshot: string | null;
  error?: string;
};

/** In-Memory-Cache der aktiven Sessions. Server-Restart → leer, wird aus DB wieder aufgebaut. */
type ActiveSession = {
  tabId: string;
  agentId: string;
  profileDir: string;
  currentUrl: string | null;
  currentTitle: string | null;
};

const activeSessions = new Map<string, ActiveSession>();

/** Generiert eine kurze, aber eindeutige Tab-ID. */
function newTabId(): string {
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Liest die Profile-Marker-Datei (Meta-Info, wann der Tab das letzte Mal aktiv war). */
function readProfileMarker(profileDir: string): {
  lastOpenedAt: string | null;
} {
  const path = profileMarkerPath(profileDir);
  if (!existsSync(path)) return { lastOpenedAt: null };
  try {
    const json = JSON.parse(readFileSync(path, "utf8")) as {
      lastOpenedAt?: string;
    };
    return { lastOpenedAt: json.lastOpenedAt ?? null };
  } catch {
    return { lastOpenedAt: null };
  }
}

function writeProfileMarker(profileDir: string, tabId: string): void {
  const payload = {
    lastOpenedAt: new Date().toISOString(),
    lastTabId: tabId,
    schema: 1,
  };
  writeFileSync(
    profileMarkerPath(profileDir),
    JSON.stringify(payload, null, 2),
    "utf8",
  );
}

/**
 * Öffnet einen neuen Tab für den Agent (oder gibt den existierenden zurück,
 * wenn einer offen ist). Legt das Profil-Verzeichnis an und startet den
 * Browser im Hintergrund, falls noch nicht geschehen.
 *
 * `waitForCdp` blockiert bis zu 6 Sekunden — die erste Frame nach dem
 * Start braucht erfahrungsgemäß 2-3s (Helium/Edge laden das Profil zum
 * ersten Mal), danach ist jeder weitere Call sofort.
 */
export async function openBrowserTab(
  database: Database | undefined,
  agentId: string,
): Promise<BrowserTabRow> {
  const profileDir = profileDirFor(agentId);
  // Existiert schon ein offener Tab für diesen Agent? → wiederverwenden
  for (const [tabId, session] of activeSessions.entries()) {
    if (session.agentId === agentId) {
      // Sicherstellen, dass der Browser läuft (Server-Restart-Hack).
      const port = cdpPortFor(profileDir);
      if (!(await waitForCdp(port, 600))) {
        const ready = await ensureAgentChromeRunning(profileDir);
        if (!ready.ok) {
          // Browser lässt sich nicht starten — wir geben den Tab trotzdem
          // zurück, das Frontend zeigt dann den Fehler beim ersten
          // Screenshot-Versuch.
        }
      }
      return toRow(tabId, session);
    }
  }
  // Neuen Tab anlegen
  const tabId = newTabId();
  const now = new Date();
  if (database) {
    await database
      .insert(agentBrowserTabs)
      .values({
        tabId,
        agentId,
        url: null,
        title: null,
        profileDir,
        openedAt: now,
        closedAt: null,
      })
      .onConflictDoNothing();
  }
  const session: ActiveSession = {
    tabId,
    agentId,
    profileDir,
    currentUrl: null,
    currentTitle: null,
  };
  activeSessions.set(tabId, session);
  writeProfileMarker(profileDir, tabId);
  // Browser starten — wir versuchen's, Fehler werden im Panel angezeigt
  const ready = await ensureAgentChromeRunning(profileDir);
  if (!ready.ok) {
    // Wir lassen den Tab trotzdem registriert; der erste Screenshot-Call
    // zeigt den Fehler.
    console.warn(`[agent-browser] Browser-Start für ${agentId} fehlgeschlagen: ${ready.detail}`);
  }
  return {
    tabId,
    agentId,
    url: null,
    title: null,
    profileDir,
    openedAt: now.toISOString(),
    closedAt: null,
  };
}

/**
 * Schließt den Tab des Agenten. Profil bleibt auf der Platte für den
 * nächsten `open`-Call.
 */
export async function closeBrowserTab(
  database: Database | undefined,
  agentId: string,
): Promise<{ closedTabId: string | null }> {
  let closedTabId: string | null = null;
  for (const [tabId, session] of activeSessions.entries()) {
    if (session.agentId === agentId) {
      activeSessions.delete(tabId);
      closedTabId = tabId;
      if (database) {
        await database
          .update(agentBrowserTabs)
          .set({ closedAt: new Date() })
          .where(eq(agentBrowserTabs.tabId, tabId));
      }
      break;
    }
  }
  return { closedTabId };
}

/**
 * Listet die offenen Tabs des Agenten.
 */
export async function listBrowserTabsFor(
  database: Database | undefined,
  agentId: string,
): Promise<BrowserTabRow[]> {
  const rows: BrowserTabRow[] = [];
  for (const session of activeSessions.values()) {
    if (session.agentId === agentId) {
      rows.push(toRow(session.tabId, session));
    }
  }
  if (database) {
    const persisted = await database
      .select()
      .from(agentBrowserTabs)
      .where(eq(agentBrowserTabs.agentId, agentId));
    for (const row of persisted) {
      // Falls wir den in-memory verloren haben (z.B. Server-Restart), aber
      // die DB hat ihn noch: gib ihn als "offen" zurück, damit das
      // Frontend ihn reaktivieren kann.
      if (
        !rows.some((existing) => existing.tabId === row.tabId) &&
        row.closedAt === null
      ) {
        rows.push({
          tabId: row.tabId,
          agentId: row.agentId,
          url: row.url,
          title: row.title,
          profileDir: row.profileDir,
          openedAt: row.openedAt.toISOString(),
          closedAt: null,
        });
      }
    }
  }
  return rows;
}

/**
 * Führt eine Browser-Aktion aus — **Stufe 1.2 = reale Engine**.
 *
 * Übersetzt die BrowserAction in einen oder mehrere CDP-Aufrufe:
 *   - `navigate` → `Page.navigate`
 *   - `click`    → `Input.dispatchMouseEvent` (mousePressed + mouseReleased)
 *   - `type`     → `Input.insertText`
 *   - `scroll`   → `Input.dispatchMouseEvent` (mouseWheel)
 *   - `back`     → `Page.navigateToHistoryEntry` (entry id -1)
 *   - `forward`  → `Page.navigateToHistoryEntry` (entry id +1)
 *   - `reload`   → `Page.reload`
 *
 * Vor jedem Call prüfen wir, ob der Browser überhaupt läuft — wenn
 * nicht, starten wir ihn (`ensureAgentChromeRunning`). Sollte der
 * Browser nicht starten (kein Chrome installiert, fehlende Rechte),
 * bekommt der Aufrufer eine ehrliche Fehlermeldung statt eines
 * "klappt" ohne dass etwas passiert ist.
 *
 * Jede erfolgreiche Aktion aktualisiert die DB (URL/Title) und gibt
 * einen frischen Screenshot mit zurück, damit das Frontend das
 * Bild nicht selbst nachladen muss.
 */
export async function performBrowserAction(
  database: Database | undefined,
  agentId: string,
  action: BrowserAction,
): Promise<BrowserActionResult> {
  const session = findActiveSession(agentId);
  if (!session) {
    return {
      ok: false,
      url: null,
      title: null,
      screenshot: null,
      error:
        "Kein offener Browser-Tab für diesen Agent. Erst `browser/open` aufrufen.",
    };
  }
  // Sicherstellen, dass der Browser für dieses Profil läuft. Wenn der
  // Server neu gestartet wurde, ist der in-memory-Verweis vielleicht weg —
  // die DB hat den Tab aber noch, also versuchen wir's einfach.
  const ready = await ensureAgentChromeRunning(session.profileDir);
  if (!ready.ok) {
    return {
      ok: false,
      url: session.currentUrl,
      title: session.currentTitle,
      screenshot: null,
      error: `Agent-Browser konnte nicht starten: ${ready.detail}`,
    };
  }
  const port = cdpPortFor(session.profileDir);
  let result: { ok: boolean; error?: string; url?: string };
  if (action.kind === "navigate") {
    result = await cdpNavigate(port, action.url);
    if (result.ok) {
      session.currentUrl = action.url;
      try {
        session.currentTitle = new URL(action.url).hostname;
      } catch {
        session.currentTitle = action.url;
      }
    }
  } else if (action.kind === "click") {
    // Selector-basiert ist in CDP nicht direkt verfügbar — wir versuchen
    // zuerst `Runtime.evaluate` mit `document.querySelector(selector)`,
    // und klicken dann per CDP auf die Mitte der Bounding-Box. Wenn das
    // scheitert (kein Element, mehrere Treffer), fällt der User auf die
    // Pixel-Koordinaten-Variante im Live-View-Panel zurück.
    const locate = await cdpCall(
      port,
      "Runtime.evaluate",
      {
        expression: `(() => { const el = document.querySelector(${JSON.stringify(action.selector)}); if (!el) return { ok: false, error: 'Selector nicht gefunden.' }; const r = el.getBoundingClientRect(); return { ok: true, x: r.left + r.width/2, y: r.top + r.height/2 }; })()`,
        returnByValue: true,
      },
    );
    if (!locate.ok || !locate.result?.result?.value) {
      const err = (locate.result?.result?.value as { error?: string } | undefined)?.error;
      return {
        ok: false,
        url: session.currentUrl,
        title: session.currentTitle,
        screenshot: null,
        error: locate.error ?? err ?? "Click fehlgeschlagen.",
      };
    }
    const point = (locate.result.result.value as { x: number; y: number });
    const down = await cdpCall(
      port,
      "Input.dispatchMouseEvent",
      { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1, buttons: 1 },
    );
    const up = await cdpCall(
      port,
      "Input.dispatchMouseEvent",
      { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1, buttons: 0 },
    );
    result = { ok: down.ok && up.ok, error: down.ok ? up.error : down.error };
  } else if (action.kind === "type") {
    if (action.submit) {
      // Erst tippen, dann Enter drücken
      const type = await cdpCall(port, "Input.insertText", { text: action.text });
      if (!type.ok) result = { ok: false, error: type.error };
      else {
        const key = await cdpCall(
          port,
          "Input.dispatchKeyEvent",
          { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
        );
        const keyUp = await cdpCall(
          port,
          "Input.dispatchKeyEvent",
          { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
        );
        result = { ok: key.ok && keyUp.ok, error: key.ok ? keyUp.error : key.error };
      }
    } else {
      const type = await cdpCall(port, "Input.insertText", { text: action.text });
      result = { ok: type.ok, error: type.error };
    }
  } else if (action.kind === "scroll") {
    const viewport = await cdpViewport(port);
    if (!viewport.width) {
      result = { ok: false, error: viewport.error ?? "Viewport unbekannt." };
    } else {
      const point = { x: action.x * viewport.width, y: action.y * viewport.height };
      const res = await cdpCall(
        port,
        "Input.dispatchMouseEvent",
        { type: "mouseWheel", ...point, deltaX: 0, deltaY: action.y < 0.5 ? -200 : 200 },
      );
      result = { ok: res.ok, error: res.error };
    }
  } else if (action.kind === "back" || action.kind === "forward") {
    // `Page.navigateToHistoryEntry` braucht eine entryId — wir holen
    // erst die History und navigieren dann relativ.
    const hist = await cdpCall(port, "Page.getNavigationHistory", {});
    if (!hist.ok || !hist.result) {
      result = { ok: false, error: hist.error ?? "History nicht abrufbar." };
    } else {
      const entries = (hist.result.entries as Array<{ id: number }> | undefined) ?? [];
      const currentIndex = (hist.result.currentIndex as number | undefined) ?? 0;
      const target = entries[
        action.kind === "back" ? currentIndex - 1 : currentIndex + 1
      ];
      if (!target) {
        result = { ok: false, error: `Kein ${action.kind === "back" ? "vorheriger" : "nächster"} Eintrag.` };
      } else {
        const nav = await cdpCall(port, "Page.navigateToHistoryEntry", { entryId: target.id });
        result = { ok: nav.ok, error: nav.error };
      }
    }
  } else if (action.kind === "reload") {
    const res = await cdpCall(port, "Page.reload", { ignoreCache: false });
    result = { ok: res.ok, error: res.error };
  } else {
    return {
      ok: false,
      url: session.currentUrl,
      title: session.currentTitle,
      screenshot: null,
      error: `Unbekannte Aktion: ${(action as { kind: string }).kind}`,
    };
  }
  if (!result.ok) {
    return {
      ok: false,
      url: session.currentUrl,
      title: session.currentTitle,
      screenshot: null,
      error: result.error ?? "Aktion fehlgeschlagen.",
    };
  }
  // Nach der Aktion aktualisieren wir URL/Title. `Runtime.evaluate`
  // liefert beides frisch, `Page.navigate` aktualisiert `currentUrl`
  // schon — aber nach Click/Type/Scroll kann sich die URL geändert
  // haben (SPA-Routing, Redirects).
  try {
    const info = await cdpCall(
      port,
      "Runtime.evaluate",
      {
        expression: "JSON.stringify({ url: location.href, title: document.title })",
        returnByValue: true,
      },
    );
    const value = info.result?.result?.value as string | undefined;
    if (typeof value === "string") {
      const parsed = JSON.parse(value) as { url: string; title: string };
      session.currentUrl = parsed.url;
      session.currentTitle = parsed.title;
    } else if (result.url) {
      session.currentUrl = result.url;
    }
  } catch {
    if (result.url) session.currentUrl = result.url;
  }
  if (database) {
    await database
      .update(agentBrowserTabs)
      .set({ url: session.currentUrl, title: session.currentTitle })
      .where(eq(agentBrowserTabs.tabId, session.tabId));
  }
  // Frischer Screenshot, damit das Frontend das nächste Frame-Update
  // nicht abwarten muss.
  const shot = await cdpScreenshot(port);
  return {
    ok: true,
    url: session.currentUrl,
    title: session.currentTitle,
    screenshot: shot.ok && shot.bytes
      ? `data:image/jpeg;base64,${Buffer.from(shot.bytes).toString("base64")}`
      : null,
  };
}

/** Findet die aktive Session für den Agent. */
function findActiveSession(agentId: string): ActiveSession | null {
  for (const session of activeSessions.values()) {
    if (session.agentId === agentId) return session;
  }
  return null;
}

function toRow(tabId: string, session: ActiveSession): BrowserTabRow {
  return {
    tabId,
    agentId: session.agentId,
    url: session.currentUrl,
    title: session.currentTitle,
    profileDir: session.profileDir,
    openedAt: new Date().toISOString(),
    closedAt: null,
  };
}

/** Liste der existierenden Profile (zur Anzeige im Settings-Panel). */
export function listProfiles(): Array<{
  agentId: string;
  profileDir: string;
  lastOpenedAt: string | null;
}> {
  const root = profilesRoot();
  if (!existsSync(root)) return [];
  const { readdirSync, statSync } =
    require("node:fs") as typeof import("node:fs");
  return readdirSync(root)
    .map((entry) => {
      const full = join(root, entry);
      try {
        if (!statSync(full).isDirectory()) return null;
      } catch {
        return null;
      }
      return {
        agentId: entry,
        profileDir: full,
        lastOpenedAt: readProfileMarker(full).lastOpenedAt,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        agentId: string;
        profileDir: string;
        lastOpenedAt: string | null;
      } => entry !== null,
    );
}
