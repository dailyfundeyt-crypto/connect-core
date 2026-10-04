# Connect: Backup, Wiederherstellen, Supabase-Import

## Tägliches Backup (Google Drive)
* Script: `apps\helium-shell\setup\Backup-Connect.ps1`, geplanter Task **„Connect Backup (Google Drive)“**:
  täglich 03:00 + bei Anmeldung (+5 min), verpasste Läufe werden nachgeholt, höchstens ein Backup pro 20 h.
* Ziel: `H:\Meine Ablage\Connect-Backups\connect-backup-<Zeit>.zip.aes`, die neuesten **14** bleiben.
  Log: `%TEMP%\connect-backup.log`.
* Inhalt (ZIP, dann AES-256 + HMAC verschlüsselt):
  * `copy.sql`: DB der Kopie laut `.env` DATABASE_URL (heute Docker 5433, nach dem Umstellen Supabase)
  * `supabase.sql`: Supabase connect-core (public + drizzle)
  * `app.sql`: installierte Connect App (5544), wenn sie läuft, sonst `app-snapshot.dump` (neuestes App-Backup)
  * `manifest.json`: Zeilenzahlen pro Tabelle
* Passwort: liegt DPAPI-geschützt in `%LOCALAPPDATA%\Connect\backup-password.dpapi`, nur dieses Windows-Konto
  auf diesem PC kann es lesen.
  **Einmal `Backup-Connect.ps1 -ShowPassword` ausführen und das Passwort in den Passwort-Manager legen.**
  Ohne das Passwort sind die Backups auf einem anderen PC nicht lesbar.
* Nicht enthalten: Secrets aus `.env`, `.env.supabase`, `%LOCALAPPDATA%\ConnectApp\data\connect.env`.
  Den Wert `KEY_ENCRYPTION_KEY` gehört ebenfalls in den Passwort-Manager, denn ohne ihn lassen sich die im
  Tresor verschlüsselten Schlüssel nicht entschlüsseln. Ebenfalls nicht enthalten: Browser-localStorage.
* Sofort-Backup: `powershell -ExecutionPolicy Bypass -File Backup-Connect.ps1`
* Task entfernen: `Backup-Connect.ps1 -Unregister`

## Wiederherstellen
```
cd apps\helium-shell\setup
powershell -ExecutionPolicy Bypass -File Restore-Connect.ps1                        # nur entschlüsseln/auspacken
powershell -ExecutionPolicy Bypass -File Restore-Connect.ps1 -Restore -Source copy -Into copy
powershell -ExecutionPolicy Bypass -File Restore-Connect.ps1 -Restore -Source copy -Into copy -Replace
```
* Ohne `-Replace` landet alles in einer **neuen** DB `connect_restore_<Zeit>`, die Zeilenzahlen werden mit
  `manifest.json` verglichen. Die aktive DB bleibt unberührt.
* Mit `-Replace` (Server vorher stoppen, Rückfrage „JA“) wird die aktive DB in `connect_before_restore_<Zeit>`
  umbenannt, nicht gelöscht.
* Andere Optionen:
  * Anderes Backup: `-BackupFile "<pfad>"`
  * Anderer PC: `-AskPassword`
  * Connect App als Ziel: `-Source app -Into app`, die App muss dabei laufen.
* Nach dem Restore den Ordner `backups\restore-<Zeit>` löschen, denn er enthält Klartext.
* Supabase wiederherstellen: zuerst nach lokal zurückspielen (`-Into copy -Replace`), dann
  `Import-LocalToSupabase.ps1` ausführen. Das funktioniert nur, wenn das Ziel keine Benutzer hat (frisches
  Projekt oder geleerte Tabellen).

## Lokal → Supabase (einmalig, nur nach OK)
```
powershell -ExecutionPolicy Bypass -File Import-LocalToSupabase.ps1           # Probelauf mit Rollback
powershell -ExecutionPolicy Bypass -File Import-LocalToSupabase.ps1 -Commit   # echter Import
```
* Der Import muss **vor der ersten Anmeldung** auf dem gehosteten Connect laufen. Das Script bricht ab, wenn
  Supabase schon Benutzer hat.
* Vorher sichert das Script beide Seiten nach `backups\` und legt einen Data-only-Dump an.
* Danach läuft alles in einer Transaktion. COMMIT gibt es nur, wenn jede Tabelle „Ziel vorher + Dump“ Zeilen
  hat, und danach folgt eine zweite Zählung.

## Danach auf Supabase umstellen
* **Lokaler Server der Kopie:** in `.env` diese Werte aus `.env.supabase` übernehmen: `DATABASE_URL`,
  `KEY_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `AGENT_TOOL_TOKEN`. Dazu `DATABASE_POOL_MAX=6` setzen. Danach den
  Server neu starten. Desktop und Web teilen sich dann dieselben Daten.
* **Helium-Fenster („Connect (Helium)“):** `Set-ConnectUrl.cmd https://connect-kunc-preview.vercel.app`
  (später die Produktions-URL) bzw. zurück mit `Set-ConnectUrl.cmd http://localhost:3010`.
* **Connect App:** `RemoteUrl` in `connect-app.json` (vorgesehen, siehe apps/connect-app/README.md).


## Stand 04.10.2026: drei Sicherungswege

### 1. Lokal, stündlich (Sicherheitsnetz)
- Skript `Backup-Connect-Local.ps1`, Aufgabe „Connect Backup (lokal, stuendlich)“ (stündlich + 10 Min. nach Anmeldung).
- `pg_dump -Fc` der Connect-App-DB (Port 5544) und der Kopie-DB (5433) nach `Documents\Connect-Backups\{app,copy}`, jede Datei mit `pg_restore --list` geprüft, Zeilenzahlen in `.rows.txt`.
- Unveränderte Daten werden nicht doppelt gespeichert. Aufbewahrung: neueste 48 + eine pro Tag für 30 Tage. Log: `Documents\Connect-Backups\backup.log`.
- Test: `Backup-Connect-Local.ps1 -RestoreTest` (spielt in eine Temp-DB ein, vergleicht, löscht sie wieder).

### 2. Google Drive für Desktop (H:)
- `Backup-Connect.ps1`, Aufgabe stündlich (`-IfDue -DueHours 0.9`) + 5 Min. nach Anmeldung, Zeitlimit 30 Min.
- Ziel `H:\Meine Ablage\Connect-Backups\connect-backup-<Zeit>.zip.aes` (AES + HMAC). Inhalt: DB-Dumps, Brain-Ordner (`Documents\000_CNT\Plannung\Brain`, ohne .git) und `secrets/` (.env, .env.supabase, connect.env inkl. KEY_ENCRYPTION_KEY), nur verschlüsselt.
- Passwort: `Backup-Connect.ps1 -ShowPassword` -> in den Passwort-Manager. Ohne Passwort ist das Archiv auf einem anderen PC nicht lesbar.
- Wiederherstellen: `Restore-Connect.ps1 -Restore -Source app -Into app`.

### 3. In Connect: Einstellungen › Sicherung (Google Drive API)
- „Mit Google verbinden ↗“ -> Google-Konto wählen -> Häkchen für Google Drive setzen. Danach sichert Connect automatisch (bei Änderungen höchstens alle 15 Min., sonst alle 24 h) in den Drive-Ordner „Connect Backup“. Scope `drive.file`: Connect sieht nur die eigenen Dateien.
- Inhalt: alle Tabellen (ohne Sitzungen; Google-Tokens der Anmeldung geschwärzt; Tresor bleibt verschlüsselt) + Brain-Dateien, gzip + AES-256-GCM mit einem aus KEY_ENCRYPTION_KEY abgeleiteten Schlüssel (Schlüssel-ID wird angezeigt).
- Jede Sicherung wird nach dem Upload per Größe und MD5 gegen Drive geprüft; zusätzlich lokale Kopie (`CONNECT_BACKUP_LOCAL_DIR`). Aufbewahrung in Drive: neueste 24 + eine pro Tag für 30 Tage (ältere in den Drive-Papierkorb).
- „Wiederherstellen …“: Sicherung wählen, `WIEDERHERSTELLEN` tippen. Vorher legt Connect eine lokale Sicherheitskopie an. Das Brain wird daneben als `Brain-Wiederherstellung-<Zeit>` abgelegt, nicht überschrieben.
- Auf einem neuen PC nur mit demselben KEY_ENCRYPTION_KEY lesbar.
- Konfiguration: `GOOGLE_DRIVE_CLIENT_ID/SECRET` (sonst `GOOGLE_OAUTH_CLIENT_ID/SECRET`), Redirect `<App-URL>/api/drive-backup/oauth/callback`. Der Desktop-Client erlaubt jede localhost-Adresse; für Vercel muss der Redirect beim Web-Client eingetragen sein. `CONNECT_DRIVE_BACKUP_SCHEDULER=off` schaltet den Zeitplan ab.
- Kommandozeile (apps/server): `bun src/drive-backup/cli.ts dry-run <datei.cbk>` und `bun src/drive-backup/cli.ts restore-test <datei.cbk> <db-url>`.
