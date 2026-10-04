<#
  Connect SEO-Agent: startet die lokalen Dienste unsichtbar (kein Konsolenfenster).
    - Ollama        127.0.0.1:11434  (lokales Sprachmodell)
    - laya-serve    127.0.0.1:8000   (lokaler Seiten-Richter fuer jev-seo, ersetzt Jev)
    - SEO-Agent     127.0.0.1:4310   (AG-UI-Endpunkt fuer Connect, Browser Helium headless)
  Idempotent: laeuft ein Dienst schon (Port belegt), wird er nicht doppelt gestartet.
  Wird von apps\helium-shell\setup\Start-Connect.ps1 aufgerufen. Alles bleibt auf diesem PC.
#>
$ErrorActionPreference = "Continue"
$App   = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Home_ = Join-Path $env:LOCALAPPDATA "ConnectSEO"
$Logs  = Join-Path $Home_ "logs"
$Py    = Join-Path $Home_ "venv\Scripts\python.exe"
$Laya  = Join-Path $Home_ "venv\Scripts\laya-serve.exe"
$Ollama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
New-Item -ItemType Directory -Force $Logs | Out-Null

function Listening($port) { [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) }
# Startet unsichtbar per ShellExecute ueber cmd mit Datei-Umleitung: kein Fenster und KEINE geerbten
# Pipe-Handles (sonst wartet ein aufrufendes Script, z. B. Start-Connect, ewig auf das Ende der Ausgabe).
function StartHidden($exe, [string]$argLine, $log, $workDir = $Home_) {
  $line = '/d /c ""' + $exe + '" ' + $argLine + ' >> "' + $log + '" 2>&1"'
  Start-Process -FilePath "$env:SystemRoot\System32\cmd.exe" -ArgumentList $line -WorkingDirectory $workDir -WindowStyle Hidden | Out-Null
}
function Say($m) { $line = "[{0:HH:mm:ss}] SEO: {1}" -f (Get-Date), $m; Write-Host $line; Add-Content (Join-Path $Logs "start.log") $line }

# Lokaler Schluessel zwischen jev-seo und laya-serve. Liegt ausserhalb des Repos, wird nie ausgegeben.
$Secrets = Join-Path $Home_ "secrets.env"
if (-not (Test-Path $Secrets)) {
  $bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  "LAYA_API_KEY=" + (($bytes | ForEach-Object { $_.ToString("x2") }) -join "") | Set-Content -Path $Secrets -Encoding ascii
}
$LayaKey = ((Get-Content $Secrets | Where-Object { $_ -like "LAYA_API_KEY=*" }) -replace "^LAYA_API_KEY=", "").Trim()

$env:PYTHONUTF8 = "1"
$env:HF_HOME = Join-Path $Home_ "hf"
$env:HF_HUB_OFFLINE = "1"            # Modelle sind lokal; zur Laufzeit wird nichts nachgeladen
$env:HF_HUB_DISABLE_TELEMETRY = "1"

# 1) Ollama
if (Listening 11434) { Say "Ollama laeuft bereits" }
elseif (Test-Path $Ollama) {
  $env:OLLAMA_HOST = "127.0.0.1:11434"
  StartHidden $Ollama "serve" (Join-Path $Logs "ollama.log")
  Say "Ollama gestartet (unsichtbar)"
} else { Say "WARNUNG: Ollama nicht gefunden ($Ollama)" }

# 2) laya-serve
if (Listening 8000) { Say "laya-serve laeuft bereits (Port 8000)" }
elseif (Test-Path $Laya) {
  $env:LAYA_HOST = "127.0.0.1"; $env:LAYA_PORT = "8000"; $env:LAYA_DEVICE = "cpu"
  $env:LAYA_PRELOAD = "1"; $env:LAYA_MODELS = "multilingual,english"; $env:LAYA_MAX_LOADED = "2"
  $env:LAYA_DEFAULT_MODEL = "multilingual"; $env:LAYA_THREADS = "10"; $env:LAYA_API_KEY = $LayaKey
  StartHidden $Laya "" (Join-Path $Logs "laya.log")
  Remove-Item Env:LAYA_API_KEY
  Say "laya-serve gestartet (unsichtbar)"
} else { Say "WARNUNG: laya-serve nicht gefunden ($Laya)" }

# 3) SEO-Agent (AG-UI)
if (Listening 4310) { Say "SEO-Agent laeuft bereits (Port 4310)" }
elseif (Test-Path $Py) {
  StartHidden $Py "-m seo_agent" (Join-Path $Logs "seo-agent.log") $App
  Say "SEO-Agent gestartet (unsichtbar, http://127.0.0.1:4310)"
} else { Say "WARNUNG: Python-Umgebung fehlt ($Py)" }
