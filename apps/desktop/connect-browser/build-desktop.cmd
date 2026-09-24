@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo   Baue Connect Desktop mit integriertem AI-Browser (.NET 8)
echo ============================================================
echo.

dotnet restore
if errorlevel 1 goto :fail

dotnet build -c Release
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo   Erfolgreich gebaut!
echo   Ausfuehrbare Datei:
echo   bin\Release\net8.0-windows\Connect Desktop.exe
echo ============================================================
echo.
pause
exit /b 0

:fail
echo.
echo FEHLER beim Build.
pause
exit /b 1
