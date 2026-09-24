# 017 — Watch Bot's screen → Ubuntu sandbox browser

**Datum:** 2026-09-21

## Ziel

Der Monitor-Button („Watch this Bot's screen“) soll einen **echten, steuerbaren
Browser** zeigen — in einer **Ubuntu-Sandbox** pro Bot, nicht einen leeren
Shared-Computer ohne Token.

## Was fehlte

- `COMPUTER_TOKEN` und `SUPERVISOR_TOKEN` in `.env` waren leer → API bekam
  `Not authorised` von `agent-computer` (503 auf `/screenshot`).
- `COMPUTER_SUPERVISOR_URL` war leer → Server im **shared**-Modus statt
  **ein Container pro Bot**.
- Browser-Modus war headless; für Take-the-wheel / echte Sites → **headed**
  auf privatem Xvfb.

## Lösung

| Variable | Wert |
| --- | --- |
| `COMPUTER_TOKEN` | `connect-dev-computer-token` (Compose-Default) |
| `SUPERVISOR_TOKEN` | `connect-dev-supervisor-token` |
| `COMPUTER_SUPERVISOR_URL` | `http://127.0.0.1:4500` |
| `COMPUTER_BROWSER_MODE` | `headed` |

Der Supervisor startet pro Bot einen Ubuntu-24.04-Container
(`connect-computer-<botId>`) mit Chromium. Watch → `ComputerView` →
`/api/computers/:botId/screenshot` → Gateway `/ensure` → Screenshot/Stream.

## Code

- `agent-computer`: kurze Retries bei Screenshot, weil headed Chromium auf
  frischem Xvfb oft erst nach dem ersten CDP-Capture paint-ready ist.

## Verifiziert

- Isolation-Log: `provider: Docker supervisor`, `one computer per Bot`
- Navigate `example.com` + Screenshot ok
- Container OS: Ubuntu 24.04.5 LTS, `browserMode: headed`
