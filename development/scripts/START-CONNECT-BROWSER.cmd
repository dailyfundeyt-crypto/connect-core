@echo off
REM ============================================================
REM  START-CONNECT-BROWSER.cmd
REM  Startet Connect: prueft PostgreSQL, Backend (3001), Frontend (3010)
REM  und oeffnet Connect Desktop mit echtem integrierten AI-Browser.
REM ============================================================
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0desktop\connect-browser\start-connect-full.ps1"
if %ERRORLEVEL% NEQ 0 (
  pause
)
