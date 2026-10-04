<#
  Connect App - Bundle bauen / neu synchronisieren aus der Kopie OpenBot-v2-Helium.

  Erzeugt apps\connect-app\runtime\:
    bun\bun.exe          gebuendeltes Bun (Kopie von %USERPROFILE%\.bun\bin\bun.exe)
    pgsql\               PostgreSQL 17 (bin/lib/share) + pgvector  (aus _build\pgsql, einmalig vorbereitet)
    connect\             Snapshot von apps/server (+drizzle-Migrationen), packages/shared, apps/examples/fintech,
                         gebaute Web-UI (apps/app/dist) und Produktions-node_modules
  Liest die Quellen der Kopie NUR (Web-UI wird in einem Staging-Ordner gebaut, nichts in apps/app wird geschrieben).
  Erneut ausfuehren, um Aenderungen der Kopie (neue Migrationen, Server-/UI-Code) zu uebernehmen.
  Aufruf:  powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-bundle.ps1 [-SkipUi] [-SkipDeps]
#>
param([switch]$SkipUi, [switch]$SkipDeps)
$ErrorActionPreference = "Stop"
$App   = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path            # ...\apps\connect-app
$Root  = (Resolve-Path (Join-Path $App "..\..")).Path                  # ...\OpenBot-v2-Helium
$Build = Join-Path $App "_build"
$Bun   = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"
$Rt    = Join-Path $App "runtime"
function Say($m) { Write-Host ("[{0:HH:mm:ss}] {1}" -f (Get-Date), $m) }
function Mirror($src, $dst, [string[]]$xd = @(), [string[]]$xf = @()) {
  $ra = @($src, $dst, "/MIR", "/XJ", "/NFL", "/NDL", "/NJH", "/NJS", "/NP", "/R:1", "/W:1")
  if ($xd.Count) { $ra += "/XD"; $ra += $xd }
  if ($xf.Count) { $ra += "/XF"; $ra += $xf }
  & robocopy @ra | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy $src -> $dst fehlgeschlagen ($LASTEXITCODE)" }
}
if (-not (Test-Path (Join-Path $Root "apps\server\src\index.ts"))) { throw "Kopie nicht gefunden: $Root" }
New-Item -ItemType Directory -Force $Build, $Rt | Out-Null

# 1) Bun + PostgreSQL
New-Item -ItemType Directory -Force (Join-Path $Rt "bun") | Out-Null
$bunDst = Join-Path $Rt "bun\bun.exe"
if (-not (Test-Path $bunDst) -or (Get-FileHash $Bun).Hash -ne (Get-FileHash $bunDst).Hash) { Copy-Item $Bun $bunDst -Force }
Say "Bun $(& $Bun --version) gebuendelt"
$pgSrc = Join-Path $Build "pgsql"
if (Test-Path (Join-Path $pgSrc "bin\pg_ctl.exe")) {
  New-Item -ItemType Directory -Force (Join-Path $Rt "pgsql") | Out-Null
  foreach ($d in "bin", "lib", "share") { Mirror (Join-Path $pgSrc $d) (Join-Path $Rt "pgsql\$d") @("pgxs") }
  Copy-Item (Join-Path $pgSrc "server_license.txt") (Join-Path $Rt "pgsql\LICENSE-PostgreSQL.txt") -Force -EA SilentlyContinue
  if (-not (Test-Path (Join-Path $Rt "pgsql\lib\vector.dll"))) { throw "pgvector (vector.dll) fehlt in _build\pgsql\lib" }
  Say "PostgreSQL + pgvector gebuendelt"
} elseif (-not (Test-Path (Join-Path $Rt "pgsql\bin\pg_ctl.exe"))) { throw "PostgreSQL fehlt (_build\pgsql). Siehe README 'Bundle bauen'." }

# 1b) helium-shell-Extension als gebuendelte Kopie (Quelle apps/helium-shell wird nur gelesen);
#     Connect-URL der Kopie auf den Port der App umgestellt (Standard 3101, siehe connect-app.json).
$port = 3101
$cfgFile = Join-Path $App "connect-app.json"
if (Test-Path $cfgFile) { try { $c = Get-Content $cfgFile -Raw | ConvertFrom-Json; if ($c.AppPort) { $port = [int]$c.AppPort } } catch { } }
$extDst = Join-Path $App "extension"
Mirror (Join-Path $Root "apps\helium-shell") $extDst @("setup", ".git", "node_modules") @("*.bak-helium", "*.md")
& (Join-Path $PSScriptRoot "patch-extension.ps1") -ExtDir $extDst -Port $port | ForEach-Object { Say "  $_" }
$extVer = (Get-Content (Join-Path $extDst "manifest.json") -Raw | ConvertFrom-Json).version
Say "Extension helium-shell $extVer gebuendelt (Port $port)"

# 2) Web-UI im Staging bauen (apps/app wird nur gelesen)
$ws = Join-Path $Build "ws"
$dist = Join-Path $Build "dist"
if (-not $SkipUi) {
  $stApp = Join-Path $ws "apps\app"
  Mirror (Join-Path $Root "apps\app") $stApp @("node_modules", "dist", "tests") @("*.bak-helium")
  Copy-Item (Join-Path $Root "tsconfig.base.json") (Join-Path $ws "tsconfig.base.json") -Force
  $nm = Join-Path $stApp "node_modules"
  if (-not (Test-Path $nm)) { cmd /c mklink /J "`"$nm`"" "`"$(Join-Path $Root 'apps\app\node_modules')`"" | Out-Null }
  Say "Baue Web-UI (vite build, Staging) ..."
  Push-Location $stApp
  try {
    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    & $Bun --bun node_modules/vite/bin/vite.js build --outDir $dist --emptyOutDir 2>&1 | ForEach-Object { "$_" } | Select-Object -Last 8
    $code = $LASTEXITCODE; $ErrorActionPreference = $prev
    if ($code -ne 0 -or -not (Test-Path (Join-Path $dist "index.html"))) { throw "vite build fehlgeschlagen ($code)" }
  } finally { Pop-Location }
  Say "Web-UI gebaut: $dist"
}

# 3) Server-Snapshot + Produktions-Abhaengigkeiten
$srv = Join-Path $Build "server"
Mirror (Join-Path $Root "apps\server") (Join-Path $srv "apps\server") @("node_modules", "tests", ".turbo") @("*.bak-helium", "*.test.ts")
Mirror (Join-Path $Root "packages\shared") (Join-Path $srv "packages\shared") @("node_modules", "tests") @("*.bak-helium", "*.test.ts")
Mirror (Join-Path $Root "apps\examples\fintech") (Join-Path $srv "apps\examples\fintech") @("node_modules") @("*.bak-helium")
Copy-Item (Join-Path $Root "tsconfig.base.json") $srv -Force
Copy-Item (Join-Path $Root "bun.lock") $srv -Force
if (Test-Path (Join-Path $Root "bunfig.toml")) { Copy-Item (Join-Path $Root "bunfig.toml") $srv -Force }
$rootPkg = Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json
$pkg = [ordered]@{ name = "connect-app-runtime"; private = $true; version = $rootPkg.version; workspaces = @("apps/server", "packages/shared") }
if ($rootPkg.resolutions) { $pkg.resolutions = $rootPkg.resolutions }
($pkg | ConvertTo-Json -Depth 5) | Set-Content (Join-Path $srv "package.json") -Encoding UTF8
if (-not $SkipDeps) {
  Say "bun install --production (Server) ..."
  Push-Location $srv
  try {
    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    # Lockfile der Kopie passt nicht 1:1 zum reduzierten Workspace -> erst nur Lockfile anpassen, dann flach installieren.
    & $Bun install --lockfile-only 2>&1 | ForEach-Object { "$_" } | Select-Object -Last 2
    & $Bun install --production --linker hoisted 2>&1 | ForEach-Object { "$_" } | Select-Object -Last 6
    $code = $LASTEXITCODE; $ErrorActionPreference = $prev
    if ($code -ne 0) { throw "bun install fehlgeschlagen ($code)" }
  } finally { Pop-Location }
}
# Workspace-Links (Junctions mit absolutem Ziel) durch echte Kopien ersetzen -> Bundle ist verschiebbar.
Get-ChildItem (Join-Path $srv "node_modules") -Recurse -Force -Attributes ReparsePoint -EA SilentlyContinue | ForEach-Object {
  $target = $_.Target; if ($target -is [array]) { $target = $target[0] }
  $full = $_.FullName
  if ($target -and (Test-Path $target)) {
    if (-not [IO.Path]::IsPathRooted($target)) { $target = Join-Path (Split-Path $full) $target }
    cmd /c rmdir "`"$full`"" | Out-Null
    Mirror $target $full @("node_modules")
    Say "Link ersetzt: $full"
  }
}

# 4) runtime\connect zusammensetzen
$conn = Join-Path $Rt "connect"
Mirror $srv $conn @() @()
if (Test-Path (Join-Path $dist "index.html")) { Mirror $dist (Join-Path $conn "apps\app\dist") }
Push-Location $Root
$sha = (& git rev-parse --short HEAD 2>$null); $dirty = (& git status --porcelain 2>$null | Measure-Object).Count
Pop-Location
$ver = "{0:yyyyMMdd-HHmmss}+{1}{2}" -f (Get-Date), $sha, $(if ($dirty) { "-dirty" } else { "" })
Set-Content (Join-Path $conn "BUNDLE_VERSION.txt") $ver -Encoding ASCII
$mig = (Get-ChildItem (Join-Path $conn "apps\server\drizzle") -Filter *.sql).Count
Say "Bundle fertig: $ver  ($mig Migrationen)"
"{0:N0} MB runtime gesamt" -f ((Get-ChildItem $Rt -Recurse -File | Measure-Object Length -Sum).Sum / 1MB)
