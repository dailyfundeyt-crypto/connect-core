# ============================================================
# Connect All-in-One Launcher & Self-Healing Health Check
# ============================================================
$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "                CONNECT DESKTOP & AI BROWSER                " -ForegroundColor White -BackgroundColor DarkBlue
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

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

# 1. Check PostgreSQL in WSL
Write-Host "[1/4] Ueberpruefe PostgreSQL Datenbank..." -NoNewline
$pgUp = Test-Port 5432
if (-not $pgUp) {
    Write-Host " [STARTET]" -ForegroundColor Yellow
    wsl -d Ubuntu bash -c "service postgresql status >/dev/null 2>&1 || service postgresql start"
    Start-Sleep -Seconds 2
    $pgUp = Test-Port 5432
}
if ($pgUp) {
    Write-Host " [BEREIT]" -ForegroundColor Green
} else {
    Write-Host " [WARNHINWEIS: Port 5432 nicht erreichbar]" -ForegroundColor Yellow
}

# 2. Check Connect API Server (Port 3001)
Write-Host "[2/4] Ueberpruefe Connect API Backend (Port 3001)..." -NoNewline
$apiUp = Test-Port 3001
if (-not $apiUp) {
    Write-Host " [STARTET]" -ForegroundColor Yellow
    wsl -d Ubuntu bash -c "cd '/mnt/c/Users/Kunc GmbH/Desktop/Connect/server' && nohup bun --env-file=../.env src/production-entry.ts > ../.logs/server.log 2>&1 &"
    $retries = 10
    while (-not $apiUp -and $retries -gt 0) {
        Start-Sleep -Seconds 1
        $apiUp = Test-Port 3001
        $retries--
    }
}
if ($apiUp) {
    Write-Host " [BEREIT]" -ForegroundColor Green
} else {
    Write-Host " [FEHLER: Server konnte nicht starten. Log in .logs/server.log]" -ForegroundColor Red
}

# 3. Check Connect App UI (Port 3010)
Write-Host "[3/4] Ueberpruefe Connect App UI (Port 3010)..." -NoNewline
$uiUp = Test-Port 3010
if (-not $uiUp) {
    Write-Host " [STARTET]" -ForegroundColor Yellow
    wsl -d Ubuntu bash -c "cd '/mnt/c/Users/Kunc GmbH/Desktop/Connect/app' && nohup bun run dev -- --host 0.0.0.0 --port 3010 --strictPort > ../.logs/app.log 2>&1 &"
    $retries = 10
    while (-not $uiUp -and $retries -gt 0) {
        Start-Sleep -Seconds 1
        $uiUp = Test-Port 3010
        $retries--
    }
}
if ($uiUp) {
    Write-Host " [BEREIT]" -ForegroundColor Green
} else {
    Write-Host " [FEHLER: App UI konnte nicht starten]" -ForegroundColor Red
}

# 4. Launch Connect Desktop (Native Windows App with AI Browser)
Write-Host "[4/4] Starte Connect Desktop (WebView2 AI-Browser)..." -ForegroundColor Cyan
$exePath = "C:\Users\Kunc GmbH\Desktop\Connect\desktop\connect-browser\bin\Release\net8.0-windows\Connect Desktop.exe"

if (-not (Test-Path $exePath)) {
    Write-Host "[Connect] Kompiliere Connect Desktop..." -ForegroundColor Yellow
    dotnet build -c Release "C:\Users\Kunc GmbH\Desktop\Connect\desktop\connect-browser\ConnectDesktop.csproj"
}

if (Test-Path $exePath) {
    Start-Process -FilePath $exePath
    Write-Host ""
    Write-Host "Connect Desktop wurde erfolgreich gestartet!" -ForegroundColor Green
    Write-Host "- Workspace:   http://127.0.0.1:3010" -ForegroundColor White
    Write-Host "- API Server:  http://127.0.0.1:3001" -ForegroundColor White
    Write-Host "- AI Browser:  Integrierter Chromium/WebView2 Browser" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "[Connect] FEHLER: Connect Desktop.exe nicht gefunden." -ForegroundColor Red
    Read-Host "Druecke Enter zum Beenden"
}
