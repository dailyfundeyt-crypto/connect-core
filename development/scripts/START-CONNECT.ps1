# ============================================================
# Connect Launcher (connect-desktop.exe)
# ============================================================
param(
  [switch]$Dev,
  [switch]$Build,
  [switch]$Schnell
)

$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$desktop = Join-Path $root "desktop"

$env:CONNECT_PRODUCT_WINDOW = "1"
$env:CONNECT_ROOT = $root
$env:CONNECT_FORCE_START = "1"

function Test-Port([int]$port) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect("127.0.0.1", $port, $null, $null)
        $wait = $iar.AsyncWaitHandle.WaitOne(800, $false)
        if ($wait) {
            $tcp.EndConnect($iar)
            $tcp.Close()
            return $true
        }
        $tcp.Close()
        return $false
    } catch {
        return $false
    }
}

function Start-UiIfNeeded {
    $uiOk = (Test-Port 3010) -and (Test-Port 3001)
    if ($uiOk) {
        Write-Host "[Connect] Stack laeuft bereits (Port 3010 + 3001)." -ForegroundColor Green
        return
    }
    Write-Host "[Connect] Starte Backend und App in WSL..." -ForegroundColor Yellow
    
    # 1. PostgreSQL in WSL
    if (-not (Test-Port 5432)) {
        wsl -d Ubuntu bash -c "service postgresql status >/dev/null 2>&1 || service postgresql start"
    }

    # 2. Server (3001) in WSL
    if (-not (Test-Port 3001)) {
        wsl -d Ubuntu bash -c "cd '/mnt/c/Users/Kunc GmbH/Desktop/Connect/server' && nohup bun --env-file=../.env src/production-entry.ts > ../.logs/server.log 2>&1 &"
    }

    # 3. App UI (3010) in WSL
    if (-not (Test-Port 3010)) {
        wsl -d Ubuntu bash -c "cd '/mnt/c/Users/Kunc GmbH/Desktop/Connect/app' && nohup bun run dev -- --host 0.0.0.0 --port 3010 --strictPort > ../.logs/app.log 2>&1 &"
    }

    # Wait for port 3010
    $retries = 15
    while (-not (Test-Port 3010) -and $retries -gt 0) {
        Start-Sleep -Seconds 1
        $retries--
    }
}

Write-Host ""
Write-Host "[Connect] Starte Connect Desktop (WPF + WebView2)..." -ForegroundColor Cyan

# Reihenfolge der Exe-Suche:
#  1) desktop/connect-browser/bin/Release/.../Connect Desktop.exe  (WPF + WebView2, mit Comet-Browser)
#  2) desktop/connect-browser/bin/Debug/.../Connect Desktop.exe    (WPF Debug)
#  3) desktop/src-tauri/target/release/connect-desktop.exe         (Tauri-Fallback, kein Comet-Browser)
#  4) desktop/src-tauri/target/debug/connect-desktop.exe           (Tauri Debug)
$wpfRelease = Join-Path $desktop "connect-browser\bin\Release\net8.0-windows\Connect Desktop.exe"
$wpfDebug   = Join-Path $desktop "connect-browser\bin\Debug\net8.0-windows\Connect Desktop.exe"
$tauriRelease = Join-Path $desktop "src-tauri\target\release\connect-desktop.exe"
$tauriDebug   = Join-Path $desktop "src-tauri\target\debug\connect-desktop.exe"

$exe = $null
$exeKind = "none"
if (Test-Path $wpfRelease)    { $exe = $wpfRelease;    $exeKind = "WPF-Release" }
elseif (Test-Path $wpfDebug)  { $exe = $wpfDebug;      $exeKind = "WPF-Debug" }
elseif (Test-Path $tauriRelease) { $exe = $tauriRelease; $exeKind = "Tauri-Release" }
elseif (Test-Path $tauriDebug)   { $exe = $tauriDebug;   $exeKind = "Tauri-Debug" }

if ($exe) {
    if (-not $Schnell) { Start-UiIfNeeded }
    Write-Host "[Connect] Starte ($exeKind): $exe" -ForegroundColor Green
    Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe -Parent)
    exit 0
}

Write-Host "[Connect] FEHLER: Weder Connect Desktop.exe (WPF) noch connect-desktop.exe (Tauri) gefunden." -ForegroundColor Red
Write-Host "  Erwartet unter:" -ForegroundColor Yellow
Write-Host "    $wpfRelease" -ForegroundColor Yellow
Write-Host "    $wpfDebug" -ForegroundColor Yellow
Write-Host "    $tauriRelease" -ForegroundColor Yellow
Write-Host "    $tauriDebug" -ForegroundColor Yellow
exit 1
