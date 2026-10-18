# Stufe 1.2 — Echte Browser-Engine im Agent-Panel

**Status:** ✅ ABGESCHLOSSEN — Helium/Chrome läuft pro Agent-Profil, CDP liefert JPEG-Frames.

## Was vorher da war (Stufe 1.0)

- `agent-browser.ts performBrowserAction` war ein **Stub**:
  - schrieb nur die URL/den Titel in die DB
  - schickte kein CDP-Kommando
  - lieferte `{ ok: true, screenshot: null }` zurück
- Das Frontend (`AgentBrowserPanel`) zeigte nur die Stub-Texte und einen Hinweis "Stufe 2 bringt das Live-Bild".
- CDP-Helfer (`cdpCall`, `cdpScreenshot`, `cdpPortFor`) existierten schon in `connect/routes.ts` für die alte Connect-User-Vorschau, wurden aber vom Agent-Pfad nicht genutzt.

## Was Stufe 1.2 macht

1. **Neues Modul `agent-cdp.ts`** — die existierenden CDP-Helfer aus
   `connect/routes.ts` extrahiert:
   - `cdpPortFor(profileDir)` — deterministischer Port (Hash modulo 200, Basis 9333)
   - `cdpPageTargets`, `cdpPageTarget`, `cdpCall`, `cdpScreenshot`
   - `cdpNavigate`, `cdpViewport`
   - `launchAgentChrome(url, profileDir)` — startet Helium/Edge/Chrome mit `--user-data-dir` + `--remote-debugging-port`
   - `ensureAgentChromeRunning(profileDir)` — wartet bis CDP antwortet (max. 6s), startet ggf. einen Browser
   - `waitForCdp(port, timeoutMs)` — pollendes `GET /json/version`

2. **`agent-browser.ts performBrowserAction` ist jetzt eine echte Engine**:
   - `navigate` → `cdpNavigate` (URL-Validation + `Page.navigate`)
   - `click(selector)` → `Runtime.evaluate` + `Input.dispatchMouseEvent` (mousePressed/mouseReleased)
   - `type(selector, text, submit?)` → `Input.insertText`, optional mit Enter-Key
   - `scroll(x, y)` → `Input.dispatchMouseEvent` (mouseWheel) mit `Page.getLayoutMetrics`
   - `back` / `forward` → `Page.getNavigationHistory` + `Page.navigateToHistoryEntry`
   - `reload` → `Page.reload`
   - Nach der Aktion: frischer `cdpScreenshot` (data-URL), URL/Title via `Runtime.evaluate` aktualisiert

3. **`openBrowserTab` startet jetzt den Browser**:
   - Beim ersten `browser/open` für einen Agent: `ensureAgentChromeRunning` wird aufgerufen
   - Falls der Server neu startet, prüft `openBrowserTab` zusätzlich, ob CDP noch antwortet, und startet ggf. neu
   - Der Browser läuft eigenständig (überlebt Server-Restart, da er via `cmd.exe /c start ""` detached wird)

4. **`/api/agent-mcp/:agentId/browser/screenshot` liefert echte JPEG-Bytes**:
   - Lookup des Tabs via `listBrowserTabsFor`
   - `waitForCdp` → `ensureAgentChromeRunning` falls nötig
   - `cdpScreenshot` → `Response(shot.bytes, { "content-type": "image/jpeg", "x-connect-page-url": … })`
   - Frontend bekommt die Page-URL/Titel in den Headers

5. **`AgentBrowserPanel` zeigt jetzt den Live-Screenshot**:
   - Eigener `useMcpBrowserFrame`-Hook (1,5s-Intervall, JPEG-Frames vom MCP-Endpoint)
   - Bei jeder Aktion wird `frameKey` erhöht → sofortiges Re-Fetch
   - Buttons: **Los** (navigate), **Reload**, **Back**, **Forward**, **extern öffnen**, **Schließen**
   - Fehler- und Loading-States (Spinner, "Browser nicht erreichbar")

## PowerShell-Quoting-Bugfix

**Problem:** Der alte Code in `connect/routes.ts` benutzte `Start-Process -ArgumentList` mit einem **einzelnen, gequoteten String** für alle Argumente. PowerShell splittet dann Args mit Leerzeichen falsch:
- Gewünscht: `--user-data-dir="C:\Users\Kunc GmbH\…"`
- Tatsächlich: `--user-data-dir="C:\Users\Kunc"` (nur bis zum ersten Leerzeichen)

**Fix:** `cmd.exe /c start "" "<binary>" <args>` mit manuell gequoteten Args (jeder Wert mit `…`-Quotes umhüllt, falls er Leerzeichen enthält). `start` detacht den Browser, das Server-Loop blockt nicht.

## E2E-Test (`apps/server/scripts/test-agent-browser-mcp.ts`)

```
[e2e] agent=e2e-stufe12-direct profile=…\browser-profiles\e2e-stufe12-direct
[e2e] openBrowserTab: tabId=tab_mve7buax_h02qrl
[e2e] Browser ready, port=9500, binary=running
[e2e] Screenshot 1: 5890 bytes → …\e2e-out\1-about-blank.jpg
[e2e] navigate ok: url=https://example.com/ title=Example Domain
[e2e] Screenshot 2: 14688 bytes → …\e2e-out\2-example-com.jpg
[e2e] Page: url=https://example.com/ title=Example Domain
[e2e] Done.
```

Beide Screenshots sind echte JPEG-Bilder von der gerenderten Seite (siehe `e2e-out/`-Verzeichnis).

## Geänderte Dateien

- `apps/server/src/agent-hub/agent-cdp.ts` — **neu** (CDP-Helpers)
- `apps/server/src/agent-hub/agent-browser.ts` — echte Engine statt Stub
- `apps/server/src/agent-hub/agent-mcp-routes.ts` — Screenshot-Endpoint liefert JPEG
- `apps/server/src/connect/routes.ts` — gleicher PowerShell-Quoting-Fix für die alte Vorschau
- `apps/app/src/components/agents/agent-browser-panel.tsx` — Live-Screenshot-UI mit Reload/Back/Forward
- `apps/server/scripts/test-agent-browser-mcp.ts` — **neu** (E2E-Test)
- `apps/server/scripts/test-agent-browser-e2e.ts` — **neu** (manueller Test gegen Helium)

## Nicht in Stufe 1.2 (kommt später)

- **Klick-Aktionen aus dem Frontend-Panel** auf den Live-Screenshot (Koordinaten-Klick → `Input.dispatchMouseEvent`) — **Stufe 1.3 mit CLI-Preview-Toggle**
- **Selector-basierte DOM-Aktionen** (echte Form-Submits) — geht schon via `performBrowserAction({kind:"click", selector:…})` über die API, das UI nutzt es noch nicht
- **Profile-Cookies-Export** — wir nutzen die `--user-data-dir`-Isolation direkt, kein Login-Handling nötig
