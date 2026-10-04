<#
  Restore-Connect.ps1 - Connect-Backup (*.zip.aes von Backup-Connect.ps1) entschluesseln und wiederherstellen.
  Ueberschreibt NIE etwas ohne Rueckfrage; beim Ersetzen bleibt die alte Datenbank umbenannt erhalten.

  1) Nur entschluesseln + auspacken (Standard, sicher):
       Restore-Connect.ps1                                  neuestes Backup aus H:\Meine Ablage\Connect-Backups
       Restore-Connect.ps1 -BackupFile "<pfad>.zip.aes"
     -> <Kopie>\backups\restore-<Zeit>\  (copy.sql, supabase.sql, app.sql, manifest.json)
  2) In eine NEUE Datenbank einspielen und Zeilenzahlen gegen manifest.json pruefen:
       Restore-Connect.ps1 -Restore -Source copy -Into copy   (Docker-DB der Kopie, 127.0.0.1:5433)
       Restore-Connect.ps1 -Restore -Source app  -Into app    (Connect App, 127.0.0.1:5544, App muss laufen)
     -> Datenbank connect_restore_<Zeit>; die aktive DB "connect" bleibt unberuehrt.
  3) Zusaetzlich -Replace: nach erfolgreicher Pruefung wird "connect" in connect_before_restore_<Zeit>
     umbenannt und die wiederhergestellte DB wird "connect" (Server vorher stoppen; Rueckfrage "JA").
  Anderer PC / DPAPI-Datei fehlt: -AskPassword (Passwort aus dem Passwort-Manager).
#>
param(
  [string]$BackupFile,
  [string]$BackupDir = "H:\Meine Ablage\Connect-Backups",
  [switch]$AskPassword,
  [switch]$Restore,
  [ValidateSet("copy", "supabase", "app", "app-snapshot")][string]$Source = "copy",
  [ValidateSet("copy", "app")][string]$Into = "copy",
  [switch]$Replace,
  [switch]$Force
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ConnectBackup.Common.ps1")
$Root  = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

if (-not $BackupFile) {
  $f = Get-ChildItem $BackupDir -Filter "connect-backup-*.zip.aes" -File | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $f) { throw "Kein Backup in $BackupDir gefunden." }
  $BackupFile = $f.FullName
}
Write-Log "Restore: $BackupFile"
$password = $null
if (-not $AskPassword) { $password = Get-BackupPassword }
if (-not $password) { $password = ConvertFrom-SecureStringPlain (Read-Host "Backup-Passwort" -AsSecureString) }

$outDir = Join-Path $Root "backups\restore-$stamp"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$zip = Join-Path $env:TEMP "connect-restore-$stamp.zip"
try {
  [void](Unprotect-BackupFile $BackupFile $password $zip)
  [IO.Compression.ZipFile]::ExtractToDirectory($zip, $outDir)
} finally { Remove-Item $zip -Force -ErrorAction SilentlyContinue }
$manifest = Get-Content (Join-Path $outDir "manifest.json") -Raw | ConvertFrom-Json
Write-Log "Entschluesselt nach $outDir (Backup vom $($manifest.created), Quellen: $(($manifest.sources | ForEach-Object { $_.name }) -join ', '))" "OK"
if (-not $Restore) {
  Write-Host "Nur ausgepackt. Zum Einspielen: -Restore -Source <copy|supabase|app> -Into <copy|app> [-Replace]" -ForegroundColor Yellow
  Write-Host "Hinweis: $outDir enthaelt Klartext-Daten - nach Gebrauch loeschen." -ForegroundColor Yellow
  exit 0
}

# ---- target server
$pgBin = Find-PgBin $Root
$psql = Join-Path $pgBin "psql.exe"
if ($Into -eq "copy") {
  $env0 = Read-DotEnv (Join-Path $Root ".env")
  $srv = ConvertFrom-PgUrl $env0["DATABASE_URL"]
  if ($srv.IsRemote) { throw "Die Kopie zeigt auf eine entfernte DB ($($srv.Host)). Restore nur in lokale DBs; fuer Supabase siehe BACKUP-RESTORE.md." }
} else {
  $appEnv = Read-DotEnv (Join-Path $env:LOCALAPPDATA "ConnectApp\data\connect.env")
  $srv = [pscustomobject]@{ Host = "127.0.0.1"; Port = 5544; User = "connect"; Password = $appEnv["CONNECT_APP_DB_PASSWORD"]; Database = "connect"; SslMode = "disable"; IsRemote = $false; IsSupabase = $false }
}
if (-not (Test-TcpPort $srv.Host $srv.Port)) { throw "Ziel-DB $($srv.Host):$($srv.Port) laeuft nicht (Docker bzw. Connect App starten)." }

$src = $manifest.sources | Where-Object { $_.name -eq $Source } | Select-Object -First 1
if (-not $src) { throw "Quelle '$Source' ist nicht in diesem Backup." }
$dumpFile = Join-Path $outDir $src.file
$newDb = "connect_restore_$($stamp.Replace('-', '_'))"

function Invoke-Sql($Db, [string]$Database, [string[]]$More) {
  $d = $Db.PSObject.Copy(); $d.Database = $Database
  $env:PGPASSWORD = $Db.Password
  try { $r = Invoke-Native $psql (@("-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", (Get-PgConnInfo $d)) + $More) }
  finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  if ($r.ExitCode -ne 0) { throw "psql fehlgeschlagen: $(($r.Output | Select-Object -Last 8) -join ' | ')" }
  $r.Output
}

[void](Invoke-Sql $srv "postgres" @("-c", "CREATE DATABASE $newDb"))
Write-Log "Neue Datenbank $newDb auf $($srv.Host):$($srv.Port) angelegt, spiele $($src.file) ein ..."
if ($dumpFile -like "*.dump") {
  $env:PGPASSWORD = $srv.Password
  $d = $srv.PSObject.Copy(); $d.Database = $newDb
  try { $r = Invoke-Native (Join-Path $pgBin "pg_restore.exe") @("--no-owner", "--no-privileges", "--exit-on-error", "-d", (Get-PgConnInfo $d), $dumpFile) }
  finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  if ($r.ExitCode -ne 0) { throw "pg_restore fehlgeschlagen: $(($r.Output | Select-Object -Last 8) -join ' | ')" }
} else {
  # Supabase dumps (-n public) contain "CREATE SCHEMA public": drop the empty default schema of the NEW db first
  if (Select-String -Path $dumpFile -Pattern '^CREATE SCHEMA public;' -Quiet) { [void](Invoke-Sql $srv $newDb @("-c", "DROP SCHEMA public")) }
  if (Select-String -Path $dumpFile -Pattern 'extensions\.' -Quiet) { [void](Invoke-Sql $srv $newDb @("-c", "CREATE SCHEMA IF NOT EXISTS extensions")) }
  [void](Invoke-Sql $srv $newDb @("-1", "-f", $dumpFile))
}

# ---- verify row counts against the manifest
$check = $srv.PSObject.Copy(); $check.Database = $newDb
$now = Get-TableCounts $pgBin $check
$bad = @()
if ($src.rows) {
  foreach ($p in $src.rows.PSObject.Properties) {
    $have = $(if ($now.Contains($p.Name)) { $now[$p.Name] } else { -1 })
    if ($have -ne [long]$p.Value) { $bad += "$($p.Name): Backup $($p.Value), wiederhergestellt $have" }
  }
} else { Write-Log "Keine Zeilenzahlen im Manifest fuer '$Source' - Pruefung uebersprungen." "WARN" }
if ($bad.Count -gt 0) { throw "Zeilenzahlen weichen ab (DB $newDb bleibt zur Analyse): $($bad -join '; ')" }
Write-Log ("Wiederhergestellt in $newDb, $($now.Count) Tabellen" + $(if ($src.rows) { ", Zeilenzahlen identisch mit dem Backup." } else { "." })) "OK"

if ($Replace) {
  if (-not $Force) {
    Write-Host "ACHTUNG: 'connect' auf $($srv.Host):$($srv.Port) wird zu connect_before_restore_$($stamp.Replace('-', '_')) umbenannt, $newDb wird zu 'connect'." -ForegroundColor Yellow
    Write-Host "Vorher den Connect-Server stoppen. Offene Verbindungen werden getrennt." -ForegroundColor Yellow
    if ((Read-Host "Zum Fortfahren JA eingeben") -ne "JA") { Write-Log "Ersetzen abgebrochen; $newDb bleibt bestehen."; exit 0 }
  }
  $oldName = "connect_before_restore_$($stamp.Replace('-', '_'))"
  $sql = "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('connect', '$newDb') AND pid <> pg_backend_pid();"
  [void](Invoke-Sql $srv "postgres" @("-c", $sql, "-c", "ALTER DATABASE connect RENAME TO $oldName", "-c", "ALTER DATABASE $newDb RENAME TO connect"))
  Write-Log "Ersetzt: 'connect' = wiederhergestellt; alte DB bleibt als $oldName (spaeter selbst loeschen: DROP DATABASE $oldName)." "OK"
}
Write-Host "Hinweis: $outDir enthaelt Klartext-Daten - nach Gebrauch loeschen." -ForegroundColor Yellow
