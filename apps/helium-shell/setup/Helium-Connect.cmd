@echo off
rem Startet Helium direkt auf der lokalen Connect-App, neuer Tab = Connect.
rem Wirkt nur, wenn Helium noch NICHT laeuft (sonst uebernimmt die laufende Instanz, Flags werden ignoriert).
start "" "%LOCALAPPDATA%\imput\Helium\Application\chrome.exe" --custom-ntp=http://localhost:3010/ http://localhost:3010/
