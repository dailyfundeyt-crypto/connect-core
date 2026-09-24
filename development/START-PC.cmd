@echo off
REM ============================================================
REM  START-PC.cmd — Connect Developer-Stack auf Windows starten
REM  Startet: API (:3001) + UI (:3010) via WSL, dann Browser
REM  Voraussetzung: Docker Desktop + WSL2 + Ubuntu-Distribution
REM ============================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo  [Connect] START-PC.cmd — Developer-Modus
echo  [Connect] API: http://localhost:3001
echo  [Connect]  UI: http://localhost:3010
echo.

REM ------------------------------------
REM  1. Google OAuth pruefen
REM ------------------------------------
set "ENV_FILE=%~dp0.env"
set "GOOGLE_ID="
set "GOOGLE_SECRET="

for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
  set "K=%%A"
  set "V=%%B"
  if "!K!"=="GOOGLE_OAUTH_CLIENT_ID" set "GOOGLE_ID=!V!"
  if "!K!"=="GOOGLE_OAUTH_CLIENT_SECRET" set "GOOGLE_SECRET=!V!"
)

if "%GOOGLE_ID%"=="" (
  echo  [Connect] FEHLER: GOOGLE_OAUTH_CLIENT_ID ist leer!
  echo.
  echo  Trage deine Google Desktop-Client Credentials in .env ein:
  echo    GOOGLE_OAUTH_CLIENT_ID=...apps.googleusercontent.com
  echo    GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-...
  echo.
  echo  Google Console: https://console.cloud.google.com/apis/credentials
  echo  Redirect URI am Desktop-Client: http://localhost:3001/api/auth/callback/google
  echo.
  echo  Nach dem Eintragen: START-PC.cmd erneut starten.
  echo.
  pause
  exit /b 1
)

echo  [Connect] Google OAuth: OK (Client-ID gefunden)
echo.

REM ------------------------------------
REM  2. WSL pruefen
REM ------------------------------------
wsl --list --running >NUL 2>&1
if errorlevel 1 (
  echo  [Connect] WSL laeuft nicht. Bitte Docker Desktop starten.
  echo  Docker Desktop startet WSL automatisch.
  pause
  exit /b 1
)

REM ------------------------------------
REM  3. Stack in WSL starten (wenn nicht schon laufend)
REM ------------------------------------
echo  [Connect] Pruefe laufenden Stack...
wsl -d Ubuntu -- bash -lc "curl -sf http://localhost:3001/api/capabilities >/dev/null 2>&1"
if errorlevel 1 (
  echo  [Connect] Stack nicht gefunden — starte via WSL...
  echo.
  
  REM Stack im Hintergrund starten
  set "WSLPATH=/mnt/c/Users/Kunc GmbH/Desktop/Connect"
  wsl -d Ubuntu -- bash -lc "cd '/mnt/c/Users/Kunc GmbH/Desktop/Connect' && CONNECT_FORCE_START=1 nohup ./START.sh > .logs/start-pc.log 2>&1 &"
  
  echo  [Connect] Stack wird gestartet (30 Sekunden warten)...
  
  REM Warte bis API antwortet (max 60 Sekunden)
  set /a TRIES=0
  :WAIT_LOOP
  timeout /t 3 /nobreak >NUL
  wsl -d Ubuntu -- bash -lc "curl -sf http://localhost:3001/api/capabilities >/dev/null 2>&1"
  if not errorlevel 1 goto :STACK_READY
  set /a TRIES+=1
  if !TRIES! LSS 20 (
    echo  [Connect] Warte... (!TRIES!/20)
    goto :WAIT_LOOP
  )
  echo  [Connect] WARNUNG: Stack antwortet noch nicht nach 60s.
  echo  [Connect] Browser wird trotzdem geoeffnet — ggf. neu laden.
  goto :OPEN_BROWSER
) else (
  echo  [Connect] Stack laeuft bereits! Gehe direkt zu /sign
)

:STACK_READY
echo.
echo  [Connect] Stack bereit!
echo  [Connect] API: http://localhost:3001/api/capabilities
echo.

REM Kurz warten damit Vite auch bereit ist
timeout /t 2 /nobreak >NUL

:OPEN_BROWSER
REM ------------------------------------
REM  4. Browser mit Connect-Profil oeffnen → /sign
REM ------------------------------------
set "SIGN_URL=http://localhost:3010/sign"
set "PROFILE=%USERPROFILE%\.connect-chrome-profile\desktop"

if not exist "%PROFILE%" mkdir "%PROFILE%"

echo  [Connect] Oeffne: %SIGN_URL%
echo  [Connect] Profil: %PROFILE%
echo.
echo  ↓ Jetzt mit stefankunc994@gmail.com bei Google anmelden ↓
echo.

REM Edge bevorzugen (auf Windows meist vorhanden)
where msedge >NUL 2>&1
if not errorlevel 1 (
  start "" msedge --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --new-window "%SIGN_URL%"
  goto :DONE
)

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --new-window "%SIGN_URL%"
  goto :DONE
)

if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --new-window "%SIGN_URL%"
  goto :DONE
)

where chrome >NUL 2>&1
if not errorlevel 1 (
  start "" chrome --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --new-window "%SIGN_URL%"
  goto :DONE
)

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --new-window "%SIGN_URL%"
  goto :DONE
)

if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
  start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --new-window "%SIGN_URL%"
  goto :DONE
)

echo  [Connect] FEHLER: Kein Chrome/Edge gefunden.
echo  Bitte Chrome oder Edge installieren.
exit /b 1

:DONE
echo.
echo  [Connect] Browser geoeffnet. Warte auf Google-Login...
echo  [Connect] Nach Login: GET http://localhost:3001/api/me prueft die Session.
echo.
echo  Wenn Login erfolgreich:
echo    curl http://localhost:3001/api/me
echo.
endlocal
