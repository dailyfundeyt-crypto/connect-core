# 018 — Bots immer privat

**Datum:** 2026-09-21

## Ziel

Beim Erstellen eines Bots soll Public vs. Private keinen Unterschied machen —
beides landet direkt als **privat**.

## Änderungen

- Create-Dialog: schon ohne Visibility-Schritt; `visibility: "private"` beim Submit
- `agentInputFrom`: immer `private` (auch wenn ein älterer Client `public` schickt)
- API `parseAgentInput`: akzeptiert `public`/`private`, speichert immer `private`
- Visibility-Zeile aus dem Agent-Dialog entfernt
- Profil-Tag zeigt immer „Private“
- Bestehende `public`-Profile in der DB auf `private` gesetzt
