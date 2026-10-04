<#
  Backup-Connect-Local.ps1 - stuendliches LOKALES Connect-Backup (pg_dump, Format custom) nach
  Dokumente\Connect-Backups. Sicherheitsnetz, bis die Google-Drive-Sicherung in Connect laeuft.

  Quellen:
    app   - Connect App (eigene PostgreSQL 127.0.0.1:5544, Passwort aus %LOCALAPPDATA%\ConnectApp\data\connect.env)
            nur wenn sie gerade laeuft (sonst aendern sich ihre Daten auch nicht)
    copy  - Kopie OpenBot-v2-Helium laut .env DATABASE_URL (Docker openbot-v2-helium-postgres-1, 5433)
  Jede Datei wird nach dem Schreiben mit pg_restore --list geprueft. Unveraenderte Daten (gleicher
  Inhalts-Hash wie das letzte Backup) werden nicht doppelt abgelegt.
  Aufbewahrung je Quelle: die neuesten 48 + je Tag das neueste fuer 30 Tage.
  Log: Dokumente\Connect-Backups\backup.log

  Aufruf:
    Backup-Connect-Local.ps1               Backup jetzt
    Backup-Connect-Local.ps1 -Register     geplanten Task "Connect Backup (lokal, stuendlich)" anlegen
    Backup-Connect-Local.ps1 -Unregister   Task entfernen
    Backup-Connect-Local.ps1 -RestoreTest  neuestes Backup jeder Quelle in eine Temp-DB einspielen,
                                           Zeilen zaehlen, Temp-DB wieder loeschen
#>
param(
  [string]$Target = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) "Connect-Backups"),
  [int]$Keep = 48,
  [int]$KeepDays = 30,
  [switch]$Register,
  [switch]$Unregister,
  [switch]$RestoreTest
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ConnectBackup.Common.ps1")
if (-not (Test-Path $Target)) { New-Item -ItemType Directory -Path $Target | Out-Null }
$script:LogFile = Join-Path $Target "backup.log"

$TaskName = "Connect Backup (lokal, stuendlich)"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$Self = $MyInvocation.MyCommand.Path

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Log "Task '$TaskName' entfernt." "OK"; exit 0
}
if ($Register) {
  $ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $action = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Self`"" -WorkingDirectory $PSScriptRoot
  $hourly = New-ScheduledTaskTrigger -Once -At ((Get-Date).Date.AddHours((Get-Date).Hour + 1)) -RepetitionInterval (New-TimeSpan -Hours 1)
  $logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  $logon.Delay = "PT10M"
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew -Hidden
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($hourly, $logon) -Settings $settings -Principal $principal `
    -Description "Stuendliches lokales Connect-Backup (pg_dump) nach $Target. Script: $Self" -Force | Out-Null
  Write-Log "Task '$TaskName' registriert: stuendlich + bei Anmeldung (+10 min)." "OK"; exit 0
}

$pgBin = Find-PgBin $Root
$pgDump = Join-Path $pgBin "pg_dump.exe"
$pgRestore = Join-Path $pgBin "pg_restore.exe"
$psqlExe = Join-Path $pgBin "psql.exe"

function Get-Sources {
  $list = @()
  $appEnvFile = Join-Path $env:LOCALAPPDATA "ConnectApp\data\connect.env"
  if (Test-Path $appEnvFile) {
    $appEnv = Read-DotEnv $appEnvFile
    $port = 5544
    foreach ($cfg in @((Join-Path $env:LOCALAPPDATA "Programs\Connect App\connect-app.json"), (Join-Path $Root "apps\connect-app\connect-app.json"))) {
      if (Test-Path $cfg) { try { $p = (Get-Content $cfg -Raw | ConvertFrom-Json).PgPort; if ($p) { $port = [int]$p; break } } catch { } }
    }
    $list += [pscustomobject]@{ Name = "app"; Db = [pscustomobject]@{ Host = "127.0.0.1"; Port = $port; User = "connect"; Password = $appEnv["CONNECT_APP_DB_PASSWORD"]; Database = "connect"; SslMode = "disable"; IsRemote = $false; IsSupabase = $false } }
  }
  $envMain = Read-DotEnv (Join-Path $Root ".env")
  if ($envMain["DATABASE_URL"]) { $list += [pscustomobject]@{ Name = "copy"; Db = (ConvertFrom-PgUrl $envMain["DATABASE_URL"]) } }
  return $list
}

function Invoke-Pg([string]$Exe, [string[]]$PgArgs, $Db) {
  $env:PGPASSWORD = $Db.Password
  try { return Invoke-Native $Exe $PgArgs } finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
}

function Get-RowSummary($Db, [string]$Database) {
  $info = (Get-PgConnInfo $Db) -replace "dbname=\S+", "dbname=$Database"
  $q = "select string_agg(relname || '=' || n, ',' order by relname) from (select c.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::int n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r') x"
  $r = Invoke-Pg $psqlExe @("-d", $info, "-X", "-A", "-t", "-c", $q) $Db
  if ($r.ExitCode -ne 0) { throw "Zeilenzaehlung fehlgeschlagen: $(($r.Output | Select-Object -First 3) -join ' | ')" }
  return (($r.Output | Where-Object { $_ -match '=' }) -join '').Trim()
}

if ($RestoreTest) {
  $fail = 0
  foreach ($s in Get-Sources) {
    $dir = Join-Path $Target $s.Name
    $last = Get-ChildItem $dir -Filter "connect-$($s.Name)-*.dump" -File -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $last) { Write-Log "$($s.Name): kein Backup vorhanden." "WARN"; continue }
    if (-not (Test-TcpPort $s.Db.Host $s.Db.Port)) { Write-Log "$($s.Name): DB-Server laeuft nicht, Restore-Test uebersprungen." "WARN"; continue }
    $tmp = "connect_restoretest_" + (Get-Date -Format "yyyyMMddHHmmss")
    $admin = (Get-PgConnInfo $s.Db) -replace "dbname=\S+", "dbname=postgres"
    try {
      $r = Invoke-Pg $psqlExe @("-d", $admin, "-X", "-c", "CREATE DATABASE $tmp") $s.Db
      if ($r.ExitCode -ne 0) { throw "CREATE DATABASE: $(($r.Output | Select-Object -First 3) -join ' | ')" }
      $tinfo = (Get-PgConnInfo $s.Db) -replace "dbname=\S+", "dbname=$tmp"
      $r = Invoke-Pg $pgRestore @("-d", $tinfo, "--no-owner", "--no-privileges", "--exit-on-error", $last.FullName) $s.Db
      if ($r.ExitCode -ne 0) { throw "pg_restore: $(($r.Output | Select-Object -First 5) -join ' | ')" }
      $rows = Get-RowSummary $s.Db $tmp
      $meta = Join-Path $dir ($last.BaseName + ".rows.txt")
      $expected = if (Test-Path $meta) { (Get-Content $meta -Raw).Trim() } else { "" }
      if ($expected -and $expected -ne $rows) { throw "Zeilenzahlen weichen ab. Erwartet: $expected | Temp-DB: $rows" }
      Write-Log "$($s.Name): Restore-Test OK ($($last.Name) -> Temp-DB $tmp). Zeilen: $rows" "OK"
    } catch { Write-Log "$($s.Name): Restore-Test FEHLGESCHLAGEN: $($_.Exception.Message)" "ERROR"; $fail++ }
    finally { [void](Invoke-Pg $psqlExe @("-d", $admin, "-X", "-c", "DROP DATABASE IF EXISTS $tmp") $s.Db) }
  }
  if ($fail) { exit 1 } else { exit 0 }
}

# ------------------------------------------------------------------ backup
$errors = 0
foreach ($s in Get-Sources) {
  $dir = Join-Path $Target $s.Name
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  if (-not $s.Db.IsRemote -and -not (Test-TcpPort $s.Db.Host $s.Db.Port)) { Write-Log "$($s.Name): DB $($s.Db.Host):$($s.Db.Port) laeuft nicht, uebersprungen."; continue }
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $file = Join-Path $dir "connect-$($s.Name)-$stamp.dump"
  $part = "$file.part"
  try {
    $extra = @(); if ($s.Db.IsSupabase) { $extra = @("-n", "public", "-n", "drizzle") }
    $r = Invoke-Pg $pgDump (@("-d", (Get-PgConnInfo $s.Db), "-Fc", "--no-owner", "--no-privileges", "-f", $part) + $extra) $s.Db
    if ($r.ExitCode -ne 0 -or -not (Test-Path $part)) { throw "pg_dump Exit $($r.ExitCode): $(($r.Output | Select-Object -First 5) -join ' | ')" }
    $chk = Invoke-Pg $pgRestore @("--list", $part) $s.Db
    if ($chk.ExitCode -ne 0 -or -not (($chk.Output -join "`n") -match "TABLE DATA")) { throw "Pruefung (pg_restore --list) fehlgeschlagen." }
    $rows = Get-RowSummary $s.Db $s.Db.Database
    # unchanged data -> no new version (row counts + data hash of the plain listing are not enough, so hash a data-only plain dump)
    $sig = Invoke-Pg $pgDump @("-d", (Get-PgConnInfo $s.Db), "--data-only", "--no-owner", "--no-privileges", "--exclude-table-data=public.sessions", "--exclude-table-data=public.verifications", "-f", "$part.sig") $s.Db
    $hash = [guid]::NewGuid().ToString()
    if ($sig.ExitCode -eq 0) {
      # pg_dump 17.6+ writes a random \restrict token per run; drop it (and comments) before hashing
      $body = ([IO.File]::ReadAllLines("$part.sig") | Where-Object { $_ -notmatch '^\\(un)?restrict ' -and $_ -notmatch '^--' }) -join "`n"
      $sha = [Security.Cryptography.SHA256]::Create()
      $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($body))) -replace '-', ''
    }
    Remove-Item "$part.sig" -ErrorAction SilentlyContinue
    $lastHashFile = Join-Path $dir "last.sha256"
    if ((Test-Path $lastHashFile) -and ((Get-Content $lastHashFile -Raw).Trim() -eq $hash)) {
      Remove-Item $part -Force
      Write-Log "$($s.Name): keine Aenderung seit dem letzten Backup, nichts Neues abgelegt."
      continue
    }
    Move-Item $part $file -Force
    [IO.File]::WriteAllText((Join-Path $dir "connect-$($s.Name)-$stamp.rows.txt"), $rows, $script:Utf8NoBom)
    [IO.File]::WriteAllText($lastHashFile, $hash, $script:Utf8NoBom)
    Write-Log ("{0}: Backup OK {1} ({2:N0} Bytes, geprueft). Zeilen: {3}" -f $s.Name, (Split-Path $file -Leaf), (Get-Item $file).Length, $rows) "OK"
  } catch {
    Write-Log "$($s.Name): Backup FEHLGESCHLAGEN: $($_.Exception.Message)" "ERROR"; $errors++
    Remove-Item $part, "$part.sig" -ErrorAction SilentlyContinue
  }
  # retention: newest $Keep + newest per day for $KeepDays days
  $all = @(Get-ChildItem $dir -Filter "connect-$($s.Name)-*.dump" -File | Sort-Object Name -Descending)
  $keepSet = @{}
  $all | Select-Object -First $Keep | ForEach-Object { $keepSet[$_.FullName] = $true }
  $all | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-$KeepDays) } | Group-Object { $_.LastWriteTime.ToString("yyyyMMdd") } | ForEach-Object { $keepSet[($_.Group | Sort-Object Name -Descending | Select-Object -First 1).FullName] = $true }
  foreach ($old in $all) { if (-not $keepSet[$old.FullName]) { Remove-Item $old.FullName -Force; Remove-Item ($old.FullName -replace '\.dump$', '.rows.txt') -ErrorAction SilentlyContinue; Write-Log "$($s.Name): altes Backup entfernt: $($old.Name)" } }
}
if ($errors) { exit 1 } else { exit 0 }
