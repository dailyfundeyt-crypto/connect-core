# Connect Windows helper — German guidance when PowerShell users hit path/git/.sh errors.
# Usage:  powershell -ExecutionPolicy Bypass -File .\START.ps1
# Or from repo:  cd Connect; .\START.ps1

$ErrorActionPreference = "Continue"

function Write-Connect($msg) {
  Write-Host "[Connect] $msg" -ForegroundColor Cyan
}
function Write-Warn($msg) {
  Write-Host "[Connect] $msg" -ForegroundColor Yellow
}
function Write-Err($msg) {
  Write-Host "[Connect] $msg" -ForegroundColor Red
}

$here = $PSScriptRoot
if (-not $here) { $here = Get-Location }

$downloadsConnect = Join-Path $env:USERPROFILE "Downloads\Connect"
$downloadsExe = Join-Path $env:USERPROFILE "Downloads\Connect.exe"

Write-Host ""
Write-Host "  Connect — Windows-Start" -ForegroundColor White
Write-Host ""

# Prefer the native window over the host-Chrome launcher.
$connectCmd = Join-Path $here "START-CONNECT.cmd"
if (Test-Path $connectCmd) {
  Write-Connect "Natives Fenster (Titelleiste Connect, keine Adressleiste)."
  & $connectCmd
  exit $LASTEXITCODE
}

# Prefer the folder that contains START-APP.cmd
$appDir = $null
if (Test-Path (Join-Path $here "START-APP.cmd")) {
  $appDir = $here
} elseif (Test-Path (Join-Path $downloadsConnect "START-APP.cmd")) {
  $appDir = $downloadsConnect
  Write-Connect "Gefunden: $appDir"
}

if (-not $appDir) {
  Write-Err "Kein Connect/Connect-Ordner gefunden."
  Write-Host ""
  Write-Warn "In PowerShell funktionieren Linux-Befehle so nicht:"
  Write-Host "  cd Connect          → Ordner fehlt oft unter dem Benutzerprofil"
  Write-Host "  git pull …          → Git ist nicht installiert / nicht im PATH"
  Write-Host "  ./START.sh          → Bash-Skript; nutze WSL oder START-APP.cmd"
  Write-Host ""
  Write-Connect "Option 1 — Connect.exe (wenn vorhanden):"
  if (Test-Path $downloadsExe) {
    Write-Host "  Gefunden: $downloadsExe"
    Write-Host "  → Doppelklick auf Connect.exe im Explorer"
    Start-Process explorer.exe -ArgumentList "/select,`"$downloadsExe`""
  } else {
    Write-Host "  Noch keine Connect.exe unter: $downloadsExe"
  }
  Write-Host ""
  Write-Connect "Option 2 — Git installieren und Projekt klonen:"
  Write-Host "  winget install --id Git.Git -e --source winget"
  Write-Host "  # PowerShell neu oeffnen, dann clone in einen Ordner mit Unterordner Connect"
  Write-Host ""
  Write-Connect "Option 3 — Nur Browser, wenn Stack schon laeuft:"
  Write-Host "  cd `"$downloadsConnect`""
  Write-Host "  .\START-APP.cmd"
  Write-Host ""
  Write-Connect "Anleitung: Connect\WINDOWS.md"
  exit 1
}

Write-Connect "App-Ordner: $appDir"
Set-Location $appDir

$cmd = Join-Path $appDir "START-APP.cmd"
Write-Connect "Starte Connect-Browser (Chrome/Edge + Connect-Profil)…"
Write-Warn "Stack (API :3001 / UI :3010) muss laufen — sonst nur Browser ohne Steuerung."
Write-Warn "Stack unter Windows: Docker Desktop + WSL → in WSL: ./START.sh"
Write-Host ""

& $cmd
exit $LASTEXITCODE
