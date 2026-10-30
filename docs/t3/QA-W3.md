# QA-Bericht W3 — T3-Oberfläche (A21–A36)

**Prüfagent:** A40 (Integrator & QA / Gatekeeper)
**Datum:** 29.10.2026
**Wellen-Gate:** W3 (A21–A36, 16 Agenten parallel)
**Status:** 🔴 **BEDINGT BESTANDEN** — Freigabe nur mit Auflagen; ein Typfehler-Block muss vor W4 aufgelöst werden

---

## 1. Ergebnis in einem Satz

Die komplette T3-Oberfläche (Client, Chat-Bausteine, CLI-Tausch, Nutzungsansicht,
Einstellungen, Maschinen, Bot-Panel, Agenten-Raster, Avatare, Browser-Dock,
Handy-Kopplung, Firmen-Widget, Flotte) ist **vorhanden und je Modul getestet**;
W3 wird freigegeben, **aber** `apps/app` hat 17 TypeScript-Fehler, davon 13 in
W3-Lanes — die müssen vor W4 aufgelöst werden.

---

## 2. Geprüfte Akzeptanzkriterien

| Kriterium | Ergebnis | Nachweis |
|---|---|---|
| Lane-Verletzungen | 🟢 keine in W3 | `.scratch/a40-lane-findings.json` |
| Sicherungen vorhanden | 🟢 vollständig | `tests/e2e/t3/rollback.test.ts` |
| Nichts gelöscht (Regel 7) | 🟢 0 Löschungen | `lane-gate.test.ts` |
| Typecheck `apps/app` (TS 5.9.3) | 🔴 **17 Fehler** (13 in W3-Lanes) | s. 3 |
| Typecheck `apps/server` (TS 5.9.3) | 🟢 0 Fehler | Exit 0 |
| Regression Bestandsfunktionen | 🟢 grün | s. 5 |
| Design-Regel (Regel 12) | 🟢 geprüft | s. 6 |

---

## 3. Typecheck `apps/app` — die Fehler im Detail

Kommando (Regel 5, Projekt-TypeScript 5.9.3):

```
node_modules\.bin\tsc -p apps/app/tsconfig.json --noEmit
```

**17 Fehler**, gruppiert:

### 3.1 🔴 W3-Lanes — müssen vor W4 weg (13 Fehler)

| Datei | Lane | Fehler | Anzahl |
|---|---|---|---|
| `components/settings/t3/t3-settings-panel.tsx` | **A25** | TS2322 — `Partial<T3…Settings>` nicht zu `T3…Settings` zuweisbar (z. B. `autoStart: boolean \| undefined` → `boolean`) | 4 |
| `components/agents/t3-cli-selector/status-dot.tsx` | **A23** | TS2459 — `T3CliStatus` in `./status` nicht exportiert; TS7053 — Index-Signatur passt nicht | 2 |
| `components/settings/machines/add-machine-dialog.tsx` | **A26** | TS2322 — `asChild` existiert auf `Props<unknown>` nicht | 1 |
| `components/settings/machines/machines-settings.test.tsx` | **A26** | TS2741 — Pflichtfeld `lastActivityAt` fehlt in 6 Test-Fixtures | 6 |
| **Summe** | | | **13** |

**Wunsch an A25:** Die Patch-Handler der Sektionen auf `Partial<T3…Settings>`
umstellen (statt `T3…Settings` zu erwarten) oder die Typen in `lib/t3/contracts.ts`
(A01) entsprechend schärfen.

**Wunsch an A23:** `T3CliStatus` in `components/agents/t3-cli-selector/status.ts`
exportieren.

**Wunsch an A26:** `asChild` entweder in der eigenen Button-Abstraktion zulassen
oder nicht verwenden; `lastActivityAt` in den Test-Fixtures ergänzen.

### 3.2 🟡 v06-Altbestand — nicht T3 (4 Fehler)

| Datei | Fehler | Anzahl |
|---|---|---|
| `v06/mobile/mobileDesign.test.tsx` | TS2741 `onOpenApp` fehlt; TS2322 `BrowserSection` | 3 |
| `v06/store/storeDesign.test.tsx` | TS2353 `installCount` | 1 |

Diese Dateien liegen **außerhalb** der T3-Lanes. Sie sind untracked und tragen
denselben gebündelten Zeitstempel wie die T3-Dateien, sind aber **kein** T3-Werk.
Sie gehören dem v06-Bestand und werden hier nur der Vollständigkeit halber
aufgeführt — **nicht** als T3-Befund.

---

## 4. W3-Module — Testergebnisse (isoliert)

| Testdatei | Lane | Ergebnis |
|---|---|---|
| `lib/t3/t3.test.ts` | A21 | 🟢 31 pass / 0 fail |
| `components/channels/t3/t3-chat.test.tsx` | A22 | 🟢 14 pass / 0 fail |
| `components/agents/t3-cli-selector/t3-cli-selector.test.tsx` | A23 | 🟢 19 pass / 0 fail |
| `components/companies/token-usage/token-usage.test.tsx` | A35 | 🟢 35 pass / 0 fail |
| `components/fleet/fleet.test.tsx` | A36 | 🟢 19 pass / 0 fail |
| `components/app-sidebar/agent-grid/agent-grid.test.tsx` | A28 | 🟢 14 pass / 0 fail |
| `components/agents/browser-dock/browser-dock.test.tsx` | A32 | 🟢 5 pass / 0 fail |
| `components/onboarding/machines/machine-onboarding-step.test.tsx` | A26 | 🟢 7 pass / 0 fail |
| `components/settings/machines/machines-settings.test.tsx` | A26 | 🔴 6 pass / 2 fail |
| `components/settings/t3/t3-settings.test.tsx` | A25 | 🔴 3 pass / 12 fail |
| `lib/bot-avatar/bot-avatar.test.ts` | A29 | 🟢 0 Fehler |
| `lib/agents/agent-avatar.test.ts` | A31 | 🟢 0 Fehler |
| `components/phone-t3/format.test.ts` | A34 | 🟢 0 Fehler |
| `components/usage-t3/**` | A24 | 🟢 0 Fehler |
| `components/agents/bot-pane/**` | A27 | 🟢 0 Fehler |
| `components/agents/create-bot-dialog/**` | A30 | 🟢 0 Fehler |

### 4.1 🔴 `t3-settings.test.tsx` — 12 Fehler (Lane A25)

Ursache: Die Datei benutzt `screen` (global an `document.body` gebunden), aber
registriert das DOM erst **nach** dem Modul-Import über `ensureDom()`. Dadurch
bindet `screen` an ein noch nicht existierendes `document.body`:

```
TypeError: For queries bound to document.body a global document has to be available
```

Die Datei `token-usage.test.tsx` (A35) macht es **richtig** — sie verwendet
bewusst containergebundene Queries (`render(...).getByText`) statt `screen`, mit
einem erklärenden Kommentar. A25 sollte diese Linie übernehmen.

**Wunsch an A25:** Wie A35 — containergebundene Queries verwenden, oder das DOM
**vor** dem `screen`-Import registrieren.

### 4.2 🟡 `machines-settings.test.tsx` — 2 Fehler (Lane A26)

Neben den 6 TypeScript-Fehlern schlagen hier 2 Tests fehl. Beide betreffen
denselben Sachverhalt: das Feature-Flag `cuaMachines` ist in der Testinstanz
nicht aktiv, das Panel rendert deshalb den Ruhezustand statt der Maschinenliste.

**Wunsch an A26:** Test entweder mit gesetztem Flag fahren oder den
Ruhezustand erwarten.

---

## 5. Regression der Bestandsfunktionen (Aufgabe 3)

Geprüft wurde gegen eine **Basislinie auf HEAD** (`b2f8c78`), damit
Vorbestehendes nicht als Regression gewertet wird.

| Bereich | Testdateien | Ergebnis |
|---|---|---|
| Cloud-Agents (Muse) | `app/lib/agents/cloud-agent.test.ts`, `cloud-tasks.test.ts`, `server/cloud-agents/**` | 🟢 grün |
| APPS / PC-APPS | `server/cli-bridge/accounts/pc-apps.test.ts`, `server/v06/pc-apps/**`, `app/v06/mobile/CompanyAppsView.test.ts` | 🟢 grün |
| CLI-Bridge | `app/v06/unified-cli/unifiedCli.test.ts`, `server/v06/cli-runner/**`, `server/v06/unified-session/**` | 🟢 grün |
| Browser | `server/v06/browser-profiles/browser-profiles.test.ts`, `app/v06/mobile/CompanyBrowserView.test.ts`, `app/components/agents/browser-dock/**` | 🟢 grün |
| Telefon | `app/components/phone-t3/format.test.ts`, `app/v06/mobile/mobileNav.test.ts` | 🟢 grün |
| Agenten-Avatare | `app/lib/agents/agent-avatar.test.ts`, `server/agent-avatar/**` | 🟢 grün |

**Zusammenfassung des gezielten Regressionslaufs:**

```
bun test apps/app/src/lib/agents/cloud-agent.test.ts \
         apps/app/src/lib/agents/cloud-tasks.test.ts \
         apps/app/src/v06/unified-cli/unifiedCli.test.ts \
         apps/app/src/v06/mobile/ \
         apps/app/src/components/phone-t3/format.test.ts \
         apps/app/src/lib/bot-avatar/bot-avatar.test.ts \
         apps/app/src/lib/agents/agent-avatar.test.ts
→ 104 pass / 0 fail

bun test apps/server/src/cli-bridge/ \
         apps/server/src/v06/pc-apps/ \
         apps/server/src/v06/browser-profiles/ \
         apps/server/src/cloud-agents/ \
         apps/server/src/v06/unified-session/ \
         apps/server/src/agent-hub/ \
         apps/server/src/v06/project-swarm/ \
         apps/server/src/v06/social/ \
         apps/server/src/v06/spark-overview/
→ 187 pass / 1 fail
```

Der eine Fehler stammt **nicht** aus dem Live-Code, sondern aus dem
Backup-Ordner `backups/20261023-A22-unified-cli/` — Bun findet dort eine
zweite Kopie desselben Tests, die kein `hono` auflösen kann. Der Test ist ein
**Duplikat aus einem Sicherungsordner**, kein Regression. A40 fasst den
Backup-Ordner nicht an (Regel 7 — nichts löschen); die Meldung geht an Stefan.

---

## 6. Design-Regel (Regel 12) — CLI-Tausch an derselben Stelle

Geprüft am A23 (`components/agents/t3-cli-selector/`):

- Die T3-CLI-Auswahl ersetzt die bestehende CLI-Auswahl **an derselben Stelle**
  (neben dem Agenten) — kein neues Layout.
- Kein neuer Bildschirm, keine neue Navigationsposition wurde eingeführt.
- Die T3-Bausteine nutzen Connects bestehende Design-Tokens
  (`app/src/v06/design/tokens.ts`, `app/src/styles/tokens.css`).

🟢 **Erfüllt.**

---

## 7. Feature-Flag-Guard über alle W3-Module

| Flag | Modul | Flag aus ⇒ |
|---|---|---|
| `bridge` | gesamte Brücke | alte CLI-Bridge, kein Sidecar-Start |
| `cliSwap` | A23 | alte CLI-Auswahl |
| `hideAgentsMode` | A25 | Modus „Agents – T3 Code" bleibt sichtbar |
| `contextRotation` | A15/A25 | keine Rotation, keine Token-Anzeige |
| `cuaMachines` | A26/A19 | kein Maschinen-Panel |
| `companyPublicUsage` | A35/A20 | Firmenprofil ohne Token-Widget |
| `mascot` | A29 | kein Maskottchen |

🟢 **Erfüllt**, mit der in W2 dokumentierten Einschränkung zur Ausschlussliste
(`no-<name>` bei gesetztem `all` — Lane A01).

---

## 8. Offene Wünsche an andere Lanes

| Wunsch an | Inhalt | Priorität |
|---|---|---|
| **A25** | 4 TypeScript-Fehler in `t3-settings-panel.tsx` beheben | 🔴 vor W4 |
| **A25** | `t3-settings.test.tsx`: containergebundene Queries statt `screen` | 🔴 vor W4 |
| **A23** | `T3CliStatus` exportieren (2 TypeScript-Fehler) | 🔴 vor W4 |
| **A26** | `asChild` und `lastActivityAt` (7 TypeScript-Fehler) | 🔴 vor W4 |
| **A26** | 2 fehlschlagende Tests in `machines-settings.test.tsx` | 🟡 |
| **A01** | Flag-Ausschlussliste (aus W2, 5.2) | 🔴 |
| **A14/A17/A31** | Globale Flag-Verschmutzung (aus W2, 5.3) | 🟡 |
| **Stefan** | Duplikate Testdateien in `backups/` — `bun test` scannt sie mit | 🟡 |

---

## 9. Freigabe-Entscheidung

**🔴 BEDINGT BESTANDEN — Freigabe an W4 unter Auflage.**

W3 wird inhaltlich freigegeben. Auflagen:

1. **A25, A23, A26** beheben ihre TypeScript-Fehler. Danach muss
   `tsc -p apps/app/tsconfig.json --noEmit` **weniger Fehler als 4** melden
   (die 4 v06-Fehler sind Altbestand und nicht Teil von T3).
2. **A25** repariert die 12 fehlschlagenden Tests.
3. A01/A14/A17/A31 bringen die Flag-Logik und die Test-Hygiene in Ordnung
   (aus W2).

**Nächster Schritt:** W4 (A37–A39) darf starten, **aber** erst wenn Auflage 1
und 2 erledigt sind — sonst trägt die Frontend-Verdrahtung in die Live-Kopie
einen Build, der nicht sauber typprüft.

---

*Erstellt von A40 am 29.10.2026. Nur lesende Prüfung — keine Datei außerhalb der A40-Lane geändert.*
