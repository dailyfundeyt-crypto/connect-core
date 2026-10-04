<#
  Set-ConnectUrl.ps1 - EIN Befehl, um die Connect-Adresse zu wechseln (z. B. localhost -> Vercel).

  Einzige Quelle der Adresse:  apps\helium-shell\tabs.config.js  ->  self.CONNECT_URL = "...";
  Dieses Script schreibt diese Zeile und zieht alles Abhaengige nach:
    - manifest.json: Helium-Startseite + Startseite/Home (chrome_settings_overrides), Rechte und
      Content-Script fuer die neue Adresse (host_permissions / content_scripts.matches)
    - Extension-Version (manifest "version" + SHELL_BUILD in background.js), damit Helium neu laedt
  Start-Connect.ps1 liest CONNECT_URL ebenfalls aus tabs.config.js (App-Fenster / Neuer Tab).

  Aufruf:
    Set-ConnectUrl.cmd https://mein-projekt.vercel.app     (umstellen)
    Set-ConnectUrl.cmd                                       (aktuellen Wert anzeigen)
    Set-ConnectUrl.cmd -RemoveStartPage                      (Helium-Startseite nicht mehr setzen = Undo)
    Set-ConnectUrl.cmd -Bump                                 (nur Extension-Build erhoehen, nach Code-Aenderungen)
  Danach: alle Helium-Fenster schliessen und "Connect (Helium)" starten (ab dem 2. Start gilt die neue
  Startseite auch beim normalen Helium-Start ueber Taskleiste/Startmenue).
#>
param(
  [Parameter(Position = 0)][string]$Url,
  [switch]$RemoveStartPage,
  [switch]$Bump
)
$ErrorActionPreference = "Stop"
$Ext      = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$CfgPath  = Join-Path $Ext "tabs.config.js"
$ManPath  = Join-Path $Ext "manifest.json"
$BgPath   = Join-Path $Ext "background.js"
$Utf8     = New-Object System.Text.UTF8Encoding($false)

function ReadText($p) { [IO.File]::ReadAllText($p, $Utf8) }
function WriteText($p, $t) {
  if (-not (Test-Path "$p.bak-helium")) { Copy-Item $p "$p.bak-helium" }
  [IO.File]::WriteAllText($p, ($t -replace "`r`n", "`n"), $Utf8)
}
function CurrentUrl {
  $m = [regex]::Match((ReadText $CfgPath), 'self\.CONNECT_URL\s*=\s*"([^"]*)"')
  if (-not $m.Success) { throw "CONNECT_URL nicht gefunden in $CfgPath" }
  $m.Groups[1].Value
}
function BumpBuild {
  $man = ReadText $ManPath
  $v = [regex]::Match($man, '"version":\s*"(\d+)\.(\d+)\.(\d+)"')
  $new = "{0}.{1}.{2}" -f $v.Groups[1].Value, $v.Groups[2].Value, ([int]$v.Groups[3].Value + 1)
  $man = [regex]::Replace($man, '"version":\s*"[^"]*"', "`"version`": `"$new`"", 1)
  # Versionierter Service-Worker-Lader (neuer Dateiname erzwingt frischen Extension-Code, siehe background.js)
  $man = [regex]::Replace($man, '"service_worker":\s*"[^"]*"', "`"service_worker`": `"sw-$new.js`"", 1)
  WriteText $ManPath $man
  Get-ChildItem $Ext -Filter "sw-*.js" | Remove-Item -Force
  [IO.File]::WriteAllText((Join-Path $Ext "sw-$new.js"), "// Versionierter Service-Worker-Lader (Dateiname = Build, siehe background.js). Nicht von Hand aendern.`nimportScripts(`"background.js`");`n", $Utf8)
  $bg = ReadText $BgPath
  WriteText $BgPath ([regex]::Replace($bg, 'const SHELL_BUILD = "[^"]*";', "const SHELL_BUILD = `"$new`";", 1))
  $new
}

$old = CurrentUrl
if ($Bump) { $b = BumpBuild; Write-Host "Extension-Build $b (Lader sw-$b.js). Helium schliessen und 'Connect (Helium)' starten." -ForegroundColor Green; exit 0 }
if ($RemoveStartPage) {
  $man = ReadText $ManPath
  $man2 = [regex]::Replace($man, ',\s*"chrome_settings_overrides":\s*\{[^{}]*?"startup_pages":\s*\[[^\]]*\]\s*\}', '')
  if ($man2 -eq $man) { Write-Host "Helium-Startseite ist nicht (mehr) gesetzt."; exit 0 }
  WriteText $ManPath $man2
  $b = BumpBuild
  Write-Host "Helium-Startseite entfernt (Extension ${b}). Helium schliessen und 'Connect (Helium)' starten." -ForegroundColor Green
  exit 0
}
if (-not $Url) { Write-Host "CONNECT_URL = $old   (Datei: $CfgPath)"; exit 0 }

$Url = $Url.Trim().TrimEnd("/")
if ($Url -notmatch '^https?://[^/\s]+') { throw "Ungueltige URL: $Url (erwartet z. B. https://projekt.vercel.app)" }
$origin = ([Uri]$Url).GetLeftPart([UriPartial]::Authority)
$pattern = "$origin/*"

# 1) tabs.config.js
$cfg = ReadText $CfgPath
WriteText $CfgPath ([regex]::Replace($cfg, 'self\.CONNECT_URL\s*=\s*"[^"]*";', "self.CONNECT_URL = `"$Url`";", 1))

# 2) manifest.json: Startseite + Rechte/Content-Script fuer die neue Adresse
$man = ReadText $ManPath
$man = [regex]::Replace($man, '("chrome_settings_overrides":\s*\{\s*"homepage":\s*)"[^"]*"', "`$1`"$Url/`"")
$man = [regex]::Replace($man, '("startup_pages":\s*\[\s*)"[^"]*"', "`$1`"$Url/`"")
if ($man -notmatch '"chrome_settings_overrides"') {
  $man = $man -replace '("chrome_url_overrides":\s*\{[^{}]*\},)', "`$1`n  `"chrome_settings_overrides`": {`n    `"homepage`": `"$Url/`",`n    `"startup_pages`": [`n      `"$Url/`"`n    ]`n  },"
}
if (-not $man.Contains("`"$pattern`"")) {
  $man = [regex]::Replace($man, '(\r?\n[ \t]*)"http://127\.0\.0\.1:3010/\*"', "`$1`"http://127.0.0.1:3010/*`",`$1`"$pattern`"")
}
WriteText $ManPath $man
$b = BumpBuild

Write-Host "CONNECT_URL: $old  ->  $Url" -ForegroundColor Green
Write-Host "Extension ${b}: Startseite/Home = $Url/, Rechte fuer $pattern"
Write-Host "Jetzt alle Helium-Fenster schliessen und 'Connect (Helium)' starten."
