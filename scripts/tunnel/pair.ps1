<# Neuen Kopplungslink (Einmal-Token, 10 min) fuer ein Handy erzeugen - ohne Browser, z.B. auf einer VM.
   Nur lokal auf dem Rechner, auf dem Connect laeuft. Ausgabe: Link + QR-Code als SVG-Datei. #>
param(
  [int]$Port = $(if ($env:PORT) { [int]$env:PORT } else { 3101 }),
  [string]$ConnectRoot = $(if ($env:CONNECT_DATA_ROOT) { $env:CONNECT_DATA_ROOT } else { Join-Path $env:LOCALAPPDATA "ConnectApp" })
)
$ErrorActionPreference = "Stop"
$key = (Get-Content (Join-Path $ConnectRoot "data\tunnel\admin.key") -Raw).Trim()
$r = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$Port/api/tunnel/pair" -Headers @{ "x-connect-tunnel-key" = $key } -ContentType "application/json" -Body "{}"
$svg = Join-Path $env:TEMP "connect-pair-qr.svg"
Set-Content -Path $svg -Value $r.qrSvg -Encoding UTF8
Write-Output "Kopplungslink (gueltig bis $($r.expiresAt)): $($r.pairUrl)"
Write-Output "QR-Code: $svg"
