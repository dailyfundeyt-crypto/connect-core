<#
.SYNOPSIS
    Prüft Windows-Voraussetzungen für Cua-Maschinen (WSL2, Hyper-V, Virtualisierung, Cua-CLI).
.DESCRIPTION
    Lane: A19 (Cua-Maschinen-Backend)
    Prüft:
    1. Windows-Plattform und Virtualisierung
    2. WSL2-Status
    3. Cua-CLI Installation & Version
    4. Cua Runtime Doctor
    WICHTIG: Docker von OpenBot-v2 wird NIEMALS angefasst oder gestoppt!
#>

[CmdletBinding()]
param(
    [switch]$Detailed
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [Cua-Maschinen] Windows-Voraussetzungspruefung (Lane A19)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$AllOk = $true
$Issues = @()

# 1. Betriebssystem
$OS = Get-CimInstance Win32_OperatingSystem
Write-Host "[OS] Windows Version: $($OS.Caption) ($($OS.Version))" -ForegroundColor Gray

# 2. Virtualisierung / Hyper-V
Write-Host "--> Pruefe Hardware-Virtualisierung / Hypervisor..." -ForegroundColor Yellow
$HypervisorPresent = (Get-CimInstance Win32_ComputerSystem).HypervisorPresent
if ($HypervisorPresent) {
    Write-Host "  [OK] Hypervisor / Virtualisierung ist im BIOS/UEFI aktiviert." -ForegroundColor Green
} else {
    Write-Host "  [WARNUNG] HypervisorPresent ist FALSE. Hardware-Virtualisierung koennte im BIOS deaktiviert sein." -ForegroundColor Red
    $Issues += "Hardware-Virtualisierung im BIOS/UEFI aktivieren."
    $AllOk = $false
}

# 3. WSL2 Status
Write-Host "--> Pruefe WSL2..." -ForegroundColor Yellow
$WslInstalled = Get-Command wsl -ErrorAction SilentlyContinue
if ($WslInstalled) {
    try {
        $WslStatus = wsl --status 2>&1 | Out-String
        if ($WslStatus -match "Standardversion:\s*2" -or $WslStatus -match "Default Version:\s*2" -or $LASTEXITCODE -eq 0) {
            Write-Host "  [OK] WSL2 ist verfuegbar." -ForegroundColor Green
        } else {
            Write-Host "  [INFO] WSL gefunden, aber Standardversion ist evtl. nicht 2." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  [WARNUNG] Fehler beim Abrufen des WSL-Status." -ForegroundColor Yellow
    }
} else {
    Write-Host "  [WARNUNG] wsl.exe wurde nicht gefunden. WSL2 wird fuer lokale Sandboxes empfohlen." -ForegroundColor Red
    $Issues += "WSL2 installieren (z.B. per 'wsl --install')."
}

# 4. Cua-CLI Prufung
Write-Host "--> Pruefe Cua-CLI..." -ForegroundColor Yellow
$CuaPath = $null

if ($env:CUA_BIN -and (Test-Path $env:CUA_BIN)) {
    $CuaPath = $env:CUA_BIN
} else {
    $Candidate = Join-Path $env:LOCALAPPDATA "Programs\cua\bin\cua.exe"
    if (Test-Path $Candidate) {
        $CuaPath = $Candidate
    } else {
        $InPath = Get-Command cua -ErrorAction SilentlyContinue
        if ($InPath) {
            $CuaPath = $InPath.Source
        }
    }
}

if ($CuaPath) {
    Write-Host "  [OK] Cua-CLI gefunden: $CuaPath" -ForegroundColor Green
    try {
        $VersionOutput = & $CuaPath --version
        Write-Host "  [OK] Version: $VersionOutput" -ForegroundColor Green
    } catch {
        Write-Host "  [FEHLER] Konnte Version nicht abfragen: $_" -ForegroundColor Red
        $AllOk = $false
    }

    Write-Host "--> Fuehre 'cua runtime doctor' aus..." -ForegroundColor Yellow
    try {
        $DoctorOutput = & $CuaPath runtime doctor 2>&1
        $DoctorOutput | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
    } catch {
        Write-Host "  [WARNUNG] 'cua runtime doctor' konnte nicht ausgefuehrt werden." -ForegroundColor Yellow
    }
} else {
    Write-Host "  [FEHLER] Cua-CLI nicht gefunden!" -ForegroundColor Red
    Write-Host "  Installation ueber PowerShell moeglich mit:" -ForegroundColor Cyan
    Write-Host "    irm https://cua.ai/install.ps1 | iex" -ForegroundColor White
    $Issues += "Cua-CLI installieren ('irm https://cua.ai/install.ps1 | iex')."
    $AllOk = $false
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
if ($AllOk) {
    Write-Host " ERGEBNIS: System erfuellt alle Cua-Voraussetzungen." -ForegroundColor Green
} else {
    Write-Host " ERGEBNIS: Voraussetzungen unvollstaendig:" -ForegroundColor Red
    $Issues | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}
Write-Host "==========================================================" -ForegroundColor Cyan
