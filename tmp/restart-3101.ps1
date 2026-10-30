<#
  Startet NUR den Connect-Prozess auf Port 3101 neu.

  Bewusst eng gefasst: es wird kein Connect.exe --stop benutzt, kein restart-server.ps1 und
  kein anderer Port angefasst. Der Befehl leitet sich aus dem Listener auf 3101 ab, damit
  garantiert derselbe Prozess neu gestartet wird, der vorher lief.

  Wichtig: der Server braucht dieselbe Umgebung, die der Launcher setzt (DATABASE_URL,
  KEY_ENCRYPTION_KEY, Ports, Pfade). connect.env wird dabei nur gelesen und als
  Prozess-Umgebung weitergegeben - nichts davon wird ausgegeben oder in eine Datei geschrieben.

  Aufruf (aus dem Repo-Wurzelverzeichnis):
    powershell -NoProfile -ExecutionPolicy Bypass -File tmp\restart-3101.ps1
#>
$ErrorActionPreference = "Stop"
$Port = 3101
$PgPort = 5544
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BundleRoot = Join-Path $RepoRoot "apps\connect-app\runtime\connect"
$ServerDir = Join-Path $BundleRoot "apps\server"
$BunExe = Join-Path $RepoRoot "apps\connect-app\runtime\bun\bun.exe"
$EnvFile = Join-Path $env:LOCALAPPDATA "ConnectApp\data\connect.env"

function Get-ConnectEnv {
  # Liest connect.env und liefert die Umgebungsvariablen fuer den Server-Prozess.
  # Die Werte werden nie ausgegeben.
  $env2 = @{}
  if (Test-Path $EnvFile) {
    foreach ($raw in [System.IO.File]::ReadAllLines($EnvFile)) {
      $line = $raw.Trim()
      if ($line -eq "" -or $line.StartsWith("#")) { continue }
      $i = $line.IndexOf("=")
      if ($i -le 0) { continue }
      $k = $line.Substring(0, $i).Trim()
      $v = $line.Substring($i + 1).Trim()
      if ($v.Length -ge 2 -and $v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
      if ($v.Length -ge 2 -and $v.StartsWith("'") -and $v.EndsWith("'")) { $v = $v.Substring(1, $v.Length - 2) }
      $env2[$k] = $v
    }
  }
  $origin = "http://localhost:$Port"
  if ($env2.ContainsKey("CONNECT_APP_DB_PASSWORD")) {
    $env2["DATABASE_URL"] = "postgres://connect:$($env2["CONNECT_APP_DB_PASSWORD"])@127.0.0.1:$PgPort/connect"
  }
  $env2["PORT"] = "$Port"
  $env2["SERVER_PORT"] = "$Port"
  $env2["NODE_ENV"] = "production"
  $env2["CONNECT_SINGLE_USER"] = "true"
  # T3-Backend: ohne dieses Flag bleiben alle T3-Oberflächen unsichtbar.
  # connect.env darf überschreiben (ContainsKey).
  if (-not $env2.ContainsKey("CONNECT_FLAGS_T3")) { $env2["CONNECT_FLAGS_T3"] = "all" }
  $env2["APP_DIST_DIR"] = Join-Path $BundleRoot "apps\app\dist"
  $env2["TENANT_PACKAGE_DIR"] = Join-Path $BundleRoot "apps\examples\fintech"
  $env2["CONNECT_APP_URL"] = $origin
  $env2["OPENBOT_APP_URL"] = $origin
  $env2["TRUSTED_ORIGINS"] = "$origin,http://127.0.0.1:$Port"
  return $env2
}

function Start-ConnectServer {
  if (-not (Test-Path $BunExe)) { Write-Host "[restart-3101] bun.exe fehlt: $BunExe"; return $null }
  if (-not (Test-Path (Join-Path $ServerDir "src\index.ts"))) { Write-Host "[restart-3101] Server fehlt: $ServerDir"; return $null }
  $env2 = Get-ConnectEnv
  if (-not $env2.ContainsKey("KEY_ENCRYPTION_KEY")) {
    Write-Host "[restart-3101] WARNUNG: KEY_ENCRYPTION_KEY nicht in connect.env gefunden - gespeicherte Schluessel waeren danach nicht mehr lesbar. Abbruch."
    return $null
  }
  # Der Server erbt die Umgebung des Skripts. Deshalb werden die Variablen hier gesetzt und
  # danach wieder zurueckgesetzt - nur fuer diesen Kindprozess.
  $saved = @{}
  foreach ($kv in $env2.GetEnumerator()) {
    $saved[$kv.Key] = [Environment]::GetEnvironmentVariable($kv.Key)
    [Environment]::SetEnvironmentVariable($kv.Key, $kv.Value)
  }
  try {
    # Eigene Logdateien: die des Launchers (connect-app-server.log) wird nicht angefasst,
    # damit der bisherige Verlauf erhalten bleibt.
    #
    # Wichtig: der Start laeuft ueber `cmd /c start /b`. Ein direkt gestarteter Prozess erbt
    # sonst die Handles der aufrufenden Shell; der Aufrufer wartet dann vergeblich auf das
    # Ende des Servers. `start /b` loest den Prozess von der Shell.
    $outLog = Join-Path $env:TEMP "connect-app-server-restart.log"
    $errLog = Join-Path $env:TEMP "connect-app-server-restart-err.log"
    $cmdLine = "start `"`" /b `"$BunExe`" src/index.ts 1>>`"$outLog`" 2>>`"$errLog`""
    $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmdLine -WorkingDirectory $ServerDir `
      -WindowStyle Hidden -PassThru
  } finally {
    foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }
  }
  return $p
}

# 1) Wer hört auf dem Port?
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
  Write-Host "[restart-3101] Auf Port $Port laeuft nichts - starte den Connect-Server."
  $null = Start-ConnectServer
} else {
  $pidToStop = $listener.OwningProcess
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$pidToStop" -ErrorAction SilentlyContinue
  Write-Host "[restart-3101] Stoppe PID $pidToStop ($($proc.Name))"
  try { Stop-Process -Id $pidToStop -ErrorAction Stop } catch { Write-Host "[restart-3101] Stop-Process schlug fehl: $($_.Exception.Message)" }
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    if (-not (Get-Process -Id $pidToStop -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 250
  }
  if (Get-Process -Id $pidToStop -ErrorAction SilentlyContinue) {
    Write-Host "[restart-3101] Prozess reagiert nicht - erzwinge."
    Stop-Process -Id $pidToStop -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }
  Write-Host "[restart-3101] Starte neu (Port $Port)."
  $null = Start-ConnectServer
}

# 2) Warten, bis der Port wieder antwortet.
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  $l = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($l) { Write-Host "[restart-3101] Fertig - Port $Port laeuft (PID $($l.OwningProcess))."; exit 0 }
  Start-Sleep -Milliseconds 500
}
Write-Host "[restart-3101] WARNUNG: Port $Port antwortet nach 90 s nicht."
exit 1
