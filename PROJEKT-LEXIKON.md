<!--
  Projekt-Lexikon — Connect-Kopie
  Diese Datei ist eine Kopie von:
  - Spark-Repo:  C:\workspace\cntconnect\PROJEKT-LEXIKON.md
  - Vault-Bridge: C:\Users\Kunc GmbH\Documents\000_CNT\Plannung\Brain\Shared\Projekt-Lexikon.md

  Stand: 5. Oktober 2026. Alle Angaben sind gegen Dateien im Vault und im Code geprüft.
-->

# Projekt-Lexikon

**Zweck:** Es gibt 11 Projekte mit ähnlich klingenden Namen und drei Orte im Code, die alle nach
"Connect" heißen. Ohne diese Datei muss eine KI raten. Diese Datei macht das Raten überflüssig.

**Stand:** 5. Oktober 2026. Alle Angaben sind gegen Dateien im Vault und im Code geprüft.
Belege stehen jeweils in der letzten Spalte. Wo etwas nur aus einer Notiz stammt und nicht
geprüft werden konnte, steht das ausdrücklich dabei.

---

## Teil 0 — Die Namenfalle (zuerst lesen)

Drei Dinge sehen gleich aus und sind es nicht:

| Du liest | Das ist **nicht** | Das ist |
|---|---|---|
| `C:\workspace\cntconnect` | weder CNT noch Connect | **Spark** |
| `C:\Users\Kunc GmbH\Downloads\OpenBot-v2-Helium` | Spark | **Connect** |
| `...Downloads\OpenBot-v2` (ohne Helium) | die Arbeitskopie | das **Original — nie ändern** |

> **⚠️ Der Ordnername `cntconnect` ist der häufigste Irrtum.**
> Er enthält „cnt" **und** „connect", ist aber **Spark**. Wer `C:\workspace\cntconnect` öffnet und
> dort Connect erwartet, arbeitet im falschen Projekt. `cntconnect` ist der alte Name des Repos,
> nicht der Projektname.

Zweitgrößter Irrtum: **`level=3` ist nicht Spark und nicht "Level 3 von Connect".**
Laut Code ist Level 3 der **Browser-Modus** innerhalb von Connect (siehe Teil 2).

---

## Teil 1 — Lexikon aller Projekte

Jede Zeile beantwortet: Was ist es, wo liegen die Notizen, gibt es Code, und worin unterscheidet
es sich vom*nächstliegenden Nachbarn*? Alle Projekte außer Connect sind **Unterfirmen von Connect**
(`agents.json`, Feld `parent`).

| Kanonischer Name | Was es ist | Vault-Ordner | Codepfad | Unterscheidendes Merkmal |
|---|---|---|---|---|
| **Connect** | Agent-Plattform: Web-Oberfläche, um Agenten und CLIs zu steuern. Mutterfirma aller anderen. Fork von OpenBot v2. | `Connect/` | `C:\Users\Kunc GmbH\Downloads\OpenBot-v2-Helium` | **Das einzige Projekt mit einem laufenden Produkt** (Web-UI + Server + Worker + Windows-Programm). Alles andere ist eine Idee im Vault. |
| **Spark** | Persönliche Entwicklung: Tagesplan, Ernährung, Sport, Self-Improvement, Sprechen/Schreiben, Stenograf-Skill. | `Spark/` | `C:\workspace\cntconnect` (TANStack/Lovable) | **Persönlich, nicht kommerziell.** Auch der einzige Ordner, der nach *fremd* benannt ist. Enthält `.bak`-Stände, die in Connect nicht erscheinen. |
| **CNT** | Firma mit Geschäftsführung: Stefan Kunc als CEO, Mitarbeiter Marshall Rise und Prinz. | `CNT/` | kein Code | **Hat Mitarbeiter und Bilder, aber keinen Code.** Eine Firma, keine Software. |
| **Analysis** | Videos und Kanäle analysieren: Transkripte holen, Skripte daraus schreiben, Material zu Kanälen sammeln. | `Analyis/` (Schreibweise so lassen) | kein eigener Codepfad | **Analysiert fremde Videos.** Nicht mit Spark verwechseln, obwohl beide "Inhalt" haben — Analysis macht Skripte, Spark plant den eigenen Tag. |
| **Consensus** | Noch ohne Inhalt: Idee, Software und System sind **alle leer**. | `Consensus/` | kein Code | **Das einzige Projekt mit komplett leerem Inhalt.** Sucht laut Flux-Bild noch seine Aufgabe. |
| **Design** | Design und Websites. | `Design/` (leer) | kein Code | **Fast leer:** nur die Notiz `Website Desing` im Vault-Root, Ordner `Design/` ist unbesetzt. |
| **Flux** | Online-Stores: vier private Shops (Duolingo, Trading-Algorithmen, ChatGPT, Figma), ca. 1 Artikel pro Woche und Account. | `Flux/` | **Namensfalle: kein eigener.** Siehe unten. | **Verkauft Artikel online.** Nicht mit Consensus verwechseln (arbeitet laut Bild mit Consensus zusammen, ist aber der Handels-Teil). |
| **Hyper** | Trading: CNT Token, Trading-Bots (Freqtrade, OctoBot, Tokenbot), Prompts für Strategien, Kurs "Hyper Bot in 7 Days". | `Hyper/` | kein eigener Codepfad | **Das einzige Kryptohandels-Projekt.** Enthält Token/NFT-Themen und rechtliche Fragen. |
| **Morgen** | Landing Page nach Vorbild `luo.app`. | `Morgen/` | kein Code | **Eine einzige Landing Page.** Das kleinste Projekt. |
| **Nexus** | Website nach Vorbild `gagetry.com` plus ein deutscher Kanal nach Vorbild "cartworthyfinds". | `Nexus/` | kein Code | **Website + deutschsprachiger Kanal** als Paar. |
| **Werbe Video** | Werbevideos: Prompt-Sammlungen (Showreel, Brand Reel, Style Guide, UI-Morph) und Design-Tools. | `Werbe  Video/` (zwei Leerzeichen) | kein Code | **Der einzige Ordner mit zwei Leerzeichen im Namen.** Nur Prompts, keine laufende Produktion. |

### Fallstricke beim Nachschlagen

- **Flux hat Code — aber nicht seinen eigenen.** Im Connect-Monorepo liegt `apps/code-flow-flux`.
  Das ist **FluxCode** (README: „AI app builder — chat, live preview, 12 build modes, MCP, Fleet
  Control"), eine **Lovable-App, die dort als Gast abgelegt ist**. Sie ist *nicht* das im Vault
  beschriebene Projekt Flux (Online-Stores). Wer Code zu Flux sucht, findet diese App und
  schließt daraus falsch, Flux sei ein App-Baukasten.
- **Spark ist ein Lovable-Projekt.** Die README nennt `cntconnect.lovable.app` und ein Projekt
  `af59bc26-…` im Lovable-Editor. Der Name `cntconnect` stammt aus dieser Lovable-Vorlage,
  nicht daraus, dass Spark etwas mit CNT oder Connect zu tun hätte.
- **Kein `rg` auf diesem Rechner** (PowerShell 5.1). `Select-String` oder `git grep` benutzen.

---

## Teil 2 — Connect im Detail

Damit eine KI Connect versteht, statt es zu raten.

### Was Connect ist

Eine **Web-Oberfläche, um Agenten und CLIs zu steuern** — mehreres ist es nicht. Der Nutzer öffnet
Connect im Browser, ruft darin Agenten auf und steuert die Kommandozeilen-Werkzeuge dieser Agenten.
Stefan nennt es in `Connect Idee.md`: „Die Idee ist es Agenten aus der Web Oberfläche zu steuern."

- **Fork von OpenBot v2**, umbenannt in Connect. Das Original `Downloads\OpenBot-v2` bleibt
  unangetastet; gearbeitet wird in der Kopie `OpenBot-v2-Helium`.
- **Monorepo mit Bun** (nicht npm, nicht pnpm).
- Start: `apps\connect-app\Connect.exe`, Helium-Start über
  `apps\helium-shell\setup\Start-Connect.cmd`. Connect Notch (`apps\connect-notch`) läuft mit Autostart.

### Die vier Level

Aus `apps\app\src\lib\companies\level.ts` (Connect-Repo, Arbeitskopie). Das sind **Modi der
Connect-Oberfläche**, keine Hierarchie-Stufen von Firmen und keine Spark-Level:

| Level | Name | Bedeutung |
|---|---|---|
| 1 | **Focus** | Schnelle Aufgaben, ein Agent-Fenster; mit ← → wechseln |
| 2 | **Messages** | Kanäle und AIs — „wie Slack für eure Company"; ist der Standard |
| 3 | **Browser** | Chromium + App-Ordner; **Agenten bauen hier, das ist der Ort fürs Programmieren** |
| 4 | **Unternehmen** | Statische Firmen-Seite an einer festen URL, ohne Tabs |

Level 3 ist laut Code der ausdrücklich als Bauort markierte Modus. Wer eine URL mit
`level=3` öffnet, landet im Browser-Modus — **nicht** in Spark, obwohl Spark ein Browser-Frontend ist.

### Steuerbare CLIs und Browser

Aus `Connect/Connect Idee.md` ( Stefans eigene Liste, mit Links):

| Werkzeug | Zweck |
|---|---|
| Claude Code | Agent |
| Codex | Agent; mehrere Instanzen, per Sprache in Connect öffnen |
| Lovable (`lovagentic`) | App-Baukasten |
| Grok Bot (`grok-bot-cli`) | Agent |
| Manus | Agent |
| PI Code (`pi.dev`) | Agent |
| Helium (`imputnet/helium`) | Browser, in dem Agenten Web-Apps bauen |

Die Integrations-Vorbilder stammen aus `obsidian-copilot` (wie eine CLI angebunden wird).

### Aufbau des Monorepos

**Kern-Anwendungen (7 Stück):**
```
apps/app              Web-UI (TanStack), auch die Level-Verwaltung
apps/server           Server
apps/worker           Hintergrund-Jobs
apps/connect-app      Windows-Programm (Connect.exe)
apps/helium-shell     Sidebar-Extension für den Helium-Browser
apps/connect-notch    Notch-Leiste am oberen Bildschirmrand
apps/code-flow-flux   FluxCode — Lovable-App „AI app builder", hier als Gast
```

**Weitere Anwendungen (6 Stück) — keine Connect-Features:**
`apps/desktop`, `apps/landing`, `apps/seo-agent`, `apps/seo-jev-local`,
`apps/supervisor`, `apps/examples`

**Agent-Pakete:**
```
packages/agents/*     agent-claude-sdk, agent-langgraph, agent-agno, agent-mastra,
                      agent-crewai, agent-langroid, agent-llamaindex,
                      agent-pydantic-ai, agent-strands, agent-microsoft,
                      agent-adk, agent-ag2, agent-bot, agent-computer
packages/shared       Gemeinsamer Code
```

**Zusammen: 13 Apps** (`apps/`-Verzeichnisse, unverändert aus dem Repo gezählt).

### Die vier Regeln für Agenten

1. **Nur in `OpenBot-v2-Helium` arbeiten.** Das Original `Downloads\OpenBot-v2` nie ändern.
2. **Backups heißen `*.bak-helium`** (`.env.bak-helium`, `.env.bak-helium-seo`,
   `connect-app.json.bak-helium-3101-…`). Diese Dateien nicht aufräumen — sie sind der
   Rückweg zum vorherigen Stand.
3. **Vault-Notizen sind für Agents nur lesbar.** Agents schreiben nie in den Vault, außer an
   die eigene Tagesnotiz in `Memory/<agent>/` und an `log.md`.
4. **Zugriff über `agents.json`.** Welche Projekte ein Agent liest, steht dort als
   `Projekt:<id>` (z. B. `Projekt:flux`, `Projekt:spark`). `Projects` bedeutet "alle Projekte".
   Vault-Notizen heißen für Agents `Vault/<Ordner>/<Notiz>.md`. Diese Rechte pflegt Stefan
   in Connect unter **Einstellungen › Brain**.

### Der Brain im Graphen

Connect zeigt den gesamten Vault unter **Einstellungen › Brain** als Graph und als Leseansicht.
Dort liegen auch die Rechte pro Agent und die Aktivität aus `log.md`. Der Vault selbst ist der
Ordner `Plannung` (eine Ebene über `Brain/`).

---

## Teil 3 — Regeln für KI und Agenten

1. **Bei Zweifeln nachfragen, nicht raten.** „Connect", „CNT", „cntconnect" und „Spark" sind
   vier verschiedene Dinge. Wenn unklar ist, welches gemeint ist: fragen.
2. **Pfade verifizieren, nicht annehmen.** Bevor du in einem Verzeichnis arbeitest, prüfe, was
   dort liegt (`git remote -v`, `README.md`, `package.json`). Der Ordnername sagt nichts.
3. **Nie `Spark` mit `Connect` oder `cntconnect` gleichsetzen.** Sie haben getrennte Repos,
   getrennte Ports und verschiedene Zwecke.
4. **Projekte erfinden.** Wenn zu einem Projekt nur leere Notizen vorliegen (Consensus, Design
   teilweise), schreibe das so hin. Erfinde keinen Inhalt, um die Lücke zu füllen.
5. **Belege trennen.** Diese Datei mischt Geprüftes (Code, `agents.json`) und Berichtetes
   (Stefans Notizen). Die Herkunft jeder Angabe steht dabei. Was nicht geprüft werden konnte,
   ist als solches gekennzeichnet — Connect wurde **nicht getestet**, die Level-Bedeutung ist
   **aus dem Code gelesen, nicht ausgeführt**.

### Geprüfte Ports und Dienste

| Dienst | Port | Beleg |
|---|---|---|
| Connect App (Server + UI) | **3101**, nur `127.0.0.1`, Postgres 5544 | `Maschinen und Pfade.md`; am 5.10.2026 als einziger dieser Ports tatsächlich belegt |
| Connect Helium | Server 3001, Web 3010, Postgres in Docker | `Maschinen und Pfade.md` |
| Spark (Entwicklung) | **nicht belegt** | Siehe Warnung unten |

> **⚠️ Port 8080 für Spark:** 8080 ist **Vites Standard-Dev-Port** — er muss nirgends
> konfiguriert werden und erscheint deshalb in keiner Datei des Repos. Empirisch wurde 8080
> am 5. Oktober 2026 um 00:43 Uhr als von Spark belegt gemessen (Prozess: `vite dev`).
> Belegt ist er aber nur, solange der Dev-Server läuft; am Abend des 5.10. war er frei.
> **Nicht zuverlässig vorhersagbar** — zur Sicherheit zur Laufzeit prüfen.

---

## Was in dieser Datei bewusst fehlt

- **Kein Commit-Stand zu GitHub.** Eine frühere Notiz nannte eine Zahl von nicht hochgeladenen
  Commits. Diese Zahl wurde nicht neu geprüft und steht deshalb hier nicht. `git fetch` und
  `git status` selbst ausführen.
- **Keine Funktionsbeschreibung aus den leeren Notizen.** `Connect Software.md` und
  `Connect System.md` sind leer, ebenso `CNT Software`, `CNT System`, `Consensus Software`,
  `Nexus Software` und weitere. Wo der Vault leer ist, steht hier nichts. Das ist kein Fehler
  dieser Datei, sondern der Zustand des Vaults.
- **Keine Code-Änderung.** Diese Datei dokumentiert nur.
