# T3-Sidecar Werkzeuge (Lane A02)

Werkzeuge zur Steuerung und Überwachung des T3-Sidecar-Hintergrundprozesses für Connect.

## Übersicht der Skripte

| Skript | Zweck | Beispiel |
|---|---|---|
| `start.ps1` | Startet den T3-Sidecar auf `127.0.0.1:3773` (im Vordergrund oder minimiert mit `-Background`) | `powershell -File tools/t3-sidecar/start.ps1 [-Background]` |
| `stop.ps1` | Stoppt **ausschließlich** den Sidecar-Prozess (anhand des gemerkten PIDs) | `powershell -File tools/t3-sidecar/stop.ps1` |
| `status.ps1` | Prüft Prozesszustand, Port und HTTP-Erreichbarkeit | `powershell -File tools/t3-sidecar/status.ps1` |
| `run.ts` | Cross-Platform CLI-Wrapper für Bun/Node | `bun tools/t3-sidecar/run.ts [start\|stop\|status\|health]` |

## Pfade & Isolation

- **T3-Home:** `%LOCALAPPDATA%\ConnectAgents\t3-home` (vollständig getrennt von Stefans `~/.t3` / `~/.t3-hermes`)
- **Runtime-Datei:** `%LOCALAPPDATA%\ConnectAgents\t3-home\userdata\server-runtime.json`
- **Logdatei:** `%LOCALAPPDATA%\ConnectAgents\logs\t3-sidecar.log`
- **Bindung:** Ausschließlich `127.0.0.1` (Standard-Port 3773, bei Belegung automatischer nächster freier Port)

## Sicherheitsregeln

1. Die Skripte berühren **niemals** den Connect-Server auf Port 3101, Docker oder OpenBot-v2.
2. `stop.ps1` prüft explizit, ob die zu beendende PID der Connect-Server ist, und bricht im Zweifel sofort ab.
3. Sämtliche Logausgaben filtern sensible Tokens und Keys automatisch heraus (`[REDACTED]`).
