# T3-Backend → Connect-Agentenbereich — Übersicht (nur Analyse, keine Umsetzung)

Stand: 29.10.2026, aktualisiert 14:30 MEZ (Europe/Berlin) · Read-only-Analyse, auf dem PC wurde nichts geändert.

- **T3-Projekt (Stefans Fork):** `C:\Users\Kunc GmbH\.gemini\antigravity\scratch\t3code`
  (Basis: Hermes-Fork `NateWeav/t3code-hermes` von `pingdotgg/t3code`, siehe `FORK.md`; zusätzlich ein `FreebuffDriver`
  und ein **leerer** Ordner `packages/provider-muse-api` vom 27.10.)
- **Upstream-Arbeitskopie auf der Box (zum Nachlesen):** `/workspace/t3cua/t3code` (pingdotgg/t3code @ `dc84b096`)
- **Connect:** `C:\Users\Kunc GmbH\Downloads\OpenBot-v2-Helium`, Live-Kopie `apps\connect-app\runtime\connect`,
  Server Port **3101**, Postgres **5544**, Daten `%LOCALAPPDATA%\ConnectApp` und `%LOCALAPPDATA%\ConnectAgents`.
  Referenz-Quelltext auf der Box: `/workspace/connect-src` (Stand Cloud-Agents-Paket 28.10.).

---

## Quellen

| Quelle | Inhalt |
|---|---|
| **Stefans Ideen-Dokument (Google Doc `1nPqWMu5l668GtPviubPs5dsD4Ej8oiWCJ6NN-xSBitU`, gelesen 29.10.)** | 6 Screenshots + Text: was bleibt, was aus T3 kommt, Kontext-Wechsel, Agenten-Liste, Browser, Computer |
| Live-Code Connect (PC, nur gelesen) | Bereits vorhanden: Modus „Agents – T3 Code“ (`apps/server/src/connect/t3-agents.ts`, `apps/app/src/components/companies/t3-agents-area.tsx`, `apps/app/src/lib/agents/t3-agents.ts`, `apps/app/src/lib/companies/level.ts`) = T3-Web-App per iframe + Pairing-Link |
| `/workspace/Grokbot-animations` (Klon, nur gelesen) | SVG-Maskottchen-Engine für Bot-Avatare (MIT) |
| `/workspace/t3cua/PLAN.md` (Kopie im Bot-Store) | „T3 Code × Cua × Muse-API — Implementierungsplan“ vom 27.10.2026 – einziges gefundenes Plan-Dokument zu T3 |
| `…\scratch\t3code\FORK.md` (PC) | Liste aller Fork-Änderungen (Hermes etc.) |
| Grok-Bot-Gedächtnis (Notizen vom 27./28.10.) | Stefans Aussagen zu T3/Connect-Merge |
| T3-Code selbst (`apps/server/src/provider`, `orchestration-v2`, `packages/provider-*`) | Backend-Analyse |

**Update 29.10.:** Stefan hat sein Ideen-Dokument (Google Doc) nachgereicht – die Zitate stehen unten in (a) als *bestätigt*. Ursprünglich: **kein eigenes Dokument „Was mir an T3 gefällt“ gefunden** – weder auf der Box noch auf dem PC (Suche nach T3/t3code in
Documents, Downloads, Desktop, Obsidian-Vault, OpenBot-v2-Helium-Doku; Treffer waren nur Trading-Notizen und fremde READMEs).

**Weitere Funde auf dem PC (nur gelesen):**
- Daneben liegt `…\scratch\t3code-hermes` (Stand 25.10.) – vermutlich die unveränderte Hermes-Fork-Kopie.
- `…\scratch\t3code` wurde zuletzt am 29.10. 13:58 (MEZ) geändert – evtl. arbeitet gerade ein anderer Agent darin.
- `…\scratch\t3code\tmp\merge` / `tmp\final` / `merge-cloud-agents.mjs` / `restart-3101.ps1` (28.10.): Hilfsdateien vom
  Einspielen des Cloud-Agents-Pakets in Connect – kein T3-Backend-Code.
- Connect-Pläne mit Hermes-Bezug (kein T3-Bezug): `OpenBot-v2-Helium\.plan\035-…hermes…`, `037-gesamtplan-weiter.md`,
  `044-bot-shells-manus-zgpt-claude.md`, `CLI-BOTS-PLAN.md`, `tools\connect-sidecar\PLAN.md`.

Abschnitt (a) setzt sich deshalb aus Zitaten aus PLAN.md/Gedächtnis plus aus dem Code abgeleiteten Punkten zusammen.

---

## (a) Was Stefan an T3 gefällt

### Bestätigt durch Stefans Ideen-Dokument (Google Doc, 29.10.) – wörtlich (Tippfehler original)

| # | Screenshot | Zitat | Bedeutung |
|---|---|---|---|
| I1 | Benutzer-Menü (Einstellungen, Nutzung & Limits, Handy verbinden, Light Mode, Focus-Timer, Abmelden) | *„In Massages will ich gerne diese einstellungen dort unten lassen nur erweitern dann in einstellungen das aus T3 und das Nutzung & Limits will ich aus T3 übernehmen Design und Funktionalität und es sollte von hier geöffnet werden können.“* | Menü bleibt; Einstellungen um T3-Einstellungen erweitern; „Nutzung & Limits“ = T3-Design + T3-Funktion, geöffnet aus diesem Menü |
| I2 | Obere Leiste „Flux ▾“ + Modus-Icons (Focus ⚡, Messages 💬, Browser ▭, Agents 🤖) | *„Das hier oben durch das man Agenten wechseln kann sollten wir behalten nur dann T3 hier entfernen weil wir es hier dannn niht mehr brauchen wennn wir es hier einbauen.“* | Agenten-/Firmen-Umschalter bleibt; der separate Modus **„Agents – T3 Code“ (iframe, Level 5)** fällt weg, sobald T3 in Messages eingebaut ist |
| I3 | Bereich „APPS (3)“ – Codex, Antigravity, Manus mit Konten | *„Apps sollen erhalten bleiben.“* | bleibt |
| I4 | Bereich „PC-APPS – App vom PC hinzufügen“ | *„Das soll auch erhaltne werden.“* | bleibt |
| I5 | – | *„Die Agenten die wir haben sollten dann die einzelnen Chats sein die gespeichert sind in dem eingabe bereich nur wichtig das das kontext jede 100.000 Token gewechselt werden soll und die informationen die es gibt zusammenkomprimiert für den Agenten und er arbeitet weiter. diese Komprimierung kann durch einen Sub Agenten mit dem gleichen Token Cout entstehen. und somit will ich immer in einem Gesprech bleiben in T3 was unsere Agenten in Connect sind nur das diese Dann immer ein neues Kontext window automatisch haben“* | **1 Connect-Agent = 1 dauerhaftes Gespräch (T3-Thread)**; alle 100 000 Tokens automatisch neues Kontextfenster, Zusammenfassung durch Sub-Agenten, Agent arbeitet nahtlos weiter |
| I6 | Grok-Bot-Seitenleiste (Avatar-Raster) | *„das design von Connect also die Agenten und die ORdner in denen Ich die Agenten speichern will sollte dann angepasst werden die Agenten solltne links so gelistet wrden wie in Grok bot vom Design her wie auf dem Bild hier.“* | Agenten links als Avatar-Raster wie Grok Bot; Ordner für Agenten |
| I7 | – | *„wenn ich einen neuen Agenten erstelle kommt dann erst das chat menü von dem ich kann nicht direkt einen chat sehen wie es bei T3 ist sondern ich muss einen Agenten auswählen“* | Neuer Agent → **sofort im Chat** landen (wie bei T3), kein Zwischenmenü |
| I8 | – | *„den Browser und Handy und alle Funktionen von T3 will ich gernen übernehmen. und erweitern durch unsee Browser Steuerung.“* | T3-Browser-Vorschau + T3-Mobile übernehmen, erweitert um Connects Browser-Steuerung |
| I9 | – | *„Somit will ich das Helium opnen Source ist den Helium Browser in die App integrieren da wir somit anmelde Daten und Chrome extensions im brwser auch sogar nutzen können dann.“* | Helium-Browser (Open Source) in die App einbetten → Logins + Chrome-Extensions nutzbar |
| I10 | – | *„Also unseren Browser der über dem Chat schwebt kannst du auch so an die Seite wie bei Grok bot mahchen.“* | Schwebenden Browser seitlich andocken (wie Grok-Bot-Seitenpanel) |
| I11 | Rechtes Panel „Connect – Details / Bibliothek / Computer – Der Computer schläft“ | *„Mache so einen Platz für einen Computer an der Seite für jeden Agenten. https://github.com/trycua/cua.git also so einen Mini Computer den die Agenten bedienen können dann“* | Pro Agent ein Computer-Tab mit Cua-Mini-Computer |
| I12 | – | *„Schaue weiter funktionen in COnnect an und frage mich ob du die auch übernehmen sollst oder von T3.“* | Feature-für-Feature-Entscheidung Connect vs. T3 → offene Fragen (d) |

Zusätzlich (Stefan, Chat 29.10.): *„es wäre gut, wenn wir es hinkriegen würden, 40 Agenten zu erstellen, die einzeln meine Ideen realisieren können. Diese CLI-Möglichkeit ist auch gut. Neben dem Agenten kann ich dann auch die CLI oben einstellen. Das hat T3 nicht, sondern nur Connect. Das ist aber entspannt und wir sollten das, glaube ich, behalten. Das Problem ist: Die CLI in Connect ist nicht so gut wie die eingebaute CLI in T3.“*
Und: neue Bots bekommen automatisch ein **Grok-Bot-Maskottchen** (Form + Farbe wählbar, Dialog „Neuen Bot erstellen“).


### Bestätigt durch Stefan (Chat 29.10., über Grok Bot)
- **Token-Sparen** in T3 gefällt ihm.
- **Kontext-Management** in T3 gefällt ihm.
- **CLI-Integration** in T3: *„wunderbar“*.
- T3 zeigt Nutzung sehr gut: Umschalter **Cost / Tokens / Limits** + Zeitraum (z. B. „30 days“) (Screenshot `…/attachments/01M63WTF8GYQSZEVVX3XQEWB54.png`). Connect hat nur einen einfachen Punkt „Usage“ → soll die volle T3-Ansicht öffnen.
→ Eigene Pakete im Masterplan: A14 Token-Sparen, A15/A16 Kontext, A23 CLI-Tausch, A17/A24 Nutzung.

### Weitere Belege (Plan & Gedächtnis)

- PLAN.md, First Principle 1: *„T3-Design bleibt. … Bestehende Provider, Threads, Settings, Devices, Diffs, Browser-Tabs
  bleiben erreichbar. Nur additiv erweitern.“*
- PLAN.md, First Principle 3: *„Kein CLI für Stefans Muse. … Nur Base-URL + Bearer-Key aus User-Settings + Modell `muse`.“*
  → Muse läuft über die API, die anderen Agenten über echte CLIs.
- PLAN.md, First Principle 7: *„Performance. Keine Screenshot-Flut über WS ohne Throttle.“*
- Gedächtnis 27.10.: Stefan will *„Connect Helium (OpenBot-v2-Helium, das Frontend) mit T3 Code (dem Backend) … zu einer
  Software“* zusammenführen.
- Gedächtnis 27.10.: Stefan will den Merge *„Schritt für Schritt selbst planen“*, weil er noch nicht sicher ist, dass es gut wird.
- Gedächtnis 27.10.: In T3 gibt es *„Menüpunkte, um mit Agenten wie Antigravity zu sprechen“* – Agenten per API-Key/CLI ansprechen.
- Auftrag heute (Stefan): *„… ein Backend integrieren, das besser funktioniert … mein T3-Projekt-Backend für Connect Messages,
  also den Agentenbereich … Ich will die CLIs auf diese Weise integriert haben.“*

### Aus dem T3-Code abgeleitet (NICHT von Stefan bestätigt)

1. **Echte CLI-Anbindung statt Text-Proxy:** Codex (App-Server-Protokoll), Claude (Agent SDK), Cursor, Grok, OpenCode, Pi,
   Antigravity, Hermes, Freebuff (ACP über stdio), Muse Code – je ein Treiber in `BUILT_IN_DRIVERS`
   (`apps/server/src/provider/builtInDrivers.ts`).
2. **Ein einheitliches Adapter-Interface** (`packages/provider-core/src/server/ProviderAdapter.ts`, `ProviderAdapterV2`):
   `ensureThread / resumeThread / startTurn / steerTurn / interruptTurn / respondToRuntimeRequest / readThreadSnapshot`
   und ein Event-Stream (`message.updated`, `turn_item.updated`, `command_output.delta`, `runtime_request.updated`,
   `plan.updated`, `subagent.updated`, `turn.terminal`).
3. **Sessions & Threads überleben Neustarts:** `ProviderSessionManager`, `ProviderRuntimeRecoveryService`,
   `RestartContinuation`, Event-Store + Projektionen (`orchestration-v2/EventStore.ts`, `ProjectionStore.ts`).
4. **Live-Streaming der Antworten** (`assistantStreaming.ts`, `ThreadLiveEventCoalescer.ts`, `LiveStreamBudget.ts`) –
   Text erscheint Wort für Wort, mit Budget gegen WS-Überlast.
5. **Freigaben/Rückfragen der CLI** (Datei schreiben, Befehl ausführen) als `runtime_request` mit Antwort aus der UI.
6. **Tool-Schritte sichtbar** (Befehle, Diffs, Sub-Agenten) als `turn_item`s, Befehlsausgabe live (`CommandOutputHub`).
7. **Unterbrechen / Nachsteuern** einer laufenden Antwort (`interruptTurn`, `steerTurn`), Warteschlange (`QueuedRunOrder`).
8. **Provider-Status & Login** pro CLI (installiert? eingeloggt? Version? Limits) – `ProviderRegistry`, `ProviderAuthService`,
   `*UsageLimits`.
9. **Checkpoints/Rollback** pro Turn (`CheckpointService`, `CheckpointRollbackService`).
10. Fork-Extras (Hermes): Skills-, Tasks-, Memory-(Hindsight)-, Kanban-Panel, Reasoning-Effort-Auswahl, Status-Punkte an Tabs.

---

## (b) Was von Connect bleibt (Design)

Alles Sichtbare bleibt Connect – T3 liefert nur „unter der Haube“:

- Agenten-Liste/Sidebar, Agenten-Anlage (`create-agent-dialog.tsx`, `agent-dialog.tsx`, `cloud-agent-form.tsx`).
- Chat-Ansicht: `channel-chat.tsx`, `chat-transcript.tsx`, `conversation-view.tsx`, `floating-composer-bar.tsx`,
  Tool-Zeilen (`tool-line.tsx`, `tool-boundary.tsx`), Avatare.
- CLI-Bereich pro Agent (`agent-cli.ts`-Panel mit Zielen Manus/Codex/ChatGPT/Claude/Grok/Cursor/Lovable).
- Cloud-Agenten inkl. Badge „Cloud · Muse“, geplante Aufgaben (`cloud-agent-tasks.tsx`), `/api/cloud-agents/*` bleibt unverändert.
- Agenten-Browser (eigene Helium-Profile je Agent), Computer-Panel, Telefon, Automationen.
- Login/Konten, Supabase/Postgres-Daten von Connect.

---

## Ist-Zustand im Vergleich

| Thema | Connect heute | T3 |
|---|---|---|
| „CLI“-Agenten | `apps/server/src/cli-bridge/bridge.ts`: **kein echter CLI-Start**, sondern OpenAI-kompatibler Chat-Completion-Aufruf (Codex-Key / Proxy), Rest per `shell-dispatch.ts` (localStorage-Warteschlange, Desktop-Injektion) | Startet echte CLIs als Prozess (stdio/ACP/App-Server/SDK) |
| Normale Agenten-Chats | CopilotKit/Intelligence-Lauf (`/api/copilotkit/agent/:id/run`, AG-UI-Events über Gateway-WS), `channels/*`, `turn-watchdog.ts` | `orchestration-v2` (Event-Sourcing, Turns, Runs) |
| Cloud-Agenten | `apps/server/src/cloud-agents/*`: Muse/Grok-Webhook/OpenAI, 30-s-Polling, Status sending/sent/waiting/answered/failed | (in Stefans Fork geplant: `provider-muse-api`, Ordner leer) |
| Laufzeit | Bun + Hono (Server 3101) | Node ≥22.16 + Effect, eigener WS-RPC-Server (Standardport 3773) |
| Datenhaltung | Postgres 5544 / Supabase | eigene SQLite/Event-Store unter T3-Home (`~/.t3-hermes` im Fork) |

**Schon vorhanden (Live-Code, 24.10.):** Connect hat einen Modus „Agents – T3 Code“ (Level 5 in `lib/companies/level.ts`). Der Server findet den laufenden T3-Server (`CONNECT_T3_URL` → `$T3CODE_HOME/userdata/server-runtime.json` → `http://127.0.0.1:3773`, nur Loopback), Route `GET /agents/t3` (Status) und `POST /agents/t3/pair` (Einmal-Pairing-Link über T3-CLI); die Oberfläche bettet **T3s eigene Web-App per iframe** ein. Das ist genau das „T3 hier“, das laut I2 wegfallen soll. Die Erkennungslogik (`apps/server/src/connect/t3-agents.ts`) wird **wiederverwendet** für die Brücke.

**Wichtigste Folgerung:** T3-Backend-Code lässt sich nicht einfach in den Bun/Hono-Server von Connect kopieren
(Effect-Laufzeit, Node-spezifisch, eigene Persistenz, ~200 Dateien in `orchestration-v2`). Empfehlung: **T3-Server als
eigenen lokalen Prozess („Sidecar“) laufen lassen** und Connect über eine schmale Brücke anbinden. Connect-Design bleibt,
T3 macht CLI-Sessions/Turns/Streaming.

---

## (c) Schritt-für-Schritt-Mapping T3 → Connect-Agentenbereich

Jeder Schritt ist einzeln einspielbar, einzeln testbar und einzeln abschaltbar (Feature-Flag), Cloud-Agenten bleiben unberührt.

### Schritt 0 – Entscheidung & Inventur (keine Codeänderung)
- Festlegen: Sidecar (empfohlen) vs. Portierung. Prüfen, welche Fork-Version läuft (Hermes-Fork nightly), welcher Port frei ist
  (Vorschlag 3773 nur auf `127.0.0.1`), wo T3-Home liegt (eigenes Verzeichnis, z. B. `%LOCALAPPDATA%\ConnectAgents\t3-home`).
- Risiko: keins. Ergebnis: Freigabe durch Stefan.

### Schritt 1 – T3-Server headless starten (getrennt von Connect)
- T3-Server aus `scratch\t3code` als eigener Prozess mit eigenem T3-Home, nur Loopback, ohne Desktop-App/T3-Connect-Relay.
- Connect bleibt komplett unverändert; nur prüfen: Provider-Status-Liste (Codex/Claude/… installiert? eingeloggt?).
- Risiken: Port-Konflikt; Prozess erbt CLI-Logins des Windows-Users (gewollt, aber dokumentieren); T3-Server darf nicht
  Stefans eigenes T3-Desktop-Home überschreiben (AGENTS.md: keine Writes auf Live-Install) → eigenes Home zwingend.

### Schritt 2 – Brücke im Connect-Server: `apps/server/src/t3-bridge/` (neu)
- Neues Modul (nur neue Dateien + 1 Zeile Routen-Mount in `app.ts`): WS-RPC-Client zum T3-Server, Health-Check,
  Route `GET /api/t3/status` (T3 erreichbar? welche Provider bereit?).
- Auth: Bridge-Token nur serverseitig (wie `KEY_ENCRYPTION_KEY`-Prinzip bei Cloud-Agents), nie an den Browser.
- Risiken: T3-RPC-Schema ändert sich bei Upstream-Sync → Contracts-Version pinnen; Bun-WS-Client vs. Effect-RPC-Format
  testen (ggf. `@t3tools/client-runtime` als Abhängigkeit nutzbar? prüfen).

### Schritt 3 – Agent-Feld `runtime: "t3"` (Daten, kein UI-Umbau)
- Ergänzend zu `runtime: "cloud" | "cli"` aus dem Cloud/CLI-Trennungsauftrag: `"t3"` + `t3Provider` (`codex`, `claudeAgent`,
  `cursor`, `grok`, `opencode`, `antigravity`, `hermes`, …) + optional Modell.
- Migration: bestehende Agenten bleiben wie sie sind (Default unverändert).
- Risiko: drei Laufzeiten im selben Feld → klare Regel „kein Fallback“ (wie bei Cloud).

### Schritt 4 – Nachricht senden: `POST /api/t3-agents/:agentId/messages`
- Mapping: Connect-Agent ↔ T3-Projekt (Arbeitsordner) und Connect-Channel/Thread ↔ T3-Thread (`threadId` speichern).
- Ablauf: Thread anlegen/fortsetzen → Turn starten mit Text (+ Anhänge über T3-Attachment-Store) → `clientMessageId` merken.
- Status-Modell an Cloud-Agents angelehnt (sending/running/waiting/answered/failed), damit der vorhandene Chat-Status wiederverwendet wird.
- Risiken: Arbeitsordner pro Agent muss existieren (CLIs brauchen `cwd`); Anhänge-Pfade Windows.

### Schritt 5 – Antworten streamen: `GET /api/t3-agents/:agentId/stream` (SSE oder Connect-WS)
- T3-Events → Connect-Transcript-Format übersetzen:
  `message.updated` → Assistent-Text (live), `turn_item.updated` → Tool-Zeile (`tool-line.tsx`),
  `command_output.delta` → ausklappbare Ausgabe, `turn.terminal` → fertig/Fehler.
- T3 drosselt bereits (`ThreadLiveEventCoalescer`, `LiveStreamBudget`); Connect-Seite zusätzlich nur aktiven Chat abonnieren.
- Risiko: Übersetzungsschicht ist das Herzstück und der größte Aufwand; Event-Formate versionieren + Snapshot-Tests.

### Schritt 6 – Chat-UI anschließen + **CLI-Auswahl-Tausch** (Design unverändert)
- **Entscheidung Stefan (29.10.):** Die CLI-Auswahl **oben neben dem Agenten** bleibt (gibt es nur in Connect). Dahinter
  läuft künftig die **T3-Engine**: Wählt Stefan dort Codex/Claude/Cursor/Grok/…, ersetzt die T3-CLI **an genau derselben
  Stelle, im selben Look** die schwächere Connect-CLI (`cli-bridge`-Chat-Completion). Kein zweites Menü, kein neues Layout.
- Umsetzung: neue Komponente `t3-cli-selector.tsx` mit identischem Trigger/Styling wie die bestehende Auswahl
  (heute `AgentModelPicker`-Stil: runder 8-px-Trigger, Chevron); Optionen kommen aus der T3-Provider-Liste (installiert /
  eingeloggt / Limit). Nicht verfügbare CLIs grau mit Hinweis „nicht eingeloggt“.
- In `channel-chat.tsx`: wenn `runtime === "t3"` → senden über Schritt 4, lesen über Schritt 5; eigene `t3-agent-chat.tsx`
  nutzt vorhandene Transcript-Komponenten. Badge „CLI · Codex (T3)“.
- Risiko: Die genaue Live-Position der heutigen CLI-Auswahl muss vor dem Bau im Live-Code bestätigt werden
  (Box-Kopie zeigt `AgentModelPicker` im Composer und `CLI_TARGETS` in `agent-cli.ts`); `channel-chat.tsx` (995 Z.) /
  `composer.tsx` groß → minimaler Diff.

### Schritt 7 – Stoppen & Nachsteuern
- Knopf „Stopp“ → `interruptTurn`; Nachricht während laufender Antwort → `steerTurn` oder Warteschlange.
- Risiko: nicht jeder Provider kann steeren → T3-Capabilities abfragen, UI-Knopf sonst ausblenden.

### Schritt 8 – Freigaben / Rückfragen der CLI
- `runtime_request.updated` → Karte im Chat „Darf Codex `npm test` ausführen? [Erlauben] [Ablehnen]“ → `respondToRuntimeRequest`.
- Option pro Agent „Vollzugriff“ (entspricht Stefans Wunsch, dass Agenten nicht nachfragen) über T3 `runtimeMode`.
- Risiko: Vollzugriff = CLI darf alles im Arbeitsordner → pro Agent bewusst einschalten.

### Schritt 9 – Connect-CLI-Ziele auf T3 umleiten (gleiche Stelle, gleicher Look)
- Ziele, die T3 kann (Codex, ChatGPT→Codex, Claude, Cursor, Grok, Antigravity, OpenCode, Hermes), laufen über T3 statt
  `cli-bridge`. Manus, Lovable, ZGPT bleiben auf dem bisherigen Weg (T3 hat keinen Treiber dafür).
- Provider-Status (installiert, eingeloggt, Limits) direkt im Selector.
- Alte `/api/cli-bridge`-Route bleibt parallel hinter Flag `connect.t3.cliSwap` (nichts löschen).

### Schritt 9a – Kontext-Wechsel alle 100 000 Tokens (Idee I5)
- Pro T3-Thread Token-Zähler (aus T3-Usage-Events). Bei ≥ 100 000: Sub-Agent (gleicher Provider/Modell) erstellt eine
  komprimierte Übergabe (Ziele, Stand, offene Punkte, Dateien), neuer T3-Thread startet mit dieser Übergabe, Connect zeigt
  **denselben Chat** weiter (Trennlinie „Neues Kontextfenster · Zusammenfassung“). Alte Threads bleiben lesbar.
- Risiko: Informationsverlust → Zusammenfassung im Chat sichtbar und editierbar; Schwelle pro Agent einstellbar.

### Schritt 9b – Ein Agent = ein Gespräch, Neuer Agent → direkt im Chat (I5, I7)
- Agent anlegen öffnet sofort seinen Chat; kein Zwischenmenü.

### Schritt 10 – Verlauf & Neustart-Festigkeit
- Beim Öffnen eines Chats `readThreadSnapshot`/Thread-Projektion laden statt nur Connect-DB; Neustart von 3101 darf laufende
  T3-Turns nicht abbrechen (läuft ja im Sidecar).
- Risiko: zwei Datenquellen (Connect-DB + T3-Store) → Regel: T3 ist Quelle für Turn-Inhalt, Connect speichert nur Zuordnung + Kopie.

### Schritt 10a – Modus „Agents – T3 Code“ (iframe) ausblenden (I2)
- Erst wenn Schritte 4–9 laufen: Level 5 im Modus-Umschalter hinter Flag ausblenden. Dateien bleiben (nichts löschen).

### Schritt 11 – Oberfläche aus Stefans Ideen (I1, I6, I8–I11)
- Nutzung & Limits im T3-Design aus dem Benutzer-Menü; Einstellungen um T3-Bereich erweitern; Agenten-Raster links wie
  Grok Bot + Ordner; Browser seitlich andocken; Helium-Einbettung (Recherche zuerst); Computer-Tab mit Cua pro Agent;
  Handy-Kopplung aus T3. Details und Pakete: `MASTERPLAN-40-AGENTEN.md` (40 Pakete, Wellen, Prompts).

### Schritt 11b (optional) – Extras aus T3/Hermes
- Checkpoints/Rollback, Diffs im rechten Panel, Hermes-Skills/Memory/Kanban, Reasoning-Effort-Auswahl, Usage-Limits.
- Einzeln nach Stefans Wunsch.

### Schritt 12 (optional) – Muse über T3
- Erst wenn `provider-muse-api` im Fork existiert (Ordner ist leer). Bis dahin bleibt Muse über `/api/cloud-agents` – funktioniert.

### Querschnitts-Risiken
- **Upstream-Drift:** T3 ändert sich nightly; Brücke gegen eine feste Fork-Version bauen.
- **Zwei Server-Prozesse:** Connect.exe startet heute nur 3101 → Start/Überwachung des Sidecars muss in den Connect-Starter,
  ohne `Connect.exe --stop`/`restart-server.ps1` anzufassen.
- **Bundle-Falle:** Änderungen müssen auch in `apps\connect-app\runtime\connect` landen; ein neuer Bundle-Build überschreibt Handänderungen.
- **Online/Vercel-Version:** Sidecar-CLIs laufen nur lokal → in der Web/Vercel-Version T3-Agenten als „nur am PC verfügbar“ markieren.
- **Sicherheit:** T3 nur auf `127.0.0.1`, Token nur serverseitig, nie loggen.

---

## Entscheidung: CLI-Auswahl bleibt, T3-Engine dahinter

| | Vorher | Nachher |
|---|---|---|
| Ort | oben neben dem Agenten (Connect) | **gleicher Ort** |
| Look | Connect-Dropdown | **gleicher Look** (gleiche Komponenten-Styles) |
| Engine | `cli-bridge` (OpenAI-kompatibler Chat-Completion, kein echter CLI-Prozess) | **T3-Treiber** (echter CLI-Prozess, Streaming, Tools, Freigaben, Stopp) |
| Fallback | – | Flag aus → alter Weg; Manus/Lovable/ZGPT immer alter Weg |

Damit beantwortet: alte Frage 6 (alter CLI-Weg bleibt parallel hinter Flag, später ersetzen) und Frage 3 (T3 läuft als Sidecar;
Stefan will T3-Backend, Connect-Oberfläche).

## Skalierung auf 40 parallele T3-Agenten

**Ziel (Stefan):** ~40 Agenten, jeder setzt eine Idee um. Ein T3-Sidecar reicht (T3 verwaltet viele Threads), aber
**40 gleichzeitig laufende CLI-Prozesse** sind für einen PC zu viel (je Codex/Claude-CLI grob 0,3–1 GB RAM + CPU-Spitzen bei
Builds/Tests; Richtwert, auf Stefans PC zu messen – Hardware-Abfrage kam wegen Verbindungsabbruch nicht durch).

| Thema | Regel |
|---|---|
| Arbeitsordner | je Agent `%LOCALAPPDATA%\ConnectAgents\workspaces\<agentSlug>\` (eigener Ordner, optional eigenes Git-Repo/Worktree); nie zwei Agenten im selben Ordner |
| T3-Home | ein eigenes T3-Home für Connect (`%LOCALAPPDATA%\ConnectAgents\t3-home`), nicht Stefans T3-Desktop-Home |
| Gleichzeitigkeit | Scheduler: **max. aktive Turns** (Start 4–6, einstellbar), Rest in Warteschlange mit Status „wartet“; pro Provider eigenes Limit (z. B. Codex 3, Claude 2) wegen Rate-/Usage-Limits |
| Leerlauf | Session nach X min Leerlauf stoppen (T3 `stopSession`), bei nächster Nachricht `resumeThread` – spart RAM |
| Lastschutz | Monitor: CPU > 85 % oder freier RAM < 4 GB oder Platte < 20 GB → keine neuen Turns starten, laufende nicht abbrechen |
| Streaming | nur der sichtbare Chat bekommt Live-Text; alle anderen nur Status-Punkte (T3-Coalescer + `LiveStreamBudget`) |
| Kontext | 100k-Rotation (9a) verhindert endlos wachsende Threads |
| Kosten/Limits | Nutzung & Limits je Agent und gesamt; bei Limit → Agent pausiert mit Hinweis, kein Provider-Wechsel ohne Stefan |
| Übersicht | Flotten-Ansicht: 40 Agenten, Status (läuft/wartet/schläft/Fehler), Tokens, letzte Aktivität |
| Sicherheit | Vollzugriff nur im eigenen Arbeitsordner; Freigaben für alles außerhalb |

### Ideen → Agenten (Vorschlag, Stefan bestätigt/ergänzt)
Das Ideen-Dokument enthält 12 Punkte (I1–I12), keine Liste mit 40 Produktideen. Vorschlag: die **Bau-Arbeit** (Integration)
in 40 Pakete schneiden (siehe `MASTERPLAN-40-AGENTEN.md`); danach sind dieselben 40 Agenten-Plätze in Connect frei für
Stefans weitere Ideen. Zuordnung der Ideen zu Paketen:

| Idee | Pakete im Masterplan |
|---|---|
| I1 Einstellungen + Nutzung & Limits aus T3 | A17, A24, A25, A39 |
| I2 Agenten-Umschalter bleibt, T3-Modus weg | A39 |
| I3/I4 Apps & PC-Apps bleiben | A40 (Regressionstest), keine Änderung |
| I5 Ein Gespräch, 100k-Kontextwechsel, Sub-Agent-Kompression | A15, A16, A22 |
| Token-Sparen (bestätigt) | A14, A25 |
| I6 Agenten-Raster wie Grok Bot + Ordner | A28, A29 |
| I7 Neuer Agent → direkt Chat | A30 |
| I8 Browser + Handy aus T3, + Connect-Browsersteuerung | A32, A34 |
| I9 Helium-Browser einbetten | A33 |
| I10 Browser seitlich andocken | A32 |
| I11 Computer-Tab mit Cua je Agent, Maschinen in Einstellungen | A19, A26, A27 |
| I12 Weitere Funktionen Connect vs. T3 | offene Fragen (d) |
| CLI-Auswahl-Tausch | A04, A23, A38 |
| Nutzungsansicht Cost/Tokens/Limits | A17, A24 |
| Firmenprofil-Token-Verbrauch | A20, A35 |
| Bot-Avatar Grok-Bot-Stil | A29, A30, A31 |
| 40 Agenten (Last, Ordner, Flotte) | A07, A08, A09, A36 |

## Nutzung (Usage) aus T3

- T3 liefert `server.getUsageSummary` (Contract `packages/contracts/src/usage.ts`, Version 6): Eingabe `sinceDay/untilDay/timeZone/
  resolution(day|hour)`, Ausgabe `buckets[]` je **Tag × Provider × Modell** mit `totals` (Tokens), `costUsd`, `cacheSavingsUsd`,
  `sessions`; Limits über `usageLimits` / `usageLimitSources` (Codex-, Claude-, Antigravity-, Cursor-Limits). Web-UI:
  `apps/web/src/components/usage/UsagePage.tsx`, `UsageLimits.tsx`, `UsageProviderChart.tsx`, Voreinstellung
  `metric: "cost"|"tokens"|"limits"`, `windowDays: 30` (`usagePagePreferences.ts`).
- **Wichtig:** T3 rechnet nach Provider/Modell, **nicht pro Connect-Agent**. Für „pro Agent“ und „pro Firma“ braucht Connect ein
  eigenes **Usage-Ledger**: pro Turn die Token-Zahlen aus den T3-Turn-Events (`ClaudeTurnTokenUsage`, `CodexTurnTokenUsage`,
  ACP `usage_update`) mit `agentId/companyId/provider/model` speichern; Kosten über T3-Preistabelle.
- Connect heute: Menüpunkt „Usage“ in `app-sidebar.tsx` → `/settings#usage` (`codex-usage-panel.tsx`). Künftig öffnet er die
  volle Ansicht (Cost/Tokens/Limits, Zeitraum 7/30/90 Tage, Filter pro Agent / CLI / Firma) im Connect-Look.

## Firmenprofil: öffentlicher Token-Verbrauch

- Connect hat einen Firmen-Feed (`lib/companies/posts.ts`, Profil `components/companies/company-profile-x.tsx`).
- Neu: Jede Firma zeigt auf ihrem Profil automatisch ihren Token-Verbrauch (Summe aller Agenten der Firma aus dem Ledger).
- Datenschutz: **nur Summen** (Tokens gesamt, optional Kosten, Zeitraum, evtl. Anteil je CLI) – **keine** Prompts, Antworten,
  Dateinamen, Keys, Agentennamen-Details; Schalter „Öffentlich anzeigen“ pro Firma (Opt-out); serverseitiger Filter, öffentlich nur
  über eigenen Endpoint mit festen Feldern; Caching (z. B. stündlich), damit keine Live-Rückschlüsse möglich sind.
- Offen: Standard-Sichtbarkeit (an oder aus) – siehe (d).

## Cua: Maschinen für Bots

- Cua (`github.com/trycua/cua`, Kopie `/workspace/t3cua/cua` @ d6fde99, **MIT © Cua AI, Inc.**): `cua`-CLI + SDK (Python,
  TypeScript `@trycua/cua`, Rust) für lokale Sandboxes/VMs (`cua sb create ubuntu --name dev`, `exec`, `screenshot`, `rm`),
  Windows-Installer `irm https://cua.ai/install.ps1 | iex`, Cua Driver für Windows-Apps, `cua host setup` für eigene Rechner.
- Wunsch Stefan:
  1. In den **Einstellungen** PCs/Sandbox-Maschinen für Bots anlegen.
  2. **Standard:** beim App-Start gibt es immer **eine lokale Maschine, die alle Bots teilen**.
  3. **Onboarding** schlägt vor, eine lokale Maschine zu installieren; ist keine da, installiert das System **automatisch eine kleine**.
  4. Pro Bot ein **Computer-Tab** wie im Grok-Bot-Agenten-Panel (Screenshot `…/attachments/01M63WPE0D552VZC77DB7VK8Y9.png`):
     Maskottchen, Name, Tabs **Details / Bibliothek / Computer**, Live-Bildschirm-Karte, Schlafzustand **„Der Computer schläft“**,
     Unterschrift **„Bildschirm von <Bot>“**.
- Risiken: Auto-Installation lädt fremde Software (Installer aus dem Netz) → nur nach einmaliger Zustimmung im Onboarding;
  gVisor/VM braucht WSL2/Hyper-V/Docker auf Windows → Vorprüfung; RAM pro Maschine → Schlafmodus, Bildschirm nur bei offenem
  Tab und gedrosselt (2–5 fps, PLAN.md); Docker von OpenBot-v2 **nie** anfassen (eigene Cua-Runtime/Namen).
- Pakete: A19 Backend, A26 Einstellungen + Onboarding, A27 Computer-Tab.

## Bot-Avatar im Grok-Bot-Stil (neu, 29.10.)

- Wunsch: Jeder neue Bot bekommt **automatisch** ein Maskottchen (Blob mit zwei Augen), anpassbar im Dialog
  „Neuen Bot erstellen“: große Vorschau, Namensfeld, Raster mit ~14 Formen (rund, Wolke, Raute, Stern, Blume, Dreieck,
  Sechseck, Kürbis …), Farbreihe (Weiß, Braun, Rot, **Orange = Standard**, Bernstein, Grün, Türkis, Blau, Lila, Pink, Grau),
  Knöpfe Abbrechen / Erstellen. Referenz-Screenshot im Bot-Store (`…/attachments/01M63WMXV0PR8RWJXFD72VA63A.png`).
- Quelle: `github.com/masermediagroup-stack/Grokbot-animations` (geklont nach `/workspace/Grokbot-animations`, nur gelesen):
  - **Lizenz MIT, © 2026 Jérémy Perret**; `package.json` verweist auf das Original `github.com/jeremy-prt/bloub` → das
    masermediagroup-Repo ist eine Kopie (1 Commit, Autor Jeremy Perret, 17.08.2026). MIT-Hinweis muss mitgeliefert werden.
  - README: *„Not affiliated with, endorsed by or connected to x.ai … The MIT licence covers the code in this repository, not
    the design it imitates.“* → Der **Code** ist frei nutzbar, das **x.ai-Grok-Design** ist nicht mitlizenziert (Marken-/Design-
    risiko bei öffentlicher/kommerzieller Nutzung → Frage an Stefan).
  - Technik: Vue 3 + Vite + TS; Kern `src/bot/` ist **framework-frei** (reines TS, `engine.sample(t)` als reine Funktion von
    der Zeit) → in React portierbar ohne Vue. SVG: 1 gefüllte Körperform (Radialprofil, 64 Winkel, Morph per
    Interpolation) + 2 Augen als Masken-Löcher; 14 animierte Zustände (idle, thinking, wink, wide, alert, notify, exclaim,
    sleep, egg, hexagon, play, orbit, swirl, burst, comet), 16 Gesichtsausdrücke. Exporte SVG/PNG/GIF/MP4 (mediabunny).
  - Repo hat **8 Formen** (`cercle, galet, squircle, capsule, triangle, hexagone, nuage, goutte`) und **12 Farben**
    (`encre #0a0a0c, brun, rouge, orange #f08a24, ambre, vert, turquoise, bleu, violet, rose, gris, creme`). Für den
    Grok-Dialog fehlen ~6 Formen (Raute, Stern, Blume, Kürbis, Zahnrad/Blob-Varianten) → analytisch per
    `regularPolygonProfile` / `unionOfCirclesProfile` / `profileFromPolygon` ergänzen; Farbe Weiß ergänzen, Standard Orange.
- Pakete: A29 Avatar-Engine-Port + `<BotAvatar>`, A30 Dialog „Neuen Bot erstellen“ (→ direkt Chat), A31 Zufalls-Standard +
  Speicherung; Einsatz in Sidebar/Chat-Kopf über A28/A38/A39.

## Regeln für Umsetzer (verbindlich)

1. Arbeiten nur in `C:\Users\Kunc GmbH\Downloads\OpenBot-v2-Helium` (+ Live-Kopie `apps\connect-app\runtime\connect`).
2. **Vor jeder Änderung Sicherung** `<datei>.bak-helium-<datum>` (bei Kollision Uhrzeit anhängen).
3. **Original-OpenBot-v2 und dessen Docker nie anfassen** (keine Container/Images/Volumes/Compose).
4. **Niemals** `Connect.exe --stop` oder `restart-server.ps1`; **nur den Prozess auf Port 3101 neu starten**.
5. Typecheck mit der **Projekt-TypeScript 5.9.3** (lokales `node_modules`), **nicht** `npx tsc`.
6. **Stefans Helium-Profil nicht anfassen** (nicht öffnen, nicht kopieren, keine Cookies lesen).
7. **Nichts löschen**, nichts verschieben (auch keine Backups).
8. Vercel nur Preview **`connect-kunc-preview`**, **nie `--prod`**.
9. T3-Fork `…\scratch\t3code` nur lesen bzw. als Sidecar starten; nicht umbauen ohne Stefans OK. Eigenes T3-Home verwenden.
10. Keine Keys/Tokens in Dateien, Logs, Chats. Kein `git commit/push` ohne ausdrückliches OK.

---

## (d) Offene Fragen an Stefan

### Durch das Ideen-Dokument / Chat 29.10. beantwortet
- ~~Welche T3-Funktionen magst du?~~ → I1–I11 (Einstellungen, Nutzung & Limits, ein Gespräch mit 100k-Kontextwechsel, direkt
  in den Chat, Browser + Handy, Computer je Agent).
- ~~Sidecar ok?~~ → Ja, T3 = Backend, Connect = Oberfläche (impliziert durch „T3-Backend für Connect Messages“).
- ~~Alter CLI-Weg?~~ → CLI-Auswahl bleibt oben am Agenten; T3-CLI tauscht an derselben Stelle ein; alter Weg nur als Fallback.
- ~~Hermes-Extras?~~ → „alle Funktionen von T3 will ich gerne übernehmen“ → ja, aber als späte, optionale Pakete.
- ~~Was gefällt an T3 (Chat)?~~ → Token-Sparen, Kontext-Management, CLI-Integration („wunderbar“), Nutzungsansicht.
- ~~Cua lokal oder Cloud?~~ → lokal: immer eine geteilte lokale Maschine, Onboarding schlägt Installation vor.
- ~~T3-Modus behalten?~~ → Nein, „T3 hier entfernen“ (Level 5 ausblenden, nicht löschen).

### Noch offen
1. **40 Ideen:** Gibt es eine Liste der 40 Ideen, die die Agenten umsetzen sollen? (Das Dokument enthält 12 Punkte zur App
   selbst.) Bis dahin: 40 Pakete = Integrationsarbeit.
2. **Last:** Wie viele Agenten dürfen gleichzeitig arbeiten? Vorschlag Start 4–6. (RAM/CPU deines PCs bitte bestätigen.)
3. **Erste CLIs:** Codex + Claude zuerst, dann Antigravity, Cursor, Grok?
4. **Arbeitsordner:** `%LOCALAPPDATA%\ConnectAgents\workspaces\<agent>` ok, oder ein anderer Projektordner pro Agent?
5. **Vollzugriff** im eigenen Ordner ohne Rückfrage ok, Freigabe-Karten nur für alles außerhalb?
6. **100k-Kontextwechsel:** Zusammenfassung sichtbar im Chat (empfohlen) oder unsichtbar? Schwelle fix 100 000 oder pro Agent?
7. **Helium-Einbettung:** Helium als eigenes Fenster/Webview neben Connect (machbar) oder echt in die App (Chromium-Einbettung,
   großer Aufwand)? Separates Agenten-Profil, nicht dein eigenes Helium-Profil – richtig?
8. **Cua-Computer:** Standard ist jetzt geklärt (eine lokale Maschine für alle Bots, weitere in den Einstellungen). Offen: Darf ein Bot eine **eigene** Maschine bekommen, und wie viele gleichzeitig wach (RAM)?
9. **Maskottchen-Design:** Der Code ist MIT, das Grok/x.ai-Aussehen aber nicht lizenziert. Nur privat/intern nutzen, oder für
   eine öffentliche/kommerzielle Version leicht abwandeln (eigene Augenform/Proportionen)?
10. **Muse:** bleibt bei Cloud-Agenten (funktioniert) – ok?
11. **Online/Handy:** T3-Agenten in der Vercel-/Handy-Version nur sichtbar, wenn der PC an ist – ok?
12. **Fork-Version:** Hermes-Fork einfrieren (feste Version) während des Umbaus?
13. **Firmen-Token öffentlich:** Standard-Sichtbarkeit **an** (wie gewünscht „automatisch“) mit Opt-out, oder **aus** bis die Firma es einschaltet? Nur Tokens oder auch Kosten in $?
14. **Cua-Auto-Installation:** Darf Connect beim ersten Start ohne Rückfrage installieren, oder einmal im Onboarding bestätigen (empfohlen)? Welche Basis: Linux-Sandbox (klein, gVisor/WSL2) oder Windows-Sandbox?
15. **Connect vs. T3 je Funktion (I12):** Automationen, Routinen, Telefon, Manus-Mail, Skills, Brain – jeweils Connect behalten
    oder T3-Variante? (Vorschlag: Connect behalten, außer Skills/Memory → Hermes prüfen.)
