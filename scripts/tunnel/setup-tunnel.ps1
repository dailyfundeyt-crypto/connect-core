<#
  Connect Handy-Tunnel einrichten (Windows). Portabel: keine festen Pfade, alles per Parameter/Env.
  - laedt das offizielle cloudflared (GitHub-Release von Cloudflare) nach <ConnectRoot>\tools\cloudflared.exe
    und prueft die Authenticode-Signatur (Cloudflare, Inc.)
  - setzt in <ConnectRoot>\data\connect.env den Tunnel-Modus (Sicherung *.bak-helium-tunnel-<Zeit>)
  Connect startet cloudflared dann selbst, versteckt, und verbindet automatisch neu.

  Beispiele:
    .\setup-tunnel.ps1                         # Quick-Tunnel (trycloudflare.com, URL wechselt bei Neustart)
    .\setup-tunnel.ps1 -Mode named -Token <TOKEN> -PublicUrl https://connect.deinedomain.de
    .\setup-tunnel.ps1 -Mode off               # Tunnel aus
  Danach Connect-Server neu starten (oder Connect App neu oeffnen).
#>
param(
  [ValidateSet("quick", "named", "external", "off")] [string]$Mode = "quick",
  [string]$Token = "",
  [string]$PublicUrl = "",
  [string]$ConnectRoot = $(if ($env:CONNECT_DATA_ROOT) { $env:CONNECT_DATA_ROOT } else { Join-Path $env:LOCALAPPDATA "ConnectApp" }),
  [switch]$SkipDownload
)
$ErrorActionPreference = "Stop"
$tools = Join-Path $ConnectRoot "tools"
$exe = Join-Path $tools "cloudflared.exe"
$envFile = Join-Path $ConnectRoot "data\connect.env"
New-Item -ItemType Directory -Force -Path $tools | Out-Null

if (-not $SkipDownload -and $Mode -ne "off" -and $Mode -ne "external") {
  $arch = if ([Environment]::Is64BitOperatingSystem) { "amd64" } else { "386" }
  $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-$arch.exe"
  $tmp = "$exe.download"
  Write-Output "Lade cloudflared ($arch) ..."
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
  $sig = Get-AuthenticodeSignature $tmp
  if ($sig.Status -ne "Valid" -or $sig.SignerCertificate.Subject -notmatch "Cloudflare") {
    Remove-Item $tmp -Force
    throw "Signatur von cloudflared ungueltig ($($sig.Status), $($sig.SignerCertificate.Subject)) - abgebrochen."
  }
  if (Test-Path $exe) {
    $running = Get-Process cloudflared -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe }
    if ($running) { Write-Output "cloudflared laeuft gerade - Update wird beim naechsten Neustart aktiv."; Move-Item $tmp "$exe.new" -Force }
    else { Move-Item $tmp $exe -Force }
  } else { Move-Item $tmp $exe -Force }
  Write-Output ("cloudflared: " + (& $exe --version))
}

if (-not (Test-Path $envFile)) { throw "connect.env nicht gefunden: $envFile (Connect App einmal starten)" }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item $envFile "$envFile.bak-helium-tunnel-$stamp"
$lines = Get-Content $envFile -Encoding UTF8 | Where-Object { $_ -notmatch '^\s*CONNECT_TUNNEL_(MODE|TOKEN|PUBLIC_URL)\s*=' -and $_ -notmatch '^# ---- Handy-Tunnel' }
$block = @("# ---- Handy-Tunnel (scripts/tunnel/setup-tunnel.ps1, $stamp) ----", "CONNECT_TUNNEL_MODE=$Mode")
if ($Token) { $block += "CONNECT_TUNNEL_TOKEN=$Token" }
if ($PublicUrl) { $block += "CONNECT_TUNNEL_PUBLIC_URL=$($PublicUrl.TrimEnd('/'))" }
Set-Content -Path $envFile -Value ($lines + $block) -Encoding UTF8
Write-Output "connect.env: CONNECT_TUNNEL_MODE=$Mode gesetzt (Sicherung connect.env.bak-helium-tunnel-$stamp)."
Write-Output "Jetzt den Connect-Server neu starten. QR-Code: Connect > Profilbild > Handy verbinden."
