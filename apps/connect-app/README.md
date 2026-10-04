# Connect App

Eigenständiges Windows-Programm: **Helium als Browser-Rahmen, Connect eingebaut**, mit eigenem,
unsichtbarem lokalen Backend (Server + Datenbank). Kein Docker, kein Bun, keine Einrichtung nötig.

Die bisherige Variante **„Connect (Helium)“** (Desktop-Verknüpfung, `apps/helium-shell/setup/Start-Connect.cmd`,
Docker-Postgres, Dev-Server 3001/3010) bleibt unverändert und unabhängig.

## Starten
* Desktop / Startmenü: **Connect App**
* Beim Start: kleines Startfenster → Datenbank starten → Migrationen prüfen → Server starten → Helium öffnet
  ein **normales Helium-Fenster mit Toolbar**, Connect ist Start- und Neuer-Tab-Seite, die Connect-Shell-Extension
  (Sidebar, Alt+Shift+S) ist geladen.
* Zweiter Klick auf die Verknüpfung holt das vorhandene Fenster nach vorn.
* **Beenden:** alle Connect-App-Fenster schließen → Server und Datenbank werden nach ~5 s automatisch sauber gestoppt.
* Fehler: Meldung mit Log-Pfad (`%TEMP%\connect-app.log`, `connect-app-server.log`, `connect-app-postgres.log`,
  `connect-app-migrate.log`).

## Was ist drin
| Ordner | Inhalt |
|---|---|
| `Connect.exe` | Launcher (.NET 8, self-contained, kein Konsolenfenster), Icon, Startfenster, Fenster-Identität (eigene Taskleisten-Gruppe „Connect App“) |
| `helium\` | Private Kopie von Helium 0.18.2.1 (portable, x64) – unabhängig vom normalen Helium, Auto-Update im App-Profil aus |
| `extension\` | Kopie von `apps/helium-shell` (Port auf die App umgestellt) |
| `runtime\bun\` | Bun (führt den Server aus) |
| `runtime\pgsql\` | PostgreSQL 17 + pgvector (selbst gebaut) |
| `runtime\connect\` | Connect-Server (`apps/server` inkl. drizzle-Migrationen), gebaute Web-UI (`apps/app/dist`), Produktions-Abhängigkeiten |

Das Backend läuft nur, solange die App offen ist, und lauscht ausschließlich auf 127.0.0.1
(Server+UI: `http://localhost:3101`, Datenbank: Port 5544). Modus: **Single-User** (kein Login, ein Administrator).

## Daten (bleiben bei Update und Deinstallation erhalten)
`%LOCALAPPDATA%\ConnectApp\`
* `data\pgdata\` – PostgreSQL-Datenbank (Profil, Avatar, Agents, Sidebar/Browser-Einträge, Split-Links, Channels …)
* `data\connect.env` – automatisch erzeugte Secrets (DB-Passwort, `KEY_ENCRYPTION_KEY`) + optionale API-Keys. **Nicht löschen.**
* `data\backups\` – Backups (`pg_dump`, Format custom)
* `profile\` – Helium-Profil der App (Cookies, localStorage, Extension-Daten)

Erster Start: Datenbank wird angelegt und alle Migrationen laufen automatisch. Bei jedem Start werden neue
Migrationen eingespielt; ändert sich die Programmversion, wird vorher automatisch ein Backup erstellt
(`connect-auto-pre-update-*.dump`, die letzten 10 bleiben).

## Backup / Export / Wiederherstellen
* Startmenü **„Connect App - Backup erstellen“** (oder `Connect.exe --backup`) → `data\backups\connect-manual-<Zeit>.dump`
* Einfachste Komplettsicherung: App schließen, Ordner `%LOCALAPPDATA%\ConnectApp` kopieren.
* Wiederherstellen (App geschlossen):
  ```
  cd "<Installationsordner>\runtime\pgsql\bin"
  set PGPASSWORD=<CONNECT_APP_DB_PASSWORD aus connect.env>
  pg_ctl start -D "%LOCALAPPDATA%\ConnectApp\data\pgdata" -o "-p 5544" -w
  pg_restore -h 127.0.0.1 -p 5544 -U connect -d connect --clean --if-exists "<datei>.dump"
  pg_ctl stop -D "%LOCALAPPDATA%\ConnectApp\data\pgdata" -m fast
  ```

## Einstellungen (`connect-app.json` im Programmordner)
* `AppPort` (3101), `PgPort` (5544) – nur ändern, wenn belegt (Extension ist auf 3101 gebaut).
* `LoadExtension` – Connect-Shell-Extension laden (Standard: ja).
* `KeepBackendRunning` – Server/DB nach dem Schließen weiterlaufen lassen (schnellerer Neustart).
* `RemoteUrl` – später: gehostetes Connect (z. B. `https://connect.example.com/`) statt lokalem Backend.
* API-Keys (OpenAI, CopilotKit Intelligence, Composio …) bei Bedarf in `%LOCALAPPDATA%\ConnectApp\data\connect.env` eintragen.

## Kommandozeile
`Connect.exe` (Start) · `--stop` (alles beenden) · `--backup` · `--open-data` · `--install` (Verknüpfungen neu anlegen)

## Für Entwickler: Installer bauen
`powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-installer.ps1 -Version 1.1.0`
synchronisiert aus der Kopie (Web-UI, Server, Migrationen, Extension), führt den **Secrets-Scan** aus und baut
`dist\ConnectApp-Setup-<Version>.exe` (Inno Setup). Voraussetzungen nur auf dem Bau-PC: .NET 8 SDK, Bun, Inno Setup,
`_build\pgsql` (PostgreSQL 17 Binaries + pgvector, mit MSVC gebaut – siehe `tools\build-bundle.ps1`).
