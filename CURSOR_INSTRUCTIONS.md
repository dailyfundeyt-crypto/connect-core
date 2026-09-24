# Connect Desktop — Master-Anweisung für Cursor (Phase 2: Comet AI & Arc Workflows)

> **Status:** Die grundlegende Verschmelzung ist abgeschlossen! 
> - Vite läuft auf `0.0.0.0:3010` (IPv4 & IPv6).
> - `MainWindow.xaml` nutzt modernes `WindowChrome` ohne Windows-Balken, mit Arc/Comet-Omnibox und Tailwind-Zinc-Design.
> - `desktop-bridge.ts` leitet IPC-Nachrichten von WebView2 an React weiter.
> 
> **Ziel für Phase 2:** Die AI-Browser-Workflows (wie bei **Perplexity Comet** und **Arc Browser**) lebendig machen, sodass der Nutzer und die Agenten direkt mit dem Browser interagieren können.

---

## 🎯 Deine konkreten Aufgaben in Cursor:

### Aufgabe 1: Comet AI Slide-Over mit echtem Agenten-Chat verbinden
* **Dateien:** `app/src/components/companies/comet-slide-over.tsx` & `app/src/components/chat/` bzw. `app/src/lib/channels/mutations.ts`
* **Problem:** Aktuell speichert `comet-slide-over.tsx` beim Klick auf *"Analysieren"*, *"Zusammenfassen"* oder *"Recherche"* nur einen Eintrag in `localStorage` und navigiert zu `/agents` – aber es passiert nichts weiter.
* **Lösung:**
  1. Wenn der Nutzer auf eine Quick-Action klickt oder im Eingabefeld Enter drückt:
     - Finde den passenden Agenten (z. B. Research/Analyst-Agent oder der Site-Mark-Agent der Company).
     - Finde oder erstelle einen Chat-Channel mit diesem Agenten (via `createChannel.mutateAsync([agentId])`).
     - Navigiere zu diesem Channel (`/channel/${channel.id}`).
     - Sende die Anfrage sofort als erste Nachricht oder setze sie als Entwurf in das Chat-Input:
       * *Beispiel Prompt:* `Analysiere bitte folgende Seite:\nTitel: ${title}\nURL: ${hostUrl}\n\nFrage: ${prompt}`
  2. Im Chat soll der Agent sofort beginnen, die Seite zu analysieren.

---

### Aufgabe 2: "Aktuelle Seite zu Gruppe pinnen" (Arc-Style Tab Pinning)
* **Dateien:** `app/src/components/companies/comet-slide-over.tsx` & `app/src/lib/companies/level3-tools.ts`
* **Vorgabe:**
  1. In `comet-slide-over.tsx` (oder in der Toolbar) soll ein eleganter Button sein: **"✦ Seite pinnen"** bzw. **"Zu Gruppe hinzufügen"**.
  2. Beim Klick öffnet sich ein Popover/Dropdown mit den 6 Gruppen:
     - **Technische** (TradingView etc.)
     - **Fundamentals**
     - **Sentimentalle**
     - **Sektorielle**
     - **Build** (Lovable, GitHub etc.)
     - **AI** (Claude, ChatGPT etc.)
  3. Nach Auswahl der Gruppe wird die aktuelle URL + Titel via `addCustomLabApp(companyId, groupId, { name: title || host, url: hostUrl })` dauerhaft in der Sidebar gespeichert!
  4. Ein kleiner Erfolgs-Toast ("Zu Build hinzugefügt") bestätigt die Aktion.

---

### Aufgabe 3: Level 3 Studio Hub (Schöner Einstiegsbildschirm)
* **Datei:** `app/src/components/companies/level3-site-studio.tsx`
* **Vorgabe:**
  1. Wenn der Nutzer in der Sidebar auf **Level 3 (Browser)** klickt und noch keine URL aktiv ist:
     - Zeige ein modernes, aufgeräumtes Grid mit Schnellzugriffs-Kacheln für die wichtigsten Tools:
       - **TradingView** (`https://de.tradingview.com`)
       - **Lovable** (`https://lovable.dev`)
       - **Cursor** (`https://cursor.com`)
       - **GitHub** (`https://github.com`)
       - **CryptoPanic** (`https://cryptopanic.com`)
       - **Claude** (`https://claude.ai`)
       - **ChatGPT** (`https://chatgpt.com`)
     - Jede Kachel hat ein Icon, Namen, Kategorie-Badge und öffnet das Tool per 1-Klick direkt im integrierten Chromium-Browser (`navigateDesktopBrowser`).

---

### Aufgabe 4: Aktive-Seite-Chip im Agenten-Chat
* **Dateien:** `app/src/components/chat/chat-input.tsx` (oder entsprechendes Input-Panel)
* **Vorgabe:**
  1. Wenn der Nutzer im Chat (`/channel/:id`) mit einem Agenten spricht und im Hintergrund eine externe Webseite im Browser aktiv ist:
  2. Zeige oberhalb des Textfeldes einen dezenten Pill-Chip:
     `🌐 Aktiver Tab: lovable.dev/projects [+ An Prompt anhängen]`
  3. Beim Klick wird der Kontext automatisch in die Eingabe eingefügt, damit der Agent weiß, worüber gesprochen wird.

---

## 🛠️ Build & Verifikation:
- Nach deinen Änderungen:
  ```bash
  cd app && bun run typecheck
  ```
  Es müssen **0 Fehler** gemeldet werden.
- Danach wie gewohnt commiten.
