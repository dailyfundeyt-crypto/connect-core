# Connect Desktop App (In-App Browser & AI-Automation)

Dieses Paket stellt die native Desktop-Applikation für Windows bereit.
Sie basiert auf der bewährten Architektur aus `EinfacherBrowser` und integriert den Browser direkt als nativen Bestandteil der Anwendung (wie bei OneKey Desktop).

---

## Funktionen

1. **Echter In-App Browser (WebView2):**
   - Echte Chromium-Rendering-Engine ohne iframe-Sicherheitsbeschränkungen (`X-Frame-Options`, CSP).
   - Voller Zugriff auf moderne Webseiten (Google, GitHub, Web3, dApps, Cloud-Konsolen).
   - Cookies und Logins bleiben erhalten.

2. **Tabs wie bei OneKey:**
   - **🏢 Connect Workspace:** Lädt die lokale Connect-Oberfläche (`http://127.0.0.1:3010`).
   - **🌐 Echter AI-Browser:** Eigenständiges Browserfenster mit URL-Eingabe, Navigations-Buttons (Zurück, Vor, Reload, Home).

3. **Integrierte AI-Automation Bridge (Port 3002):**
   Der Desktop-Browser lauscht lokal auf `http://127.0.0.1:3002` und ermöglicht Connect-KI-Agenten:
   - `GET /api/browser/status` — Status, aktuelle URL und Titel abfragen.
   - `POST /api/browser/navigate` — Browser zu einer beliebigen URL steuern.
   - `POST /api/browser/eval` — JavaScript im Browserkontext ausführen.
   - `POST /api/browser/click` — DOM-Elemente per Selektor anklicken.
   - `POST /api/browser/type` — Text in Formularfelder eingeben.
   - `GET /api/browser/snapshot` — HTML / Text-Repräsentation für AI extrahieren.
   - `GET /api/browser/screenshot` — Live-PNG-Screenshot des Browserfensters aufnehmen.

---

## Bauen & Starten

### Schnellstart:
Doppelklick auf `START-CONNECT-BROWSER.cmd` im Hauptverzeichnis.

### Manuell mit .NET 8:
```cmd
cd desktop\connect-browser
dotnet build -c Release
"bin\Release\net8.0-windows\Connect Desktop.exe"
```
