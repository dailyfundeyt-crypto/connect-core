# Connect Shell – Arc-Sidebar für Helium (und Connect Desktop)

Unpacked MV3-Extension. Helium bleibt der Browser (Tabs, Adressleiste, Rahmen, Updates),
Connect (`http://localhost:3010/`) ist Startseite/Neuer Tab, und das Side-Panel zeigt eine
Arc-artige Sidebar: angeheftete Kacheln oben, Tabs pro **Space**, Space-Umschalter unten.
Jeder Eintrag ist ein HTML-Button mit Icon + Link; Klick öffnet den Link im Browserfenster.

## Dateien
| Datei | Zweck |
|---|---|
| `tabs.config.js` | **Einzige Datei zum Anpassen**: Startseite, Bridge-URL, Spaces, Tabs |
| `manifest.json` | MV3: `side_panel`, `chrome_url_overrides.newtab`, Service Worker, Alt+Shift+S |
| `background.js` | `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` |
| `sidebar.html/.css/.js` | Sidebar (gleiche Dateien für Helium, WebView2 und normale Seite) |
| `newtab.html/.js` | Neuer Tab → Weiterleitung auf `startUrl` |
| `icons/` | Lokale SVGs (Lucide, ISC) + Monogramm-Beispiel |
| `setup/` | Optionale Vorlagen (Startverknüpfung, Policy-.reg) – **nicht angewendet** |

## Tab hinzufügen / ersetzen
In `tabs.config.js` einen Eintrag in `tabs` kopieren:
```js
{ id: "meintool", title: "Mein Tool", url: "https://example.com/", icon: "icons/server.svg", color: "#6366F1", space: "dev" },
```
- `icon: null` → automatisches Buchstaben-Monogramm (keine Datei nötig).
- `pinned: true` → Kachel oben, in allen Spaces sichtbar.
- Neues Icon: SVG nach `icons/` legen (z. B. von https://lucide.dev, ISC). Für weiße Linien
  `stroke="currentColor"` durch `stroke="#FFFFFF"` ersetzen.
- Neuer Space: Eintrag in `spaces` (`{ id, name, color }`) und bei Tabs `space: "<id>"`.
- Nach Änderungen: `chrome://extensions` → bei „Connect Shell" auf ⟳ (Neu laden).

Die Einträge Supabase/Vercel/GitHub/Render/Cloudflare/Notion/MDN sind **Platzhalter**
(generische Icons, keine offiziellen Logos).

## Installation in Helium (unpacked)
1. Helium öffnen → `chrome://extensions`
2. Oben rechts **Entwicklermodus** einschalten
3. **Entpackte Erweiterung laden** → Ordner
   `C:\Users\Kunc GmbH\Downloads\OpenBot-v2-Helium\apps\helium-shell` wählen
4. Beim ersten neuen Tab fragt Chromium ggf. „Diese Seite wurde von einer Erweiterung geändert" → **Behalten**
5. Puzzle-Symbol → „Connect Shell" anpinnen. Klick auf das Symbol (oder **Alt+Shift+S**) öffnet die Sidebar.
6. Optional für echtes Arc-Gefühl: Helium-Layout auf **Vertikal** stellen
   (Rechtsklick auf Titelleiste/Fensterrahmen → Systemmenü → Layout → Vertikal, oder Einstellungen → Darstellung; in 0.18.1.1 nicht verifiziert).

## Startseite = Connect
- **Neuer Tab:** macht die Extension (`newtab.html`). Alternative ohne Extension: `chrome://flags/#custom-ntp`
  → `http://localhost:3010/` → Neu starten (ungoogled-chromium-Flag, in Helium enthalten).
- **Beim Start:** `chrome://settings/onStartup` → „Bestimmte Seite oder Seiten öffnen" → `http://localhost:3010/`.
- **Startknopf:** `chrome://settings/appearance` → „Startseite anzeigen" → `http://localhost:3010/`.
- Verknüpfung: `setup/Helium-Connect.cmd`
  (`chrome.exe --custom-ntp=http://localhost:3010/ http://localhost:3010/`).
- Policies (`setup/helium-startpage-policies.reg`, Pfad `HKCU\Software\Policies\Helium`) greifen für
  Startseiten-Policies nur auf Domänen-/MDM-PCs – auf diesem PC voraussichtlich nicht.

## Klick-Routing
| Umgebung | Erkennung | Verhalten |
|---|---|---|
| Helium/Chromium Side-Panel | `chrome.tabs` vorhanden | vorhandenen Tab mit gleicher Seite aktivieren; sonst aktiven Tab umleiten; angeheftete Seiten (Connect) nie überschreiben → neuer Tab; Strg/Mittelklick → neuer Tab |
| Connect Desktop (WebView2) | `window.chrome.webview` | Bridge `http://127.0.0.1:3002/api/browser`: `GET /tabs`, `POST /switchtab {tabId}`, `POST /navigate {url}` bzw. `POST /newtab {url}`; Fallback `chrome.webview.postMessage({type:"connect-shell-navigate",url})` (**Host-Handler existiert noch nicht**) |
| normale Seite | sonst | wie WebView2 über Bridge, Fallback `window.open` |

Hinweis: Die Bridge lauscht auf `127.0.0.1` (HttpListener-Prefix) – `localhost:3002` kann mit „Bad Request (Invalid Hostname)" scheitern.

## Lizenzen
- Icons `icons/{house,database,cloud,git-branch,server,notebook-pen,triangle,plus}.svg`:
  **Lucide** v1.49.0 (https://lucide.dev), **ISC License**, siehe `icons/LICENSE-lucide.txt`.
  Einzige Änderung: Strichfarbe `currentColor` → `#FFFFFF`.
- `icons/monogram-example.svg` und die zur Laufzeit erzeugten Monogramme: selbst erstellt.

## Modus-Leiste oben (wie Connect)
Logo = Home · Blitz = Focus (Level 1) · Sprechblasen = Messages (Level 2, HQ: Gruppen/Agents/Channels) ·
Fenster = Browser (Level 3, Lab) · Gebäude = Unternehmen (Level 4). Klick schaltet die Sidebar-Ansicht um und
öffnet im Connect-Tab / bzw. /company/<id>?level=N (Connect-localStorage connect.activeLevel /
connect.activeCompanyId wird per chrome.scripting gesetzt/gelesen; dafür scripting + host_permissions
localhost:3010). Chevron = Icon-Modus, Suche filtert die Einträge, + = Erstellen-Menü.
Icons: Lucide v1.49.0 (ISC) zap, messages-square, pp-window, uilding-2, chevron-left, search
(als CSS-Maske, Farbe = currentColor). icons/connect-logo.png = Connect-Logo aus pps/app/public/brand.

## Apps als Helium-Tabs (v0.3.2)

- Klick auf eine App in der Connect-Sidebar: neuer Tab im zuletzt benutzten normalen Helium-Fenster (kein normales Fenster: neues Fenster). Ist die Seite schon offen, werden Tab und Fenster nach vorne geholt. Connect selbst bleibt unverändert (keine Vorschau-/iframe-Seite mehr).
- Ohne Extension-Antwort (Extension fehlt/verwaist) öffnet Connect die App per `window.open(url, "_blank")` als Tab.
- **Wichtig bei Änderungen an `background.js`, `open-window.js` oder `tabs.config.js`:** `version` in `manifest.json` und `SHELL_BUILD` in `background.js` erhöhen, dann Helium komplett schließen und neu starten. Chrome aktualisiert den Extension-Service-Worker sonst nicht (alter Code läuft weiter). `chrome://extensions` → Neu laden nur mit aktiviertem Entwicklermodus (sonst deaktiviert Helium die Extension).

## v0.4.0: Split-Links, automatische Tab-Sicherung

- **Split-Link** (Connect-Sidebar › „App hinzufügen“ › „Split-Link“: Name, URL links, URL rechts, optional Icon, Gruppe):
  ein Klick öffnet beide Seiten nebeneinander. Die Extension legt zwei normale Helium-Fenster auf die linke/rechte Hälfte
  der Arbeitsfläche (`chrome.system.display`). Sind die Seiten schon offen, werden sie wiederverwendet und neu gekachelt.
  Chromiums natives Split-View hat keine Extension-API zum Anlegen (nur `tab.splitViewId`, read-only), daher zwei Fenster.
  Beispiel „Notion + TradingView“ in „Technische“ – Rechtsklick › Bearbeiten.
- **Tab-Sitzung** (`session-save.js`): Snapshot aller normalen Fenster/Tabs in `chrome.storage.local`
  (`connectShell.session`) bei jeder Änderung. Startet Helium ohne seine Tabs wiederherzustellen, öffnet die Extension
  den letzten Stand nach ~7 s (abschaltbar: `restoreSession: false` in `tabs.config.js`).
  Empfohlen zusätzlich: `chrome://settings/onStartup` › „Zuletzt geöffnete Seiten öffnen“.

## Connect-Adresse (CONNECT_URL) und Helium-Startseite

- **Einzige Stelle:** `tabs.config.js` → `self.CONNECT_URL = "http://localhost:3010";`
  Umstellen (z. B. auf Vercel) mit **einem Befehl**: `setup\Set-ConnectUrl.cmd https://<projekt>.vercel.app`
  (schreibt CONNECT_URL, setzt Startseite/Home in `manifest.json` → `chrome_settings_overrides`, ergänzt
  `host_permissions`/`content_scripts.matches` für die neue Adresse, erhöht den Build). `Start-Connect.ps1` liest
  CONNECT_URL ebenfalls. Ohne Argument: aktuellen Wert anzeigen.
- **Helium-Startseite:** über `chrome_settings_overrides.startup_pages` der Extension. Gilt ab dem 2. Start mit
  geladener Extension auch beim normalen Helium-Start (Taskleiste/Startmenü, ohne Argumente).
  Rückgängig: `setup\Set-ConnectUrl.cmd -RemoveStartPage`, danach Helium einmal über „Connect (Helium)“ starten.
  (Gruppenrichtlinien unter `HKCU\Software\Policies\Helium` gehen nicht: der Schlüssel ist ohne Adminrechte
  schreibgeschützt, und Chromium ignoriert RestoreOnStartup/HomepageLocation auf Windows-PCs ohne Domäne.
  Direktes Bearbeiten von `Preferences` geht auch nicht, weil die Werte per MAC geschützt sind.)
- **Reihenfolge beim Start:** Connect zuerst (Startseite bzw. App-Fenster), ~7 s später öffnet die Extension die
  gesicherten Tabs (`session-save.js`), sofern Helium sie nicht selbst wiederhergestellt hat.

## Build-Wechsel (wichtig)

Helium registriert den Service Worker einer per `--load-extension` geladenen Extension nicht neu, auch wenn
`version` und `background.js` sich ändern; dann läuft weiter der alte Code. Deshalb zeigt `manifest.json` auf einen
versionierten Lader `sw-<version>.js`. Nach Code-Änderungen: `setup\Set-ConnectUrl.cmd -Bump`.
