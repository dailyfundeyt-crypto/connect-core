<#
  Passt die GEBUENDELTE Kopie der helium-shell-Extension (apps\connect-app\extension) an die Connect App an.
  Die Quelle apps\helium-shell (Variante "Connect (Helium)") bleibt unveraendert.
   - Port 3010 -> AppPort der App (Standard 3101)
   - Connect laeuft als TAB im normalen Helium-Fenster (mit Toolbar), nie als eigenes Popup-/App-Fenster
   - Service-Worker-Datei bekommt einen eindeutigen Namen (Helium registriert sonst alten Code weiter)
#>
param([Parameter(Mandatory)][string]$ExtDir, [int]$Port = 3101)
$ErrorActionPreference = "Stop"
$utf8 = New-Object Text.UTF8Encoding $false
function ExtRead($n) { [IO.File]::ReadAllText((Join-Path $ExtDir $n)) }
function ExtWrite($n, $t) { [IO.File]::WriteAllText((Join-Path $ExtDir $n), $t, $utf8) }

# 1) Port
Get-ChildItem $ExtDir -Recurse -File -Include *.js, *.json, *.html | ForEach-Object {
  $t = [IO.File]::ReadAllText($_.FullName)
  $n = $t -replace 'localhost:3010', "localhost:$Port" -replace '127\.0\.0\.1:3010', "127.0.0.1:$Port" -replace '\[::1\]:3010', "[::1]:${Port}"
  if ($n -ne $t) { [IO.File]::WriteAllText($_.FullName, $n, $utf8) }
}

# 2) Kein separates Connect-Fenster: Popup-Erzeugung -> Tab im normalen Fenster
$ow = ExtRead "open-window.js"
$rep = [ordered]@{
  'const w = await chrome.windows.create({ url, type: "popup", focused: true, width: 1400, height: 900 });' =
  'const nw = await targetNormalWindow(); /* connect-app: Tab statt Popup */ if (nw) { const t = await chrome.tabs.create({ windowId: nw.id, url, active: true }); await focusWindow(nw); return { tab: t && t.id }; } const w = await chrome.windows.create({ url, type: "normal", focused: true });'
  'await chrome.windows.create({ url: CONNECT + "/", type: "popup", focused: true, width: 1400, height: 900 });' =
  '{ const nw = await targetNormalWindow(); /* connect-app: Tab statt Popup */ if (nw) await chrome.tabs.create({ windowId: nw.id, url: CONNECT + "/", index: 0, active: false }); else await chrome.windows.create({ url: CONNECT + "/", type: "normal", focused: true }); }'
}
foreach ($k in $rep.Keys) {
  if ($ow.Contains($k)) { $ow = $ow.Replace($k, $rep[$k]) }
  elseif (-not $ow.Contains($rep[$k])) { Write-Warning "patch-extension: Stelle nicht gefunden (Extension geaendert?): $($k.Substring(0,60))" }
}
ExtWrite "open-window.js" $ow

# 3) Eindeutiger Service-Worker-Dateiname je Inhalt
$m = ExtRead "manifest.json" | ConvertFrom-Json
$oldSw = $m.background.service_worker
$hashSrc = ((Get-ChildItem $ExtDir -File -Filter *.js | Where-Object { $_.Name -notlike "sw-*" } | Sort-Object Name | ForEach-Object { [IO.File]::ReadAllText($_.FullName) }) -join "`n")
$h = [BitConverter]::ToString([Security.Cryptography.SHA1]::Create().ComputeHash($utf8.GetBytes($hashSrc))).Replace("-", "").Substring(0, 8).ToLower()
$newSw = "sw-$($m.version)-app$h.js"
if ($oldSw -ne $newSw) {
  $loader = ExtRead $oldSw
  Get-ChildItem $ExtDir -File -Filter "sw-*.js" | Remove-Item -Force
  ExtWrite $newSw $loader
  $raw = (ExtRead "manifest.json").Replace('"service_worker": "' + $oldSw + '"', '"service_worker": "' + $newSw + '"')
  ExtWrite "manifest.json" $raw
}
"Extension $($m.version) angepasst: Port $Port, Connect als Tab, Service-Worker $newSw"
