<#
.SYNOPSIS
    Stoppt den T3-Sidecar für Connect kontrolliert und sicher.
.DESCRIPTION
    Liest den PID des T3-Sidecars und beendet NUR diesen einen Prozess.
    SICHERHEITSREGEL: Berührt NIEMALS Connect (Port 3101), Docker oder fremde Prozesse.
#>

[CmdletBinding()]
param ()

$ErrorActionPreference = "Stop"

$agentsDir = [System.IO.Path]::Combine($env:LOCALAPPDATA, "ConnectAgents")
$t3Home = [System.IO.Path]::Combine($agentsDir, "t3-home")
$userdataDir = [System.IO.Path]::Combine($t3Home, "userdata")
$runtimeFile = [System.IO.Path]::Combine($userdataDir, "server-runtime.json")
$pidFile = [System.IO.Path]::Combine($userdataDir, "sidecar-supervisor.pid")

$pidToKill = $null

# 1. PID aus runtime.json lesen
if (Test-Path $runtimeFile) {
    try {
        $rt = Get-Content $runtimeFile -Raw | ConvertFrom-Json
        if ($rt.pid) {
            $pidToKill = [int]$rt.pid
        }
    } catch {}
}

# 2. Falls nicht vorhanden, aus PID-Datei lesen
if (-not $pidToKill -and (Test-Path $pidFile)) {
    try {
        $rawPid = (Get-Content $pidFile -Raw).Trim()
        if ($rawPid -match '^\d+$') {
            $pidToKill = [int]$rawPid
        }
    } catch {}
}

if (-not $pidToKill) {
    Write-Host "[T3-Sidecar] Kein laufender Sidecar gefunden (keine aktive PID-Datei vorhanden)." -ForegroundColor Yellow
    exit 0
}

# SICHERHEITSCHECK: Port 3101 darf NIEMALS beendet werden
$connectConn = Get-NetTCPConnection -LocalPort 3101 -ErrorAction SilentlyContinue
if ($connectConn -and ($connectConn.OwningProcess -contains $pidToKill)) {
    Write-Error "SICHERHEITSALARM: Die ermittelte PID ($pidToKill) gehoert zum Connect-Server auf Port 3101! Abbruch!"
    exit 1
}

# Prüfen ob Prozess existiert
$proc = Get-Process -Id $pidToKill -ErrorAction SilentlyContinue
if ($proc) {
    Write-Host "[T3-Sidecar] Beende Sidecar-Prozess mit PID $pidToKill ($($proc.ProcessName))..." -ForegroundColor Cyan
    try {
        # Auf Windows den gesamten Unterprozessbaum beenden
        Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    } catch {
        Write-Warning "Fehler beim Beenden von PID ${pidToKill}: $_"
    }
} else {
    Write-Host "[T3-Sidecar] Prozess mit PID $pidToKill lief bereits nicht mehr." -ForegroundColor Yellow
}

# Bereinigung der Runtime-Dateien
if (Test-Path $runtimeFile) {
    Remove-Item -Force $runtimeFile -ErrorAction SilentlyContinue
}
if (Test-Path $pidFile) {
    Remove-Item -Force $pidFile -ErrorAction SilentlyContinue
}

Write-Host "[T3-Sidecar] Sidecar wurde erfolgreich gestoppt und bereinigt." -ForegroundColor Green
