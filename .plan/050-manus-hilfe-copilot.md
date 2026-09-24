# 050 — Manus „Hilfe“ Co-Pilot + dediziertes Browserprofil

## Feasibility (keine erfundenen APIs)

| # | Frage | Ergebnis |
| --- | --- | --- |
| **(a)** | Menschliche Nachricht in laufenden Task? | **JA** — `POST /v2/task.sendMessage`; bei Action-Waits `task.confirmAction` mit `waiting_for_event_id` |
| **(b)** | Manus Cloud Browser remote per API steuern? | **NEIN** — kein öffentlicher CDP/Stream. „Take Over“ nur in der manus.im Product-UI. `needConnectMyBrowser` / `browser.onlineList` = **lokaler** Browser-Operator, nicht Manus-Cloud-CDP |
| **(c)** | Signal „Agent braucht Hilfe“? | **JA** — `task.listMessages` → `agent_status: waiting` (+ Ask/Confirm-Payloads). Hilfe-Button pulst; Take-Over bleibt in manus.im |

## Product

Während Connect die `task_url` / `share_url` im Lab beobachtet:

1. **Hilfe**-Button auf der Manus-Lab-Fläche; pulst bei `waiting`.
2. Klick → gleiche URL im **interaktiven** Voll-Chrome mit Connects **dediziertem Manus-Profil** (Cookies der manus.im-Session dieses Bots).
3. Optional Connect-Bridge: Frage + Antwort → `/api/manus` → `sendMessage` / `confirmAction`.

Kein Custom-Screencast, kein behauptetes Cloud-Browser-CDP.

## Dediziertes Manus-Browserprofil (Pflicht)

Manus erlaubt nur **eine Anmeldung pro E-Mail**. Geteilte Profile würden Sessions anderer Bots überschreiben.

Lösung:

```
~/.connect-chrome-profile/{user}/agents/{agentId}/manus/
```

- Ein persistentes Profil **pro Bot**, nie geteilt mit dem allgemeinen Agent-Chrome-Profil oder anderen Bots.
- Erstellt/wiederverwendet beim ersten Manus-Job oder Hilfe-Klick (`open-chrome` mit `profileKind: "manus"`).
- Cookies/Session überleben App-Neustart; fremde Profile bleiben unangetastet.

## Workaround für (b)

Co-Pilot = Caller arbeitet **in manus.im selbst** (Chat rechts / Browser links) im eingeloggten Dediziert-Profil. Connect steuert nur API-Follow-ups, nicht den Cloud-Browser-Pixelsstream.

## Files

- `app/src/components/agents/manus-hilfe-panel.tsx`
- `app/src/components/agents/computer-view-panel.tsx` — Manus-Fläche + Hilfe
- `app/src/lib/agents/manus-api.ts` — waiting-Derive, send/confirm, openManusTaskInLab
- `server/src/connect/routes.ts` — `profileKind: manus`
