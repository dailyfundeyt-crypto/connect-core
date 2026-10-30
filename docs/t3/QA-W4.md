# QA-Bericht W4 — Verdrahtung (A37, A38, A39)

**Prüfagent:** A40 (Integrator & QA / Gatekeeper)
**Datum:** 29.10.2026
**Wellen-Gate:** W4 (A37 Server, A38 Chat/CLI, A39 Navigation/Einstellungen)
**Status:** 🔴 **BEDINGT BESTANDEN** — ein blockierender Defekt in `apps/server/src/app.ts` muss vor dem Einspielen in die Live-Kopie behoben werden

---

## 1. Ergebnis in einem Satz

Die Verdrahtung sitzt an der richtigen Stelle und die drei Lanes sind disjunkt,
**aber** `apps/server/src/app.ts` enthält **ungeklärte Merge-Konflikt-Marker** —
die Datei darf in diesem Zustand **nicht** in die Live-Kopie.

---

## 2. Geprüfte Akzeptanzkriterien

| Kriterium | Ergebnis | Nachweis |
|---|---|---|
| Lane-Verletzungen | 🟢 keine in W4 | `.scratch/a40-lane-findings.json` |
| A38/A39 Lane-Disjunkt | 🟢 disjunkt | s. 3 |
| Sicherungen vorhanden | 🟢 vollständig | `tests/e2e/t3/rollback.test.ts` |
| Nichts gelöscht (Regel 7) | 🟢 0 Löschungen | `lane-gate.test.ts` |
| Typecheck `apps/server` (TS 5.9.3) | 🟢 **0 Fehler** | Exit 0 |
| Typecheck `apps/app` (TS 5.9.3) | 🔴 17 Fehler | s. `QA-W3.md` (W3-Auflagen) |
| Flag aus = altes Verhalten (live) | 🟢 **bestätigt** | s. 5 |
| Rollback getestet | 🟢 | `tests/e2e/t3/rollback.test.ts` |

---

## 3. Lane-Abgleich W4

| Agent | Geänderte Dateien | Backup |
|---|---|---|
| **A37** | `apps/server/src/app.ts`, `apps/server/src/connect/routes.ts`, `apps/server/src/connect/t3-agents.ts`, `apps/server/src/t3-bridge/index.ts` | 🟢 `app.ts.bak-helium-2026-10-29-a37-193303` u. a. |
| **A38** | `channel-chat.tsx`, `chat-transcript.tsx`, `composer/composer.tsx`, `agent-model-picker.tsx`, `lib/agents/agent-cli.ts`, `lib/agents/agent-shell.ts` | 🟢 vorhanden |
| **A39** | `app-sidebar.tsx`, `user-avatar.tsx`, `settings-sidebar.tsx`, `routes/_authed/settings/**`, `lib/companies/level.ts`, `company-level-chips.tsx`, `detail-panel.tsx`, `company-profile-x.tsx`, `create-agent-dialog.tsx`, `routes/_authed/onboarding.tsx` | 🟢 vorhanden |

**Ergebnis:** Keine Datei wird von zwei Lanes beansprucht. A37 rührt keine
App-Datei an, A38 keine Navigationsdatei, A39 keine Chat-Datei. Die
Disjunktheit der drei Verdrahtungs-Lanes ist **eingehalten**.

---

## 4. 🔴 Befund: Merge-Konflikt-Marker in `apps/server/src/app.ts`

### 4.1 Was

In `apps/server/src/app.ts` stehen **zwei unaufgelöste Konflikte**:

```
1440: <<<<<<< Updated upstream
1446: =======
1452: >>>>>>> Stashed changes
1485: <<<<<<< Updated upstream
1487: =======
1489: >>>>>>> Stashed changes
```

Die Marker stammen aus einem **`git stash pop`** mit Konflikt (`Updated upstream`
vs. `Stashed changes`).

### 4.2 Warum das auffällt

- Die Datei **kompiliert trotzdem** — die Marker stehen innerhalb eines
  Block-Kommentars (`/* MCP-OAuth … */`). Deshalb meldet der Typecheck
  **0 Fehler**, und deshalb wäre der Defekt beim Review leicht zu übersehen.
- Der Build läuft durch (`bun build --target=bun apps/server/src/app.ts` → Exit 0).
- Ein zusätzlicher Schaden: an zwei Stellen ist der **UTF-8-Text zerstört**
  (Mojibake, z. B. `ÔÇö` statt `—`, `g├Âglich` statt `möglich`). Die
  Baseline auf HEAD (`b2f8c78`) enthält diese Schäden **nicht**.

### 4.3 Nachweis

```
# Marker im Quellbaum
Select-String -Path apps/server/src/app.ts -Pattern "<<<<<<<|=======|>>>>>>>"
→ 6 Treffer (2 Konflikte)

# Marker in der Basislinie HEAD — keine
Select-String -Path .scratch/wt-pristine/apps/server/src/app.ts -Pattern "<<<<<<<"
→ 0 Treffer

# Mojibake
Quellbaum : 2 Zeilen mit "Ã|Ô|â€|Â"
Basislinie : 0 Zeilen
```

### 4.4 Auswirkung

**Funktional ist der Schaden derzeit begrenzt:** Die Live-Kopie
(`apps/connect-app/runtime/connect/.../app.ts`) ist **sauber** — 0 Marker,
0 Mojibake. Der Vergleich Quelle ↔ Live ergibt **0 funktionale Unterschiede**;
der einzige Unterschied sind Kommentarzeilen.

**Trotzdem ist das ein Blocker:**
1. Die Datei, die A37 als Verdrahtungs-Eigentümer verantwortet, ist in einem
   ungeklärten Zustand. Der nächste Editor, der die Datei speichert, kann die
   Marker in den Kommentar-Block einrasten lassen — dann bricht der Build.
2. Der Mojibake-Schaden ist dauerhaft und betrifft einen **Lesertext im Code**
   (deutsche Kommentare).
3. Die Live-Kopie hat eine **andere Fassung** derselben Datei als die Quelle.
   Beim Einspielen würde die Quelle die Live-Kopie überschreiben — mit den
   Markern.

### 4.5 Eskalation: der Defekt ist inzwischen committet (21:54 Uhr)

Nach Abschluss der ersten Prüfphase hat ein **automatischer Build-Prozess**
(`Helium Auto-Build`) committet:

```
a5ce6b9 connect-mcp: OAuth-Login mit Google-Konto, Firmen aus dem angemeldeten Profil
   2026-10-29 21:54:28 +0100  Helium Auto-Build
```

Dieser Commit enthält `apps/server/src/app.ts` — **mit den Konflikt-Markern**:

```
git show HEAD:apps/server/src/app.ts | Select-String "<<<<<<<|>>>>>>>"
→ 1378: <<<<<<< Updated upstream
  1384: =======
  1390: >>>>>>> Stashed changes
  1423: <<<<<<< Updated upstream
  1425: =======
  1427: >>>>>>> Stashed changes
```

Damit liegt der Defekt jetzt **in der Git-Historie** und nicht mehr nur im
Arbeitsbaum. Das ändert die Dringlichkeit:

| | vorher | nachher |
|---|---|---|
| Ort des Defekts | nur Arbeitsbaum | Arbeitsbaum **und** Historie (`a5ce6b9`) |
| Rückkehr zu HEAD | Arbeitsbaum bereinigen genügt | Arbeitsbaum **und** Index/Historie bereinigen |
| Risiko bei jedem künftigen `git checkout`/`git stash` | gering | **hoch** — die Marker kehren zurück |

**Entwarnung:** Die **Live-Kopie ist nicht betroffen**
(`apps/connect-app/runtime/connect/.../app.ts` → 0 Marker, Zeitstempel 21:14),
und der Prozess auf Port 3101 läuft unverändert (PID 7524, gestartet 21:34).
Der Defekt ist damit **noch nicht produktiv**.

**Zusätzlich geprüft:** Der Typecheck `apps/server` ist **weiterhin 0 Fehler**
(Exit 0) — die Marker stehen im Kommentar und fallen der Prüfung nicht auf.

**Empfehlung an A37:** Nicht nur die Datei im Arbeitsbaum bereinigen, sondern
den Commit mit den Markern **nicht** als Grundlage weiterverwenden. Da A40
weder committen noch die Historie umschreiben darf (Regel 9), ist die
Bereinigungsstrategie **Stefans Entscheidung**.

### 4.6 Empfehlung an A37 (Dateistand)

`app.ts` auf den sauberen Stand bringen. Es liegen **bereits** passende
Sicherungen vor, u. a. `app.ts.bak-helium-2026-10-29-a37-193303` (0 Marker,
0 Mojibake, 17:59 Uhr). Der Konfliktblock ist **rein kosmetisch** (Zeilen
1440–1452 und 1485–1489) — die „Stashed changes"-Fassung trägt die korrekte
UTF-8-Kodierung; die „Updated upstream"-Fassung ist die zerstörte.

**A40-Verhalten:** Nicht geändert — `app.ts` ist A37-Lane (Regel 1).

---

## 5. Feature-Flag im laufenden Betrieb (live, Port 3101)

Der laufende Live-Server (PID 7524, Bun, seit 21:34 Uhr) wurde geprüft:

| Route | Ergebnis | Bewertung |
|---|---|---|
| `/api/health` | 200 `{"status":"ok"}` | 🟢 Server läuft |
| `/api/t3/providers` | 404 | 🟢 Flag aus ⇒ keine T3-Route |
| `/api/t3/agents` | 404 | 🟢 |
| `/api/t3/usage` | 404 | 🟢 |
| `/api/t3/fleet` | 404 | 🟢 |
| `/api/machines` | 404 | 🟢 Flag `cuaMachines` aus |

Der Live-Prozess läuft **ohne** `CONNECT_FLAGS_T3`. In `t3-bridge/index.ts`
gilt:

```typescript
const bridge = getT3Flag("bridge");
if (!bridge && !cua && !companyUsage && !mascot) return;
```

**Ergebnis: „Flag aus = altes Verhalten" ist im laufenden Betrieb bestätigt.**
Es wird kein Sidecar gestartet, keine T3-Route registriert, kein Verhalten
geändert.

### 5.1 Stand der Live-Kopie

| Bereich | Stand |
|---|---|
| `apps/server/src/t3-bridge/**` (vollständiger Baum) | 🟢 vorhanden |
| `apps/server/src/cua/**` | 🟢 vorhanden |
| `apps/server/src/app.ts` | 🟢 vorhanden, **sauber** |
| `apps/server/src/connect/routes.ts` | 🟢 identisch zur Quelle |
| `apps/server/src/t3-bridge/contracts.ts` | 🟢 identisch zur Quelle |
| **Frontend** (`apps/app/src/components/settings/t3/**` u. a.) | 🔴 **fehlt komplett** |

Die Server-Hälfte ist bereits ausgespielt, die **Frontend-Hälfte fehlt noch**.
Das ist der eigentliche Grund, warum die T3-Oberfläche noch nicht sichtbar ist.

---

## 6. Live-Kopie — wer hat sie angefasst?

In der Live-Kopie liegen Sicherungen mit dem Suffix `-a37-193303`:

```
apps/connect-app/runtime/connect/apps/server/src/app.ts.bak-helium-2026-10-29-a37-193303
apps/connect-app/runtime/connect/apps/server/src/connect/routes.ts.bak-helium-2026-10-29-a37-193303
apps/connect-app/runtime/connect/apps/server/src/connect/t3-agents.ts.bak-helium-2026-10-29-a37-193303
```

**Masterplan-Regel 13:** Die Live-Kopie ändert **nur A40** (Integrator).

A37 hat in seinem Bericht ausdrücklich festgehalten:
> „Kein Commit, kein Push, kein Neustart, keine Änderung an der Live-Kopie oder an Stefans T3-Home."

**Das ist ein Widerspruch zum Dateisystemstand.** Erklärbar ist er dadurch,
dass A37 die Sicherungen im *Quellbaum* anlegte und ein Skript sie in die
Live-Kopie spiegelte — die Namensgebung `-a37-193303` deutet auf ein
automatisches Spiegeln der Sicherungen hin.

**Wunsch an A37:** Klären, wie die Sicherungen in die Live-Kopie gelangten, und
künftig Sicherungen **nur** im Quellbaum anlegen.

**Wunsch an Stefan:** Bestätigen, ob der derzeitige Server-Stand der Live-Kopie
gewollt ist. Der Server läuft, alle T3-Flags sind aus, die Oberfläche ist noch
nicht ausgespielt — es besteht also **kein akuter Handlungsbedarf**.

---

## 7. Offene Wünsche an andere Lanes

| Wunsch an | Inhalt | Priorität |
|---|---|---|
| **A37** | 🔴 `app.ts`: Konflikt-Marker (1440–1452, 1485–1489) auflösen + Mojibake reparieren. **Der Defekt ist seit 21:54 Uhr auch in der Git-Historie** (`a5ce6b9`, Auto-Build) — s. 4.5. | **blockierend** |
| **A37** | Erklären, wie die `-a37-193303`-Sicherungen in die Live-Kopie kamen | 🟡 |
| **A25/A23/A26** | 🔴 13 TypeScript-Fehler + 14 fehlschlagende Tests (aus W3) | **blockierend für Frontend-Ausspielung** |
| **A01** | 🔴 Flag-Ausschlussliste (aus W2) | 🟡 |
| **A14/A17/A31** | Globale Flag-Verschmutzung (aus W2) | 🟡 |

---

## 8. Freigabe-Entscheidung

**🔴 BEDINGT BESTANDEN — W4 wird inhaltlich freigegeben, das Einspielen in die
Live-Kopie ist gesperrt.**

Freigabe-Erteilung:

| Schritt | Status |
|---|---|
| W4-Quellcode fachlich freigegeben | 🟢 ja |
| Server-Teil in Live-Kopie ausspielen | 🟡 **bereits geschehen** (Flags aus, harmlos) |
| Frontend-Teil in Live-Kopie ausspielen | 🔴 **gesperrt** |
| Migration `0570_t3_tables.sql` gegen Postgres 5544 | 🔴 **gesperrt** — erst nach Stefans OK |
| Neustart Port 3101 | 🟡 **gesperrt** — erst nach Stefans OK |
| Vercel-Preview `connect-kunc-preview` | ⏸️ nicht ausgeführt — kein Auftrag |

**Auflagen vor dem Einspielen:**

1. **A37** löst die Konflikt-Marker in `app.ts` auf und repariert den
   UTF-8-Schaden.
2. **A25/A23/A26** beheben die 13 TypeScript-Fehler und die 14 fehlschlagenden
   Tests, damit `tsc -p apps/app/tsconfig.json --noEmit` unter 4 Fehlern
   bleibt.
3. Danach: `docs/t3/QA-ABSCHLUSS.md` fortschreiben, Stefans OK einholen,
   **dann** einspielen.

---

*Erstellt von A40 am 29.10.2026. Nur lesende Prüfung — keine Datei außerhalb der A40-Lane geändert. Kein Neustart, kein Commit, kein Push.*
