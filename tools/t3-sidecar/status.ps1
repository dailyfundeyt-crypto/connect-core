<#
.SYNOPSIS
    Gibt den aktuellen Status des T3-Sidecars aus.
#>

[CmdletBinding()]
param ()

$agentsDir = [System.IO.Path]::Combine($env:LOCALAPPDATA, "ConnectAgents")
$t3Home = [System.IO.Path]::Combine($agentsDir, "t3-home")
$userdataDir = [System.IO.Path]::Combine($t3Home, "userdata")
$runtimeFile = [System.IO.Path]::Combine($userdataDir, "server-runtime.json")
$logFile = [System.IO.Path]::Combine($agentsDir, "logs", "t3-sidecar.log")

Write-Host "==========================================" -ForegroundColor DarkCyan
Write-Host "       T3-Sidecar Statusbericht          " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor DarkCyan

Write-Host "T3-Home:      $t3Home"
Write-Host "Runtime-File: $runtimeFile"
Write-Host "Log-File:     $logFile"

if (-not (Test-Path $runtimeFile)) {
    Write-Host "`nStatus:       GESTOPPT (keine server-runtime.json)" -ForegroundColor Yellow
    exit 0
}

try {
    $rt = Get-Content $runtimeFile -Raw | ConvertFrom-Json
    $pidNum = [int]$rt.pid
    $proc = Get-Process -Id $pidNum -ErrorAction SilentlyContinue

    $procName = "Nicht aktiv"
    if ($proc) {
        $procName = $proc.ProcessName
    }

    Write-Host "PID:          $pidNum ($procName)"
    Write-Host "Host:         $($rt.host)"
    Write-Host "Port:         $($rt.port)"
    Write-Host "Origin:       $($rt.origin)"
    Write-Host "Version:      $($rt.serverVersion)"
    Write-Host "Gestartet:    $($rt.startedAt)"

    if (-not $proc) {
        Write-Host "`nStatus:       FEHLER (Prozess existiert nicht mehr, veraltetes Runtime-File)" -ForegroundColor Red
        exit 1
    }

    # Healthcheck
    $healthy = $false
    $statusCode = 0
    try {
        $res = Invoke-WebRequest -Uri "$($rt.origin)/manifest.webmanifest" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        $statusCode = $res.StatusCode
        if ($statusCode -lt 500) {
            $healthy = $true
        }
    } catch {
        try {
            $res = Invoke-WebRequest -Uri "$($rt.origin)/" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
            $statusCode = $res.StatusCode
            if ($statusCode -lt 500) {
                $healthy = $true
            }
        } catch {}
    }

    if ($healthy) {
        Write-Host "`nStatus:       LAEUFT UND BEREIT (HTTP $statusCode)" -ForegroundColor Green
    } else {
        Write-Host "`nStatus:       PROZESS LAEUFT, ANTWORTET JEDOCH NOCH NICHT" -ForegroundColor Yellow
    }

} catch {
    Write-Host "`nFehler beim Lesen des Status: $_" -ForegroundColor Red
}
