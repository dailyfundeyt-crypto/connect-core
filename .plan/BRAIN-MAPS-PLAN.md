# BRAIN-MAPS-PLAN – Connect als Multi-Agent-"AI Operating System"

Stand 16.10.2026 · Vorlage: Video „Turn Claude Code Into Your AI Operating System (4 Layers)“ (MAPS).
Großer Unterschied zum Video: **Multi-Agent**. Jede Schicht kennt Agenten und deren Rechte (agents.json), durchgesetzt im Server.

## 0. Bestand (vorher) – was kaputt/unschön war
1. `CONNECT_BRAIN_PATH` zeigt auf den ganzen Vault (`Plannung`), der Brain-Kern liegt seit der Vault-Umstellung (06.10.) in `Knowledge/Brain`.
   Folge: Server las `Plannung/agents.json` + `Plannung/log.md` (gibt es nicht) → Agent-Rechte, Aktivität und Agent-Tools (brain_*) liefen ins Leere.
2. `agents.json` → `projects[].folders` nennt alte Ordner (`Spark`, `Connect`, …); echte Orte jetzt `Knowledge/Spark`, `Community/Connect`, `Business/CNT` … (16 Lint-Funde).
   Projekt-Rechte (`Projekt:<id>`) greifen dadurch für Vault-Notizen nicht (fallen auf „Projects = alle“).
3. Brain versteckt unter Einstellungen › Brain, heller Look (#f6f5f2) passt nicht zur dunklen App; kein Weg Graph → Editor, kein Weg Editor → Graph.
4. Keine Wurzelkarte (index.md ist lang und enthält Fakten), keine Wegweiser pro Bereich, keine Lint-Prüfung (224 kaputte Links, 28 davon in Brain-Wegweisern).
5. Editor (VaultNoteEditor) zeigt YAML-Frontmatter als normale Blöcke und speichert automatisch (800 ms) – beim Bearbeiten einer Notiz mit Frontmatter wird das YAML zu Listen umgeschrieben. Keine Sicherung vor dem Schreiben in den Vault. (→ Phase 1b)
6. Keine Connect-Agenten haben `connectAgentId` in agents.json → kein Connect-Agent bekommt Brain-Tools.

## 1. Die 4 Schichten auf Connect

### M – Memory (Karte)
- `Brain/MAP.md` (≈40 Zeilen, generiert): nur Wegweiser – Kern, eine Zeile pro Bereich (Connect = Mutter, darunter Analysis, CNT, Consensus, Design, Flux, Hyper, Morgen, Nexus, Spark, Werbe Video), Agenten, Pulse.
- Bereichsdatei = **Zuhause der Fakten**: `Projects/Projekt <Name>.md` (bleibt von Hand gepflegt).
- Wegweiser (generiert): `Maps/Bereiche/<Name>.md` → echte Dokumente. MAP → Wegweiser → Dokument = max. 2 Sprünge.
- **Multi-Agent:** `Maps/<agent>.md` = gefilterte Wurzelkarte nur mit den Bereichen, die der Agent lesen darf. Agent-Tools sagen „starte mit deiner Karte“.
- Regel „Ein Fakt = ein Zuhause“ in `CONVENTIONS.md` (erledigt).
- Später: Interview-Ersteinrichtung (Phase 2).

### A – Agent (Rechte)
- `agents.json` bleibt die Quelle: Bereiche (`read`/`write`) + **neu `files`**: Regeln pro Datei/Ordner `{ path, read?, write? }` (Ordner enden auf `/`, Vault als `Vault/<..>`). Genaueste Regel gewinnt, Regel vor Bereich.
- Durchsetzung **im Server** (`policy.ts`: `fileRule`, `canRead`, `canWrite`, `assertAllowed`) bei jedem brain_list/read/search/append/write und jeder Routine. Vault bleibt für Agenten immer nur lesbar, `log.md` schreibt nur Connect.
- Setzen: Brain-Seite → Punkt anklicken → „Rechte pro Agent“ (Datei oder Ordner) → `PUT /api/brain/agents/:slug` mit `files`. Einstellungen › Brain behält Bereichs-Rechte.
- Neues Tool `brain_ask_human` → hängt an `Braucht-dich.md` an (mit Absender), kann nicht abhaken.

### P – Pulse (Routinen)
- `Brain/routines.yaml`: name, zweck, **agent** (Besitzer), aktion (`map` | `lint` | `digest`), `at: "HH:MM"` oder `every: "30m"`, machine (`pc`, später `server`), aktiv.
- Scheduler im Connect-Server (`maps.ts startPulse`): alle 5 Min, Routine läuft **nur mit Rechten ihres Agenten** (liest nur `canRead`, schreibt nur `canWrite`).
- Lauf-Log `Pulse/Laeufe.md` (Datum Zeit | Routine | Agent | Status | ms | Notiz) + Zeile in `log.md`. Fehler-Deckel: 3 Fehler in Folge → pausiert, „Fortsetzen“ im Dashboard.
- Erste Routinen (Agent `connect-pulse`, darf nur `MAP.md`, `Maps/`, `Pulse/`, `Drafts/` schreiben): brain-neuaufbau 03:00, vault-lint 03:15, morgen-digest 07:00 (Entwurf in `Drafts/`, nie versendet). Nichts sendet, nichts löscht.

### S – Screen (Dashboard) – „Zeigen, nicht speichern“
- Eigene Seite **/brain** (Menü „Brain“ im Profil-Menü links unten + Knopf in Einstellungen › Brain + „Im Brain zeigen“ im Editor).
- Mitte: Graph, MAP.md als Hexagon im Zentrum, Ring Routinen, Ring Bereiche (Connect als Mutter größer), Datei-Wolke je Bereich, äußerer Ring Agenten.
  Ansichten: **Ringe**, **Links** (Agent → Bereiche lesen/schreiben, zuletzt angefasste Dateien, Filter nach Agent), **Zeitachse** (Änderungen pro Tag, 6 Wochen). Später: Kreis, Bereiche, 3D-Orbit.
- Bereichsfilter (dimmt Rest), Suche mit Trefferliste, Klick → Detail (Bereich, Datum, Rechte pro Agent, „zuletzt angefasst von“), **Öffnen** → Editor (aus Firmen-Editor kommend: zurück in denselben Arbeitsbereich, sonst Editor-Panel auf der Brain-Seite).
- Links: Heute + nächste 14 Tage (offene Aufgaben `- [ ] … 📅 JJJJ-MM-TT` + Tagesnotizen, sonst leer mit Hinweis), Business-Puls (Änderungen pro Bereich, 7 Tage).
- Rechts: **Braucht dich** (Datei `Braucht-dich.md`, Agenten hängen an, nur Stefan hakt ab – UI-Endpoint, kein Agent-Tool), **Routinen-Board** (Status, letzter Lauf, Agent, Jetzt laufen, Fortsetzen, Lauf-Log), **Lint**.

## 2. Phase 1 – umgesetzt (16.10.)
Server (`apps/server/src/brain/`, gespiegelt nach `apps/connect-app/runtime/connect/apps/server/src/brain/`):
- `maps.ts` (neu): Bereiche auflösen (findet verschobene Ordner), MAP/Agent-Karten/Wegweiser, Lint, Agenda, Braucht dich, Pulse-Scheduler, Dashboard, Rechte-Abfrage.
- `policy.ts`: Datei-Regeln, `canWrite`, neue Bereiche `Maps` (Kern), `Pulse` (log), `Drafts` (Inbox).
- `store.ts`: `files` in agents.json lesen/speichern, `coreOf()` findet `Knowledge/Brain` unter dem Vault (behebt Punkt 0.1).
- `routes.ts`: `GET /maps`, `GET /access`, `POST /pulse/run`, `POST /pulse/resume`, `PUT /needs`; `/agents`, `/log`, `/status` lesen jetzt den Brain-Kern; Scheduler-Start.
- `tools.ts`: Tools arbeiten im Brain-Kern, neues `brain_ask_human`, Hinweis auf `Maps/<agent>.md`.
App (`apps/app/src/`): `routes/_authed/_app/brain.tsx`, `components/brain/maps/brain-maps-page.tsx`, `components/brain/maps/brain-maps-graph.tsx`, `lib/brain/maps.ts`;
Änderungen: `vault-note-editor.tsx` (Knopf „Im Brain zeigen“), `level3-site-studio.tsx`, `level-chrome-sidebar.tsx`, `app-sidebar.tsx`, `brain-settings-page.tsx`.
Brain (`Plannung/Knowledge/Brain`, nur dort geschrieben): `MAP.md`, `Maps/*.md`, `Maps/Bereiche/*.md`, `routines.yaml`, `Braucht-dich.md`, `Pulse/Laeufe.md`, `Pulse/Lint.md`, `Drafts/Morgen-Digest-2026-10-16.md`, `agents.json` (+ Agent `connect-pulse`), `CONVENTIONS.md` (+ MAPS-Abschnitt).
Sicherungen: `*.bak-helium-maps` neben jeder geänderten Datei, Runtime: `runtime/connect/apps/app/dist.bak-helium-maps-20261016`, `runtime/connect/apps/server/src/brain.bak-helium-maps-20261016`.
Werkzeuge: `.plan/brain-maps/` (Patch-Skripte, `run-once.ts`, `restart-server.ps1` = nur Server neu starten, Screenshot-Vorschau).

## 3. Phase 1b – als Nächstes (klein)
- agents.json `projects[].folders` auf neue Orte setzen (Vorschlag steht in `Pulse/Lint.md`; ändert Rechte → Stefan bestätigt über „Braucht dich“).
- `connectAgentId` für Connect-Agenten setzen (Agent-Einstellungen › Brain), sonst bekommt kein Connect-Agent Brain-Tools.
- Editor: Frontmatter als eigener Block (nicht editierbar/geschützt), Sicherung `.bak` vor erstem Schreiben in Vault-Dateien.
- Weitere Ansichten Kreis/Bereiche, 3D-Orbit; Graph-Beschriftung bei kleiner Breite.
- Routinen-Editor (nur YAML-Datei öffnen im Editor), Link-Kanten Datei↔Datei in „Links“.

## 4. Phase 2 – nur geplant
1. **Handy-Zugriff** über bestehende PC-Brücke (`pc-bridge`, Supabase): Handy schickt Chat/Sprachnachricht → PC-Brücke → Agent mit eigener Brain-Karte. Neue Bridge-Befehle: `brain.dashboard` (nur lesen: Heute, Braucht dich, Routinen), `brain.ask` (Frage an Agent), `needs.done` nur mit Stefan-Login. Keine Brain-Dateien in Supabase speichern – nur Nachrichten durchreichen („Zeigen, nicht speichern“).
2. **Agent auf immer laufendem Rechner** (Server/Mini-PC/Box): gleicher Brain-Ordner, Zwei-Wege-Sync über git (Brain ist schon ein git-Repo; Konflikte → „Braucht dich“). `routines.yaml` `machine: server` für nächtliche Läufe. Dort eingeschränkt: eigener Agent-Eintrag `server-*` mit Schreiben nur `Drafts/`, `Pulse/`, `Memory/<eigen>/`, `Inbox/`; kein Senden, kein Löschen (Policy hat dafür kein Werkzeug).
   Vorher klären: Zwei-Wege-Sync vom 06.10. (Plannung_RESTRUCTURED/Backups) – nur ein Sync-Weg, sonst überschreiben sich PC und Server.
3. **Interview-Ersteinrichtung**: Agent `connect-interview` stellt eine Frage nach der anderen (Bereiche, Ziele, Personen, Routinen), schreibt Antworten als Entwürfe in `Inbox/`, Stefan übernimmt → Fakten wandern an ihr Zuhause, MAP wird neu erzeugt.
4. Kalender (Google) als Datei-Export in den Vault → „Heute/14 Tage“ zeigt Termine; Morgen-Digest als Gmail-**Entwurf** (nie senden) nur nach Freigabe.
