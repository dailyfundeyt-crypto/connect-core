<#
  Connect App - kompletter Installer-Bau:
    1. Launcher (Connect.exe, self-contained .NET 8) bauen
    2. Bundle aus der Kopie synchronisieren (build-bundle.ps1: Web-UI, Server, Migrationen, Extension, Bun, PostgreSQL)
    3. Secrets-Scan (scan-secrets.ps1) - bricht bei Treffern ab
    4. Inno Setup -> apps\connect-app\dist\ConnectApp-Setup-<Version>.exe
  Aufruf: powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-installer.ps1 [-Version 1.1.0] [-SkipBundle]
#>
param([string]$Version = "1.1.0", [switch]$SkipBundle)
$ErrorActionPreference = "Stop"
$App = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
function Say($m) { Write-Host ("[{0:HH:mm:ss}] {1}" -f (Get-Date), $m) -ForegroundColor Cyan }
Say "1/4 Launcher bauen"
Push-Location (Join-Path $App "src\launcher")
try { & dotnet publish -c Release -o (Join-Path $App "_build\publish") -p:Version=$Version | Select-Object -Last 2; if ($LASTEXITCODE) { throw "dotnet publish fehlgeschlagen" } } finally { Pop-Location }
$exe = Join-Path $App "Connect.exe"
try { Copy-Item (Join-Path $App "_build\publish\Connect.exe") $exe -Force -ErrorAction Stop } catch { $old = Join-Path $App "_build\Connect.exe.old"; Remove-Item $old -Force -EA SilentlyContinue; Move-Item $exe $old -Force; Copy-Item (Join-Path $App "_build\publish\Connect.exe") $exe -Force }
Copy-Item (Join-Path $App "src\launcher\connect-app.ico") (Join-Path $App "connect-app.ico") -Force
if (-not $SkipBundle) { Say "2/4 Bundle synchronisieren"; & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build-bundle.ps1"); if ($LASTEXITCODE) { throw "build-bundle fehlgeschlagen" } }
Say "3/4 Secrets-Scan"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "scan-secrets.ps1"); if ($LASTEXITCODE) { throw "Secrets-Scan fehlgeschlagen - Installer wird NICHT gebaut" }
Say "4/4 Inno Setup"
$iscc = @("C:\Program Files\Inno Setup 7\ISCC.exe", "C:\Program Files (x86)\Inno Setup 6\ISCC.exe", "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw "ISCC.exe (Inno Setup) nicht gefunden" }
New-Item -ItemType Directory -Force (Join-Path $App "dist") | Out-Null
& $iscc /Q "/DAppVer=$Version" (Join-Path $PSScriptRoot "connect-app.iss"); if ($LASTEXITCODE) { throw "ISCC fehlgeschlagen ($LASTEXITCODE)" }
$out = Join-Path $App "dist\ConnectApp-Setup-$Version.exe"
Say ("Fertig: {0} ({1:N0} MB)" -f $out, ((Get-Item $out).Length / 1MB))
(Get-FileHash $out -Algorithm SHA256).Hash | Set-Content "$out.sha256" -Encoding ASCII
