# 021 — No middle agent rail; agents in SidebarContent

**Datum:** 2026-09-21

## Problem

Opening Flux showed a second middle column with all company agents. That
duplicates the left sidebar and is not needed.

## Fix

| Vorher | Nachher |
| --- | --- |
| Company L2: Agent-Liste in der Mitte | L2 = normale Sidebar (Agents + Channels) |
| Profil nur über Level-Seite | **Company profile** im Unternehmens-Switcher |
| — | Rechtsklick auf Agent/Channel → Company profile |

- `CompanyAgentsNav` in `SidebarContent`
- L2 ohne `?profile=` redirectet nach `/`
- `?profile=true` zeigt nur das X-Profil (kein Agent-Rail)
