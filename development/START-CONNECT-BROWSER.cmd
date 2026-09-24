@echo off
REM ============================================================
REM  START-CONNECT-BROWSER.cmd
REM  Startet die Connect Desktop App mit echtem integrierten AI-Browser (WebView2)
REM ============================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "EXE=%~dp0desktop\connect-browser\bin\Release\net8.0-windows\Connect Desktop.exe"

if not exist "%EXE%" (
  echo [Connect] Baue Connect Desktop mit AI-Browser...
  dotnet build -c Release "%~dp0desktop\connect-browser\ConnectDesktop.csproj"
)

if exist "%EXE%" (
  echo.
  echo [Connect] Starte Connect Desktop (WebView2 AI-Browser)...
  echo [Connect] - Tab 1: Connect Workspace (http://127.0.0.1:3010)
  echo [Connect] - Tab 2: Echter AI-Browser (alle Webseiten ohne iframe-Sperren)
  echo [Connect] - AI Bridge: http://127.0.0.1:3002
  echo.
  start "" "%EXE%"
) else (
  echo [Connect] FEHLER: "%EXE%" konnte nicht gebaut werden.
  echo Bitte ueberpruefe das .NET 8 SDK.
  pause
)
