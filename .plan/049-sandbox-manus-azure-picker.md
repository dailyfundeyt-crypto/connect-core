# 049 — Sandbox Manus Cloud + Azure Cloud + Auto-open task_url

## Caller wording

> Bevorzugte Sandbox ist Manus, aber Azure hat mehr Features — nicht nur Chrome-Sandbox, sondern ein ganzer PC.

## Product

Computer-Picker zeigt **zwei** Cloud-Optionen statt einer „Sandbox cloud“:

| Option | Runtime | Was | Key |
| --- | --- | --- | --- |
| **Manus Cloud** (bevorzugt) | `manus` | Manus Open API + Watch über `task_url` / `share_url` in Lab Voll-Chrome | Manus API-Key |
| **Azure Cloud** | `cloud` | Anchor / Oracle Remote-Box — ganzer PC | Anchor (`browserUse`) |

Unverändert darunter: **Sandbox lokal** (Ubuntu-Docker) und **Smartphone** (ADB/scrcpy).

Ohne Manus-Key: Manus-Zeile grau + Hinweis „unter Agent → API-Keys hinterlegen“.  
Ohne Anchor-Key: Azure analog.

## Auto-open task_url

Bei `task.create` via `/api/manus`:

1. Request setzt `share_visibility: "public"` — `share_url` ist ohne interaktives Manus-Login watchbar.
2. Watch-URL = `share_url` falls vorhanden, sonst `task_url`.
3. Connect öffnet die URL automatisch in Host-Chrome mit **dediziertem Manus-Profil** (`…/agents/{agentId}/manus`, `profileKind: "manus"`) — Lab Voll-Chrome (`engine: full` / Plan 041), kein Custom-Screencast, kein Screenshot-Polling-UI.

Polling `task.listMessages` bleibt für Chat/Status; Zusehen = Browser auf der URL.

## Out of scope

- Custom Video-/Screencast-Player
- Azure remote-box Internals außer Label/Default
- Remote-Control der Manus Cloud Browser per API (gibt es nicht — siehe [050](./050-manus-hilfe-copilot.md))

## Smoke

1. Manus-Key setzen → Computer-Menü: Manus Cloud wählbar, „bevorzugt“.
2. Manus-Key entfernen → Zeile disabled + API-Keys-Hint.
3. Azure ohne Anchor-Key → disabled + Hint; mit Key → Anchor live iframe wie zuvor.
4. Chat-Turn mit Manus API → neue Task → Chrome öffnet share/task URL im Manus-Profil.
5. PC + Smartphone unverändert startbar.

## Files

- `app/src/lib/agents/agent-computer.ts` — runtime `manus` + Labels
- `app/src/lib/agents/agent-browser.ts` — Manus-Boot / Azure-Texte
- `app/src/lib/agents/manus-api.ts` — create + auto-open
- `app/src/lib/ui/lab-prefs.ts` + `server/.../routes.ts` — `profileKind: manus`
- UI: `agent-browser-menu`, `agent-browser-mode`, `composer-plus-menu`, `computer-view-panel`
