# Startet NUR den Connect-App-Server (bun, Port 3101) neu - wie der Launcher (Backend.ServerEnv).
# Postgres, Fenster und Connect.exe bleiben unberuehrt. Kein "Connect.exe --stop". Gibt keine Werte aus.
$ErrorActionPreference = "Stop"
$app = "C:\Users\Kunc GmbH\Downloads\OpenBot-v2-Helium\apps\connect-app"
$rt = "$app\runtime"; $connect = "$rt\connect"; $bun = "$rt\bun\bun.exe"
$envFile = "$env:LOCALAPPDATA\ConnectApp\data\connect.env"
$cfg = Get-Content "$app\connect-app.json" -Raw | ConvertFrom-Json
$port = if ($cfg.AppPort) { $cfg.AppPort } else { 3101 }
$pg = if ($cfg.PgPort) { $cfg.PgPort } else { 5544 }
$file = @{}
foreach ($raw in Get-Content $envFile -Encoding UTF8) {
  $l = $raw.Trim(); if (!$l -or $l.StartsWith("#")) { continue }
  $i = $l.IndexOf("="); if ($i -le 0) { continue }
  $v = $l.Substring($i + 1).Trim(); if ($v.Length -ge 2 -and (($v[0] -eq '"' -and $v[-1] -eq '"') -or ($v[0] -eq "'" -and $v[-1] -eq "'"))) { $v = $v.Substring(1, $v.Length - 2) }
  $file[$l.Substring(0, $i).Trim()] = $v
}
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "cmd.exe"
$log = "$env:TEMP\connect-app-server.log"
$psi.Arguments = "/d /s /c `"`"$bun`" src/index.ts 1>>`"$log`" 2>&1`""
$psi.WorkingDirectory = "$connect\apps\server"
$psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
foreach ($k in $file.Keys) { if (-not $k.StartsWith("CONNECT_APP_", "OrdinalIgnoreCase")) { $psi.EnvironmentVariables[$k] = $file[$k] } }
$origin = "http://localhost:$port"
$psi.EnvironmentVariables["DATABASE_URL"] = "postgres://connect:$($file['CONNECT_APP_DB_PASSWORD'])@127.0.0.1:$pg/connect"
$psi.EnvironmentVariables["PORT"] = "$port"; $psi.EnvironmentVariables["SERVER_PORT"] = "$port"
$psi.EnvironmentVariables["NODE_ENV"] = "production"; $psi.EnvironmentVariables["CONNECT_SINGLE_USER"] = "true"
$psi.EnvironmentVariables["APP_DIST_DIR"] = "$connect\apps\app\dist"
$psi.EnvironmentVariables["TENANT_PACKAGE_DIR"] = "$connect\apps\examples\fintech"
$psi.EnvironmentVariables["CONNECT_APP_URL"] = $origin; $psi.EnvironmentVariables["OPENBOT_APP_URL"] = $origin
$psi.EnvironmentVariables["TRUSTED_ORIGINS"] = "$origin,http://127.0.0.1:$port"
$psi.EnvironmentVariables["PATH"] = "$rt\bun;$rt\pgsql\bin;$env:PATH"
foreach ($k in "BETTER_AUTH_SECRET","BETTER_AUTH_URL","GOOGLE_OAUTH_CLIENT_ID","GOOGLE_OAUTH_CLIENT_SECRET","MICROSOFT_OAUTH_CLIENT_ID","MICROSOFT_OAUTH_CLIENT_SECRET","OKTA_OAUTH_ISSUER","CONNECT_PUBLIC_URL") { if (-not $file.ContainsKey($k)) { $psi.EnvironmentVariables[$k] = "" } }

Get-CimInstance Win32_Process -Filter "name='bun.exe'" | Where-Object { $_.ExecutablePath -eq $bun } | ForEach-Object {
  $parent = $_.ParentProcessId
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  $pp = Get-CimInstance Win32_Process -Filter "ProcessId=$parent" -ErrorAction SilentlyContinue
  if ($pp -and $pp.Name -eq "cmd.exe") { Stop-Process -Id $parent -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 2
Add-Content $log "`n===== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Connect App Server Neustart (MAPS, restart-server.ps1) =====" -Encoding UTF8
[void][System.Diagnostics.Process]::Start($psi)
for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Seconds 2; try { $r = Invoke-WebRequest "http://127.0.0.1:$port/health" -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { "Server laeuft wieder ($([int]($i*2+2)) s)"; exit 0 } } catch {} }
"Server antwortet nicht - siehe $log"; exit 1
