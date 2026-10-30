<#
.SYNOPSIS
    Startet den T3-Sidecar für Connect (isoliert auf 127.0.0.1).
.DESCRIPTION
    Startet den T3-Server aus dem Fork mit eigenem T3-Home unter %LOCALAPPDATA%\ConnectAgents\t3-home.
    Berührt NIEMALS Connect (Port 3101), Docker oder Stefans Desktop-Home (~/.t3).
#>

[CmdletBinding()]
param (
    [int]$Port = 3773,
    [string]$HostAddress = "127.0.0.1",
    [switch]$Background
)

$ErrorActionPreference = "Stop"

$agentsDir = [System.IO.Path]::Combine($env:LOCALAPPDATA, "ConnectAgents")
$t3Home = [System.IO.Path]::Combine($agentsDir, "t3-home")
$userdataDir = [System.IO.Path]::Combine($t3Home, "userdata")
$logsDir = [System.IO.Path]::Combine($agentsDir, "logs")
$runtimeFile = [System.IO.Path]::Combine($userdataDir, "server-runtime.json")
$logFile = [System.IO.Path]::Combine($logsDir, "t3-sidecar.log")
$pidFile = [System.IO.Path]::Combine($userdataDir, "sidecar-supervisor.pid")

$t3Source = "C:\Users\Kunc GmbH\.gemini\antigravity\scratch\t3code"
$distEntry = [System.IO.Path]::Combine($t3Source, "apps", "server", "dist", "bin.mjs")

if (-not (Test-Path $distEntry)) {
    Write-Error "T3-Server-Bundle nicht gefunden unter: $distEntry"
    exit 1
}

# Verzeichnisse anlegen falls nötig
New-Item -ItemType Directory -Force -Path $t3Home | Out-Null
New-Item -ItemType Directory -Force -Path $userdataDir | Out-Null
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

# Prüfen ob bereits aktiv (stale Runtime-Dateien aufräumen)
if (Test-Path $runtimeFile) {
    try {
        $rt = Get-Content $runtimeFile -Raw | ConvertFrom-Json
        if ($rt.pid -and (Get-Process -Id $rt.pid -ErrorAction SilentlyContinue)) {
            Write-Host "[T3-Sidecar] Läuft bereits auf Port $($rt.port) (PID $($rt.pid))." -ForegroundColor Yellow
            exit 0
        } else {
            Remove-Item -Force $runtimeFile -ErrorAction SilentlyContinue
        }
    } catch {
        Remove-Item -Force $runtimeFile -ErrorAction SilentlyContinue
    }
}

# Port auf Verfügbarkeit prüfen
$conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "[T3-Sidecar] Port $Port ist belegt. Suche nächsten freien Port..." -ForegroundColor Yellow
    for ($p = $Port + 1; $p -le $Port + 50; $p++) {
        if (-not (Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue)) {
            $Port = $p
            break
        }
    }
}

Write-Host "[T3-Sidecar] Starte T3-Server auf http://${HostAddress}:${Port}..." -ForegroundColor Cyan
Write-Host "  T3-Home:  $t3Home"
Write-Host "  Logdatei: $logFile"

$env:T3CODE_HOME = $t3Home
$env:T3HERMES_HOME = $t3Home
$env:T3CODE_HOST = $HostAddress
$env:T3HERMES_PORT = "$Port"
$env:T3CODE_NO_BROWSER = "true"
$env:T3CODE_MODE = "web"

$nodeArgs = @(
    $distEntry,
    "serve",
    "--host", $HostAddress,
    "--port", "$Port",
    "--base-dir", $t3Home,
    "--no-browser"
)

$quotedArgs = $nodeArgs | ForEach-Object {
    if ($_ -match '\s') { "`"$_`"" } else { $_ }
}

if ($Background) {
    $proc = Start-Process -FilePath "node" -ArgumentList $quotedArgs -WorkingDirectory $t3Source -WindowStyle Minimized -PassThru
    $sidecarPid = $proc.Id

    [System.IO.File]::WriteAllText($pidFile, "$sidecarPid")

    # Auf Bereitschaft warten (max 15s)
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-Path $runtimeFile) {
            try {
                $check = Invoke-WebRequest -Uri "http://${HostAddress}:${Port}/manifest.webmanifest" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
                if ($check.StatusCode -lt 500) {
                    $ready = $true
                    break
                }
            } catch {}
        }
    }

    if ($ready) {
        Write-Host "[T3-Sidecar] Erfolgreich im Hintergrund gestartet und erreichbar (PID $sidecarPid)." -ForegroundColor Green
    } else {
        Write-Host "[T3-Sidecar] Prozess gestartet (PID $sidecarPid), Initialisierung laeuft..." -ForegroundColor Yellow
    }
} else {
    Write-Host "[T3-Sidecar] Server läuft im Vordergrund. Drücke Strg+C zum Beenden.`n" -ForegroundColor DarkGray
    & node $nodeArgs
}
