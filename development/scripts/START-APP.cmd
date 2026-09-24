@echo off
REM Connect IS the browser: Host-Chrome/Edge with Connect profile.
REM NOT --app= packing the web UI as a website.
REM Usage: double-click START-APP.cmd   or: START-APP.cmd http://127.0.0.1:3010
setlocal
cd /d "%~dp0"

set "URL=%~1"
if "%URL%"=="" set "URL=http://127.0.0.1:3010"

if "%CONNECT_CHROME_PROFILE%"=="" (
  set "PROFILE=%USERPROFILE%\.connect-chrome-profile\desktop"
) else (
  set "PROFILE=%CONNECT_CHROME_PROFILE%"
)

echo [Connect] Pruefe %URL% ...
curl -sf -o NUL --max-time 2 "%URL%" >NUL 2>&1
if errorlevel 1 (
  echo [Connect] Stack laeuft noch nicht.
  echo [Connect] Starte in einem anderen Terminal:  bun install  ^&^&  ./START.sh
  echo [Connect] Oder unter Windows mit Docker Desktop + Bun, siehe DESKTOP-PC.md
)

if not exist "%PROFILE%" mkdir "%PROFILE%"

echo [Connect] Connect-Browser mit Profil: %PROFILE%
echo [Connect] Steuerung-Tab: %URL% — Surfen/Extensions im selben Fenster.

where msedge >NUL 2>&1
if not errorlevel 1 (
  start "" msedge --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --new-window "%URL%"
  goto :done
)

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --new-window "%URL%"
  goto :done
)

if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --new-window "%URL%"
  goto :done
)

where chrome >NUL 2>&1
if not errorlevel 1 (
  start "" chrome --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --new-window "%URL%"
  goto :done
)

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --new-window "%URL%"
  goto :done
)

if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
  start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --new-window "%URL%"
  goto :done
)

echo [Connect] Kein Edge/Chrome gefunden. Connect IST der Browser — bitte Chrome/Edge installieren.
exit /b 1

:done
endlocal
