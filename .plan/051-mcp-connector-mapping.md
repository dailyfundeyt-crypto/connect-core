# 051 — MCP / Connector source mapping (App · Hermes · Manus)

## Goal

Drei MCP-/Connector-Quellen automatisch trennen und **harte Isolation** gegenüber Manus erzwingen.

| Quelle | Badge | Inhalt | An Manus? |
| --- | --- | --- | --- |
| **App** | `App` | Connect interne MCP (Settings-Katalog, z. B. Agentmail) | **Nie** |
| **Hermes** | `Hermes` | Hermes harness tools + Plugin-`mcp__*` grants | **Nie** |
| **Manus** | `Manus` | `GET /v2/connector.list` (`builtin` \| `byok` \| `mcp`) | Nur **ausgewählte** UUIDs |

## Hard rules

1. Badge pro Server/Connector: `App` | `Hermes` | `Manus`.
2. Manus-Task erhält **nur** Manus Connectors via `message.connectors[]` auf `task.create` / `task.sendMessage`. Kein Proxy von App-/Hermes-Tools.
3. App-/Hermes-Agents bekommen Manus Connectors **nicht**, außer der Caller mappt sie explizit (Default = kein Cross-Wiring).
4. OAuth für Manus Connectors ist **nicht** per API-Key abschließbar. Auth-Button öffnet Manus Integrations / `task_url` im **dedizierten Manus Voll-Chrome-Profil** (Plan 050). Bei `connectorOauthExpired` gleiche Re-Auth; `task.confirmAction` `{ accept: true }` setzt nur den Wait fort — Login bleibt in manus.im.

## Feasibility

| Capability | Status |
| --- | --- |
| `GET /v2/connector.list` | Ja — installierte Connectors |
| `message.connectors[]` on create/sendMessage | Ja — weglassen = User/Projekt-Defaults; bei Override nicht stillschweigend Defaults re-resolven |
| `clear_connectors: true` | Ja — wenn Auswahl leer |
| `connector.auth` via API | **Nein** — nur Web-OAuth + optional `connectorOauthExpired` |

## UI — Settings → MCP

- Multi-Select Manus Connectors (persistiert **pro Agent-Profil**).
- App- und Hermes-Listen **read-only**, nebeneinander mit Badges (nicht in Manus-Multi-Select gemischt).
- „Authentifizieren“ → dediziertes Manus-Profil (`profileKind: manus`).
- Ohne Manus-Key: Liste leer/disabled + API-Keys-Hint.

## API / Client

- `/api/manus` Proxy → `connector.list` (Client-Cache + Refresh).
- `manusMessageConnectorFields(agentId)` liefert `connectors` oder `clear_connectors`.
- Selection: `localStorage` key `connect.manus-connector-selection`.

## Files

- `app/src/lib/mcp/connector-sources.ts`
- `app/src/components/settings/mcp-connector-mapping.tsx`
- `app/src/components/settings/mcp-settings.tsx`
- `app/src/lib/agents/manus-api.ts` — connectors on create/send
- Plan 049/050 Manus-Profil reuse
