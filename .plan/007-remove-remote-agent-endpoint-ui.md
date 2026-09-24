# 007 — Remote Agent-Endpoint UI entfernt

**Datum:** 2026-09-21

## Ziel

UI-Felder entfernen, die Connect noch an externe AG-UI-Server koppeln
(„Agent endpoint“, Test-Button, optionaler Auth-Key).

## Änderungen

- `create-agent-dialog.tsx`: Step „Where does it run?“ / Managed entfernt;
  Wizard nur noch Identity + Visibility; Create immer mit leerem Endpoint
- `form.ts` `agentInputFrom`: `endpoint` immer `""`, kein Auth-Header mehr
- `agent-dialog.tsx` ConnectionSection: nur noch lokaler Hinweis, kein Endpoint /
  Callback-Token-Panel

## Bewusst nicht

- Server-APIs für remote agents bleiben im Code (Tests/Legacy); UI bietet sie nicht mehr an
- Desktop `HarnessPicker` unberührt (eigenes Surface)
