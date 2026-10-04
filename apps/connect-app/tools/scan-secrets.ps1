<#
  Secrets-Scan fuer das Installer-Paket der Connect App.
  Prueft alle Dateien, die ins Setup kommen (Connect.exe, helium\, extension\, runtime\, README, connect-app.json):
   1. keine .env-Dateien,
   2. kein einziger Secret-WERT aus der .env der Entwickler-Kopie (KEY/SECRET/TOKEN/PASSWORD/... >= 12 Zeichen),
   3. typische Key-Muster (sk-..., ghp_..., AIza..., private keys) - nur informativ, node_modules enthaelt Doku-Beispiele.
  Exit 1 bei Treffern aus 1 oder 2.
#>
param([string]$App = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path)
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $App "..\..")).Path
$targets = @("Connect.exe", "README.md", "connect-app.json", "connect-app.ico", "helium", "extension", "runtime") | ForEach-Object { Join-Path $App $_ } | Where-Object { Test-Path $_ }
$files = foreach ($t in $targets) { if ((Get-Item $t).PSIsContainer) { Get-ChildItem $t -Recurse -File -Force } else { Get-Item $t } }
$binExt = @(".dll", ".exe", ".pak", ".dat", ".bin", ".node", ".wasm", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".mo", ".lib", ".pdb", ".zip", ".gz", ".br", ".mp3", ".mp4", ".avif")
$text = $files | Where-Object { $binExt -notcontains $_.Extension.ToLowerInvariant() -and $_.Length -lt 20MB }
Write-Host ("Dateien gesamt: {0}, davon Text gescannt: {1}" -f $files.Count, $text.Count)
$fail = 0

$envFiles = $files | Where-Object { $_.Name -match '^\.env($|\.)' -and $_.Name -notmatch '\.example$' }
foreach ($f in $envFiles) { Write-Host "FEHLER .env-Datei im Paket: $($f.FullName)" -ForegroundColor Red; $fail++ }

$secrets = @{}
$envPath = Join-Path $Root ".env"
if (Test-Path $envPath) {
  foreach ($line in Get-Content $envPath) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$') {
      $k = $Matches[1]; $v = $Matches[2].Trim('"', "'")
      if ($k -match 'KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL|CLIENT_ID' -and $v.Length -ge 12) { $secrets[$k] = $v }
    }
  }
}
# auch die erzeugte connect.env der App (darf nie ins Paket)
$appEnv = Join-Path $env:LOCALAPPDATA "ConnectApp\data\connect.env"
if (Test-Path $appEnv) { foreach ($line in Get-Content $appEnv) { if ($line -match '^([A-Z0-9_]+)=(.{12,})$') { $k = $Matches[1]; $v = $Matches[2]; if ($k -match 'KEY|SECRET|TOKEN|PASSWORD') { $secrets["app:" + $k] = $v } } } }
# Werte, die schon oeffentlich in .env.example / im Quellcode als Platzhalter stehen, sind keine Geheimnisse
# (z. B. der dokumentierte Platzhalter-KEY_ENCRYPTION_KEY, den die Dev-Kopie nutzt; die App erzeugt eigene Keys).
$public = @()
foreach ($ex in (Get-ChildItem $Root -Filter ".env.example" -File -Recurse -Depth 3 -EA SilentlyContinue | Where-Object { $_.FullName -notmatch '\\node_modules\\' })) { $public += [IO.File]::ReadAllText($ex.FullName) }
foreach ($k in @($secrets.Keys)) { foreach ($pt in $public) { if ($pt.Contains($secrets[$k])) { Write-Host "  Hinweis: $k ist ein oeffentlicher Platzhalter aus .env.example (kein Geheimnis) - ignoriert" -ForegroundColor Yellow; $secrets.Remove($k); break } } }
Write-Host "Pruefe $($secrets.Count) konkrete Secret-Werte (aus .env der Kopie + connect.env der App) ..."
$hits = @{}
foreach ($f in $text) {
  $c = [IO.File]::ReadAllText($f.FullName)
  foreach ($kv in $secrets.GetEnumerator()) { if ($c.Contains($kv.Value)) { $hits["$($kv.Key) in $($f.FullName)"] = 1 } }
}
# Binaerdateien des eigenen Codes (Connect.exe) ebenfalls byteweise pruefen
foreach ($f in ($files | Where-Object { $_.Name -eq "Connect.exe" })) {
  $b = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($f.FullName)); $u = [Text.Encoding]::Unicode.GetString([IO.File]::ReadAllBytes($f.FullName))
  foreach ($kv in $secrets.GetEnumerator()) { if ($b.Contains($kv.Value) -or $u.Contains($kv.Value)) { $hits["$($kv.Key) in $($f.FullName)"] = 1 } }
}
foreach ($h in $hits.Keys) { Write-Host "FEHLER Secret-Wert gefunden: $h" -ForegroundColor Red; $fail++ }

$patterns = @{ "OpenAI sk-" = 'sk-(proj-)?[A-Za-z0-9_-]{32,}'; "GitHub token" = 'gh[pousr]_[A-Za-z0-9]{36}'; "Google API key" = 'AIza[0-9A-Za-z_-]{35}'; "Private key" = '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'; "Slack token" = 'xox[baprs]-[0-9A-Za-z-]{10,}' }
foreach ($p in $patterns.GetEnumerator()) {
  $m = $text | Select-String -Pattern $p.Value -List -ErrorAction SilentlyContinue
  $own = $m | Where-Object { $_.Path -notmatch '\\node_modules\\' }
  Write-Host ("Muster {0}: {1} Datei(en) (davon ausserhalb node_modules: {2})" -f $p.Key, @($m).Count, @($own).Count)
  foreach ($o in $own) { Write-Host "   pruefen: $($o.Path):$($o.LineNumber)" -ForegroundColor Yellow }
}
if ($fail) { Write-Host "SECRETS-SCAN FEHLGESCHLAGEN ($fail)" -ForegroundColor Red; exit 1 }
Write-Host "SECRETS-SCAN OK: keine .env-Dateien, keine Secret-Werte im Paket." -ForegroundColor Green
