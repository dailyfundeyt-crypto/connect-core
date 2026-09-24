# 013 — Company Levels L1 / L2 / L3

**Datum:** 2026-09-21 · **Update:** siehe auch Plan 020

## Mapping

| Level | Jetzt | Später |
| --- | --- | --- |
| **L1** | Eigene Shell (kein Channel-Roster) — leere CRM-Fläche | CRM, Dashboard, Unterseiten, Arc Browser |
| **L2** | Volle Arbeitsumgebung: Sidebar mit Channels/Bots/Chat (+ Company-Overview) | bleibt der Workspace |
| **L3** | Eigene Shell — Agent-Fokus unter App-Ordnern | konzentriertes Arbeiten mit einzelnen Mitarbeitern |

Default: **L2**. Umschalten über **L1 / L2 / L3** neben dem Company-Namen.

L1/L3 zeigen **nicht** die L2-Arbeits-Sidebar. Funktionen wie Channel-Chat und Bot-Roster nur unter L2; Unternehmen bearbeiten über Settings.

## Dateien

- `app/src/lib/companies/level.ts`
- `app/src/routes/_authed/_app.tsx`
- `app/src/routes/_authed/_app/company/$companyId.tsx`
- `app/src/components/companies/company-level-chips.tsx`
- `app/src/components/companies/level-chrome-sidebar.tsx`
- `app/src/components/companies/company-switcher.tsx`
