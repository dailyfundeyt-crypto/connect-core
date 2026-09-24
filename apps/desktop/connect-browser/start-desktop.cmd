@echo off
setlocal
cd /d "%~dp0"

set "EXE=bin\Release\net8.0-windows\Connect Desktop.exe"

if not exist "%EXE%" (
  echo Baue Anwendung zuerst...
  dotnet build -c Release
)

if exist "%EXE%" (
  echo Starte Connect Desktop mit AI-Browser...
  start "" "%EXE%"
) else (
  echo FEHLER: "%EXE%" nicht gefunden.
  pause
)
