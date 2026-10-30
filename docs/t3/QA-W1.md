# QA-Bericht W1 — T3-Sidecar-Grundlage (A02–A10)

**Prüfagent:** A40 (Integrator & QA / Gatekeeper)
**Datum:** 29.10.2026
**Wellen-Gate:** W1 (A02–A10, 9 Agenten parallel)
**Status:** 🟡 **BEDINGT BESTANDEN** — Freigabe mit Auflagen

---

## 1. Ergebnis in einem Satz

Die W1-Grundlage (Sidecar-Supervisor, RPC-Client, Provider-Registry, DB-Schema, Übersetzer, Workspaces, Scheduler, Monitor, Auth) ist **funktional vorhanden und durch eigene Unit-Tests abgedeckt**; das Quality-Tor gibt W1 frei, **aber** der Sidecar-Supervisor kann den echten Port 3773 nicht ungestört testen (belegter Fremdprozess) und der DB-Schema-/Migrationsstand ist noch nicht gegen Postgres 5544 verifiziert.

---

## 2. Geprüfte Akzeptanzkriterien

| Kriterium | Ergebnis | Nachweis |
|---|---|---|
| Lane-Verletzungen (geänderte Dateien ⊆ Lane) | 🟢 keine | `.scratch/a40-lane-findings.json` |
| Sicherungen `.bak-helium-<datum>` vorhanden | 🟢 vollständig | `tests/e2e/t3/lane-gate.test.ts` |
| Nichts gelöscht (Regel 7) | 🟢 0 Löschungen im T3-Bereich | `lane-gate.test.ts` → „es wurde im T3-Bereich nichts gelöscht" |
| Typecheck `apps/server` (TS 5.9.3) | 🟢 0 Fehler | `node_modules\.bin\tsc -p apps/server/tsconfig.json --noEmit` → Exit 0 |
| Typecheck `apps/app` (TS 5.9.3) | 🟡 siehe W3 | siehe `QA-W3.md` |
| Keine Lane-Überschneidung | 🟢 keine | `lane-gate.test.ts` |
| Feature-Flag-Guard | 🟢 | `tests/e2e/t3/feature-flag-gate.test.ts` |

---

## 3. Lane-Abgleich W1

Geprüfte Dateien (Auszug, alle in Lane):

| Agent | Lane | Geänderte/neue Dateien | Backup |
|---|---|---|---|
| A02 | `apps/server/src/t3-bridge/sidecar/**` | Supervisor, `sidecar.test.ts` | n/a (neu) |
| A03 | `apps/server/src/t3-bridge/rpc/**` | RPC-Client, `rpc.test.ts` | n/a (neu) |
| A04 | `apps/server/src/t3-bridge/providers/**` | Provider-Registry, `providers.test.ts` | n/a (neu) |
| A05 | `apps/server/src/db/schema/t3.ts`, `apps/server/drizzle/**` | Schema + Migration | vorhanden |
| A06 | `apps/server/src/t3-bridge/translate/**` | Event-Übersetzer, `translate.test.ts` | n/a (neu) |
| A07 | `apps/server/src/t3-bridge/workspaces/**` | Workspace-Manager, `workspaces.test.ts` | n/a (neu) |
| A08 | `apps/server/src/t3-bridge/scheduler/**` | Scheduler, `scheduler.test.ts` | n/a (neu) |
| A09 | `apps/server/src/t3-bridge/monitor/**` | Ressourcen-Monitor, `monitor.test.ts` | n/a (neu) |
| A10 | `apps/server/src/t3-bridge/auth/**` | Brücken-Auth, `auth.test.ts` | n/a (neu) |

**Ergebnis:** keine Datei außerhalb der zugewiesenen Lane angefasst. Keine Datei liegt in zwei Lanes.

---

## 4. Testergebnisse

### 4.1 W1-eigene Tests (isoliert)

| Testdatei | Ergebnis |
|---|---|
| `apps/server/src/t3-bridge/sidecar/sidecar.test.ts` | 🟢 0 Fehler (eine Prüfung braucht freien Port 3773 — s. Befund 5.1) |
| `apps/server/src/t3-bridge/rpc/rpc.test.ts` | 🟢 29 pass / 0 fail |
| `apps/server/src/t3-bridge/providers/providers.test.ts` | 🟢 0 Fehler |
| `apps/server/src/t3-bridge/translate/translate.test.ts` | 🟢 0 Fehler |
| `apps/server/src/t3-bridge/workspaces/workspaces.test.ts` | 🟢 0 Fehler |
| `apps/server/src/t3-bridge/scheduler/scheduler.test.ts` | 🟢 0 Fehler |
| `apps/server/src/t3-bridge/monitor/monitor.test.ts` | 🟢 0 Fehler |
| `apps/server/src/t3-bridge/auth/auth.test.ts` | 🟢 0 Fehler |

### 4.2 A40 E2E-Suite

`tests/e2e/t3/` — **35 pass / 0 fail** (isoliert; siehe `QA-ABSCHLUSS.md` für den Suite-Gesamtlauf).

---

## 5. Befunde (W1)

### 5.1 🟡 Port 3773 durch Fremdprozess belegt (A02)

`sidecar.test.ts:176` startet den Supervisor gegen den echten Sidecar-Port 3773. Auf
dieser Maschine läuft bereits ein Node-Prozess (PID 43396) auf 3773, der nicht zu
diesem Projekt gehört. Der Test kann den Port deshalb nicht exklusiv belegen.

**A40-Verhalten:** Prozess **nicht** beendet (Regel 3/4 — kein Eingriff in fremde
Prozesse, kein `Connect.exe --stop`).

**Wunsch an A02:** Der Supervisor-Test sollte einen **freien Port** wählen
(z. B. `0` oder einen env-gesteuerten Testport) statt fest 3773 zu belegen, damit
er parallel zu einem laufenden Sidecar lauffähig ist. Alternativ: Test über
`CONNECT_T3_SIDECAR_PORT` konfigurierbar machen.

### 5.2 🟡 Migration A05 noch nicht gegen Postgres 5544 geprüft

A05 hat Schema und Migration angelegt (Postgres Port 5544). Das Einspielen in die
Live-Datenbank ist laut Masterplan **erst nach Stefans OK** erlaubt (Aufgabe 4 des
Masterplans). Der Migrationsstand ist daher **offen** und wird in W4 nach dem OK
nachgezogen.

### 5.3 🟢 Keine Befunde

- Sidecar bindet ausschließlich an `127.0.0.1` — geprüft in `sidecar.test.ts`.
- Brücken-Auth nutzt keine im Klartext gespeicherten Geheimnisse; `KEY_ENCRYPTION_KEY`
  wird nirgends ausgegeben (Regel 10).
- Scheduler-Limit global 5 / pro Provider 3 ist in `scheduler.test.ts` abgedeckt.

---

## 6. Offene Wünsche an andere Lanes

| Wunsch an | Inhalt |
|---|---|
| **A02** | Supervisor-Test auf freien Port umstellen (siehe 5.1) |
| **A05** | Vergebene Migrationsnummer in `docs/t3/reports/A05.md` bestätigen + `RESERVATIONS.md` prüfen |
| **A40 (selbst)** | — |

---

## 7. Freigabe-Entscheidung

**🟡 BEDINGT BESTANDEN.**

W1 wird freigegeben. Auflagen für W2:

1. A02 passt den Supervisor-Test auf einen freien Testport an (nicht blockierend für W2).
2. Die Migration A05 wird **nicht** vor Stefans OK gegen Postgres 5544 eingespielt.
3. Alle W2-Arbeit bleibt hinter dem Feature-Flag `bridge`.

**Nächster Schritt:** W2 (A11–A20) darf starten.

---

*Erstellt von A40 am 29.10.2026. Nur lesende Prüfung — keine Datei außerhalb der A40-Lane geändert.*
