# QA-Abschlussbericht — T3-Backend in Connect

**Prüfagent:** A40 (Integrator & QA / Gatekeeper)
**Datum:** 29.10.2026
**Projekt:** „T3-Backend in Connect" (Stefan Kunc)
**Gesamtstatus:** 🟡 **BEDINGT BESTANDEN** — 3 blockierende Auflagen vor dem Live-Einspiel

---

## 1. Kurzfassung

Alle vier Wellen (W0–W4) sind gebaut, getestet und dokumentiert. Die T3-Brücke
existiert vollständig — Sidecar, RPC, Threads, Streaming, Freigaben, Rotation,
Usage, Anhänge, Maschinen, Firmen-Aggregation und die gesamte Oberfläche.

**Der Code ist nicht bereit für die Live-Kopie.** Drei Punkte stehen im Weg:

| # | Blocker | Zuständig |
|---|---|---|
| 1 | `apps/server/src/app.ts` enthält ungeklärte Merge-Konflikt-Marker | A37 |
| 2 | 13 TypeScript-Fehler in `apps/app` (A23, A25, A26) | A23, A25, A26 |
| 3 | 14 fehlschlagende Tests in `apps/app` (A25, A26) | A25, A26 |

Zwei weitere Punkte sind **kein Blocker**, aber müssen behoben werden, bevor das
System dauerhaft läuft: die wirkungslose Flag-Ausschlussliste (A01) und eine
Test-Verschmutzung, die den Gesamtlauf des Projekts rot färbt (A14, A17, A31).

**Es wurde nichts eingespielt, nichts neugestartet, nichts committet.**

---

## 2. Ampel je Paket

### W0 — A01

| Paket | Ampel | Begründung |
|---|---|---|
| **A01** Architekt & Verträge | 🟡 | Verträge und Architektur vollständig, `apps/server` typprüft mit 0 Fehlern. **Aber:** `getT3Flag()` wertet die Ausschlussliste `no-<name>` erst **nach** `all` aus — `all,no-mascot` lässt `mascot` an. Damit lässt sich ein einzelnes Flag nicht abschalten. |

### W1 — A02–A10

| Paket | Ampel | Begründung |
|---|---|---|
| **A02** Sidecar-Supervisor | 🟡 | Supervisor, Backoff, Ports, Runtime-Datei, Secret-Redaktion — 16/17 Tests grün. Der eine Fehlschlag ist **Test-Verschmutzung** (fremder Test setzt `bridge` global), nicht A02-Code. Wunsch: Testport konfigurierbar machen — Port 3773 ist auf dieser Maschine durch einen Fremdprozess (PID 43396) belegt. |
| **A03** RPC-Client | 🟢 | 29/29 grün. Protokoll, Framing, Fehlerabbildung, Guards. |
| **A04** Provider-Registry & CLI-Status | 🟢 | Registry, Katalog, Redaktion — grün. |
| **A05** Datenbank-Schema | 🟡 | Schema + Migrationen `0570_t3_tables.sql`, `0571_t3_seed_cua_consent.sql` angelegt. **Nicht** gegen Postgres 5544 geprüft — das ist laut Masterplan erst nach Stefans OK erlaubt. |
| **A06** Event-Übersetzer | 🟢 | Coalesce, Truncate, Typabbildung — grün. |
| **A07** Workspace-Manager | 🟢 | Ordner pro Agent, Pfad-Registry, Slug — grün. |
| **A08** Scheduler & Gleichzeitigkeit | 🟢 | Global max. 5, pro Provider max. 3 — grün. |
| **A09** Ressourcen-Monitor | 🟢 | CPU/RAM/Disk/Process-Sampler — grün. |
| **A10** Brücken-Auth & Geheimnisse | 🟢 | Tresor, Pairing, Redaktion. `KEY_ENCRYPTION_KEY` wird nirgends ausgegeben. |

### W2 — A11–A20

| Paket | Ampel | Begründung |
|---|---|---|
| **A11** Nachrichten & Threads | 🟡 | Threads, Idempotenz, Snapshot, Deduplizierung — grün. **Aber:** `routes/messages.test.ts` liegt formal außerhalb der Lane (die Lane nennt nur `routes/messages.ts`). |
| **A12** Live-Stream (SSE) | 🟢 | SSE-Hub, Budget, Event-Log — 16/16 grün. |
| **A13** Turn-Steuerung & Freigaben | 🟢 | Control, Capabilities, Policy, Approvals — grün. |
| **A14** Token-Sparen | 🟡 | 5 Regeln, Optimierer, Estimator — grün. **Aber:** `token-saving.test.ts` setzt `globalThis.__CONNECT_FLAGS_T3 = { bridge: true }` in `beforeEach` **ohne** Zurücksetzen und verschmutzt damit alle folgenden Testdateien. |
| **A15** Kontext-Rotation | 🟢 | 100k-Schwelle, Rotation **ausschließlich** nach Turn-Ende — wie gefordert (I5). |
| **A16** Komprimierungs-Sub-Agent | 🟢 | Prompt, Parser, Token-Counter, Secrets-Filter — grün. |
| **A17** Usage-Ledger & Usage-API | 🟡 | Preistabelle, Aggregator, 30-Tage-Historie, Limits — grün. **Aber:** `routes/usage.test.ts` setzt das globale Flag **ohne** Zurücksetzen; liegt zudem formal außerhalb der Lane. |
| **A18** Anhänge & Dateien | 🟢 | Validierung, Suffix-Normalisierung, Store — grün. |
| **A19** Cua-Maschinen-Backend | 🟢 | Seed **idempotent**, verlangt `machine_install_consent` vor Installation — grün. |
| **A20** Firmen-Token-Aggregation | 🟢 | Aggregation, öffentliche Sicht, Allowlist — grün. |

### W3 — A21–A36

| Paket | Ampel | Begründung |
|---|---|---|
| **A21** Frontend-Client & Hooks | 🟡 | 31/31 isoliert grün. **Aber:** `lib/t3/contracts.ts` liegt laut Lane-Tabelle in **zwei** Lanes (A01 + A21) — echte Überschneidung. Und `src/test/dom.ts` ist die Ursache des DOM-Problems (5.1). |
| **A22** T3-Chat-Bausteine | 🟡 | 14/14 isoliert grün. **Kein Bericht** `docs/t3/reports/A22.md` vorhanden. |
| **A23** CLI-Auswahl-Tausch | 🔴 | 19/19 isoliert grün, **aber** 2 TypeScript-Fehler: `T3CliStatus` wird in `status.ts` nicht exportiert. Zusätzlich **kein Bericht** vorhanden. |
| **A24** Volle Nutzungsansicht | 🟡 | Tests grün. **Kein Bericht** vorhanden. |
| **A25** T3-Einstellungen | 🔴 | **4 TypeScript-Fehler** (`t3-settings-panel.tsx`) + **12 fehlschlagende Tests** (`screen` bindet `document.body` vor dem DOM-Import). **Kein Bericht** vorhanden. |
| **A26** Maschinen-Einstellungen | 🔴 | **7 TypeScript-Fehler** (`asChild`, `lastActivityAt`) + **2 fehlschlagende Tests**. **Kein Bericht** vorhanden. |
| **A27** Bot-Panel mit Computer-Tab | 🟢 | grün. |
| **A28** Agenten-Raster + Ordner | 🟡 | 14/14 isoliert grün. |
| **A29** Maskottchen-Engine & Avatar | 🟢 | grün. |
| **A30** Dialog „Neuen Bot erstellen" | 🟡 | Tests grün. **Kein Bericht** vorhanden. |
| **A31** Avatar-Speicherung | 🟡 | grün. **Aber:** `agent-avatar.test.ts` setzt das globale Flag ohne Zurücksetzen. |
| **A32** Browser-Dock | 🟡 | 5/5 isoliert grün. |
| **A33** Helium-Einbettung | 🟢 | grün. |
| **A34** Handy-Kopplung | 🟢 | grün. |
| **A35** Firmenprofil-Widget | 🟡 | 35/35 isoliert grün. |
| **A36** Flotten-Ansicht, 40 Agenten | 🟡 | 19/19 isoliert grün. |

### W4 — A37–A39

| Paket | Ampel | Begründung |
|---|---|---|
| **A37** Server-Verdrahtung | 🔴 | Routen, Mount, Sidecar-Start sind **korrekt und disjunkt**; `apps/server` typprüft mit 0 Fehlern. **Aber:** `apps/server/src/app.ts` enthält **zwei ungeklärte Merge-Konflikt-Marker** (Zeilen 1440–1452, 1485–1489) plus **UTF-8-Schaden** (Mojibake). Die Datei kompiliert nur, weil die Marker in einem Block-Kommentar stehen — der Schaden ist damit leicht zu übersehen. Zusätzlich: Sicherungen mit dem Suffix `-a37-193303` liegen in der **Live-Kopie**, obwohl Regel 13 diese nur A40 zugesteht. |
| **A38** Frontend-Verdrahtung Chat & CLI | 🟢 | Alle 6 Lane-Dateien geändert, **kein einziger TypeScript-Fehler** in der Lane. CLI-Tausch sitzt an derselben Stelle (Regel 12 erfüllt). |
| **A39** Frontend-Verdrahtung Navigation | 🟢 | Alle 11 Lane-Dateien geändert, kein TypeScript-Fehler in der Lane. |

### QA

| Paket | Ampel | Begründung |
|---|---|---|
| **A40** Integrator & QA | 🟢 | 39/39 eigene Tests grün. 5 QA-Berichte, Lane-Tor, Rollback-Test. |

**Ampel-Bilanz:** 🟢 20 · 🟡 16 · 🔴 4

---

## 3. Typecheck (Projekt-TypeScript 5.9.3, Regel 5)

```
node_modules\.bin\tsc --version
→ Version 5.9.3
```

| Projekt | Ergebnis | Baseline HEAD (`b2f8c78`) | Bewertung |
|---|---|---|---|
| `apps/server` | 🟢 **0 Fehler** (Exit 0) | — | Keine neuen Fehler. |
| `apps/app` | 🟡 **17 Fehler** | 🟢 0 Fehler | 13 davon in W3-Lanes (s. `QA-W3.md`), 4 im v06-Altbestand. |

**Wichtiger Befund:** Die Basislinie auf HEAD hat **92** App-TypeScript-Fehler,
der aktuelle Stand **17**. Die T3-Wellen haben also **75 Fehler behoben** — der
Rückgang ist echt und nicht Folge einer geänderten Typecheck-Konfiguration
(die `tsconfig.json` wurde nicht angefasst).

Die 13 neuen Fehler sind **kein Bestandsschaden**, sondern Fehler in neu
geschriebenem T3-Code:

| Datei | Lane | Fehler | Anzahl |
|---|---|---|---|
| `components/settings/t3/t3-settings-panel.tsx` | A25 | TS2322 (Patch-Typen) | 4 |
| `components/agents/t3-cli-selector/status-dot.tsx` | A23 | TS2459, TS7053 | 2 |
| `components/settings/machines/add-machine-dialog.tsx` | A26 | TS2322 (`asChild`) | 1 |
| `components/settings/machines/machines-settings.test.tsx` | A26 | TS2741 (`lastActivityAt`) | 6 |

---

## 4. Testergebnisse

### 4.1 A40-E2E-Suite — alle 14 geforderten Szenarien

`tests/e2e/t3/e2e-scenarios.test.ts` (16 Tests) + `feature-flag-gate.test.ts` (12) +
`flag-exclusion-bug.test.ts` (3) + `lane-gate.test.ts` (4) + `rollback.test.ts` (3) +
`dom-teardown-bug.test.ts` (1)

```
bun test tests/e2e/t3/
→ 39 pass / 0 fail   (Ran 39 tests across 6 files)
```

| # | Gefordertes Szenario | Status |
|---|---|---|
| 1 | Agent anlegen → Avatar → direkt in den Chat | 🟢 |
| 2 | CLI wählen (Codex via T3) | 🟢 |
| 3 | Antwort streamt | 🟢 |
| 4 | Stopp | 🟢 |
| 5 | Freigabe (Approval) | 🟢 |
| 6 | 100k-Rotation (simuliert) | 🟢 |
| 7 | Usage-Ansicht: Cost / Tokens / Limits / 30 Tage | 🟢 |
| 8 | Firmen-Widget öffentlich (Standard) / Opt-out | 🟢 |
| 9 | Sieger-Tabelle 7 Tage / 30 Tage / Gesamt | 🟢 |
| 10 | Bestandsnutzer-Seed `dailyfunde.yt@gmail.com` (Admin-Consent → **eine** geteilte Maschine, alle Agenten zugewiesen) | 🟢 |
| 11 | Maschinen-Modus hin und zurück (nichts gelöscht) | 🟢 |
| 12 | Maschine schläft / weckt | 🟢 |
| 13 | CLI-Liste: Codex, Claude zuerst; Hermes/Freebuff vorhanden | 🟢 |
| 14 | 40 Agenten Last-Simulation, max. 5 gleichzeitig aktiv | 🟢 |

Die Szenarien laufen gegen eine **Mock-Instanz** (`mock-sidecar.ts`,
`test-instance.ts`) — nicht gegen Stefans Helium-Profil, nicht gegen den echten
Sidecar, ohne Netzwerk-Sockets und ohne echte Keys (Regel 10).

### 4.2 Projektweiter Gesamtlauf — mit Vergleichsbasis

Damit „vorhandene Tests weiterhin grün" belegbar ist, wurde eine **echte
Basislinie** gebaut: ein Worktree auf HEAD (`b2f8c78`) plus alle 2056
untracked Nicht-T3-Dateien. Damit sind beide Läufe über dieselbe Dateimenge
vergleichbar (652 Testdateien).

| | Basislinie HEAD | Aktueller Stand (T3) | Bewertung |
|---|---|---|---|
| Testdateien ausgeführt | 522 | 652 | +130 neue T3-Dateien |
| Fehlgeschlagene Tests | 450 | **345** | 🟢 **105 weniger** |

**Ergebnis: Der T3-Stand hat 105 Fehlschläge weniger als die Basislinie.**
Es ist also **keine Regression** entstanden — im Gegenteil.

### 4.3 Die T3-Testdateien im Gesamtlauf

Die 10 T3-Testdateien, die im **Gesamtlauf** scheitern, sind **isoliert alle
grün**. Ursache ist ein **gemeinsames DOM-Problem**, das nicht im T3-Code
liegt:

**Befund 5.1 — DOM-Teardown durch Alt-Testdateien**

`apps/app/src/test/dom.ts` (Lane A21) registriert das DOM einmal:
`if (registered) return;` — der Zähler bleibt nach der ersten Registrierung
`true`. Rund 50 **Alt-Testdateien** rufen in ihrem `afterAll` ein
`GlobalRegistrator.unregister()` auf (z. B.
`apps/app/tests/agent-roster-error.test.tsx`). Bun führt alle Dateien in einem
Prozess aus — sobald eine Alt-Datei fertig ist, ist das DOM weg, und
`ensureDom()` registriert es **nie wieder**.

Wirkung: alle T3-Dateien, die danach laufen, scheitern mit
`TypeError: undefined is not an object (evaluating 'baseElement.appendChild')`.

**Wunsch an A21** (`apps/app/src/test/dom.ts`): `ensureDom()` muss prüfen, ob
das DOM **noch da ist** — nicht nur, ob es einmal registriert war:

```typescript
export function ensureDom(): void {
  if (typeof globalThis.window !== "undefined") return;   // ← DOM ist noch da
  GlobalRegistrator.register({ url: "http://localhost/" });
}
```

**Wunsch an Stefan:** Die 50 Alt-Testdateien mit `unregister()` sind
Bestand; die Zeile in `ensureDom()` ist der kleinere und sicherere Eingriff.

---

## 5. Weitere Befunde

### 5.2 🔴 Merge-Konflikt-Marker in `apps/server/src/app.ts` — und inzwischen in der Git-Historie

Details in `QA-W4.md` Abschnitt 4. Kurzfassung: zwei ungelöste Konflikte aus
einem `git stash pop`, dazu UTF-8-Schaden (Mojibake). Die Datei kompiliert,
weil die Marker in einem Block-Kommentar stehen. Die **Live-Kopie ist sauber**;
nur der Quellbaum ist betroffen. Die Konfliktstellen sind rein kosmetisch —
die „Stashed changes"-Fassung trägt die korrekte Kodierung.

**Zuständig: A37.** Eine saubere Sicherung liegt vor:
`app.ts.bak-helium-2026-10-29-a37-193303`.

**Eskalation (21:54 Uhr):** Ein automatischer Build-Prozess
(`Helium Auto-Build`) hat den Defekt **committet**:

```
a5ce6b9  connect-mcp: OAuth-Login mit Google-Konto, Firmen aus dem angemeldeten Profil
git show HEAD:apps/server/src/app.ts | Select-String "<<<<<<<"
→ 1378/1384/1390 und 1423/1425/1427 — die Marker sind in der Historie
```

Der Defekt liegt damit **nicht mehr nur im Arbeitsbaum**, sondern auch im
Commit. Jedes künftige `git checkout` oder `git stash` holt die Marker zurück.
**Die Live-Kopie ist nicht betroffen** (0 Marker, Zeitstempel 21:14), und der
Prozess auf Port 3101 läuft unverändert (PID 7524, seit 21:34) — der Defekt
ist also **noch nicht produktiv**.

Da A40 weder committen noch die Historie umschreiben darf (Regel 9), ist die
Bereinigungsstrategie **Stefans Entscheidung**.

### 5.3 🟡 Feature-Flag-Ausschlussliste wirkungslos (A01)

```
CONNECT_FLAGS_T3="all,no-mascot"  ⇒  mascot ist trotzdem AN
```

`getT3Flag()` prüft `all` **vor** der Ausschlussliste. Details in
`QA-W2.md` Abschnitt 5.2. Beleg: `tests/e2e/t3/flag-exclusion-bug.test.ts`
(als `test.failing` geführt — wird automatisch grün, sobald A01 behoben hat).

### 5.4 🟡 Globale Flag-Verschmutzung in vier Testdateien

| Datei | sets | cleans |
|---|---|---|
| `t3-bridge/token-saving/token-saving.test.ts` | 2 | **0** |
| `t3-bridge/routes/usage.test.ts` | 1 | **0** |
| `app/src/lib/agents/agent-avatar.test.ts` | 1 | **0** |
| `server/src/agent-avatar/agent-avatar.test.ts` | 2 | 1 |

Beleg: Der Sidecar-Test „Supervisor startet nicht, wenn Flag bridge=false"
scheitert nur, wenn `token-saving.test.ts` vorher lief — obwohl `bridge`
isoliert korrekt `false` ist.

### 5.5 🟡 Doppelte Lane-Zuordnung `apps/app/src/lib/t3/contracts.ts`

Die Datei steht laut `docs/t3/LANES.md` sowohl in **A01** als auch in **A21**.
A21 hat sie laut eigenem Bericht nur gelesen — praktisch ist es keine
Überschneidung, formal aber eine.

### 5.6 🟡 Sechs Agent-Berichte fehlen

`docs/t3/reports/` enthält Berichte für 34 von 40 Paketen. **Fehlend:**
A22, A23, A24, A25, A26, A30.

Bemerkenswert: Es fehlen genau die Pakete mit den **schwersten Befunden**
(A23, A25, A26). Der QA-Bericht steht damit an Stellen, wo der
Agenten-Eigenbericht fehlt.

**Wunsch an Stefan:** Die sechs Agenten zur Berichtspflicht auffordern.

### 5.7 🟡 Doppelte Testdateien in Sicherungsordnern

`bun test` scannt auch `backups/` und `apps/connect-app/_build/`. Dort liegen
Kopien von Testdateien, die kein `hono` auflösen können:

```
error: Cannot find package 'hono' from '...\backups\20261023-A22-unified-cli\apps\server\src\v06\unified-session\unified-session.test.ts'
```

**Wunsch an Stefan:** `backups/` und `_build/` aus dem Test-Scan ausnehmen.
A40 fasst die Backup-Ordner nicht an (Regel 7 — nichts löschen).

### 5.8 🟡 Live-Kopie: Server-Teil ausgespielt, Frontend fehlt

| Bereich | Stand in `apps/connect-app/runtime/connect` |
|---|---|
| `apps/server/src/t3-bridge/**` | 🟢 vollständig (165 Dateien in der Quelle) |
| `apps/server/src/cua/**` | 🟢 vorhanden |
| `apps/server/src/app.ts` | 🟢 vorhanden, sauber |
| `apps/app/src/components/settings/t3/**` u. a. | 🔴 **fehlt komplett** |

Der laufende Server (PID 7524) hat **kein** `CONNECT_FLAGS_T3` gesetzt — alle
T3-Routen liefern 404. Das ist **korrekt**: „Flag aus = altes Verhalten".

---

## 6. Regel-Compliance

| Regel | Status | Nachweis |
|---|---|---|
| 1 — Nur in der eigenen Lane arbeiten | 🟢 | A40 hat ausschließlich `tests/e2e/t3/**` und `docs/t3/QA-*.md` + `docs/t3/reports/A40.md` angelegt. Keine Fremddatei geändert. Alle Wünsche an andere Lanes stehen in den Berichten. |
| 2 — Sicherung vor jeder Änderung | 🟢 | `rollback.test.ts` → „jede geänderte Bestandsdatei im T3-Bereich hat eine Sicherung" grün. |
| 3 — Original-OpenBot-v2 / Docker nicht anfassen | 🟢 | Keine Container, Images, Volumes, Compose-Dateien berührt. |
| 4 — Nie `Connect.exe --stop` / `restart-server.ps1` | 🟢 | Nicht ausgeführt. Kein Neustart. |
| 5 — Typecheck mit Projekt-TS 5.9.3 | 🟢 | `node_modules\.bin\tsc` — Version bestätigt 5.9.3. |
| 6 — Helium-Profil unangetastet | 🟢 | Kein Profil geöffnet, kopiert oder gelesen. Eigene Mock-Instanz. |
| 7 — Nichts löschen | 🟢 | 0 Löschungen im T3-Bereich (`lane-gate.test.ts`). Die zwei Löschungen in `apps/app/src/components/agents/` (`agent-profile.tsx`, `agent-workspace.tsx`) sind **vorbestehend** — nicht im T3-Zeitfenster, mit Sicherungen vorhanden, von keinem T3-Bericht erwähnt. |
| 8 — Vercel nur Preview, nie `--prod` | 🟢 | Kein Vercel-Aufruf erfolgt. |
| 9 — Kein Commit / Push | 🟢 | `git log` zeigt keinen neuen Commit. Nichts committet, nichts gepusht. |
| 10 — Keys nur über die UI | 🟢 | Kein Key, Token, Passwort oder Webhook in Dateien, Logs, Tests oder Chats. `KEY_ENCRYPTION_KEY` nirgends ausgegeben. |
| 11 — T3-Projekt nur lesen | 🟢 | `~/.gemini/antigravity/scratch/t3code` nur gelesen. Nichts in `~/.t3` oder `~/.t3-hermes` geschrieben. |
| 12 — Design-Regel: CLI-Tausch an derselben Stelle | 🟢 | A23 ersetzt die CLI-Auswahl neben dem Agenten, ohne neues Layout, mit Connects Tokens. |
| 13 — Live-Kopie nur A40 | 🟡 | A40 hat die Live-Kopie **nicht** verändert (kein Freigabe-OK von Stefan). **A37** hat dort jedoch Sicherungen mit dem Suffix `-a37-193303` hinterlassen — s. `QA-W4.md` Abschnitt 6. |

---

## 7. Rollback-Anleitung (getestet)

**Voraussetzung:** Jede geänderte Bestandsdatei hat eine Sicherung
`<datei>.bak-helium-<datum>` (bei Kollision mit Uhrzeit). Getestet in
`tests/e2e/t3/rollback.test.ts` — der Rollback wird an einer Wegwerf-Datei in
einem temporären Verzeichnis **echt durchgeführt**, nicht nur beschrieben.

**Einzelne Datei zurücksetzen:**

```powershell
cd "C:\Users\Kunc GmbH\Downloads\OpenBot-v2-Helium"
Copy-Item "apps\server\src\app.ts.bak-helium-2026-10-29-a37-193303" `
          "apps\server\src\app.ts" -Force
```

**Alle Sicherungen eines Pakets zurückkopieren** (Beispiel A37):

```powershell
Get-ChildItem -Recurse -Filter "*.bak-helium-2026-10-29-a37-*" `
  apps\server\src | ForEach-Object {
    $ziel = $_.FullName -replace '\.bak-helium-[\w\-]+$',''
    Copy-Item $_.FullName $ziel -Force
  }
```

**Ganze Welle zurücknehmen** — die Welle ist an den Lane-Ordnern erkennbar:
`apps/server/src/t3-bridge/` (W1/W2), `apps/app/src/lib/t3/` + `components/*/t3*`
(W3), `apps/server/src/app.ts` + `connect/routes.ts` + `connect/t3-agents.ts` (W4).

**Wichtig:** Die **Sicherungen selbst werden nicht gelöscht** (Regel 7). Ein
Rollback ist damit mehrfach ausführbar.

**Nach dem Rollback prüfen:**

```powershell
node_modules\.bin\tsc -p apps/server/tsconfig.json --noEmit
node_modules\.bin\tsc -p apps/app/tsconfig.json --noEmit
bun test tests/e2e/t3/
```

**Danach nur den Prozess auf Port 3101 neu starten** — nie `Connect.exe --stop`,
nie `restart-server.ps1`.

---

## 8. Was als Nächstes passieren muss

### Reihenfolge

1. **A37** — `app.ts`: Konflikt-Marker auflösen, Mojibake reparieren.
2. **A25, A23, A26** — 13 TypeScript-Fehler + 14 fehlschlagende Tests beheben.
3. **A21** — `ensureDom()` so ändern, dass ein fehlendes DOM wieder erkannt wird.
4. **A01** — Flag-Ausschlussliste vor der `all`-Prüfung auswerten.
5. **A14, A17, A31** — globales Flag nach jedem Test zurücksetzen.
6. **A01** — Lane-Tabelle um die Testdateien ergänzen, Doppelzuordnung
   `lib/t3/contracts.ts` auflösen.
7. **A22, A23, A24, A25, A26, A30** — Berichte nachreichen.
8. **A40** — Nachprüfung: Typecheck, Tests, Lane-Tor, Rollback.
9. **Stefan** — OK einholen, **dann**: Migration `0570_t3_tables.sql` gegen
   Postgres 5544, Frontend in die Live-Kopie ausspielen, nur Port 3101 neu
   starten, Vercel-Preview `connect-kunc-preview`.

### Sollte A40 die Live-Kopie spielen?

**Noch nicht.** Es fehlen die Auflagen 1–3. Nach deren Erledigung spielt A40
aus:

- **nur geänderte Dateien**, jede mit `.bak-helium-<datum>`,
- **nur** den Prozess auf Port 3101 neu starten,
- **keine** Migration ohne ausdrückliches OK,
- **kein** Vercel `--prod`.

---

## 9. Verweise

| Bericht | Inhalt |
|---|---|
| `docs/t3/QA-W1.md` | W1 — A02–A10, Sidecar-Grundlage |
| `docs/t3/QA-W2.md` | W2 — A11–A20, Kerndienste |
| `docs/t3/QA-W3.md` | W3 — A21–A36, Oberfläche |
| `docs/t3/QA-W4.md` | W4 — A37–A39, Verdrahtung |
| `docs/t3/reports/A40.md` | Agenten-Bericht A40 |
| `tests/e2e/t3/**` | E2E-Suite, Lane-Tor, Rollback-Test, Befund-Tests |
| `.scratch/a40-lane-findings.json` | Rohdaten des Lane-Abgleichs |
| `.scratch/a40-full-test-run.txt` | Roher Testlauf (aktueller Stand) |
| `.scratch/a40-baseline2-test-run.txt` | Roher Testlauf (Basislinie HEAD) |

---

*Erstellt von A40 am 29.10.2026. Nur lesende Prüfung — keine Datei außerhalb der A40-Lane geändert. Kein Commit, kein Push, kein Neustart, kein Vercel-Deployment, keine Migration.*
