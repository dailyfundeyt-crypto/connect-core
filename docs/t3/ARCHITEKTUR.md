# ARCHITEKTUR — T3-Backend in Connect

Eigentümer: **A01** (Architekt & Verträge) · Stand 29.10.2026 · Nur Dokumentation, kein Funktionscode.

Begleitdokumente: `docs/t3/LANES.md` (Zuständigkeiten), `docs/t3/T3-INTEGRATION-UEBERSICHT.md` (Begründung),
`docs/t3/MASTERPLAN-40-AGENTEN.md` (Paketplan).

---

## 1. Kurzfassung

Connect behält **sein Design**. Darunter arbeitet das **T3-Backend** als lokaler Sidecar.
Der Sidecar startet echte CLI-Prozesse (Codex, Claude, Cursor, Grok, OpenCode, Antigravity, Hermes,
Freebuff, Pi, Muse), hält Threads, streamt Antworten, drosselt Last, verwaltet Kontextfenster und
meldet Nutzung.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Browser (React/Vite)  apps/app/src                                       │
│  Messages-Chat · CLI-Auswahl oben neben dem Agenten · Usage · Avatare    │
└───────────────▲───────────────────────────────────┬───────────────────────┘
                │ REST + SSE                         │ fetch (credentials)
┌───────────────┴───────────────────────────────────▼───────────────────────┐
│ Connect-Server (Bun + Hono)  apps/server/src        Port 3101               │
│  apps/server/src/t3-bridge/**  ← A01–A20, A37                         │
│  • Sidecar-Supervisor (A02)  • WS-RPC-Client (A03)                       │
│  • Provider-Registry (A04)   • Translator (A06)                          │
│  • Scheduler/Monitor (A08/A09) • Auth (A10)                              │
│  • Threads/Messages (A11)   • Stream (A12) • Control/Approvals (A13)    │
│  • Usage-Ledger (A17)        • Fleet (A36)                              │
└───────────────▲────────────────────────────────────────────────────────────┘
                │ WebSocket-RPC (Effect-RPC-Format)
┌───────────────┴────────────────────────────────────────────────────────────┐
│ T3-Sidecar  (Node ≥22 + Effect)                    127.0.0.1:3773        │
│  eigener T3-Home: %LOCALAPPDATA%\ConnectAgents\t3-home                   │
│  orchestration-v2: Threads · Turns · Runs · Event-Store                 │
│  Provider-Treiber → echte CLI-Prozesse                                  │
└───────────────────────────────────────────────────────────────────────────┘
```

**Leitentscheidung:** T3-Code wird **nicht** in den Bun/Hono-Server kopiert. Effect-Laufzeit,
Node-spezifische APIs, eigene Persistenz und ~200 Dateien `orchestration-v2` machen eine
Portierung zu riskant. Der Sidecar ist additiv und abschaltbar.

---

## 2. Ports und Prozesse

| Prozess | Port | Bindung | Start | Persistenz |
|---|---|---|---|---|
| Connect-Server | **3101** | lokal | wie bisher (Connect.exe) | Postgres 5544, `%LOCALAPPDATA%\ConnectApp` |
| T3-Sidecar | **3773** (Standard) | **nur 127.0.0.1** | von A02 supervidiert, eigener Prozess | eigener T3-Home `%LOCALAPPDATA%\ConnectAgents\t3-home` |
| Postgres | 5544 | lokal | unverändert | unverändert |

Der Sidecar darf **niemals** Stefans Desktop-Home (`~/.t3`, `~/.t3-hermes`) anrühren. A02 setzt
`T3CODE_HOME` explizit auf das eigene Verzeichnis (Umgebungsvariable, siehe
`T3_SIDECAR_DEFAULTS.homeEnvVar`).

### Erkennung des laufenden T3-Servers

Die bestehende Logik in `apps/server/src/connect/t3-agents.ts` bleibt **die** Quelle und wird
von der Brücke wiederverwendet:

1. `CONNECT_T3_URL` (explizite Override)
2. `$T3CODE_HOME/userdata/server-runtime.json` (Desktop-verwaltet)
3. `http://127.0.0.1:3773` (Standard)

Nur Loopback-Origins werden akzeptiert, sofern `CONNECT_T3_URL` nicht explizit gesetzt ist.

---

## 3. Verträge

| Datei | Inhalt | Besitzer |
|---|---|---|
| `apps/server/src/t3-bridge/contracts.ts` | Laufzeiten, Provider, Thread-Map, Chat-Events, Usage, Maschinen, Avatare, Flags, Routen | A01 |
| `apps/app/src/lib/t3/contracts.ts` | dieselben Typen für den Browser (eigenständig, kein Server-Import) | A01 |

Wichtig: Die beiden Dateien sind bewusst **getrennt** (die App hat keinen Alias auf den Server).
Bei jeder Typänderung müssen beide Seiten synchron bleiben — das ist ein **Wunsch an alle Lanes**,
sie melden Breaking Changes an A01 bzw. an den Besitzer der betroffenen Datei.

### Zentrale Typen

- `AgentRuntime = "cli" | "cloud" | "t3"` — die drei Laufzeiten. **Kein Fallback**: ein `t3`-Agent
  ohne erreichbaren Sidecar meldet den Fehler.
- `T3ProviderId` — die T3-Treiber-Ids (siehe §4); additiv ergänzt um `T3ProviderAuthState`, `T3ProviderAvailabilityState` und `T3ApprovalDecisionWire`.
- `T3ThreadMap` — Zuordnung Agent ↔ Channel ↔ T3-Thread ↔ Generation.
- `ConnectChatEvent` — das Übersetzungsformat (A06 erzeugt, A12 streamt, A22 rendert).
- `UsageLedgerRow`, `UsageQuery`, `UsageResponse` — Nutzung pro Agent/Firma (A17).
- `CompanyPublicUsage` — **nur Summen** für das öffentliche Firmenprofil (A20/A35).
- `Machine` — Cua-Maschinen (A19).
- `AgentAvatar` — Maskottchen (A29/A31).
- `SchedulerLimits`, `ContextPolicy`, `TokenSavingPolicy`, `ResourceLimits`.

### Feature-Flags

Alle T3-Flags stehen in `T3_FEATURE_FLAGS` (Server- und App-Datei). Sie werden über
`CONNECT_FLAGS_T3` (Server, kommagetrennt) bzw. `window.__CONNECT_FLAGS_T3` (Browser) gesetzt.

| Flag | Wirkung | Aus = |
|---|---|---|
| `connect.t3.bridge` | Sidecar, RPC, Threads, Streaming | alles wie heute |
| `connect.t3.cliSwap` | CLI-Auswahl nutzt T3-Engine | alte `cli-bridge` |
| `connect.t3.hideAgentsMode` | Level 5 („Agents – T3 Code", iframe) ausblenden | iframe-Modus sichtbar |
| `connect.t3.contextRotation` | Kontextwechsel alle 100.000 Tokens | ein Thread bis zum Ende |
| `connect.cua.machines` | Cua-Maschinen | kein Computer-Tab |
| `connect.company.publicUsage` | öffentliche Firmen-Token | Firmenprofil ohne Token |
| `connect.avatar.mascot` | Maskottchen-Avatare | bestehende Avatare |

> `packages/contracts/src/flags.ts` (`FLAGS_V06`) gehört einem anderen Besitzer und wird **nicht**
> angefasst. Wunsch an A37: die T3-Flags entweder dort ergänzen (mit Freigabe des Besitzers) oder
> separat per `GET /api/t3/status` ausliefern.

---

## 4. Provider (CLIs)

### T3-Treiber (Quelle: `apps/server/src/provider/builtInDrivers.ts`, Hermes-Fork)

| T3-ProviderId | Anzeigename | Herkunft der Id |
|---|---|---|
| `codex` | Codex | `ProviderDriverKind.make("codex")` |
| `claudeAgent` | Claude | `ProviderDriverKind.make("claudeAgent")` |
| `cursor` | Cursor | `packages/provider-cursor` |
| `grok` | Grok | `ProviderDriverKind.make("grok")` |
| `hermes` | Hermes | `ProviderDriverKind.make("hermes")` |
| `freebuff` | Freebuff | `ProviderDriverKind.make("freebuff")` |
| `opencode` | OpenCode | `packages/provider-opencode` |
| `antigravity` | Antigravity | `ProviderDriverKind.make("antigravity")` |
| `pi` | Pi | `packages/provider-pi` |
| `muse` | Muse | `packages/provider-muse` (Cloud, kein echter CLI-Prozess) |
| `acpRegistry` | ACP | generischer ACP-Treiber über stdio |

### Mapping Connect-CLI-Ziel → T3-Treiber

Basis: `apps/app/src/lib/agents/agent-cli.ts` → `CLI_TARGETS`
(antigravity, manus, codex, chatgpt, claude, grok, cursor, lovable, freebuff).

| Connect-Ziel | T3 | Anmerkung |
|---|---|---|
| `codex` | `codex` | echter App-Server-Prozess |
| `chatgpt` | `codex` | ChatGPT lief schon über dieselbe Codex-Bridge |
| `claude` | `claudeAgent` | Agent SDK |
| `cursor` | `cursor` | |
| `grok` | `grok` | |
| `antigravity` | `antigravity` | |
| `freebuff` | `freebuff` | ACP über stdio |
| `manus` | **legacy** | kein T3-Treiber |
| `lovable` | **legacy** | kein T3-Treiber |
| (ZGPT) | **legacy** | kein T3-Treiber |

`legacy` heißt: alter Weg (`cli-bridge` / shell-dispatch), unverändert.

### 4.1 Erweiterter Provider-Status und Verfügbarkeit (Nachtrag nach A04 §9)

Die Verträge (contracts.ts auf Server und App) wurden am 29.10.2026 additiv um präzise Status- und
Wire-Typen ergänzt:

- **T3ProviderAuthState (uthenticated | unauthenticated | unknown):** Dreiwertiger Status
  aus T3s ServerProviderAuthStatus. *Wichtig für A23/UI:* unknown darf in der CLI-Auswahl
  **nicht** als „nicht eingeloggt" dargestellt werden, sondern als neutraler Zustand (T3 konnte es nicht ermitteln).
- **T3ProviderAvailabilityState (vailable | unavailable | legacy):**
  - vailable: Installiert, aktiv und einsatzbereit.
  - unavailable: Fehlt, deaktiviert, Fehler oder noch nicht unterstützter Treiber.
  - legacy: Kein T3-Treiber vorhanden; Connect nutzt den bestehenden Pfad (cli-bridge).
- **Erweiterte Zeile T3ProviderStatus:**
  - driver?: string (rohe Treiber-Id aus dem Sidecar, z. B. für Protokollierung)
  - instanceId?: string | null (Instanz-Id bei mehrinstanzfähigen Treibern)
  - displayName?: string (Anzeigename in der UI)
  - vailability?: T3ProviderAvailabilityState
  - uth?: T3ProviderAuthState | null
  - limits?: T3ProviderLimit[] (Limitfenster direkt am Provider-Objekt)
  - ork?: boolean (Kennzeichen für im Hermes-Fork ergänzte Treiber)

### 4.2 ACP-Instanzen und dynamische Treiber

- **ACP-Mehrinstanz-Fähigkeit:** Der generische Treiber cpRegistry kann mehrere parallele
  Agenteninstanzen bedienen (z. B. Devin, Marvin). Alle Instanzen teilen sich die Treiber-Id
  cpRegistry, unterscheiden sich jedoch über instanceId (z. B. cpRegistry:devin) und
  displayName. Die CLI-Auswahl (A23) rendert jede Instanz als eigene Zeile.
- **Unbekannte Fork-Treiber (unknownDrivers):** Meldet ein aktualisierter T3-Sidecar einen
  neuen Treiber, der im geschlossenen Union-Typ T3ProviderId noch nicht existiert (z. B.
  quantumAgent), wird er nicht verworfen. Er erscheint mit provider: null, vailability: "unavailable"
  und wird im Array unknownDrivers?: string[] der T3ProviderListResponse geführt.

### 4.3 Freigaben auf der Leitung (Wire-Format)

- **T3ApprovalDecisionWire:** Der T3-RPC-Server akzeptiert auf WebSocket-Ebene (espondToRuntimeRequest)
  ausschließlich fünf feste Werte:
  ccept · cceptForSession · cceptAlways · decline · cancel.
- **Connect-Ebene (T3ApprovalDecision):** Connects Freigabekarten bieten die drei sprechenden
  Optionen llow · deny · llow_always.
- **Übersetzungsfunktionen:**
  - 	oT3ApprovalDecisionWire(decision): Verlustfreie Übersetzung Connect → T3-Wire
    (llow → ccept, deny → decline, llow_always → cceptAlways).
  - romT3ApprovalDecisionWire(wire): Übersetzung T3-Wire → Connect (für Kartenvorschau;
    cceptForSession/cceptAlways fallen auf llow_always, cancel auf deny).
  Damit ist sichergestellt, dass weder A06 noch A13 eigene divergierende Übersetzungstabellen bauen.

---

## 5. Wo sitzt was im Live-Code (Bestandsaufnahme A01)

| Thema | Datei | Befund |
|---|---|---|
| CLI-Ziele | `apps/app/src/lib/agents/agent-cli.ts` | `CliTarget`, `CLI_TARGETS` (9 Ziele), `getAgentCliDefault`/`setAgentCliDefault` (localStorage `connect.agent-cli-default`), `isBridgedCliTarget` (codex/chatgpt/cursor) |
| Auswahl „oben neben dem Agenten" | `apps/app/src/lib/agents/agent-models.ts` | `FAMILY_TO_CLI` / `CLI_TO_FAMILY`; die Familie bestimmt die CLI. Umbrella: `setAgentModelFamily` → `setAgentCliDefault` |
| Auswahl-UI (Trigger-Referenz) | `apps/app/src/components/agents/agent-model-picker.tsx` | runder 8-px-Trigger (`rounded-full`, `h-8`, `text-[11px]`), Chevron `IconChevronDown`, `SelectContent align="end" min-w-44` → **dieser Look ist die Vorlage für A23** |
| CLI-Anzeige in der Kopfzeile | `apps/app/src/components/companies/focus-overlay.tsx` (Z. 226) und `level1-agent-stage.tsx` (Z. 247) | zeigt `{familyLabel(...)} · {getAgentCliDefault(active.id)}` — die „CLI-Auswahl neben dem Agenten" in der Agenten-Kopfzeile |
| Agent anlegen (Wizard) | `apps/app/src/components/agents/create-agent-dialog.tsx` | Schritte `profile → model → setup → account`; `chosenCli` wird beim Anlegen gesetzt (Z. 325/339), `setAgentCliDefault` in Z. 351 |
| Engine-Wahl | `apps/app/src/components/agents/agent-engine-panel.tsx` | `kind`/`cliKind`/`chosenCli` |
| MCP je CLI | `apps/app/src/components/agent-hub/agent-mcp-panel.tsx` | `chosenCli` (Z. 278), `setAgentCliDefault` (Z. 296) |
| Usage-Menüpunkt | `apps/app/src/components/app-sidebar/app-sidebar.tsx` Z. 663–669 | `DropdownMenuItem → /settings` mit `hash: "usage"`, Label „Usage"; zusätzlich `/usage`-Route (Z. 473/524) und `apps/app/src/routes/_authed/_app/usage.tsx` |
| Firmenprofil | `apps/app/src/components/companies/company-profile-x.tsx` | öffentliches Firmenprofil (A35 setzt dort das Token-Widget ein) |
| Rechtes Panel | `apps/app/src/components/layout/detail-panel.tsx` | `DetailPanel` mit Breite 400 px, mobil als Sheet — dort gehört der Cua-Computer-Tab (A27) |
| T3-Modus (Level 5) | `apps/app/src/lib/companies/level.ts` | `CompanyLevel 1..5`, `5 = "Agents"`, Label „Agents — T3 Code für deine Agenten" → **wird hinter `hideAgentsMode` ausgeblendet (A39)** |
| T3-Iframe-Bereich | `apps/app/src/components/companies/t3-agents-area.tsx` | embettet T3s Web-App; erkennt Server, mintet Pairing-Link |
| T3-Erkennung (Server) | `apps/server/src/connect/t3-agents.ts` | `t3AgentsStatus()`, `mintT3PairingLink()`, Routen `GET /agents/t3`, `POST /agents/t3/pair` |
| Cloud-Agent-Statusmodell | `apps/server/src/cloud-agents/types.ts` | `CloudMessageStatus` = sending/sent/waiting/answered/failed → Vorlage für den T3-Status |
| Route-Mount | `apps/server/src/connect/routes.ts` Z. 353/366 | bestehende T3-Routen |

---

## 6. Event-Mapping T3 → Connect

T3 liefert Domain-Events (`OrchestrationV2DomainEvent`). A06 übersetzt sie in `ConnectChatEvent`.

| T3-Event | ConnectChatEvent | Was der Nutzer sieht |
|---|---|---|
| `message.updated` | `text_delta` / `text_done` | Assistenten-Text, live |
| `turn_item.updated` | `tool` | Tool-Zeile (`tool-line.tsx`) |
| `command_output.delta` | `tool` (Output-Update) | ausklappbare Befehlsausgabe |
| `runtime_request.updated` | `approval` | Freigabe-Karte „Darf Codex `npm test` ausführen?" |
| `plan.updated` | `plan` | Plan-Fortschritt |
| `subagent.updated` | `subagent` | Sub-Agent-Status |
| `turn.terminal` (aus Run-Status abgeleitet) | `turn_end` | fertig / Fehler |
| `context-handoff.updated`, `context-transfer.created` | `context_switch` | Trennlinie „Neues Kontextfenster · Zusammenfassung" |
| `provider-turn.updated` (Token-Nutzung) | `usage` | Zähler, speist das Usage-Ledger |

**Vorwärtskompatibilität:** unbekannte Event-Typen werden verworfen, nicht als Fehler geworfen
(`isConnectChatEvent` im Vertrag). Die Zuordnung liegt als Tabelle `T3_EVENT_TO_CONNECT` vor.

---

## 7. Routen

Alle Pfade sind **relativ** zum Mount `/api`, den A37 in `apps/server/src/app.ts` setzt.

| Route | Methode | Zweck | Lane |
|---|---|---|---|
| `/api/t3/status` | GET | Sidecar erreichbar? Version? Contract kompatibel? Provider-Liste | A02/A03 |
| `/api/t3/providers` | GET | Provider-Status (Cache 30 s) | A04 |
| `/api/t3/thread-map` | GET | Agent ↔ Thread-Zuordnung | A11 |
| `/api/t3-agents/:agentId/messages` | POST | Nachricht senden → Turn starten | A11 |
| `/api/t3-agents/:agentId/stream` | GET (SSE) | Live-Events des Chats | A12 |
| `/api/t3-agents/:agentId/control` | POST | Stopp / Nachsteuern / Einreihen | A13 |
| `/api/t3-agents/:agentId/approvals` | POST | Freigabe beantworten | A13 |
| `/api/t3-agents/:agentId/thread` | GET | Thread-Snapshot (Verlauf) | A11 |
| `/api/usage/t3` | GET | Nutzung (Cost/Tokens/Limits), Filter | A17 |
| `/api/companies/:companyId/public-usage` | GET | öffentliche Summen (nur Summen!) | A20 |
| `/api/machines`, `/api/machines/:machineId` | GET/POST | Cua-Maschinen | A19 |
| `/api/agents/:agentId/avatar` | GET/POST | Maskottchen | A31 |
| `/api/t3/fleet` | GET | Flotten-Ansicht (40 Agenten) | A36 |

---

## 8. Datenhaltung

### Zwei Quellen, klare Regel

- **T3 ist die Quelle für Turn-Inhalt.** Threads, Messages, Tool-Schritte, Freigaben liegen im
  T3-Event-Store.
- **Connect speichert nur die Zuordnung und eine Kopie.** `t3_thread_map` (agent_id, channel_id,
  t3_thread_id, generation) plus das Usage-Ledger.

Datenbank-Schema und Migrationen belong **allein A05** (`apps/server/src/db/schema/t3.ts`,
`apps/server/drizzle/<nr>_t3_*.sql`, `RESERVATIONS.md`). Kein anderer Agent legt Tabellen an.

Vorgesehene Tabellen (A05): `t3_thread_map`, `agent_workspace`, `usage_ledger`,
`company_usage_settings`, `machine`, `agent_machine`, `agent_avatar`, `context_generation`.

### Dateien

| Ort | Inhalt |
|---|---|
| `%LOCALAPPDATA%\ConnectAgents\t3-home` | eigenes T3-Home (Sidecar) |
| `%LOCALAPPDATA%\ConnectAgents\workspaces\<agentSlug>` | Arbeitsordner je Agent |
| `%LOCALAPPDATA%\ConnectAgents\logs\t3-sidecar.log` | Sidecar-Log (ohne Secrets) |

---

## 9. Betriebsregeln

1. **Nur Loopback.** Sidecar bindet auf 127.0.0.1. Kein Remote-Flag.
2. **Keine Secrets im Browser.** Bridge-Token, API-Keys, CLI-Credentials bleiben serverseitig (A10).
   Keys gibt Stefan nur in der UI ein.
3. **Kein Fallback zwischen Laufzeiten.** `t3` → `cli` → `cloud` findet nicht automatisch statt.
4. **Zwei Datenquellen, eine Wahrheit.** Turn-Inhalt aus T3, Zuordnung in Connect.
5. **Kein Löschen.** Altes hinter Flag behalten; `cli-bridge`-Route bleibt parallel bestehen.
6. **Upstream-Drift.** Die Brücke wird gegen eine **gefixte** Fork-Version gebaut; die
   Contract-Version des Sidecars wird geprüft und bei Abweichung gemeldet (`contractCompatible`).
7. **Lastschutz.** Monitor (A09) startet keine neuen Turns bei CPU > 85 %, RAM < 4 GB, Platte < 20 GB.
   Laufende Turns werden nicht abgebrochen.
8. **40 Agenten.** Scheduler (A08) erlaubt 4–6 aktive Turns (Default 5), Rest in Warteschlange,
   pro Provider eigenes Limit.

---

## 10. Bekannte Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| T3 ändert sich nightly | Contract-Version pinnen und prüfen; feste Fork-Version |
| Zwei Serverprozesse | Sidecar-Start gehört in den Connect-Starter; Port 3101 nur von A40 neu starten |
| Bundle-Falle | Änderungen müssen auch in `apps\connect-app\runtime\connect` landen — nur A40 |
| Web/Vercel-Version | T3-Agenten dort als „nur am PC verfügbar" markieren |
| CLI-Prozesse sind RAM-hungry | Scheduler + Leerlauf-Stopp + Sleep-Modus |
| Informationsverlust bei Kontextrotation | Zusammenfassung sichtbar und editierbar; alte Threads bleiben lesbar |
| Muster- und Designrecht Maskottchen | Code MIT (© Jérémy Perret); x.ai-Design NICHT lizenziert → privat/intern nutzen oder für öffentlich abwandeln |

---

## 11. Offene Entscheidungen (Antwort von Stefan nötig)

1. Wie viele Agenten dürfen gleichzeitig arbeiten? (Default 5)
2. RAM/CPU von Stefans PC — bitte bestätigen.
3. Kontextrotation: Zusammenfassung sichtbar (Empfehlung) oder unsichtbar? Schwelle fix 100.000?
4. Cua-Auto-Installation: ohne Rückfrage oder nach Zustimmung im Onboarding? Linux- oder Windows-Sandbox?
5. Firmen-Token öffentlich: standardmäßig an (mit Opt-out) oder aus? Kosten in $ zeigen?
6. Maskottchen: nur intern im x.ai-Look oder für die öffentliche Version abwandeln?
7. Helium: gekoppeltes Fenster (machbar) oder echte Einbettung (groß)?
8. Gibt es eine Liste mit 40 konkreten Ideen? (bisher nur 12 Punkte im Ideen-Dokument)
