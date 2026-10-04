<#
  Set-ConnectAppAuth.ps1 - Anmeldung der Connect App (localhost:3101) umschalten.
    Set-ConnectAppAuth.cmd google   Anmeldung mit Google (Abmelden funktioniert)
    Set-ConnectAppAuth.cmd single   Notfall: Einzelnutzer ohne Anmeldung (als dailyfunde.yt, gleiche Daten)
    Set-ConnectAppAuth.cmd          aktuellen Modus anzeigen
  Danach die Connect App ganz schliessen und neu starten.
#>
param([Parameter(Position = 0)][ValidateSet("google", "single", "")][string]$Mode = "")
$ErrorActionPreference = "Stop"
$envF = Join-Path $env:LOCALAPPDATA "ConnectApp\data\connect.env"
$keys = "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"
$lines = [IO.File]::ReadAllLines($envF)
$active = @($lines | Where-Object { $_ -match '^GOOGLE_OAUTH_CLIENT_ID=' }).Count -gt 0
if (-not $Mode) { Write-Host ("Connect App: " + $(if ($active) { "Anmeldung mit Google" } else { "Einzelnutzer ohne Anmeldung" })); exit 0 }
Copy-Item $envF "$envF.bak-auth-$(Get-Date -Format yyyyMMdd-HHmmss)"
$out = foreach ($l in $lines) {
  $hit = $keys | Where-Object { $l -match "^#?\s*$_=" }
  if (-not $hit) { $l; continue }
  if ($Mode -eq "single") { if ($l.StartsWith("#")) { $l } else { "#" + $l } }
  else { $l -replace '^#\s*', '' }
}
[IO.File]::WriteAllLines($envF, $out, (New-Object Text.UTF8Encoding($false)))
Write-Host ("Connect App jetzt: " + $(if ($Mode -eq "google") { "Anmeldung mit Google" } else { "Einzelnutzer ohne Anmeldung" }) + ". Connect App ganz schliessen und neu starten.") -ForegroundColor Green
