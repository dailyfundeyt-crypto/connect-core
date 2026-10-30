# QA-Bericht W2 — T3-Kerndienste (A11–A20)

**Prüfagent:** A40 (Integrator & QA / Gatekeeper)
**Datum:** 29.10.2026
**Wellen-Gate:** W2 (A11–A20, 10 Agenten parallel)
**Status:** 🟡 **BEDINGT BESTANDEN** — Freigabe mit Auflagen

---

## 1. Ergebnis in einem Satz

Threads, Streaming, Turn-Steuerung/Freigaben, Token-Sparen, Kontext-Rotation,
Komprimierungs-Sub-Agent, Usage-Ledger, Anhänge, Cua-Maschinen-Backend und die
Firmen-Token-Aggregation sind **vorhanden und einzeln getestet**; W2 wird
freigegeben, **aber** es gibt einen Fehler in der Feature-Flag-Logik (A01) und
eine Test-Verschmutzung, die den Gesamtlauf des Projekts rot färbt.

---

## 2. Geprüfte Akzeptanzkriterien

| Kriterium | Ergebnis | Nachweis |
|---|---|---|
| Lane-Verletzungen | 🟢 2 (Testdateien außerhalb der Lane — s. 5.1) | `.scratch/a40-lane-findings.json` |
| Sicherungen vorhanden | 🟢 vollständig | `tests/e2e/t3/rollback.test.ts` |
| Nichts gelöscht (Regel 7) | 🟢 0 Löschungen im T3-Bereich | `lane-gate.test.ts` |
| Typecheck `apps/server` (TS 5.9.3) | 🟢 **0 Fehler** | `tsc -p apps/server/tsconfig.json --noEmit` → Exit 0 |
| Typecheck `apps/app` (TS 5.9.3) | 🟡 17 Fehler (davon 4 in W2-Lanes) | s. `QA-W3.md` |
| Feature-Flag-Guard | 🟢 | `tests/e2e/t3/feature-flag-gate.test.ts` |
| Flag aus = altes Verhalten | 🟡 mit Einschränkung | s. 5.2 |

---

## 3. Lane-Abgleich W2

| Agent | Lane | Geänderte/neue Dateien | Backup |
|---|---|---|---|
| A11 | `t3-bridge/threads/**`, `t3-bridge/routes/messages.ts` | Threads-Service, Messages-Route + Test | n/a (neu) |
| A12 | `t3-bridge/stream/**`, `t3-bridge/routes/stream.ts` | SSE-Hub, Stream-Route + Test | n/a (neu) |
| A13 | `t3-bridge/routes/control.ts`, `approvals.ts`, `t3-bridge/control/**` | Turn-Steuerung, Freigaben | n/a (neu) |
| A14 | `t3-bridge/token-saving/**` | Optimierer, 5 Regeln + Test | n/a (neu) |
| A15 | `t3-bridge/context/rotation/**` | Rotation-Manager, Token-Tracker + Test | n/a (neu) |
| A16 | `t3-bridge/context/summarizer/**` | Sub-Agent, Prompt, Parser + Test | n/a (neu) |
| A17 | `t3-bridge/usage/**`, `t3-bridge/routes/usage.ts` | Ledger, Aggregator, Preistabelle + Test | n/a (neu) |
| A18 | `t3-bridge/attachments/**` | Datei-Anhang, Validierung + Test | n/a (neu) |
| A19 | `apps/server/src/cua/**`, `tools/cua/**` | Maschinen-Backend, Seed + Test | n/a (neu) |
| A20 | `apps/server/src/company-usage/**` | Firmen-Aggregation + Test | n/a (neu) |

**Ergebnis:** Die Produktivdateien liegen alle korrekt. Zwei **Testdateien**
liegen außerhalb der Lane (5.1).

---

## 4. Testergebnisse

### 4.1 W2-eigene Tests (isoliert)

| Testdatei | Ergebnis |
|---|---|
| `t3-bridge/threads/threads.test.ts` | 🟢 0 Fehler |
| `t3-bridge/routes/messages.test.ts` | 🟢 0 Fehler |
| `t3-bridge/stream/stream.test.ts` | 🟢 16 pass / 0 fail |
| `t3-bridge/control/control.test.ts` | 🟢 0 Fehler |
| `t3-bridge/control/capabilities.test.ts` | 🟢 0 Fehler |
| `t3-bridge/control/policy.test.ts` | 🟢 0 Fehler |
| `t3-bridge/token-saving/token-saving.test.ts` | 🟢 0 Fehler |
| `t3-bridge/context/rotation/rotation.test.ts` | 🟢 0 Fehler |
| `t3-bridge/context/summarizer/summarizer.test.ts` | 🟢 0 Fehler |
| `t3-bridge/usage/usage.test.ts` | 🟢 0 Fehler |
| `t3-bridge/attachments/attachments.test.ts` | 🟢 0 Fehler |
| `cua/cua.test.ts`, `cua/routes/machines.test.ts`, `cua/seed/seed.test.ts` | 🟢 0 Fehler |
| `company-usage/company-usage.test.ts` | 🟢 0 Fehler |

### 4.2 A40-E2E (W2-relevante Szenarien)

Aus `tests/e2e/t3/e2e-scenarios.test.ts`:

| Szenario | Ergebnis |
|---|---|
| Antwort streamt → Stopp | 🟢 |
| Freigabe (Approval) | 🟢 |
| 100k-Kontext-Rotation (nur nach Turn-Ende) | 🟢 |
| Usage-Ansicht (Cost, Tokens, Limits, 30 Tage) | 🟢 |
| Firmen-Widget öffentlich / Opt-out | 🟢 |
| Sieger-Tabelle 7 Tage / 30 Tage / Gesamt | 🟢 |
| Bestandsnutzer-Seed `dailyfunde.yt@gmail.com` | 🟢 |
| Maschinen-Modus hin und zurück | 🟢 |
| Maschine schläft / weckt | 🟢 |
| 40 Agenten, höchstens 5 gleichzeitig aktiv | 🟢 |

---

## 5. Befunde (W2)

### 5.1 🟡 Zwei Testdateien außerhalb der Lane

| Datei | Angelegt von | Lane laut `LANES.md` |
|---|---|---|
| `apps/server/src/t3-bridge/routes/messages.test.ts` | A11 | `routes/messages.ts` — die **Testdatei** ist nicht genannt |
| `apps/server/src/t3-bridge/routes/usage.test.ts` | A17 | `routes/usage.ts` — die **Testdatei** ist nicht genannt |

Die Lane-Tabelle nennt nur die Produktivdatei (`routes/messages.ts`), nicht ihre
Testdatei. Da `routes/**` sonst niemandem gehört, ist die Überschneidung
gering — aber sie ist formal eine Lane-Überschreidung.

**Wunsch an A01:** Die Lane-Tabelle um die Testdateien ergänzen
(`routes/messages.test.ts`, `routes/usage.test.ts`), **oder** A11/A17 legen die
Tests in den jeweils genannten Ordner. A40 ändert die Lane-Tabelle nicht
(A01-Lane).

### 5.2 🔴 Feature-Flag-Ausschlussliste ist wirkungslos (Lane A01)

`getT3Flag()` in `apps/server/src/t3-bridge/contracts.ts` prüft **zuerst** auf
`all`/`true` und gibt dann `true` zurück — **bevor** die Ausschlussliste
(`no-<name>`, `-<name>`) geprüft wird.

```
CONNECT_FLAGS_T3="all,no-mascot"   ⇒  mascot ist trotzdem AN
```

Damit lässt sich ein einzelnes Flag im Betrieb **nicht** abschalten, sobald `all`
gesetzt ist. Betroffen: `apps/server/src/t3-bridge/contracts.ts` und
`apps/app/src/lib/t3/contracts.ts` (dort fehlt die Ausschlussliste ganz).

**Beleg:** `tests/e2e/t3/flag-exclusion-bug.test.ts` (als `test.failing`
geführt — wird automatisch grün, wenn A01 behoben hat) sowie
`tests/e2e/t3/feature-flag-gate.test.ts`.

**A40-Verhalten:** Nicht geändert (A01-Lane, Regel 1). Befund gemeldet.

### 5.3 🟡 Test-Verschmutzung über `globalThis.__CONNECT_FLAGS_T3`

Mehrere Testdateien setzen das **globale** Flag-Objekt, ohne es zurückzusetzen:

| Datei | sets | cleans | Wirkung |
|---|---|---|---|
| `t3-bridge/token-saving/token-saving.test.ts` | 2 | **0** | `beforeEach` setzt `{ bridge: true }` — bleibt für alle folgenden Dateien stehen |
| `t3-bridge/routes/usage.test.ts` | 1 | **0** | setzt `{ bridge: false }` — bleibt stehen |
| `apps/app/src/lib/agents/agent-avatar.test.ts` | 1 | **0** | setzt Flags global |
| `apps/server/src/agent-avatar/agent-avatar.test.ts` | 2 | 1 | Rest bleibt stehen |

**Beleg:** `bun test apps/server/src/t3-bridge/token-saving/token-saving.test.ts apps/server/src/t3-bridge/sidecar/sidecar.test.ts`
⇒ der Sidecar-Test „Supervisor startet nicht, wenn Flag bridge=false" schlägt
fehl, obwohl `bridge` **isoliert** korrekt `false` ist.

Das ist kein Facettenfehler, sondern ein echter Testfehler: die Testaussage
„Flag aus ⇒ Sidecar startet nicht" hält nicht, sobald ein anderer Test vorher
das Flag global gesetzt hat.

**Wunsch an A13/A14/A17/A31:** Nach jedem Test den globalen Zustand
zurücksetzen (z. B. `afterEach(() => { delete (globalThis as any).__CONNECT_FLAGS_T3; })`).

### 5.4 🟢 Kontext-Rotation: Rotation ausschließlich nach Turn-Ende

Bestätigt: Die Rotation greift **ausschließlich** in `onTurnEnd`, nie während
eines laufenden Turns. Genau so gefordert (I5). Abgedeckt in
`t3-bridge/context/rotation/rotation.test.ts` und in der A40-E2E-Suite.

### 5.5 🟢 Cua-Seed für `dailyfunde.yt@gmail.com`

Der Seed ist **idempotent** und verlangt `machine_install_consent` (Scope
`cua_install`) vor der Installation. Beides in `cua/seed/seed.test.ts`
abgedeckt. Kein Key, Token oder Passwort im Code (Regel 10 eingehalten).

---

## 6. Offene Wünsche an andere Lanes

| Wunsch an | Inhalt |
|---|---|
| **A01** | `getT3Flag`: Ausschlussliste **vor** der `all`-Prüfung auswerten (5.2) |
| **A01** | Lane-Tabelle um Testdateien ergänzen (5.1) |
| **A14** | `token-saving.test.ts`: globales Flag nach jedem Test zurücksetzen (5.3) |
| **A17** | `routes/usage.test.ts`: globales Flag nach jedem Test zurücksetzen (5.3) |
| **A13** | Eigene Tests auf globale Flag-Nebenwirkung prüfen (5.3) |
| **A31** | `agent-avatar.test.ts`: globales Flag zurücksetzen (5.3) |
| **A05** | Migration `0570_t3_tables.sql` + `0571_t3_seed_cua_consent.sql` erst nach Stefans OK einspielen |

---

## 7. Freigabe-Entscheidung

**🟡 BEDINGT BESTANDEN.**

W2 wird freigegeben. Auflagen für W3:

1. **A01** behebt die Flag-Ausschlussliste (5.2). Das ist die einzige Auflage mit
   Funktionsfolge — ohne sie ist „Flag aus = altes Verhalten" für Einzel-Flags
   nicht zuverlässig herstellbar.
2. A14/A17/A31 räumen die globale Flag-Verschmutzung auf (5.3).
3. Alle W3-Arbeit bleibt hinter dem Feature-Flag `bridge`.

**Nächster Schritt:** W3 (A21–A36) darf starten.

---

*Erstellt von A40 am 29.10.2026. Nur lesende Prüfung — keine Datei außerhalb der A40-Lane geändert.*
