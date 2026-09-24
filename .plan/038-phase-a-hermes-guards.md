# Phase A — Hermes Loop-Guards

Umsetzung von [037](./037-gesamtplan-weiter.md) Phase A im laufenden Connect-Bot.

## Was drin ist

1. **Hermes-Profil** — `shared/hermes-profile.ts`
   - Default-Tool-Allowlist (Computer + `hermes_plan` + Gallery-Decisions)
   - MCP-Refs (`server/tool`) bleiben über Grants freigeschaltet
   - Skill-Ordner-Konvention dokumentiert (`skills/<slug>/SKILL.md` …)

2. **Hermes-Guidance** — `shared/bot-prompt.ts` → `HERMES_GUIDANCE`
   - Plan → Tool → Observe → Reply
   - Interrupt bei neuer Nachricht
   - Compact-Nudge bei Context-Limit
   - Eingebunden in built-in Prompt-Assembly und standing role (`server/src/copilot.ts`)
   - Server-Tools laufen durch `filterHermesTools`

3. **Interrupt on send** — Channel-Composer
   - `interruptWhileBusy` statt Queue: neue Nachricht stoppt den laufenden Turn und startet sofort
   - Send-Label: „Send and stop current“

4. **Sichtbarer Mini-Plan** — `hermes_plan` Frontend-Tool
   - Ziel + Steps mit Status (pending / doing / done / blocked)
   - Registriert in `CopilotProvider`

5. **Shell Ask-Gate** — `computer_run_command`
   - Default **Ask** (Allow / Deny / Allow always)
   - Persistenz: `localStorage` `connect.computer-shell-permission`
   - UI: Settings → MCP → Computer → Shell commands

## Done-Kriterium (037)

Ein Agent zieht einen Multi-Tool-Turn durch; du kannst ihn mittendrin mit einer neuen Nachricht stoppen; Shell-Befehle fragen nach.

## Nicht in A (kommt später)

- Phase B Codex-Bridge
- Wave Command-Blocks
- Context-Compress als echte Truncation (nur Prompt-Nudge)
- Per-Agent Allowlist in der DB (jetzt Default-Profil für alle)

## Nächster Schritt

**Phase B erledigt** — siehe [039](./039-phase-b-codex-bridge.md).

**Phase C** — Bot-CLI als Block-Terminal (Wave).
