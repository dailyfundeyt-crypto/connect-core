# 020 — Levels: L2 is the workspace

**Datum:** 2026-09-21

## Regel

Die aktuelle Arbeitsumgebung (Channels, Bots, Chat, Create, Search) gehört
**nur zu Level 2**. L1 und L3 sind eigene Shells — nicht dieselbe Sidebar.

| Level | Shell | Inhalt |
| --- | --- | --- |
| **L1** | Slim chrome (Company + L-Chips + Hinweis) | CRM / Dashboard / Arc (Platzhalter) |
| **L2** | Volle App-Sidebar (Roster) | Channels, Bots, Chat; Company-Overview unter `/company?level=2` |
| **L3** | Slim chrome | Agent-Fokus unter App-Ordnern |

## Bedienung außerhalb von L2

- **Unternehmen bearbeiten** → Settings → Companies (auch vom Slim-Chrome und Company-Switcher „Manage companies“)
- **Workspace (Channels/Bots)** → L2 wählen oder „Open Level 2 workspace“
- Aktives Level liegt in `localStorage` (`connect.activeLevel`)

## Dateien

- `app/src/lib/companies/level.ts`
- `app/src/routes/_authed/_app.tsx`
- `app/src/components/companies/company-level-chips.tsx`
- `app/src/components/companies/level-chrome-sidebar.tsx`
