# LANES — Zuständigkeiten der 40 Pakete

Eigentümer: **A01** (Architekt & Verträge) · Stand 29.10.2026.

Diese Datei ist die **verbindliche** Lane-Tabelle für das Projekt „T3-Backend in Connect".
Sie stammt aus `MASTERPLAN-40-AGENTEN.md` und ist unverändert übernommen.

---

## Grundregel

- Arbeite **nur** in deiner Lane. Alles andere nur **lesen**.
- Braucht ein Agent eine Änderung außerhalb der Lane, schreibt er sie als **Wunsch in seinen Bericht**
  (`docs/t3/reports/Axx.md`) — er ändert die Datei nicht selbst.
- Neue Funktionen entstehen in **neuen Dateien**. Gemeinsame Bestandsdateien gehören genau
  **einem** Verdrahtungs-Agenten (A37–A39).
- Vor jeder Änderung an einer bestehenden Datei: Sicherung `<datei>.bak-helium-<datum>`.

---

## Lane-Tabelle

| Nr | Name | Welle | Lane (darf ändern) | Abhängig von | Ideen |
|---|---|---|---|---|---|
| A01 | Architekt & Verträge | W0 | `apps/server/src/t3-bridge/contracts.ts`<br>`apps/app/src/lib/t3/contracts.ts`<br>`docs/t3/ARCHITEKTUR.md`<br>`docs/t3/LANES.md`<br>`docs/t3/T3-INTEGRATION-UEBERSICHT.md`<br>`docs/t3/MASTERPLAN-40-AGENTEN.md`<br>`docs/t3/reports/A01.md` | – | – |
| A02 | T3-Sidecar-Supervisor | W1 | `apps/server/src/t3-bridge/sidecar/**`<br>`tools/t3-sidecar/**`<br>`docs/t3/reports/A02.md` | A01 | – |
| A03 | T3-RPC-Client | W1 | `apps/server/src/t3-bridge/rpc/**`<br>`docs/t3/reports/A03.md` | A01 | – |
| A04 | Provider-Registry & CLI-Status | W1 | `apps/server/src/t3-bridge/providers/**`<br>`docs/t3/reports/A04.md` | A01, A03 (Mock erlaubt) | – |
| A05 | Datenbank-Schema (alle neuen Tabellen) | W1 | `apps/server/src/db/schema/t3.ts`<br>`apps/server/drizzle/<reservierte Nummer>_t3_*.sql`<br>`apps/server/drizzle/RESERVATIONS.md`<br>`docs/t3/reports/A05.md` | A01 | – |
| A06 | Event-Übersetzer T3 → Connect-Chat | W1 | `apps/server/src/t3-bridge/translate/**`<br>`docs/t3/reports/A06.md` | A01 | – |
| A07 | Workspace-Manager (Ordner pro Agent) | W1 | `apps/server/src/t3-bridge/workspaces/**`<br>`docs/t3/reports/A07.md` | A01, A05 | – |
| A08 | Scheduler & Gleichzeitigkeit | W1 | `apps/server/src/t3-bridge/scheduler/**`<br>`docs/t3/reports/A08.md` | A01 | – |
| A09 | Ressourcen-Monitor (PC-Last) | W1 | `apps/server/src/t3-bridge/monitor/**`<br>`docs/t3/reports/A09.md` | A01 | – |
| A10 | Brücken-Auth & Geheimnisse | W1 | `apps/server/src/t3-bridge/auth/**`<br>`docs/t3/reports/A10.md` | A01 | – |
| A11 | Nachrichten & Threads | W2 | `apps/server/src/t3-bridge/threads/**`<br>`apps/server/src/t3-bridge/routes/messages.ts`<br>`docs/t3/reports/A11.md` | A03, A05, A06, A07, A08, A10 | I5 |
| A12 | Live-Stream (SSE) | W2 | `apps/server/src/t3-bridge/stream/**`<br>`apps/server/src/t3-bridge/routes/stream.ts`<br>`docs/t3/reports/A12.md` | A03, A06 | – |
| A13 | Turn-Steuerung & Freigaben | W2 | `apps/server/src/t3-bridge/routes/control.ts`<br>`apps/server/src/t3-bridge/routes/approvals.ts`<br>`apps/server/src/t3-bridge/control/**`<br>`docs/t3/reports/A13.md` | A03, A11 | – |
| A14 | Token-Sparen | W2 | `apps/server/src/t3-bridge/token-saving/**`<br>`docs/t3/reports/A14.md` | A03, A06, A17 (Mock erlaubt) | Token-Sparen (bestätigt) |
| A15 | Kontext-Rotation alle 100.000 Tokens | W2 | `apps/server/src/t3-bridge/context/rotation/**`<br>`docs/t3/reports/A15.md` | A11, A16, A17 | I5, Kontext-Management (bestätigt) |
| A16 | Komprimierungs-Sub-Agent | W2 | `apps/server/src/t3-bridge/context/summarizer/**`<br>`docs/t3/reports/A16.md` | A03 | I5 |
| A17 | Usage-Ledger & Usage-API | W2 | `apps/server/src/t3-bridge/usage/**`<br>`apps/server/src/t3-bridge/routes/usage.ts`<br>`docs/t3/reports/A17.md` | A03, A05 | I1, Nutzung |
| A18 | Anhänge & Dateien | W2 | `apps/server/src/t3-bridge/attachments/**`<br>`docs/t3/reports/A18.md` | A03, A07 | – |
| A19 | Cua-Maschinen-Backend | W2 | `apps/server/src/cua/**`<br>`tools/cua/**`<br>`docs/t3/reports/A19.md` | A01, A05 | I11 |
| A20 | Firmen-Token-Aggregation (öffentlich) | W2 | `apps/server/src/company-usage/**`<br>`docs/t3/reports/A20.md` | A05, A17 | Firmenprofil |
| A21 | Frontend-Client & Hooks | W3 | `apps/app/src/lib/t3/**`<br>`docs/t3/reports/A21.md` | A01 (W2 als Mock) | – |
| A22 | T3-Chat-Bausteine | W3 | `apps/app/src/components/channels/t3/**`<br>`docs/t3/reports/A22.md` | A21 | I5 |
| A23 | CLI-Auswahl-Tausch (gleiche Stelle, gleicher Look) | W3 | `apps/app/src/components/agents/t3-cli-selector/**`<br>`docs/t3/reports/A23.md` | A01, A04, A21 | CLI-Tausch |
| A24 | Volle Nutzungsansicht (Cost / Tokens / Limits) | W3 | `apps/app/src/components/usage-t3/**`<br>`docs/t3/reports/A24.md` | A17, A21 | I1, Nutzung |
| A25 | T3-Einstellungen in Connect-Settings | W3 | `apps/app/src/components/settings/t3/**`<br>`docs/t3/reports/A25.md` | A04, A08, A14, A15, A21 | I1, Token-Sparen, Kontext |
| A26 | Maschinen-Einstellungen & Onboarding (Cua) | W3 | `apps/app/src/components/settings/machines/**`<br>`apps/app/src/components/onboarding/machines/**`<br>`docs/t3/reports/A26.md` | A19, A21 | I11 |
| A27 | Bot-Panel mit Computer-Tab (Grok-Bot-Stil) | W3 | `apps/app/src/components/agents/bot-pane/**`<br>`docs/t3/reports/A27.md` | A19, A21, A29 | I11 |
| A28 | Agenten-Raster links (Grok-Bot-Stil) + Ordner | W3 | `apps/app/src/components/app-sidebar/agent-grid/**`<br>`apps/app/src/lib/agents/agent-folders.ts`<br>`docs/t3/reports/A28.md` | A21, A29 | I6, I3, I4 |
| A29 | Maskottchen-Engine & `<BotAvatar>` | W3 | `apps/app/src/lib/bot-avatar/**`<br>`apps/app/src/components/bot-avatar/**`<br>`docs/third-party/bloub-MIT.txt`<br>`docs/t3/reports/A29.md` | A01 | Avatar, I6 |
| A30 | Dialog „Neuen Bot erstellen" → direkt in den Chat | W3 | `apps/app/src/components/agents/create-bot-dialog/**`<br>`docs/t3/reports/A30.md` | A21, A29, A31 | Avatar, I7 |
| A31 | Avatar-Speicherung & Zufalls-Standard | W3 | `apps/server/src/agent-avatar/**`<br>`apps/app/src/lib/agents/agent-avatar.ts`<br>`docs/t3/reports/A31.md` | A05, A29 | Avatar |
| A32 | Browser seitlich andocken + T3-Browser-Vorschau | W3 | `apps/app/src/components/agents/browser-dock/**`<br>`docs/t3/reports/A32.md` | A21 | I8, I10 |
| A33 | Helium-Einbettung (Recherche + Prototyp) | W3 | `docs/helium-embed/**`<br>`tools/helium-embed/**`<br>`docs/t3/reports/A33.md` | A01 | I9 |
| A34 | Handy-Kopplung aus T3 | W3 | `apps/app/src/components/phone-t3/**`<br>`apps/server/src/t3-bridge/mobile/**`<br>`docs/t3/reports/A34.md` | A03, A10, A21 | I1, I8 |
| A35 | Firmenprofil-Widget Token-Verbrauch + Schalter | W3 | `apps/app/src/components/companies/token-usage/**`<br>`docs/t3/reports/A35.md` | A20, A21 | Firmenprofil |
| A36 | Flotten-Ansicht, 40-Agenten-Anlage & Ideen-Backlog | W3 | `apps/app/src/components/fleet/**`<br>`apps/server/src/t3-bridge/fleet/**`<br>`docs/ideen/IDEEN-BACKLOG.md`<br>`docs/t3/reports/A36.md` | A07, A08, A09, A21, A31 | 40 Agenten |
| A37 | Server-Verdrahtung | W4 | `apps/server/src/app.ts`<br>`apps/server/src/connect/routes.ts`<br>`apps/server/src/connect/t3-agents.ts`<br>`apps/server/src/t3-bridge/index.ts`<br>`docs/t3/reports/A37.md` | W1–W3 fertig, A40-Freigabe | – |
| A38 | Frontend-Verdrahtung Chat & CLI-Auswahl | W4 | `apps/app/src/components/channels/channel-chat.tsx`<br>`apps/app/src/components/channels/chat-transcript.tsx`<br>`apps/app/src/components/channels/composer/composer.tsx`<br>`apps/app/src/components/agents/agent-model-picker.tsx`<br>`apps/app/src/lib/agents/agent-cli.ts`<br>`apps/app/src/lib/agents/agent-shell.ts`<br>`docs/t3/reports/A38.md` | A22, A23, A21 | CLI-Tausch, I5 |
| A39 | Frontend-Verdrahtung Navigation, Einstellungen, Profil | W4 | `apps/app/src/components/app-sidebar/app-sidebar.tsx`<br>`apps/app/src/components/app-sidebar/user-avatar.tsx`<br>`apps/app/src/components/settings/settings-sidebar.tsx`<br>`apps/app/src/routes/_authed/settings/**`<br>`apps/app/src/lib/companies/level.ts`<br>`apps/app/src/components/companies/company-level-chips.tsx`<br>`apps/app/src/components/layout/detail-panel.tsx`<br>`apps/app/src/components/companies/company-profile-x.tsx`<br>`apps/app/src/components/agents/create-agent-dialog.tsx`<br>`apps/app/src/routes/_authed/onboarding.tsx`<br>`docs/t3/reports/A39.md` | A24–A36 | I1, I2, I3, I4, I6, I7, I11 |
| A40 | Integrator & QA (Gatekeeper) | alle Wellen | `tests/e2e/t3/**`<br>`docs/t3/QA-*.md`<br>`docs/t3/reports/A40.md`<br>`apps/connect-app/runtime/connect/**`<br>Neustart NUR Port 3101` | läuft parallel; Freigabe-Tor nach jeder Welle | – |

---

## Gemeinsam genutzte Dateien — wer darf was

| Datei | einziger Besitzer |
|---|---|
| `apps/server/src/app.ts`, `connect/routes.ts`, `connect/t3-agents.ts` | **A37** |
| `channel-chat.tsx`, `chat-transcript.tsx`, `composer/composer.tsx`, `agent-model-picker.tsx`, `agent-cli.ts`, `agent-shell.ts` | **A38** |
| `app-sidebar.tsx`, `user-avatar.tsx`, `settings-sidebar.tsx`, Settings-Routen, `level.ts`, `company-level-chips.tsx`, `detail-panel.tsx`, `company-profile-x.tsx`, `create-agent-dialog.tsx`, `onboarding.tsx` | **A39** |
| DB-Schema + Migrationen + `RESERVATIONS.md` | **A05** |
| Verträge `t3-bridge/contracts.ts`, `lib/t3/contracts.ts` | **A01** |
| Live-Kopie `apps/connect-app/runtime/connect`, Neustart Port 3101, Vercel-Preview | **A40** |

Alle anderen bestehenden Dateien: **nur lesen**.

---

## Migrationsnummer für A05

A01 trägt hier **keine** Migrationsnummer ein. Zuständig ist allein **A05**: es vergibt die
fortlaufende Nummer in `apps/server/drizzle/` und hält `apps/server/drizzle/RESERVATIONS.md` aktuell
(eigene Zeile anhängen, mit Sicherung). A05 meldet die vergebene Nummer in
`docs/t3/reports/A05.md`.

---

## Wellen

| Welle | Agenten | parallel? | Start, wenn |
|---|---|---|---|
| W0 | A01 | – | sofort |
| W1 | A02–A10 | ja (9) | A01 fertig + A40-Tor |
| W2 | A11–A20 | ja (10) | W1 fertig + A40-Tor (Mocks erlaubt, wo angegeben) |
| W3 | A21–A36 | ja (16) | A01 fertig; gegen Mock von A21 baubar, echte Anbindung nach W2 |
| W4 | A37, A38, A39 | ja (3, disjunkte Dateien) | W1–W3 fertig + A40-Tor |
| QA | A40 | begleitend | nach jeder Welle Tor; Einspielen in Live nur nach Stefans OK |

Empfehlung für die PC-Last beim **Bauen**: höchstens 6–8 Coding-Agenten gleichzeitig.
W3 in zwei Hälften (A21–A28, dann A29–A36) laufen lassen.

---

## Berichte

Jeder Agent schreibt seinen Bericht nach `docs/t3/reports/Axx.md` (gehört zur jeweiligen Lane) mit:
geänderte/neue Dateien · angelegte Sicherungen · Typecheck-Ausgabe · Testergebnis ·
**offene Wünsche an andere Lanes** · Risiken. Danach **STOPP** — kein Commit, kein Neustart.
