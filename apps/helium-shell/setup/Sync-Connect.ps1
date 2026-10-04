<#
  Sync-Connect.ps1 - laufender ZWEI-WEGE-Abgleich Connect App (lokale DB 127.0.0.1:5544) <-> Supabase
  (connect-core, .env.supabase = Backend von connect-kunc-preview.vercel.app). Logik: sync-engine.ts.

  Sicherheit:
    * Nie wird neuere Arbeit ueberschrieben oder geloescht: auf beiden Seiten geaenderte Workspace-Werte (Companies,
      Projekte, Lab ...) werden dreifach zusammengefuehrt; bei Zeilen gewinnt die neuere, die andere Version
      landet in data\sbsync\conflicts\. Loeschen wird nur uebertragen, wenn die andere Seite die Zeile seit dem
      letzten Abgleich nicht geaendert hat (sonst wird sie wiederhergestellt); geloeschte Zeilen werden vorher in
      data\sbsync\tombstones\ archiviert.
    * Vor jedem Lauf MIT Aenderungen: verschluesselte, geprueft entschluesselbare Sicherung beider Datenbanken nach
      data\backups\sync\ (Rotation: letzte 24 + eine pro Tag fuer 30 Tage).
    * Sperrdatei gegen ueberlappende Laeufe, Log data\sbsync\sync.log, Status data\sbsync\status.json
      (sichtbar in Einstellungen > Sicherung).
    * Nicht synchronisiert: Login/Sitzungen/Rollen, Protokolle, Paket-Zeilen, lokale MCP-/Drive-Tabellen und
      verschluesselte Zugangsdaten (credentials; KEY_ENCRYPTION_KEY ist in App und Supabase verschieden).

  Aufruf:  Sync-Connect.ps1               ein Lauf (das macht der geplante Task alle 5 Minuten)
           Sync-Connect.ps1 -DryRun       nur anzeigen, was passieren wuerde
           Sync-Connect.ps1 -Register     geplanten Task "Connect Sync (Supabase)" anlegen (alle 5 min, unsichtbar)
           Sync-Connect.ps1 -Unregister   Task entfernen
  Test:    -AppDb <name> -SbDb <name> -StateDir <dir>  (beide Datenbanken auf 127.0.0.1:5544, z. B. Kopien)
#>
param([switch]$DryRun, [switch]$Register, [switch]$Unregister, [switch]$NoBackup,
      [string]$AppDb, [string]$SbDb, [string]$StateDir)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ConnectBackup.Common.ps1")
$TaskName = "Connect Sync (Supabase)"
$Self  = $MyInvocation.MyCommand.Path
$Root  = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$Data  = Join-Path $env:LOCALAPPDATA "ConnectApp\data"
$test  = [bool]($AppDb -or $SbDb)
if (-not $StateDir) { $StateDir = Join-Path $Data "sbsync" }
New-Item -ItemType Directory -Force $StateDir | Out-Null
$script:LogFile = Join-Path $StateDir "sync.log"
$statusFile = Join-Path $StateDir "status.json"
$BackupDir  = if ($test) { Join-Path $StateDir "backups" } else { Join-Path $Data "backups\sync" }

if ($Unregister) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue; Write-Log "Task '$TaskName' entfernt." "OK"; exit 0 }
if ($Register) {
  # wscript + vbs: kein aufblitzendes Konsolenfenster alle 5 Minuten
  $vbs = Join-Path $PSScriptRoot "Sync-Connect-hidden.vbs"
  $cmd = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""$Self"""
  [IO.File]::WriteAllText($vbs, "CreateObject(""WScript.Shell"").Run ""$($cmd -replace '"','""')"", 0, True`r`n", [Text.Encoding]::ASCII)
  $action = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot "System32\wscript.exe") -Argument "//B //Nologo `"$vbs`"" -WorkingDirectory $PSScriptRoot
  $every = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 5)
  $logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"; $logon.Delay = "PT3M"
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
              -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew -Hidden
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($every, $logon) -Settings $settings -Principal $principal `
    -Description "Zwei-Wege-Abgleich Connect App <-> Supabase alle 5 Minuten (Script: $Self). Log: $($script:LogFile)" -Force | Out-Null
  Write-Log "Task '$TaskName' registriert: alle 5 Minuten + bei Anmeldung." "OK"; exit 0
}

# ---------------------------------------------------------------- status helpers
$status = [ordered]@{}
if (Test-Path $statusFile) { try { (Get-Content $statusFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $status[$_.Name] = $_.Value } } catch { } }
function Save-Status([string]$Result, [string]$Message, $Extra = @{}) {
  $now = (Get-Date).ToString("o")
  $status["lastRun"] = $now; $status["result"] = $Result; $status["message"] = $Message
  $status["intervalMinutes"] = 5; $status["log"] = $script:LogFile
  if ($Result -eq "ok" -or $Result -eq "unchanged") { $status["lastSuccess"] = $now; $status["lastError"] = $null }
  if ($Result -eq "error") { $status["lastError"] = $Message; $status["lastErrorAt"] = $now }
  foreach ($k in $Extra.Keys) { $status[$k] = $Extra[$k] }
  if (-not $DryRun) { [IO.File]::WriteAllText($statusFile, ($status | ConvertTo-Json -Depth 6), $script:Utf8NoBom) }
}
function Rotate-Log { if ((Test-Path $script:LogFile) -and (Get-Item $script:LogFile).Length -gt 2MB) { Move-Item $script:LogFile "$($script:LogFile).1" -Force } }

# ---------------------------------------------------------------- lock
$lockPath = Join-Path $StateDir "sync.lock"
try { $lock = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None') }
catch { Write-Log "Vorheriger Abgleich laeuft noch - dieser Lauf wird uebersprungen." "WARN"; exit 0 }
try {
  Rotate-Log
  $pgBin = Find-PgBin $Root; $pgDump = Join-Path $pgBin "pg_dump.exe"
  $bun   = Join-Path $Root "apps\connect-app\runtime\bun\bun.exe"
  $appE  = Read-DotEnv (Join-Path $Data "connect.env")
  $appUrl = "postgres://connect:$($appE['CONNECT_APP_DB_PASSWORD'])@127.0.0.1:5544/" + $(if ($AppDb) { $AppDb } else { "connect" })
  $sbUrl  = if ($SbDb) { "postgres://connect:$($appE['CONNECT_APP_DB_PASSWORD'])@127.0.0.1:5544/$SbDb" } else { (Read-DotEnv (Join-Path $Root ".env.supabase"))["DATABASE_URL"] }
  $app = ConvertFrom-PgUrl $appUrl; $sb = ConvertFrom-PgUrl $sbUrl
  if (-not $test -and -not $sb.IsSupabase) { throw "Ziel ist kein Supabase-Host: $($sb.Host)" }
  if (-not (Test-TcpPort "127.0.0.1" 5544)) { Write-Log "Connect App (Postgres 5544) laeuft nicht - Abgleich spaeter." "WARN"; Save-Status "waiting" "Connect App laeuft nicht - naechster Versuch in 5 Minuten"; exit 0 }

  $engine = Join-Path $PSScriptRoot "sync-engine.ts"
  function Run-Engine([string[]]$EngineArgs) {
    $env:SYNC_APP_URL = $appUrl; $env:SYNC_SB_URL = $sbUrl
    try { $r = Invoke-Native $bun (@($engine, "--state", $StateDir) + $EngineArgs) } finally { Remove-Item Env:SYNC_APP_URL, Env:SYNC_SB_URL -ErrorAction SilentlyContinue }
    $line = $r.Output | Where-Object { $_ -like "RESULT *" } | Select-Object -Last 1
    foreach ($l in $r.Output) { if ($l -like "RETRY*") { Write-Log $l "WARN" } }
    if ($r.ExitCode -ne 0 -or -not $line) { throw "sync-engine: $((($r.Output | Where-Object { $_ -notlike 'RESULT *' }) | Select-Object -Last 6) -join ' | ')" }
    $line.Substring(7) | ConvertFrom-Json
  }

  # 1) schneller Vergleich der Zeilen-Hashes mit dem letzten Stand (keine Daten werden gelesen, wenn nichts neu ist)
  $check = Run-Engine @("--quick")
  if (-not $check.changed) { Save-Status "unchanged" "Keine Aenderungen" @{ lastOps = 0 }; Write-Log "unveraendert"; exit 0 }
  foreach ($o in @($check.opsList)) { if ($o) { Write-Log "  geplant: $o" } }
  if ($DryRun) { Write-Log ("PROBELAUF: {0} Operation(en), {1} Konflikt(e)" -f $check.ops, $check.conflicts) "OK"; $check.notes | ForEach-Object { Write-Host "  NOTE $_" }; exit 0 }

  # 2) Sicherung vor dem Schreiben (nur wenn wirklich etwas geschrieben wird)
  $backupInfo = $null
  if ($check.ops -gt 0 -and -not $NoBackup) {
    New-Item -ItemType Directory -Force $BackupDir | Out-Null
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"; $pw = Get-BackupPassword -CreateIfMissing
    $tmp = Join-Path $env:TEMP "connect-sync-$stamp"; New-Item -ItemType Directory -Force $tmp | Out-Null
    try {
      foreach ($s in @(@{ n = "app"; db = $app; a = @("-Fc") }, @{ n = "supabase"; db = $sb; a = @("-n", "public", "-n", "drizzle") })) {
        $plain = Join-Path $tmp "$($s.n).dump"
        $env:PGPASSWORD = $s.db.Password
        try { $r = Invoke-Native $pgDump (@("-d", (Get-PgConnInfo $s.db), "--no-owner", "--no-privileges", "--encoding=UTF8", "-f", $plain) + $s.a) } finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
        if ($r.ExitCode -ne 0 -or -not (Test-Path $plain) -or (Get-Item $plain).Length -lt 500) { throw "Sicherung $($s.n) fehlgeschlagen: $(($r.Output | Select-Object -First 3) -join ' | ')" }
        $enc = Join-Path $BackupDir "$($s.n)-$stamp.dump.aes"
        Protect-BackupFile $plain $enc $pw | Out-Null
        $chk = Join-Path $tmp "$($s.n).verify"; Unprotect-BackupFile $enc $pw $chk | Out-Null
        if ((Get-FileHash $plain -Algorithm SHA256).Hash -ne (Get-FileHash $chk -Algorithm SHA256).Hash) { throw "Sicherung $enc laesst sich nicht 1:1 entschluesseln" }
      }
    } finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
    $backupInfo = $stamp
    Write-Log "Sicherung vor dem Abgleich: $BackupDir\*-$stamp.dump.aes (entschluesselt geprueft)" "OK"
    # Rotation: je Seite die letzten 24 + die neueste pro Tag fuer 30 Tage
    foreach ($p in "app", "supabase") {
      $files = @(Get-ChildItem $BackupDir -Filter "$p-*.dump.aes" | Sort-Object Name -Descending)
      $keep = @{}; $files | Select-Object -First 24 | ForEach-Object { $keep[$_.Name] = 1 }
      $days = @{}
      foreach ($f in $files) {
        if ($f.Name -match "^$p-(\d{8})-\d{6}") { $d = $Matches[1]
          if (-not $days.ContainsKey($d) -and [datetime]::ParseExact($d, "yyyyMMdd", $null) -ge (Get-Date).Date.AddDays(-30)) { $days[$d] = 1; $keep[$f.Name] = 1 } }
      }
      foreach ($f in $files) { if (-not $keep.ContainsKey($f.Name)) { Remove-Item $f.FullName -Force; Write-Log "Rotation: $($f.Name) entfernt" } }
    }
  }

  # 3) Abgleich schreiben (die Engine plant neu und prueft jede Zeile vor dem Schreiben)
  $res = Run-Engine @("--apply")
  foreach ($o in @($res.opsList)) { if ($o) { Write-Log "  $o" } }
  $msg = "{0} Aenderung(en) abgeglichen{1}{2}{3}" -f $res.ops, $(if ($res.conflicts) { ", $($res.conflicts) Konflikt-Kopie(n) in conflicts\" } else { "" }), $(if ($res.deleted) { ", $($res.deleted) Loeschung(en) (archiviert in tombstones\)" } else { "" }), $(if ($res.failed) { ", $($res.failed) Zeile(n) nicht schreibbar (siehe conflicts\)" } else { "" })
  $level = if ($res.failed) { "WARN" } else { "OK" }
  Write-Log $msg $level
  Save-Status $(if ($res.failed) { "warning" } else { "ok" }) $msg @{ lastOps = $res.ops; lastChangeAt = (Get-Date).ToString("o"); lastBackup = $backupInfo; conflictsTotal = ([int]$status["conflictsTotal"] + [int]$res.conflicts); notes = @($res.notes) }
  exit 0
} catch {
  $m = $_.Exception.Message -replace [regex]::Escape($app.Password), '***'
  if ($sb.Password) { $m = $m -replace [regex]::Escape($sb.Password), '***' }
  Write-Log "FEHLER: $m" "ERROR"
  Save-Status "error" $m
  exit 1
} finally { $lock.Close() }
